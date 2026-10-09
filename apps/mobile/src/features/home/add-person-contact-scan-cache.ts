import { type PeopleTargetResolution } from '@/lib/live-data';
import { type ContactsPermissionStatus } from '@/lib/contacts-permissions';
import { type ContactCandidate } from '@/features/invites/people-outreach-utils';

export type WarmContactScanCache = {
  readonly userId: string | null;
  readonly contactsPermissionStatus: ContactsPermissionStatus;
  readonly contacts: readonly ContactCandidate[];
  readonly targetCache: Record<string, PeopleTargetResolution>;
  readonly indexRevision?: number;
  readonly readLimit?: number;
  readonly loadedCount?: number;
  readonly matchingCount?: number;
  readonly scanComplete?: boolean;
};

let warmContactScanCache: WarmContactScanCache | null = null;
const listeners = new Map<string | null, Set<() => void>>();

export function subscribeWarmContactScanCache(userId: string | null, listener: () => void) {
  let userListeners = listeners.get(userId);
  if (!userListeners) listeners.set(userId, (userListeners = new Set()));
  userListeners.add(listener);
  return () => {
    userListeners.delete(listener);
    if (!userListeners.size) listeners.delete(userId);
  };
}

function notifySnapshotAvailable(userId: string | null) {
  for (const listener of listeners.get(userId) ?? []) listener();
}

export function readWarmContactScanCache(
  userId: string | null | undefined,
): WarmContactScanCache | null {
  if (!warmContactScanCache || warmContactScanCache.userId !== (userId ?? null)) {
    return null;
  }

  return warmContactScanCache;
}

export function writeWarmContactScanCache(cache: WarmContactScanCache) {
  const previous = warmContactScanCache;
  warmContactScanCache = {
    ...cache,
    contacts: cache.contacts,
    targetCache: cache.targetCache,
  };
  if (
    previous?.userId !== cache.userId ||
    previous.contacts !== cache.contacts ||
    previous.contactsPermissionStatus !== cache.contactsPermissionStatus ||
    previous.indexRevision !== cache.indexRevision ||
    previous.scanComplete !== cache.scanComplete ||
    previous.loadedCount !== cache.loadedCount ||
    previous.matchingCount !== cache.matchingCount
  ) {
    notifySnapshotAvailable(cache.userId);
  }
}

export function clearWarmContactScanCache(userId: string | null | undefined) {
  if (warmContactScanCache?.userId === (userId ?? null)) {
    warmContactScanCache = null;
  }
}

export function updateWarmContactScanTargetCache(
  userId: string | null | undefined,
  targetCache: Record<string, PeopleTargetResolution>,
) {
  if (warmContactScanCache?.userId !== (userId ?? null)) {
    return;
  }

  warmContactScanCache = {
    ...warmContactScanCache,
    targetCache,
  };
}
