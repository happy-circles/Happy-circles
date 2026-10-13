import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sqlite = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock('expo-sqlite', () => ({ openDatabaseAsync: sqlite.open }));
vi.mock('expo-crypto', () => ({ randomUUID: () => crypto.randomUUID() }));
vi.mock('../config', () => ({ appConfig: { supabaseUrl: 'production' } }));

import type { AppSnapshot, PeopleOverview } from './types';
import { emptyHistorySyncState } from './history-sync';

const overview: PeopleOverview = { fetchedAt: '2026-10-13T00:00:00.000Z', people: [] };

function bridge(database: DatabaseSync) {
  return {
    execAsync: async (sql: string) => database.exec(sql),
    getFirstAsync: async (sql: string, ...values: SQLInputValue[]) =>
      database.prepare(sql).get(...values) ?? null,
    runAsync: async (sql: string, ...values: SQLInputValue[]) =>
      database.prepare(sql).run(...values),
  };
}

describe('account and session isolation in real SQLite', () => {
  let database: DatabaseSync;
  beforeEach(() => {
    vi.resetModules();
    sqlite.open.mockReset();
    database = new DatabaseSync(':memory:');
    sqlite.open.mockResolvedValue(bridge(database));
  });
  afterEach(() => database.close());

  it('separates people data by account and backend and ignores unscoped legacy entries', async () => {
    database.exec(
      'CREATE TABLE people_overview_cache (user_id TEXT PRIMARY KEY, schema_version INTEGER, overview_json TEXT, avatar_signed_urls_json TEXT, updated_at TEXT)',
    );
    database
      .prepare('INSERT INTO people_overview_cache VALUES (?, ?, ?, ?, ?)')
      .run('legacy-a', 1, JSON.stringify(overview), '{}', overview.fetchedAt);
    const cache = await import('./people-overview-cache');
    await expect(cache.readCachedPeopleOverview('legacy-a')).resolves.toBeNull();
    const b = { ...overview, fetchedAt: '2026-10-13T01:00:00.000Z' };
    const preview = { ...overview, fetchedAt: '2026-10-13T02:00:00.000Z' };
    await cache.persistCachedPeopleOverview('a', overview);
    await cache.persistCachedPeopleOverview('b', b);
    await cache.persistCachedPeopleOverview('a', preview, {}, { backendScope: 'preview' });
    expect((await cache.readCachedPeopleOverview('a'))?.overview).toEqual(overview);
    expect((await cache.readCachedPeopleOverview('b'))?.overview).toEqual(b);
    expect((await cache.readCachedPeopleOverview('a', 'preview'))?.overview).toEqual(preview);
  });

  it.each(['people', 'snapshot', 'history'] as const)(
    'prevents a stale %s write after awaiting database initialization',
    async (kind) => {
      let resolve!: (value: ReturnType<typeof bridge>) => void;
      const opening = new Promise<ReturnType<typeof bridge>>((complete) => {
        resolve = complete;
      });
      sqlite.open.mockReturnValue(opening);
      const boundary = await import('../session-data-boundary');
      boundary.setSessionDataIdentity({ userId: 'a', sessionId: 'a-session' });
      const generation = boundary.captureSessionDataGeneration();
      const options = { assertCurrent: () => boundary.assertSessionDataGeneration(generation) };
      let writing: Promise<unknown>;
      let table: string;
      if (kind === 'people') {
        const cache = await import('./people-overview-cache');
        writing = cache.persistCachedPeopleOverview('a', overview, {}, options);
        table = 'people_overview_cache_v2';
      } else if (kind === 'snapshot') {
        const cache = await import('./snapshot-cache');
        writing = cache.persistCachedAppSnapshot(
          'a',
          { notificationViewedKeys: new Set() } as unknown as AppSnapshot,
          {},
          options,
        );
        table = 'app_snapshot_cache';
      } else {
        const cache = await import('./history-sync-cache');
        writing = cache.persistCachedHistory('a', 'production', emptyHistorySyncState(), options);
        table = 'history_sync_cache';
      }
      const rejected = expect(writing).rejects.toThrow('La sesión cambió');
      boundary.setSessionDataIdentity({ userId: 'b', sessionId: 'b-session' });
      boundary.setSessionDataIdentity({ userId: 'a', sessionId: 'a-session' });
      resolve(bridge(database));
      await rejected;
      expect(database.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get()?.total).toBe(0);
    },
  );
});
