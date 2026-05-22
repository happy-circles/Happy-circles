import * as Crypto from 'expo-crypto';

import type { PeopleTargetResolution } from '@/lib/live-data';

type StoredPeopleTargetResolution = Omit<PeopleTargetResolution, 'phoneE164'>;

export function createPeopleTargetResolutionCacheHashSource(input: {
  readonly userId: string;
  readonly phoneE164: string;
}): string {
  return `${input.userId}:${input.phoneE164}`;
}

export async function createPeopleTargetResolutionCacheKey(input: {
  readonly userId: string;
  readonly phoneE164: string;
}): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    createPeopleTargetResolutionCacheHashSource(input),
  );
}

export function isPeopleTargetResolutionCacheEntryFresh(): boolean {
  return false;
}

export function stripPhoneFromPeopleTargetResolution(
  resolution: PeopleTargetResolution,
): StoredPeopleTargetResolution {
  return {
    accountInviteId: resolution.accountInviteId,
    accountInviteStatus: resolution.accountInviteStatus,
    avatarPath: resolution.avatarPath,
    displayName: resolution.displayName,
    friendshipInviteId: resolution.friendshipInviteId,
    matchedUserId: resolution.matchedUserId,
    relationshipId: resolution.relationshipId,
    status: resolution.status,
  };
}

export function restorePhoneOnPeopleTargetResolution(input: {
  readonly phoneE164: string;
  readonly storedResolution: StoredPeopleTargetResolution;
}): PeopleTargetResolution {
  return {
    phoneE164: input.phoneE164,
    ...input.storedResolution,
  };
}

export async function loadPeopleTargetResolutionCache(): Promise<
  Record<string, PeopleTargetResolution>
> {
  return {};
}

export async function savePeopleTargetResolutionsToCache(): Promise<void> {
  return undefined;
}

export async function pruneExpiredPeopleTargetResolutionCache(): Promise<void> {
  return undefined;
}
