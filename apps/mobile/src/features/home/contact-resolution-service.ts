import { registerContactDiscoverySchema, resolvePeopleTargetsSchema } from '@happy-circles/shared';
import {
  captureContactDiscoveryRevision,
  captureContactGenerations,
  associateContactDiscoveryWatches,
  clearContactResolutionUser,
  isContactRealtimeReady,
  isContactResolutionFresh,
  isContactResolutionWritePending,
  contactResolutionTtl,
  mergeContactResolutions,
  readContactResolutions,
  revokeContactAccountMatchConfirmations,
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
const OBSERVED_VISIBLE_MAX_AGE_MS = 5 * 60_000;
const discoverySessions = new Map<string, string>();
const recoveryVersions = new Map<string, number>();
const recoveryRequired = new Set<string>();
const validatedPhones = new Map<string, Map<string, number>>();
// A malformed live positive stays unconfirmed, but does not bypass the TTL on
// every visible tick. A genuine recovery or a newer row permits a new attempt.
const accountConfirmationReads = new Map<string, Map<string, number>>();
type DiscoveryWatch = { readonly phoneE164: string; readonly discoveryWatchId: string };
const registeredPhones = new Map<string, Map<string, DiscoveryWatch>>();
const registrationSchedulers = new Map<string, ContactResolutionScheduler<DiscoveryWatch>>();
const removalSchedulers = new Map<string, ContactResolutionScheduler<DiscoveryWatch>>();
const retiredWatches = new Map<
  string,
  Map<string, DiscoveryWatch & { readonly sessionId: string }>
>();
const pendingRemovals = new Map<string, Map<string, Promise<unknown>>>();
const removedPhones = new Map<string, Set<string>>();
const watchReaders = new Map<string, Map<string, Set<Promise<void>>>>();

function beginWatchRead(userId: string, phones: readonly string[]) {
  const readers = watchReaders.get(userId) ?? new Map<string, Set<Promise<void>>>();
  let finish!: () => void;
  const done = new Promise<void>((resolve) => {
    finish = resolve;
  });
  for (const phone of phones) {
    const pending = readers.get(phone) ?? new Set<Promise<void>>();
    pending.add(done);
    readers.set(phone, pending);
  }
  watchReaders.set(userId, readers);
  return () => {
    for (const phone of phones) {
      const pending = readers.get(phone);
      pending?.delete(done);
      if (!pending?.size) readers.delete(phone);
    }
    finish();
  };
}

export function restoreContactDiscoveryPhones(userId: string, phones: readonly string[]) {
  const removed = removedPhones.get(userId);
  for (const phone of phones) removed?.delete(phone);
}

async function waitForWatchRemovals(userId: string, phones: readonly string[]) {
  const pending = pendingRemovals.get(userId);
  await Promise.all(
    phones.flatMap((phone) =>
      pending?.get(phone) ? [pending.get(phone)!.catch(() => undefined)] : [],
    ),
  );
}

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

function schedulerFor(userId: string) {
  let scheduler = schedulers.get(userId);
  if (!scheduler) {
    scheduler = new ContactResolutionScheduler(async (phones) => {
      await waitForWatchRemovals(userId, phones);
      await assertActor(userId);
      phones = phones.filter(
        (phone) =>
          !isContactResolutionWritePending(userId, phone) && !removedPhones.get(userId)?.has(phone),
      );
      if (!phones.length) return [];
      const expectedGenerations = captureContactGenerations(userId, phones);
      const discoveryRevision = captureContactDiscoveryRevision();
      const recoveryVersion = recoveryVersions.get(userId);
      const discoverySessionId = isContactRealtimeReady(userId)
        ? discoverySessions.get(userId)
        : undefined;
      const finishWatchRead = beginWatchRead(userId, phones);
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
        if (recoveryVersions.get(userId) !== recoveryVersion) return [];
        const observedSessionCurrent = Boolean(
          discoverySessionId &&
          discoverySessionId === discoverySessions.get(userId) &&
          isContactRealtimeReady(userId),
        );
        const registered = registeredPhones.get(userId) ?? new Map<string, DiscoveryWatch>();
        for (const row of rows) {
          if (row.discoveryWatchId && observedSessionCurrent)
            registered.set(row.phoneE164, {
              phoneE164: row.phoneE164,
              discoveryWatchId: row.discoveryWatchId,
            });
        }
        registeredPhones.set(userId, registered);
        const accepted = mergeContactResolutions(
          userId,
          rows
            .filter((row) => !removedPhones.get(userId)?.has(row.phoneE164))
            .map((row) => ({
              ...row,
              discoverySessionId: observedSessionCurrent ? discoverySessionId : undefined,
              discoveryWatchId: observedSessionCurrent ? row.discoveryWatchId : undefined,
            })),
          { expectedGenerations, discoveryRevision },
        );
        const confirmationReads = accountConfirmationReads.get(userId) ?? new Map<string, number>();
        for (const row of accepted) {
          if (row.status === 'active_user' && row.accountMatchConfirmed !== true)
            confirmationReads.set(row.phoneE164, row.generation ?? 0);
          else confirmationReads.delete(row.phoneE164);
        }
        accountConfirmationReads.set(userId, confirmationReads);
        const validated = validatedPhones.get(userId) ?? new Map<string, number>();
        for (const row of accepted) {
          if (
            observedSessionCurrent &&
            row.discoveryWatchId &&
            row.resolvedAt &&
            recoveryVersion !== undefined &&
            !pendingRemovals.get(userId)?.has(row.phoneE164)
          )
            validated.set(row.phoneE164, recoveryVersion);
          else validated.delete(row.phoneE164);
        }
        validatedPhones.set(userId, validated);
        registeredPhones.set(userId, registered);
        await savePeopleTargetResolutionsToCache(userId, accepted).catch(() => undefined);
        return accepted;
      } finally {
        // Suspending can send stop before this read registers its watches. Stop once
        // more after the read completes, without stopping a current session.
        await stopInactiveDiscoverySession(userId, discoverySessionId);
        finishWatchRead();
      }
    });
    schedulers.set(userId, scheduler);
  }
  return scheduler;
}

