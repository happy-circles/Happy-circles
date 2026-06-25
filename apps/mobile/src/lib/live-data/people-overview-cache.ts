import * as SQLite from 'expo-sqlite';

import type { SignedAvatarUrlRecord } from '../avatar';
import type { PeopleOverview } from './types';

const CACHE_DB_NAME = 'happy-circles-app-cache.db';
const PEOPLE_OVERVIEW_CACHE_SCHEMA_VERSION = 1;

interface CachedPeopleOverviewRow {
  readonly avatar_signed_urls_json: string | null;
  readonly overview_json: string;
  readonly updated_at: string;
}

export interface CachedPeopleOverview {
  readonly avatarSignedUrlsByPath: SignedAvatarUrlRecord;
  readonly overview: PeopleOverview;
  readonly updatedAt: string;
}

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function getDatabase() {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync(CACHE_DB_NAME).then(async (database) => {
      await database.execAsync(`
        CREATE TABLE IF NOT EXISTS people_overview_cache (
          user_id TEXT PRIMARY KEY NOT NULL,
          schema_version INTEGER NOT NULL,
          overview_json TEXT NOT NULL,
          avatar_signed_urls_json TEXT NOT NULL DEFAULT '{}',
          updated_at TEXT NOT NULL
        );
      `);

      return database;
    });
  }

  return databasePromise;
}

function parseOverviewPayload(payload: string): PeopleOverview | null {
  try {
    const value: unknown = JSON.parse(payload);
    if (!isRecord(value) || typeof value.fetchedAt !== 'string' || !Array.isArray(value.people)) {
      return null;
    }

    const hasInvalidPerson = value.people.some(
      (person) =>
        !isRecord(person) ||
        typeof person.userId !== 'string' ||
        typeof person.displayName !== 'string' ||
        typeof person.netAmountMinor !== 'number' ||
        typeof person.pendingCount !== 'number' ||
        typeof person.lastActivityLabel !== 'string' ||
        !['i_owe', 'owes_me', 'settled'].includes(String(person.direction)),
    );

    return hasInvalidPerson ? null : (value as unknown as PeopleOverview);
  } catch {
    return null;
  }
}

function parseAvatarUrlsPayload(payload: string | null): SignedAvatarUrlRecord {
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

export async function readCachedPeopleOverview(
  userId: string,
): Promise<CachedPeopleOverview | null> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<CachedPeopleOverviewRow>(
    `
      SELECT overview_json, avatar_signed_urls_json, updated_at
      FROM people_overview_cache
      WHERE user_id = ? AND schema_version = ?
      LIMIT 1
    `,
    userId,
    PEOPLE_OVERVIEW_CACHE_SCHEMA_VERSION,
  );

  if (!row) {
    return null;
  }

  const overview = parseOverviewPayload(row.overview_json);
  if (!overview) {
    await database.runAsync('DELETE FROM people_overview_cache WHERE user_id = ?', userId);
    return null;
  }

  return {
    avatarSignedUrlsByPath: parseAvatarUrlsPayload(row.avatar_signed_urls_json),
    overview,
    updatedAt: row.updated_at,
  };
}

export async function persistCachedPeopleOverview(
  userId: string,
  overview: PeopleOverview,
  avatarSignedUrlsByPath: SignedAvatarUrlRecord = {},
): Promise<void> {
  const database = await getDatabase();
  const updatedAt = overview.fetchedAt || new Date().toISOString();

  await database.runAsync(
    `
      INSERT INTO people_overview_cache (
        user_id,
        schema_version,
        overview_json,
        avatar_signed_urls_json,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        schema_version = excluded.schema_version,
        overview_json = excluded.overview_json,
        avatar_signed_urls_json = excluded.avatar_signed_urls_json,
        updated_at = excluded.updated_at
    `,
    userId,
    PEOPLE_OVERVIEW_CACHE_SCHEMA_VERSION,
    JSON.stringify(overview),
    JSON.stringify(avatarSignedUrlsByPath),
    updatedAt,
  );
}
