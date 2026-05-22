import type { SignedAvatarUrlRecord } from '../avatar';
import { resolveAvatarUrl } from '../avatar-url';
import type { AppSnapshot } from './types';

export interface CachedAppSnapshot {
  readonly avatarSignedUrlsByPath: SignedAvatarUrlRecord;
  readonly snapshot: AppSnapshot;
  readonly updatedAt: string;
}

type SerializableAppSnapshot = Omit<AppSnapshot, 'notificationViewedKeys'> & {
  readonly notificationViewedKeys: readonly string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function serializeAppSnapshot(snapshot: AppSnapshot): SerializableAppSnapshot {
  return {
    ...snapshot,
    notificationViewedKeys: Array.from(snapshot.notificationViewedKeys),
  };
}

function reviveAppSnapshot(value: unknown): AppSnapshot | null {
  if (
    !isRecord(value) ||
    !Array.isArray(value.notificationViewedKeys) ||
    !Array.isArray(value.people) ||
    !isRecord(value.dashboard)
  ) {
    return null;
  }

  return {
    ...(value as unknown as SerializableAppSnapshot),
    notificationViewedKeys: new Set(
      value.notificationViewedKeys.filter((key): key is string => typeof key === 'string'),
    ),
  } as AppSnapshot;
}

export function serializeCachedSnapshotPayload(snapshot: AppSnapshot): string {
  return JSON.stringify(serializeAppSnapshot(snapshot));
}

export function parseCachedSnapshotPayload(payload: string): AppSnapshot | null {
  try {
    return reviveAppSnapshot(JSON.parse(payload));
  } catch {
    return null;
  }
}

export function serializeCachedAvatarUrlsPayload(
  avatarSignedUrlsByPath: SignedAvatarUrlRecord,
): string {
  return JSON.stringify(avatarSignedUrlsByPath);
}

export function parseCachedAvatarUrlsPayload(payload: string | null): SignedAvatarUrlRecord {
  if (!payload) {
    return {};
  }

  try {
    const value: unknown = JSON.parse(payload);
    if (!isRecord(value)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(value).filter((entry): entry is [string, SignedAvatarUrlRecord[string]] => {
        const [path, signedUrl] = entry;
        return (
          typeof path === 'string' &&
          path.trim().length > 0 &&
          isRecord(signedUrl) &&
          typeof signedUrl.url === 'string' &&
          typeof signedUrl.expiresAt === 'string'
        );
      }),
    );
  } catch {
    return {};
  }
}

export function replaceCurrentUserAvatarInSnapshot(
  snapshot: AppSnapshot,
  avatarPath: string,
  version = new Date().toISOString(),
): AppSnapshot {
  if (!snapshot.currentUserProfile) {
    return snapshot;
  }

  return {
    ...snapshot,
    currentUserProfile: {
      ...snapshot.currentUserProfile,
      avatarUrl: resolveAvatarUrl(avatarPath, version),
    },
  };
}

export async function readCachedAppSnapshot(): Promise<CachedAppSnapshot | null> {
  return null;
}

export async function persistCachedAppSnapshot(): Promise<void> {
  return undefined;
}

export async function updateCachedSnapshotCurrentUserAvatar(): Promise<void> {
  return undefined;
}
