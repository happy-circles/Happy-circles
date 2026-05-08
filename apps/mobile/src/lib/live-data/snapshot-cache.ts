import * as SQLite from 'expo-sqlite';

import type { SignedAvatarUrlRecord } from '../avatar';
import { resolveAvatarUrl } from '../avatar-url';
import type { AppSnapshot } from './types';

const SNAPSHOT_CACHE_DB_NAME = 'happy-circles-app-cache.db';
const SNAPSHOT_CACHE_SCHEMA_VERSION = 2;

interface CachedAppSnapshotRow {
  readonly avatar_signed_urls_json: string | null;
  readonly snapshot_json: string;
  readonly updated_at: string;
}

export interface CachedAppSnapshot {
  readonly avatarSignedUrlsByPath: SignedAvatarUrlRecord;
  readonly snapshot: AppSnapshot;
  readonly updatedAt: string;
}

type SerializableAppSnapshot = Omit<AppSnapshot, 'notificationViewedKeys'> & {
  readonly notificationViewedKeys: readonly string[];
};

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function getDatabase() {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync(SNAPSHOT_CACHE_DB_NAME).then(async (database) => {
      await database.execAsync(`
        CREATE TABLE IF NOT EXISTS app_snapshot_cache (
          user_id TEXT PRIMARY KEY NOT NULL,
          schema_version INTEGER NOT NULL,
          snapshot_json TEXT NOT NULL,
          avatar_signed_urls_json TEXT NOT NULL DEFAULT '{}',
          updated_at TEXT NOT NULL
        );
      `);

      return database;
    });
  }

  return databasePromise;
}

function serializeAppSnapshot(snapshot: AppSnapshot): SerializableAppSnapshot {
  return {
    ...snapshot,
    notificationViewedKeys: Array.from(snapshot.notificationViewedKeys),
  };
}

function reviveAppSnapshot(value: unknown): AppSnapshot | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    !isRecord(value.dashboard) ||
    !isRecord(value.balanceOverview) ||
    !isRecord(value.balanceAnalytics) ||
    !Array.isArray(value.people) ||
    !isRecord(value.peopleById) ||
    !isRecord(value.happyCircleScore) ||
    !Array.isArray(value.friendshipPendingItems) ||
    !Array.isArray(value.friendshipHistoryItems) ||
    !isRecord(value.friendshipSummary) ||
    !Array.isArray(value.accountInvitePendingItems) ||
    !Array.isArray(value.accountInviteHistoryItems) ||
    !isRecord(value.accountInviteSummary) ||
    !Array.isArray(value.activitySections) ||
    !Array.isArray(value.notificationViewedKeys) ||
    typeof value.notificationUnreadCount !== 'number' ||
    typeof value.pendingCount !== 'number' ||
    !Array.isArray(value.auditEvents) ||
    !isRecord(value.settlementsById)
  ) {
    return null;
  }

  if (value.currentUserProfile !== null && !isRecord(value.currentUserProfile)) {
    return null;
  }

  return {
    ...(value as unknown as SerializableAppSnapshot),
    notificationViewedKeys: new Set(
      value.notificationViewedKeys.filter((key): key is string => typeof key === 'string'),
    ),
  };
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

export async function readCachedAppSnapshot(userId: string): Promise<CachedAppSnapshot | null> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<CachedAppSnapshotRow>(
    `
      SELECT snapshot_json, avatar_signed_urls_json, updated_at
      FROM app_snapshot_cache
      WHERE user_id = ? AND schema_version = ?
      LIMIT 1
    `,
    userId,
    SNAPSHOT_CACHE_SCHEMA_VERSION,
  );

  if (!row) {
    return null;
  }

  const snapshot = parseCachedSnapshotPayload(row.snapshot_json);
  if (!snapshot) {
    await database.runAsync('DELETE FROM app_snapshot_cache WHERE user_id = ?', userId);
    return null;
  }

  return {
    avatarSignedUrlsByPath: parseCachedAvatarUrlsPayload(row.avatar_signed_urls_json),
    snapshot,
    updatedAt: row.updated_at,
  };
}

export async function persistCachedAppSnapshot(
  userId: string,
  snapshot: AppSnapshot,
  avatarSignedUrlsByPath: SignedAvatarUrlRecord = {},
): Promise<void> {
  const database = await getDatabase();
  const updatedAt = new Date().toISOString();

  await database.runAsync(
    `
      INSERT INTO app_snapshot_cache (
        user_id,
        schema_version,
        snapshot_json,
        avatar_signed_urls_json,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        schema_version = excluded.schema_version,
        snapshot_json = excluded.snapshot_json,
        avatar_signed_urls_json = excluded.avatar_signed_urls_json,
        updated_at = excluded.updated_at
    `,
    userId,
    SNAPSHOT_CACHE_SCHEMA_VERSION,
    serializeCachedSnapshotPayload(snapshot),
    serializeCachedAvatarUrlsPayload(avatarSignedUrlsByPath),
    updatedAt,
  );
}

export async function updateCachedSnapshotCurrentUserAvatar(
  userId: string,
  avatarPath: string,
): Promise<void> {
  const cached = await readCachedAppSnapshot(userId);
  if (!cached) {
    return;
  }

  await persistCachedAppSnapshot(
    userId,
    replaceCurrentUserAvatarInSnapshot(cached.snapshot, avatarPath),
    cached.avatarSignedUrlsByPath,
  );
}