function registrationSchedulerFor(userId: string) {
  let scheduler = registrationSchedulers.get(userId);
  if (!scheduler) {
    scheduler = new ContactResolutionScheduler<DiscoveryWatch>(async (phones) => {
      await waitForWatchRemovals(userId, phones);
      await assertActor(userId);
      phones = phones.filter((phone) => !removedPhones.get(userId)?.has(phone));
      if (!phones.length) return [];
      const sessionId = discoverySessions.get(userId);
      if (!sessionId || !isContactRealtimeReady(userId))
        throw new Error('La observación de contactos está pausada.');
      const discoveryRevision = captureContactDiscoveryRevision();
      const finishWatchRead = beginWatchRead(userId, phones);
      try {
        const result = await invokeParsedEdgeFunction<
          ReturnType<typeof registerContactDiscoverySchema.parse>,
          { readonly watches: readonly DiscoveryWatch[] }
        >(
          'register-contact-discovery',
          registerContactDiscoverySchema,
          { discoverySessionId: sessionId, phoneE164List: phones },
          { expectedUserId: userId },
        );
        await assertActor(userId);
        if (discoverySessions.get(userId) !== sessionId) return [];
        const registered = registeredPhones.get(userId) ?? new Map<string, DiscoveryWatch>();
        for (const watch of result.watches) registered.set(watch.phoneE164, watch);
        registeredPhones.set(userId, registered);
        associateContactDiscoveryWatches(userId, result.watches, discoveryRevision);
        return result.watches;
      } finally {
        await stopInactiveDiscoverySession(userId, sessionId);
        finishWatchRead();
      }
    });
    registrationSchedulers.set(userId, scheduler);
  }
  return scheduler;
}

function removalSchedulerFor(userId: string) {
  let scheduler = removalSchedulers.get(userId);
  if (!scheduler) {
    scheduler = new ContactResolutionScheduler<DiscoveryWatch>(
      async (phones) => {
        const retired = retiredWatches.get(userId);
        const sessionId = discoverySessions.get(userId);
        if (!sessionId || !retired) return [];
        const watches = phones.flatMap((phone) => {
          const watch = retired.get(phone);
          return watch && watch.sessionId === sessionId ? [watch] : [];
        });
        if (!watches.length) return [];
        await assertActor(userId);
        await invokeSupabaseFunction(
          'manage-contact-discovery',
          {
            discoverySessionId: sessionId,
            action: 'remove',
            watchIds: watches.map((watch) => watch.discoveryWatchId),
          },
          { expectedUserId: userId },
        );
        for (const watch of watches) {
          if (retired?.get(watch.phoneE164) === watch) retired.delete(watch.phoneE164);
          if (
            registeredPhones.get(userId)?.get(watch.phoneE164)?.discoveryWatchId ===
            watch.discoveryWatchId
          )
            registeredPhones.get(userId)?.delete(watch.phoneE164);
          validatedPhones.get(userId)?.delete(watch.phoneE164);
        }
        return watches;
      },
      { background: 15, visible: 15, event: 17, interactive: 18 },
    );
    removalSchedulers.set(userId, scheduler);
  }
  return scheduler;
}

