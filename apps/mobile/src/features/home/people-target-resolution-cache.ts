import * as Crypto from 'expo-crypto';
import * as SQLite from 'expo-sqlite';

import {
  CONTACT_RESOLUTION_CACHE_TTL_MS,
  contactResolutionCacheTtlMs,
  isReusableCachedContactResolution,
} from '@/features/home/contacts-sheet-helpers';
import type { PeopleTargetResolution } from '@/lib/live-data';
import { readContactResolutions } from '@/lib/contact-resolution-state';

const DATABASE_NAME = 'happy-circles-people-target-resolution-cache.db';
// Versioned separately: pre-v2 rows had no usable in-memory freshness metadata.
const TABLE_NAME = 'people_target_resolution_cache_v2';
const QUERY_CHUNK_SIZE = 250;

type StoredPeopleTargetResolution = Omit<PeopleTargetResolution, 'phoneE164'>;

type PeopleTargetResolutionCacheRow = {
  readonly phone_hash: string;
  readonly resolution_json: string;
  readonly resolved_at: number;
  readonly generation: number;
};

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;
let writes: Promise<void> = Promise.resolve();

function serializeWrite(work: () => Promise<void>): Promise<void> {
  const next = writes.catch(() => undefined).then(work);
  writes = next;
  return next;
}

