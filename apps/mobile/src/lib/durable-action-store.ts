import * as SQLite from 'expo-sqlite';

import type { DurableActionStore } from './durable-action';

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync('happy-circles-action-journal.db')
      .then(async (database) => {
        await database.execAsync(`
          PRAGMA synchronous = FULL;
          CREATE TABLE IF NOT EXISTS durable_action_intentions (
            signature TEXT PRIMARY KEY NOT NULL,
            idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) >= 8),
            status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed'))
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

export const durableActionStore: DurableActionStore = {
  async acquire(signature, candidateKey, retiredKey) {
    const database = await getDatabase();
    // One statement reserves or reuses the key across concurrent callers. Do
    // not replace an unresolved intention merely because the app restarted.
    const row = await database.getFirstAsync<{ idempotency_key: string }>(
      `INSERT INTO durable_action_intentions (signature, idempotency_key, status)
       VALUES (?, ?, 'pending')
       ON CONFLICT(signature) DO UPDATE SET
         idempotency_key = CASE
           WHEN status = 'confirmed' OR idempotency_key = ? THEN excluded.idempotency_key
           ELSE idempotency_key END,
         status = 'pending'
       RETURNING idempotency_key`,
      signature,
      candidateKey,
      retiredKey ?? null,
    );
    if (!row || typeof row.idempotency_key !== 'string' || row.idempotency_key.length < 8) {
      throw new Error('Invalid durable action journal.');
    }
    return row.idempotency_key;
  },
  async confirm(signature, key) {
    const database = await getDatabase();
    await database.runAsync(
      `UPDATE durable_action_intentions SET status = 'confirmed'
       WHERE signature = ? AND idempotency_key = ?`,
      signature,
      key,
    );
  },
};