/** Remove only retired agenda numbers, leaving the active lease and other rows intact. */
export async function removeContactDiscoveryPhoneWatches(
  userId: string,
  phones: readonly string[],
) {
  const sessionId = discoverySessions.get(userId);
  if (!sessionId) return;
  const retired =
    retiredWatches.get(userId) ??
    new Map<string, DiscoveryWatch & { readonly sessionId: string }>();
  const pending = pendingRemovals.get(userId) ?? new Map<string, Promise<unknown>>();
  const removed = removedPhones.get(userId) ?? new Set<string>();
  const toRemove = [...new Set(phones)];
  for (const phone of toRemove) {
    removed.add(phone);
    validatedPhones.get(userId)?.delete(phone);
    const watch = registeredPhones.get(userId)?.get(phone);
    if (watch) {
      retired.set(phone, { ...watch, sessionId });
      registeredPhones.get(userId)?.delete(phone);
    }
  }
  removedPhones.set(userId, removed);
  retiredWatches.set(userId, retired);
  pendingRemovals.set(userId, pending);
  const batches: Promise<unknown>[] = [];
  for (let offset = 0; offset < toRemove.length; offset += 60) {
    const batch = toRemove.slice(offset, offset + 60);
    const readers = new Set(
      batch.flatMap((phone) => [...(watchReaders.get(userId)?.get(phone) ?? [])]),
    );
    const removal = Promise.all(readers)
      .then(async () => {
        if (discoverySessions.get(userId) !== sessionId) return;
        for (const phone of batch) {
          const watch = registeredPhones.get(userId)?.get(phone);
          if (watch) {
            retired.set(phone, { ...watch, sessionId });
            registeredPhones.get(userId)?.delete(phone);
          }
        }
        const registeredBatch = batch.filter(
          (phone) => retired.get(phone)?.sessionId === sessionId,
        );
        if (registeredBatch.length)
          await removalSchedulerFor(userId).request(registeredBatch, 'background');
      })
      .finally(() => {
        for (const phone of batch) if (pending.get(phone) === removal) pending.delete(phone);
      });
    for (const phone of batch) pending.set(phone, removal);
    batches.push(removal);
  }
  await Promise.all(batches);
}

export async function registerContactDiscoveryPhoneWatches(
  userId: string,
  phones: readonly string[],
  priority: ContactResolutionPriority = 'background',
) {
  if (!discoverySessions.has(userId) || !isContactRealtimeReady(userId)) return [];
  const registered = registeredPhones.get(userId);
  const missing = [...new Set(phones)].filter(
    (phone) =>
      !removedPhones.get(userId)?.has(phone) &&
      (!registered?.has(phone) || pendingRemovals.get(userId)?.has(phone)),
  );
  return missing.length ? registrationSchedulerFor(userId).request(missing, priority) : [];
}

/** A disconnected broadcast has no replay. Reconcile progressively without clearing the UI. */
export function beginContactDiscoveryRecovery(userId: string) {
  recoveryVersions.set(userId, (recoveryVersions.get(userId) ?? 0) + 1);
  recoveryRequired.add(userId);
  accountConfirmationReads.delete(userId);
  revokeContactAccountMatchConfirmations(userId);
}

function needsContactResolution(
  userId: string,
  phone: string,
  priority: ContactResolutionPriority,
) {
  const row = readContactResolutions(userId)[phone];
  const sessionId = discoverySessions.get(userId);
  const version = recoveryVersions.get(userId);
  const validated = validatedPhones.get(userId)?.get(phone) === version;
  const needsAccountConfirmation =
    row?.status === 'active_user' &&
    row.accountMatchConfirmed !== true &&
    accountConfirmationReads.get(userId)?.get(phone) !== (row.generation ?? 0);
  const observed =
    sessionId &&
    isContactRealtimeReady(userId) &&
    registeredPhones.get(userId)?.has(phone) &&
    !pendingRemovals.get(userId)?.has(phone) &&
    row?.resolvedAt &&
    (priority !== 'visible' || Date.now() - row.resolvedAt < OBSERVED_VISIBLE_MAX_AGE_MS) &&
    validated &&
    row.status !== 'pending_activation' &&
    row.status !== 'pending_friendship';
  const needsRecovery =
    sessionId && isContactRealtimeReady(userId) && recoveryRequired.has(userId) && !validated;
  return Boolean(
    needsAccountConfirmation || needsRecovery || (!observed && !isContactResolutionFresh(row)),
  );
}

