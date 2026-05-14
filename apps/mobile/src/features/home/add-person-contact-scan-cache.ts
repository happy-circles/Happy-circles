import { type PeopleTargetResolution } from '@/lib/live-data';
import { type ContactsPermissionStatus } from '@/lib/contacts-permissions';
import { type ContactCandidate } from '@/features/invites/people-outreach-utils';

export type WarmContactScanCache = {
  readonly userId: string | null;
  readonly contactsPermissionStatus: ContactsPermissionStatus;
  readonly contacts: readonly ContactCandidate[];
  readonly targetCache: Record<string, PeopleTargetResolution>;
};

let warmContactScanCache: WarmContactScanCache | null = null;

export function readWarmContactScanCache(
  userId: string | null | undefined,
): WarmContactScanCache | null {
  if (!warmContactScanCache || warmContactScanCache.userId !== (userId ?? null)) {
    return null;
  }

  return {
    ...warmContactScanCache,
    contacts: [...warmContactScanCache.contacts],
    targetCache: { ...warmContactScanCache.targetCache },
  };
}

export function writeWarmContactScanCache(cache: WarmContactScanCache) {
  warmContactScanCache = {
    ...cache,
    contacts: [...cache.contacts],
    targetCache: { ...cache.targetCache },
  };
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
    targetCache: { ...targetCache },
  };
}
