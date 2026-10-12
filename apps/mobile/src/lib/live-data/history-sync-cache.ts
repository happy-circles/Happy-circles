import * as SQLite from 'expo-sqlite';

import { parseHistorySyncState, type HistorySyncState } from './history-sync';

const HISTORY_CACHE_DB_NAME = 'happy-circles-history-cache.db';
const HISTORY_CACHE_SCHEMA_VERSION = 1;

interface CachedHistoryRow {
  readonly state_json: string;
}

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;
const syncLocks = new Map<string, Promise<void>>();

function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync(HISTORY_CACHE_DB_NAME)
      .then(async (database) => {
        await database.execAsync(`
          CREATE TABLE IF NOT EXISTS history_sync_cache (
            backend_scope TEXT NOT NULL,
            user_id TEXT NOT NULL,
            schema_version INTEGER NOT NULL,
            state_json TEXT NOT NULL,
            PRIMARY KEY (backend_scope, user_id)
          );
        `);
        return database;
      })
      .catch((error: unknown) => {
        databasePromise = null;
        throw error;
      });
  }
  return databasePromise;
}

/** Serializes the complete read/fetch/merge/write cycle for one account and backend. */
export async function withHistorySyncLock<T>(
  userId: string,
  scope: string,
  callback: () => Promise<T>,
): Promise<T> {
  const key = JSON.stringify([scope, userId]);
  const previous = syncLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  syncLocks.set(key, current);
  await previous;
  try {
    return await callback();
  } finally {
    release();
    if (syncLocks.get(key) === current) {
      syncLocks.delete(key);
    }
  }
}

export async function readCachedHistory(
  userId: string,
  scope: string,
): Promise<HistorySyncState | null> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<CachedHistoryRow>(
    `
      SELECT state_json
      FROM history_sync_cache
      WHERE backend_scope = ? AND user_id = ? AND schema_version = ?
      LIMIT 1
    `,
    scope,
    userId,
    HISTORY_CACHE_SCHEMA_VERSION,
  );
  if (!row) {
    return null;
  }

  let state: HistorySyncState | null = null;
  try {
    state = parseHistorySyncState(JSON.parse(row.state_json));
  } catch {
    // A corrupted cache must bootstrap again without using an orphaned cursor.
  }
  if (!state) {
    await database.runAsync(
      `DELETE FROM history_sync_cache
       WHERE backend_scope = ? AND user_id = ? AND schema_version = ? AND state_json = ?`,
      scope,
      userId,
      HISTORY_CACHE_SCHEMA_VERSION,
      row.state_json,
    );
  }
  return state;
}

export async function persistCachedHistory(
  userId: string,
  scope: string,
  state: HistorySyncState,
): Promise<void> {
  const payload = JSON.stringify(state);
  if (!parseHistorySyncState(JSON.parse(payload))) {
    throw new Error('Cannot persist an invalid history sync state.');
  }
  const database = await getDatabase();
  // One SQLite statement commits historical rows and their cursor together.
  // Any failure propagates so a retry starts from the last durable cursor.
  await database.runAsync(
    `
      INSERT INTO history_sync_cache (backend_scope, user_id, schema_version, state_json)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(backend_scope, user_id) DO UPDATE SET
        schema_version = excluded.schema_version,
        state_json = excluded.state_json
    `,
    scope,
    userId,
    HISTORY_CACHE_SCHEMA_VERSION,
    payload,
  );
}
