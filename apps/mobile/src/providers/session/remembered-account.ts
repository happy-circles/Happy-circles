import { getStoredItem, removeStoredItem, setStoredItem } from '@/lib/storage';
import { REMEMBERED_ACCOUNT_KEY } from './constants';
import { deriveAccountAccessState } from './account-state';
import type { RememberedAccountSnapshot, UserProfileRow } from './types';

export function isRememberedAccountSnapshot(value: unknown): value is RememberedAccountSnapshot {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const snapshot = value as Record<string, unknown>;
  return (
    typeof snapshot.userId === 'string' &&
    snapshot.userId.length > 0 &&
    typeof snapshot.displayName === 'string' &&
    (snapshot.email === null || typeof snapshot.email === 'string') &&
    (snapshot.avatarPath === null || typeof snapshot.avatarPath === 'string') &&
    (snapshot.accountAccessState === 'needs_invite' ||
      snapshot.accountAccessState === 'needs_activation' ||
      snapshot.accountAccessState === 'active') &&
    typeof snapshot.lastUsedAt === 'string' &&
    snapshot.lastUsedAt.length > 0
  );
}

export function resolveRememberedAccountDisplayName(
  displayName: string,
  email: string | null,
): string {
  const normalizedDisplayName = displayName.trim();
  if (normalizedDisplayName) {
    return normalizedDisplayName;
  }

  const emailLabel = email?.split('@')[0]?.trim();
  return emailLabel || 'Tu cuenta';
}

export async function readRememberedAccountSnapshot(): Promise<RememberedAccountSnapshot | null> {
  const stored = await getStoredItem(REMEMBERED_ACCOUNT_KEY);
  if (!stored) {
    return null;
  }

  try {
    const parsed = JSON.parse(stored) as unknown;
    if (!isRememberedAccountSnapshot(parsed)) {
      await removeStoredItem(REMEMBERED_ACCOUNT_KEY);
      return null;
    }

    return {
      ...parsed,
      displayName: resolveRememberedAccountDisplayName(parsed.displayName, parsed.email),
    };
  } catch {
    await removeStoredItem(REMEMBERED_ACCOUNT_KEY);
    return null;
  }
}

export async function persistRememberedAccountSnapshot(
  profile: UserProfileRow | null,
): Promise<RememberedAccountSnapshot | null> {
  if (!profile) {
    await removeStoredItem(REMEMBERED_ACCOUNT_KEY);
    return null;
  }

  const derivedAccessState = deriveAccountAccessState(profile);
  const snapshot: RememberedAccountSnapshot = {
    userId: profile.id,
    displayName: resolveRememberedAccountDisplayName(profile.display_name, profile.email),
    email: profile.email,
    avatarPath: profile.avatar_path,
    accountAccessState: derivedAccessState === 'loading' ? 'needs_invite' : derivedAccessState,
    lastUsedAt: new Date().toISOString(),
  };

  await setStoredItem(REMEMBERED_ACCOUNT_KEY, JSON.stringify(snapshot));
  return snapshot;
}