function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  databasePromise ??= SQLite.openDatabaseAsync(DATABASE_NAME).then(async (database) => {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
        user_id TEXT NOT NULL,
        phone_hash TEXT NOT NULL,
        resolution_json TEXT NOT NULL,
        resolved_at INTEGER NOT NULL,
        generation INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, phone_hash)
      );
      CREATE INDEX IF NOT EXISTS idx_people_target_resolution_cache_v2_expiry
        ON ${TABLE_NAME} (user_id, resolved_at);
    `);

    return database;
  });

  return databasePromise;
}

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

export function isPeopleTargetResolutionCacheEntryFresh(input: {
  readonly resolvedAt: number;
  readonly status?: PeopleTargetResolution['status'];
  readonly now?: number;
}): boolean {
  const now = input.now ?? Date.now();
  const ttlMs = input.status
    ? contactResolutionCacheTtlMs(input.status)
    : CONTACT_RESOLUTION_CACHE_TTL_MS;
  return now - input.resolvedAt <= ttlMs;
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
    resolvedAt: resolution.resolvedAt,
    generation: resolution.generation,
    friendshipDirection: resolution.friendshipDirection,
    availableActions: resolution.availableActions,
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

function parseStoredResolution(value: string): StoredPeopleTargetResolution | null {
  try {
    const parsed = JSON.parse(value) as Partial<StoredPeopleTargetResolution>;
    if (
      typeof parsed.status !== 'string' ||
      ![
        'active_user',
        'pending_activation',
        'no_account',
        'already_related',
        'pending_friendship',
      ].includes(parsed.status)
    ) {
      return null;
    }

    return parsed as StoredPeopleTargetResolution;
  } catch {
    return null;
  }
}

async function buildHashPhonePairs(
  userId: string,
  phoneE164List: readonly string[],
): Promise<readonly { readonly phoneE164: string; readonly phoneHash: string }[]> {
  return Promise.all(
    phoneE164List.map(async (phoneE164) => ({
      phoneE164,
      phoneHash: await createPeopleTargetResolutionCacheKey({ userId, phoneE164 }),
    })),
  );
}

export async function loadPeopleTargetResolutionCache(
  userId: string | null | undefined,
  phoneE164List: readonly string[],
): Promise<Record<string, PeopleTargetResolution>> {
  if (!userId || phoneE164List.length === 0) {
    return {};
  }

  const uniquePhones = [...new Set(phoneE164List)];
  const hashPhonePairs = await buildHashPhonePairs(userId, uniquePhones);
  const phoneByHash = new Map(hashPhonePairs.map((pair) => [pair.phoneHash, pair.phoneE164]));
  // Retain stale display data offline; the shared store decides when to revalidate it.
  const freshAfter = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const database = await getDatabase();
  const result: Record<string, PeopleTargetResolution> = {};

  for (let index = 0; index < hashPhonePairs.length; index += QUERY_CHUNK_SIZE) {
    const chunk = hashPhonePairs.slice(index, index + QUERY_CHUNK_SIZE);
    const placeholders = chunk.map(() => '?').join(', ');
    const rows = await database.getAllAsync<PeopleTargetResolutionCacheRow>(
      `SELECT phone_hash, resolution_json, resolved_at, generation
       FROM ${TABLE_NAME}
       WHERE user_id = ?
         AND resolved_at >= ?
         AND phone_hash IN (${placeholders})`,
      [userId, freshAfter, ...chunk.map((pair) => pair.phoneHash)],
    );

    for (const row of rows) {
      const phoneE164 = phoneByHash.get(row.phone_hash);
      const storedResolution = parseStoredResolution(row.resolution_json);
      if (!phoneE164 || !storedResolution) {
        continue;
      }
      const restoredResolution = restorePhoneOnPeopleTargetResolution({
        phoneE164,
        storedResolution: {
          ...storedResolution,
          resolvedAt: row.resolved_at,
          generation: row.generation,
        },
      });
      if (!isReusableCachedContactResolution(restoredResolution)) {
        continue;
      }

      result[phoneE164] = restoredResolution;
    }
  }

  return result;
}

export async function savePeopleTargetResolutionsToCache(
  userId: string | null | undefined,
  resolutions: readonly PeopleTargetResolution[],
): Promise<void> {
  const reusableResolutions = resolutions.filter(isReusableCachedContactResolution);

  if (!userId || reusableResolutions.length === 0) {
    return;
  }

  await serializeWrite(async () => {
    const database = await getDatabase();
    const now = Date.now();
    const hashPhonePairs = await buildHashPhonePairs(
      userId,
      reusableResolutions.map((resolution) => resolution.phoneE164),
    );
    const hashByPhone = new Map(hashPhonePairs.map((pair) => [pair.phoneE164, pair.phoneHash]));
    await database.withTransactionAsync(async () => {
      for (const resolution of reusableResolutions) {
        const current = readContactResolutions(userId)[resolution.phoneE164];
        if (
          !current ||
          current.generation !== resolution.generation ||
          current.resolvedAt !== resolution.resolvedAt
        )
          continue;
        const phoneHash = hashByPhone.get(resolution.phoneE164);
        if (!phoneHash) {
          continue;
        }

        await database.runAsync(
          `INSERT INTO ${TABLE_NAME}
          (user_id, phone_hash, resolution_json, resolved_at, generation)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(user_id, phone_hash) DO UPDATE SET
           resolution_json = excluded.resolution_json,
           resolved_at = excluded.resolved_at,
           generation = excluded.generation
         WHERE excluded.generation >= ${TABLE_NAME}.generation`,
          [
            userId,
            phoneHash,
            JSON.stringify(stripPhoneFromPeopleTargetResolution(resolution)),
            resolution.resolvedAt ?? now,
            resolution.generation ?? now,
          ],
        );
      }
    });
  });
}

export async function invalidatePeopleTargetResolutionCache(userId: string): Promise<void> {
  await serializeWrite(async () => {
    const database = await getDatabase();
    await database.runAsync(`DELETE FROM ${TABLE_NAME} WHERE user_id = ?`, [userId]);
  });
}

export async function pruneExpiredPeopleTargetResolutionCache(
  userId: string | null | undefined,
): Promise<void> {
  if (!userId) {
    return;
  }

  await serializeWrite(async () => {
    const database = await getDatabase();
    await database.runAsync(
      `DELETE FROM ${TABLE_NAME}
     WHERE user_id = ?
       AND resolved_at < ?`,
      [userId, Date.now() - 30 * 24 * 60 * 60 * 1000],
    );
  });
}