/** Observed resolution already registers its watches; do not pay for two requests. */
export async function synchronizeContactDiscoveryPhones(
  userId: string,
  phones: readonly string[],
  priority: ContactResolutionPriority = 'background',
) {
  const unique = [...new Set(phones)];
  const toResolve = unique.filter((phone) => needsContactResolution(userId, phone, priority));
  const needsRead = new Set(toResolve);
  const toRegister = unique.filter((phone) => !needsRead.has(phone));
  await Promise.all([
    toResolve.length ? resolveContactPhones(userId, toResolve, priority) : undefined,
    toRegister.length
      ? registerContactDiscoveryPhoneWatches(userId, toRegister, priority)
      : undefined,
  ]);
  const version = recoveryVersions.get(userId);
  return {
    recheck: toRegister.flatMap((phoneE164) => {
      const row = readContactResolutions(userId)[phoneE164];
      if (!row?.resolvedAt || validatedPhones.get(userId)?.get(phoneE164) === version) return [];
      // Fresh cached state remains usable briefly, but registering a new watch
      // cannot establish a baseline for changes missed while the app was closed.
      return [{ phoneE164, at: row.resolvedAt + contactResolutionTtl(row.status) + 1 }];
    }),
  };
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
  const missing = [...new Set(phones)].filter(
    (phone) =>
      !removedPhones.get(userId)?.has(phone) &&
      !isContactResolutionWritePending(userId, phone) &&
      (force || needsContactResolution(userId, phone, priority)),
  );
  const beforeRead = captureContactGenerations(userId, missing);
  const refreshed = missing.length
    ? await schedulerFor(userId).request(missing, priority, force)
    : [];
  const refreshedByPhone = new Map<string, PeopleTargetResolution>();
  for (const row of refreshed) {
    // Earlier batches can age while a long queue drains. TTL expiry is not
    // a concurrent write and must not restart a completed 10,000-phone scan.
    const current = readContactResolutions(userId)[row.phoneE164];
    if (current?.resolvedAt && (current.generation ?? 0) >= (row.generation ?? 0))
      refreshedByPhone.set(row.phoneE164, current);
  }
  for (const phone of missing) {
    const current = readContactResolutions(userId)[phone];
    // A completed command may supersede an in-flight read. Keep its confirmed
    // state rather than forcing a redundant lookup after successful outreach.
    if (current?.resolvedAt && (current.generation ?? 0) > (beforeRead.get(phone) ?? 0))
      refreshedByPhone.set(phone, current);
  }
  const discarded = missing.filter(
    (phone) =>
      !removedPhones.get(userId)?.has(phone) &&
      !refreshedByPhone.has(phone) &&
      !isContactResolutionWritePending(userId, phone),
  );
  if (
    discarded.length &&
    retryDiscarded &&
    (priority === 'interactive' || discoverySessions.has(userId))
  ) {
    await assertActor(userId);
    const retried = await resolveContactPhones(userId, discarded, priority, true, false);
    for (const row of retried) refreshedByPhone.set(row.phoneE164, row);
  }
  if (force && discarded.some((phone) => !refreshedByPhone.has(phone))) {
    throw new Error('El estado del contacto cambió durante la consulta. Vuelve a intentarlo.');
  }
  return phones.flatMap((phone) => {
    const row = refreshedByPhone.get(phone) ?? readContactResolutions(userId)[phone];
    return row ? [row] : [];
  });
}

export function setContactDiscoverySession(userId: string, sessionId: string | null) {
  if (discoverySessions.get(userId) === sessionId) return;
  registeredPhones.delete(userId);
  accountConfirmationReads.delete(userId);
  retiredWatches.delete(userId);
  pendingRemovals.delete(userId);
  removedPhones.delete(userId);
  watchReaders.delete(userId);
  if (sessionId) {
    discoverySessions.set(userId, sessionId);
    recoveryVersions.set(userId, (recoveryVersions.get(userId) ?? 0) + 1);
    recoveryRequired.delete(userId);
  } else {
    discoverySessions.delete(userId);
    schedulers.get(userId)?.cancelBackground();
    registrationSchedulers.get(userId)?.cancelBackground();
    removalSchedulers.get(userId)?.cancelBackground();
  }
}

export async function manageContactDiscovery(
  sessionId: string,
  action: 'renew' | 'stop',
  userId?: string,
) {
  if (userId) await assertActor(userId);
  return invokeSupabaseFunction<
    { discoverySessionId: string; action: 'renew' | 'stop' },
    { readonly status: 'renewed' | 'expired' | 'stopped' }
  >(
    'manage-contact-discovery',
    { discoverySessionId: sessionId, action },
    userId ? { expectedUserId: userId } : undefined,
  );
}

export function disposeContactResolutionUser(userId: string) {
  schedulers.get(userId)?.cancelAll();
  schedulers.delete(userId);
  discoverySessions.delete(userId);
  recoveryVersions.delete(userId);
  recoveryRequired.delete(userId);
  validatedPhones.delete(userId);
  accountConfirmationReads.delete(userId);
  registeredPhones.delete(userId);
  registrationSchedulers.get(userId)?.cancelAll();
  registrationSchedulers.delete(userId);
  removalSchedulers.get(userId)?.cancelAll();
  removalSchedulers.delete(userId);
  retiredWatches.delete(userId);
  pendingRemovals.delete(userId);
  removedPhones.delete(userId);
  watchReaders.delete(userId);
  clearContactResolutionUser(userId);
}
