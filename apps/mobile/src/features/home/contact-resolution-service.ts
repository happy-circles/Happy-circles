import { resolvePeopleTargetsSchema } from '@happy-circles/shared';
import {
  captureContactDiscoveryRevision,
  captureContactGenerations,
  clearContactResolutionUser,
  isContactRealtimeReady,
  isContactResolutionFresh,
  subscribeContactRealtime,
  mergeContactResolutions,
  readContactResolutions,
} from '@/lib/contact-resolution-state';
import {
  ContactResolutionScheduler,
  type ContactResolutionPriority,
} from '@/lib/contact-resolution-scheduler';
import { invokeParsedEdgeFunction } from '@/lib/live-data/mutations/edge-action';
import { assertSupabaseClient, invokeSupabaseFunction } from '@/lib/live-data/client';
import type { PeopleTargetResolution } from '@/lib/live-data/types-runtime';
import { savePeopleTargetResolutionsToCache } from './people-target-resolution-cache';

const schedulers = new Map<string, ContactResolutionScheduler>();
const discoverySessions = new Map<string, string>();

async function assertActor(userId: string) {
  const { data } = await assertSupabaseClient().auth.getSession();
  if (data.session?.user.id !== userId)
    throw new Error('La sesión cambió. Vuelve a consultar tus contactos.');
}

async function stopInactiveDiscoverySession(userId: string, sessionId: string | undefined) {
  if (!sessionId || discoverySessions.get(userId) === sessionId) return;
  try {
    await assertActor(userId);
    // A consumer may have resumed this session while the auth lookup was pending.
    if (discoverySessions.get(userId) === sessionId) return;
    await invokeSupabaseFunction(
      'manage-contact-discovery',
      { discoverySessionId: sessionId, action: 'stop' },
      { expectedUserId: userId },
    );
  } catch {
    // Cleanup must not replace the read result. Offline sessions also expire server-side.
  }
}

async function waitForSubscription(userId: string) {
  if (isContactRealtimeReady(userId) || !discoverySessions.has(userId)) return;
  await new Promise<void>((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      unsubscribe();
      resolve();
    };
    const unsubscribe = subscribeContactRealtime(userId, () => {
      if (isContactRealtimeReady(userId)) finish();
    });
    const timer = setTimeout(finish, 2000);
  });
}

function schedulerFor(userId: string) {
  let scheduler = schedulers.get(userId);
  if (!scheduler) {
    scheduler = new ContactResolutionScheduler(async (phones) => {
      await waitForSubscription(userId);
      await assertActor(userId);
      const expectedGenerations = captureContactGenerations(userId, phones);
      const discoveryRevision = captureContactDiscoveryRevision();
      const discoverySessionId = isContactRealtimeReady(userId)
        ? discoverySessions.get(userId)
        : undefined;
      try {
        const rows = await invokeParsedEdgeFunction<
          ReturnType<typeof resolvePeopleTargetsSchema.parse>,
          PeopleTargetResolution[]
        >(
          'resolve-people-targets',
          resolvePeopleTargetsSchema,
          { phoneE164List: phones, discoverySessionId },
          { expectedUserId: userId },
        );
        await assertActor(userId);
        const accepted = mergeContactResolutions(
          userId,
          rows.map((row) => ({ ...row, discoverySessionId })),
          { expectedGenerations, discoveryRevision },
        );
        await savePeopleTargetResolutionsToCache(userId, accepted).catch(() => undefined);
        return accepted;
      } finally {
        // Closing can send stop before this read registers its watches. Stop once
        // more after the read completes, without stopping a current session.
        await stopInactiveDiscoverySession(userId, discoverySessionId);
      }
    });
    schedulers.set(userId, scheduler);
  }
  return scheduler;
}

export async function resolveContactPhones(
  userId: string,
  phones: readonly string[],
  priority: ContactResolutionPriority,
  force = false,
  retryDiscarded = true,
): Promise<readonly PeopleTargetResolution[]> {
  const cache = readContactResolutions(userId);
  if (priority !== 'interactive' && !discoverySessions.has(userId)) {
    return phones.flatMap((phone) => (cache[phone] ? [cache[phone]] : []));
  }
  const sessionId = isContactRealtimeReady(userId) ? discoverySessions.get(userId) : undefined;
  const missing = [...new Set(phones)].filter(
    (phone) =>
      force ||
      !isContactResolutionFresh(cache[phone]) ||
      (sessionId && cache[phone]?.discoverySessionId !== sessionId),
  );
  const refreshed = missing.length
    ? await schedulerFor(userId).request(missing, priority, force)
    : [];
  const refreshedByPhone = new Map(
    refreshed
      .filter(
        (row) =>
          isContactResolutionFresh(row) &&
          readContactResolutions(userId)[row.phoneE164]?.generation === row.generation,
      )
      .map((row) => [row.phoneE164, row]),
  );
  const discarded = missing.filter((phone) => !refreshedByPhone.has(phone));
  if (
    discarded.length &&
    retryDiscarded &&
    (priority === 'interactive' || discoverySessions.has(userId))
  ) {
    await assertActor(userId);
    const retried = await resolveContactPhones(userId, discarded, priority, true, false);
    for (const row of retried) refreshedByPhone.set(row.phoneE164, row);
  }
  if (force && missing.some((phone) => !refreshedByPhone.has(phone))) {
    throw new Error('El estado del contacto cambió durante la consulta. Vuelve a intentarlo.');
  }
  return phones.flatMap((phone) => {
    const row = refreshedByPhone.get(phone) ?? readContactResolutions(userId)[phone];
    return row ? [row] : [];
  });
}

export function setContactDiscoverySession(userId: string, sessionId: string | null) {
  if (sessionId) discoverySessions.set(userId, sessionId);
  else {
    discoverySessions.delete(userId);
    schedulers.get(userId)?.cancelBackground();
  }
}

export async function manageContactDiscovery(sessionId: string, action: 'renew' | 'stop') {
  return invokeSupabaseFunction<
    { discoverySessionId: string; action: 'renew' | 'stop' },
    { readonly status: 'renewed' | 'expired' | 'stopped' }
  >('manage-contact-discovery', { discoverySessionId: sessionId, action });
}

export function disposeContactResolutionUser(userId: string) {
  schedulers.get(userId)?.cancelAll();
  schedulers.delete(userId);
  discoverySessions.delete(userId);
  clearContactResolutionUser(userId);
}
