import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  mergeHistoryWithLiveRows,
  type HistorySyncPage,
  type HistorySyncState,
} from './history-sync';
import type * as NativeHistoryCache from './history-sync-cache';
import type * as WebHistoryCache from './history-sync-cache.web';
import { synchronizeHistorySnapshot } from './history-sync-runner';
import type { LiveSnapshotRows } from './types';

const sqliteMocks = vi.hoisted(() => ({
  openDatabaseAsync: vi.fn(),
}));

vi.mock('expo-sqlite', () => ({
  openDatabaseAsync: sqliteMocks.openDatabaseAsync,
}));

const scope = 'https://production.supabase.co';
const epoch = 'a70edac3-8a51-4488-91e9-73e4b3a0f301';

function state(sequence = 1): HistorySyncState {
  return {
    protocol: 1,
    cursor: `${epoch}:${sequence}`,
    collections: {
      profiles: {},
      financialRequests: {
        'request-a': { id: 'request-a', state: 'confirmed', amount_minor: sequence },
      },
      history: {},
      friendshipInvites: {},
      friendshipInviteDeliveries: {},
      accountInvites: {},
      accountInviteDeliveries: {},
      settlementProposals: {},
      settlementParticipants: {},
      happyCircleScoreEvents: {},
      auditEvents: {},
    },
  };
}

function snapshotRows(historySync?: HistorySyncPage): LiveSnapshotRows {
  return {
    profiles: [],
    avatarSignedUrlsByPath: {},
    relationships: [],
    openDebts: [],
    financialRequests: [],
    history: [],
    inboxItems: [],
    friendshipInvites: [],
    friendshipInviteDeliveries: [],
    accountInvites: [],
    accountInviteDeliveries: [],
    settlementProposals: [],
    settlementParticipants: [],
    happyCircleScoreEvents: [],
    notificationViews: [],
    auditEvents: [],
    limits: {
      financialRequestHistory: 250,
      relationshipHistory: 300,
      friendshipInviteHistory: 250,
      accountInviteHistory: 250,
      settlementHistory: 100,
      auditEvents: 200,
      notificationViews: 200,
    },
    fetchedAt: '2026-10-11T12:00:00.000Z',
    ...(historySync ? { historySync } : {}),
  };
}

function page(
  sequence: number,
  changes: HistorySyncPage['changes'],
  options: Partial<HistorySyncPage> = {},
): HistorySyncPage {
  return {
    protocol: 1,
    cursor: `${epoch}:${sequence}`,
    hasMore: false,
    reset: false,
    changes,
    ...options,
  };
}

function sqliteAdapter(database: DatabaseSync) {
  return {
    execAsync: async (sql: string) => database.exec(sql),
    getFirstAsync: async (sql: string, ...params: SQLInputValue[]) =>
      database.prepare(sql).get(...params) ?? null,
    runAsync: async (sql: string, ...params: SQLInputValue[]) =>
      database.prepare(sql).run(...params),
  };
}

describe('durable history synchronization cache', () => {
  let database: DatabaseSync;
  let cache: typeof NativeHistoryCache;
  let temporaryDirectory: string;
  let databasePath: string;

  beforeEach(async () => {
    vi.resetModules();
    sqliteMocks.openDatabaseAsync.mockReset();
    temporaryDirectory = mkdtempSync(join(tmpdir(), 'happy-circles-history-test-'));
    databasePath = join(temporaryDirectory, 'history.db');
    database = new DatabaseSync(databasePath);
    sqliteMocks.openDatabaseAsync.mockResolvedValue(sqliteAdapter(database));
    cache = await import('./history-sync-cache');
  });

  afterEach(() => {
    database.close();
    rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  it('restores all historical rows and their cursor after reopening SQLite', async () => {
    const initial = state(27);
    const durableState: HistorySyncState = {
      ...initial,
      collections: {
        ...initial.collections,
        history: {
          'transaction:relationship-a:item-a': {
            item_kind: 'transaction',
            relationship_id: 'relationship-a',
            item_id: 'item-a',
          },
          'financial_request:relationship-a:item-a': {
            item_kind: 'financial_request',
            relationship_id: 'relationship-a',
            item_id: 'item-a',
          },
        },
        settlementProposals: { 'circle-a': { id: 'circle-a', status: 'settled' } },
        settlementParticipants: {
          'participant-a': { id: 'participant-a', proposal_id: 'circle-a' },
        },
        happyCircleScoreEvents: {
          'award-a': { id: 'award-a', settlement_proposal_id: 'circle-a' },
        },
      },
      liveRows: snapshotRows(),
      bootstrapComplete: true,
    };
    await cache.persistCachedHistory('user-a', scope, durableState);

    database.close();
    database = new DatabaseSync(databasePath);
    sqliteMocks.openDatabaseAsync.mockResolvedValue(sqliteAdapter(database));
    vi.resetModules();
    cache = await import('./history-sync-cache');

    const restored = await cache.readCachedHistory('user-a', scope);
    expect(restored).toEqual(durableState);
    expect(restored?.bootstrapComplete).toBe(true);
    expect(restored?.liveRows).toEqual(snapshotRows());
    const offline = mergeHistoryWithLiveRows(restored!.liveRows!, restored!);
    expect(offline.financialRequests).toEqual([
      durableState.collections.financialRequests['request-a'],
    ]);
    expect(offline.history).toHaveLength(2);
    expect(offline.settlementProposals.map((row) => row.id)).toEqual(['circle-a']);
    expect(offline.settlementParticipants.map((row) => row.id)).toEqual(['participant-a']);
    expect(offline.happyCircleScoreEvents.map((row) => row.id)).toEqual(['award-a']);
  });

  it('isolates accounts and backend environments', async () => {
    await cache.persistCachedHistory('user-a', scope, state(1));
    await cache.persistCachedHistory('user-b', scope, state(2));
    await cache.persistCachedHistory('user-a', 'https://preview.supabase.co', state(3));

    await expect(cache.readCachedHistory('user-a', scope)).resolves.toEqual(state(1));
    await expect(cache.readCachedHistory('user-b', scope)).resolves.toEqual(state(2));
    await expect(cache.readCachedHistory('user-a', 'https://preview.supabase.co')).resolves.toEqual(
      state(3),
    );
    await expect(cache.readCachedHistory('user-c', scope)).resolves.toBeNull();
  });

  it('keeps the previous rows and cursor when SQLite rejects a write, then retries safely', async () => {
    await cache.persistCachedHistory('user-a', scope, state(1));
    database.exec(`
      CREATE TRIGGER reject_history_update BEFORE UPDATE ON history_sync_cache
      BEGIN SELECT RAISE(ABORT, 'simulated disk failure'); END;
    `);

    await expect(cache.persistCachedHistory('user-a', scope, state(2))).rejects.toThrow(
      'simulated disk failure',
    );
    await expect(cache.readCachedHistory('user-a', scope)).resolves.toEqual(state(1));

    database.exec('DROP TRIGGER reject_history_update');
    await cache.persistCachedHistory('user-a', scope, state(2));
    await cache.persistCachedHistory('user-a', scope, state(2));

    await expect(cache.readCachedHistory('user-a', scope)).resolves.toEqual(state(2));
    expect(database.prepare('SELECT COUNT(*) AS count FROM history_sync_cache').get()).toEqual({
      count: 1,
    });
  });

  it('bootstraps after corrupted data and ignores incompatible storage schema versions', async () => {
    await cache.persistCachedHistory('user-a', scope, state(1));
    database
      .prepare('UPDATE history_sync_cache SET state_json = ? WHERE user_id = ?')
      .run('{', 'user-a');
    await expect(cache.readCachedHistory('user-a', scope)).resolves.toBeNull();
    expect(database.prepare('SELECT COUNT(*) AS count FROM history_sync_cache').get()).toEqual({
      count: 0,
    });

    await cache.persistCachedHistory('user-a', scope, state(2));
    database.exec('UPDATE history_sync_cache SET schema_version = 0');
    await expect(cache.readCachedHistory('user-a', scope)).resolves.toBeNull();
    await cache.persistCachedHistory('user-a', scope, state(3));
    await expect(cache.readCachedHistory('user-a', scope)).resolves.toEqual(state(3));
  });

  it('rejects malformed state without discarding previously committed history', async () => {
    await cache.persistCachedHistory('user-a', scope, state(1));
    const invalidState = { ...state(2), protocol: 2 } as unknown as HistorySyncState;

    await expect(cache.persistCachedHistory('user-a', scope, invalidState)).rejects.toThrow(
      'invalid history sync state',
    );
    await expect(cache.readCachedHistory('user-a', scope)).resolves.toEqual(state(1));
  });

  it('never restores a cursor without its corresponding complete collection payload', async () => {
    await cache.persistCachedHistory('user-a', scope, state(1));
    const invalidPayload = JSON.stringify({ protocol: 1, cursor: `${epoch}:200`, collections: {} });
    database
      .prepare('UPDATE history_sync_cache SET state_json = ? WHERE user_id = ?')
      .run(invalidPayload, 'user-a');

    await expect(cache.readCachedHistory('user-a', scope)).resolves.toBeNull();
    expect(database.prepare('SELECT COUNT(*) AS count FROM history_sync_cache').get()).toEqual({
      count: 0,
    });
  });

  it('does not delete a newer commit while removing a previously read corrupt payload', async () => {
    await cache.persistCachedHistory('user-a', scope, state(1));
    database.exec("UPDATE history_sync_cache SET state_json = '{'");
    const adapter = sqliteAdapter(database);
    sqliteMocks.openDatabaseAsync.mockResolvedValue({
      ...adapter,
      getFirstAsync: async (sql: string, ...params: SQLInputValue[]) => {
        const staleRow = await adapter.getFirstAsync(sql, ...params);
        database
          .prepare('UPDATE history_sync_cache SET state_json = ? WHERE user_id = ?')
          .run(JSON.stringify(state(2)), 'user-a');
        return staleRow;
      },
    });
    vi.resetModules();
    cache = await import('./history-sync-cache');

    await expect(cache.readCachedHistory('user-a', scope)).resolves.toBeNull();
    expect(database.prepare('SELECT state_json FROM history_sync_cache').get()).toEqual({
      state_json: JSON.stringify(state(2)),
    });
  });

  it.each([
    {
      invalid: 'invalid timestamp',
      liveRows: { ...snapshotRows(), fetchedAt: 'invalid-date' },
    },
    {
      invalid: 'missing row identity',
      liveRows: { ...snapshotRows(), profiles: [{}] },
    },
    {
      invalid: 'invalid collection shape',
      liveRows: { ...snapshotRows(), financialRequests: 'missing-array' },
    },
  ])('bootstraps safely when persisted offline context has $invalid', async ({ liveRows }) => {
    await cache.persistCachedHistory('user-a', scope, state(1));
    database
      .prepare('UPDATE history_sync_cache SET state_json = ? WHERE user_id = ?')
      .run(JSON.stringify({ ...state(1), liveRows, bootstrapComplete: true }), 'user-a');

    const request = vi.fn(async (cursor: string | null) => {
      expect(cursor).toBeNull();
      return snapshotRows(
        page(
          2,
          [{ collection: 'financialRequests', key: 'request-new', row: { id: 'request-new' } }],
          { reset: true },
        ),
      );
    });
    const recovered = await synchronizeHistorySnapshot({
      read: () => cache.readCachedHistory('user-a', scope),
      persist: (next) => cache.persistCachedHistory('user-a', scope, next),
      request,
    });

    expect(request).toHaveBeenCalledTimes(1);
    expect(recovered.financialRequests.map((row) => row.id)).toEqual(['request-new']);
    const restored = await cache.readCachedHistory('user-a', scope);
    expect(restored?.cursor).toBe(`${epoch}:2`);
    expect(restored?.bootstrapComplete).toBe(true);
    expect(restored?.liveRows?.historySync).toBeUndefined();
  });

  it('resumes an interrupted paginated bootstrap after reopening the actual SQLite file', async () => {
    const source = Array.from({ length: 317 }, (_, index) => ({
      collection: 'financialRequests' as const,
      key: `request-${index}`,
      row: { id: `request-${index}`, status: 'accepted', amount_minor: index + 1 },
    }));
    const firstRequest = vi.fn(async (cursor: string | null) => {
      if (cursor !== null) throw new Error('network disconnected');
      return snapshotRows(page(137, source.slice(0, 137), { reset: true, hasMore: true }));
    });

    await expect(
      synchronizeHistorySnapshot({
        read: () => cache.readCachedHistory('user-a', scope),
        persist: (next) => cache.persistCachedHistory('user-a', scope, next),
        request: firstRequest,
      }),
    ).rejects.toThrow('network disconnected');
    const interrupted = await cache.readCachedHistory('user-a', scope);
    expect(interrupted?.cursor).toBe(`${epoch}:137`);
    expect(interrupted?.bootstrapComplete).toBe(false);
    expect(Object.keys(interrupted?.collections.financialRequests ?? {})).toHaveLength(137);
    expect(interrupted?.liveRows).toEqual(snapshotRows());
    expect(interrupted?.liveRows?.historySync).toBeUndefined();

    database.close();
    database = new DatabaseSync(databasePath);
    sqliteMocks.openDatabaseAsync.mockResolvedValue(sqliteAdapter(database));
    vi.resetModules();
    cache = await import('./history-sync-cache');
    const resumedCursors: (string | null)[] = [];
    const result = await synchronizeHistorySnapshot({
      read: () => cache.readCachedHistory('user-a', scope),
      persist: (next) => cache.persistCachedHistory('user-a', scope, next),
      request: async (cursor) => {
        resumedCursors.push(cursor);
        const offset = Number(cursor?.split(':')[1]);
        const end = Math.min(offset + 137, source.length);
        return snapshotRows(
          page(end, source.slice(Math.max(0, offset - 1), end), {
            hasMore: end < source.length,
          }),
        );
      },
    });

    expect(resumedCursors).toEqual([`${epoch}:137`, `${epoch}:274`]);
    expect(result.financialRequests).toHaveLength(source.length);
    expect(new Set(result.financialRequests.map((row) => row.id)).size).toBe(source.length);
    const completed = await cache.readCachedHistory('user-a', scope);
    expect(completed?.cursor).toBe(`${epoch}:317`);
    expect(completed?.bootstrapComplete).toBe(true);
    expect(completed?.liveRows?.historySync).toBeUndefined();
    expect(Object.keys(completed?.collections.financialRequests ?? {})).toHaveLength(317);
  });

  it('retries the same network page after an actual SQLite write rejection without losing offline context', async () => {
    const initial = { ...state(1), liveRows: snapshotRows(), bootstrapComplete: true };
    await cache.persistCachedHistory('user-a', scope, initial);
    database.exec(`
      CREATE TRIGGER reject_history_update BEFORE UPDATE ON history_sync_cache
      BEGIN SELECT RAISE(ABORT, 'simulated disk failure'); END;
    `);
    const incoming = {
      ...snapshotRows(
        page(2, [
          {
            collection: 'financialRequests',
            key: 'request-a',
            row: { id: 'request-a', status: 'accepted', amount_minor: 200 },
          },
          {
            collection: 'financialRequests',
            key: 'request-b',
            row: { id: 'request-b', status: 'accepted', amount_minor: 300 },
          },
        ]),
      ),
      fetchedAt: '2026-10-11T12:01:00.000Z',
    };
    const requestedCursors: (string | null)[] = [];
    const synchronize = () =>
      synchronizeHistorySnapshot({
        read: () => cache.readCachedHistory('user-a', scope),
        persist: (next) => cache.persistCachedHistory('user-a', scope, next),
        request: async (cursor) => {
          requestedCursors.push(cursor);
          return incoming;
        },
      });

    await expect(synchronize()).rejects.toThrow('simulated disk failure');
    await expect(cache.readCachedHistory('user-a', scope)).resolves.toEqual(initial);

    database.exec('DROP TRIGGER reject_history_update');
    const recovered = await synchronize();
    const replayed = await synchronize();

    expect(requestedCursors).toEqual([`${epoch}:1`, `${epoch}:1`, `${epoch}:2`]);
    expect(recovered.financialRequests.map((row) => row.id)).toEqual(['request-a', 'request-b']);
    expect(replayed.financialRequests).toEqual(recovered.financialRequests);
    expect(recovered.financialRequests[0]?.amount_minor).toBe(200);
    const restored = await cache.readCachedHistory('user-a', scope);
    expect(restored?.cursor).toBe(`${epoch}:2`);
    expect(restored?.liveRows?.fetchedAt).toBe(incoming.fetchedAt);
    expect(restored?.liveRows?.historySync).toBeUndefined();
    expect(restored?.bootstrapComplete).toBe(true);
    expect(database.prepare('SELECT COUNT(*) AS count FROM history_sync_cache').get()).toEqual({
      count: 1,
    });
  });

  it('retries initialization after an unavailable database', async () => {
    sqliteMocks.openDatabaseAsync.mockRejectedValueOnce(new Error('device locked'));

    await expect(cache.readCachedHistory('user-a', scope)).rejects.toThrow('device locked');
    await cache.persistCachedHistory('user-a', scope, state(1));

    await expect(cache.readCachedHistory('user-a', scope)).resolves.toEqual(state(1));
    expect(sqliteMocks.openDatabaseAsync).toHaveBeenCalledTimes(2);
  });

  it('serializes complete sync cycles so concurrent updates cannot overwrite newer history', async () => {
    const update = (requestId: string) =>
      cache.withHistorySyncLock('user-a', scope, async () => {
        const current = (await cache.readCachedHistory('user-a', scope)) ?? state(0);
        await Promise.resolve();
        const next: HistorySyncState = {
          ...current,
          cursor: `${epoch}:${Object.keys(current.collections.financialRequests).length + 1}`,
          collections: {
            ...current.collections,
            financialRequests: {
              ...current.collections.financialRequests,
              [requestId]: { id: requestId, state: 'confirmed' },
            },
          },
        };
        await cache.persistCachedHistory('user-a', scope, next);
      });

    await Promise.all([update('request-b'), update('request-c'), update('request-d')]);

    const restored = await cache.readCachedHistory('user-a', scope);
    expect(Object.keys(restored?.collections.financialRequests ?? {}).sort()).toEqual([
      'request-a',
      'request-b',
      'request-c',
      'request-d',
    ]);
    expect(restored?.cursor).toBe(`${epoch}:4`);
  });

  it('releases a failed sync lock and lets independent accounts sync immediately', async () => {
    let releaseFirst!: () => void;
    const blocked = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const first = cache.withHistorySyncLock('user-a', scope, async () => {
      await blocked;
      throw new Error('offline');
    });
    const failure = expect(first).rejects.toThrow('offline');
    const second = cache.withHistorySyncLock('user-a', scope, async () => 'retry');
    const otherUser = cache.withHistorySyncLock('user-b', scope, async () => 'other account');
    const otherBackend = cache.withHistorySyncLock(
      'user-a',
      'preview',
      async () => 'other backend',
    );

    await expect(otherUser).resolves.toBe('other account');
    await expect(otherBackend).resolves.toBe('other backend');
    releaseFirst();
    await failure;
    await expect(second).resolves.toBe('retry');
  });
});

describe('browser history synchronization cache', () => {
  let cache: typeof WebHistoryCache;

  beforeEach(async () => {
    vi.resetModules();
    cache = await import('./history-sync-cache.web');
  });

  it('isolates accounts and backend scopes and avoids mutable shared state', async () => {
    const original = state(1);
    await cache.persistCachedHistory('user-a', scope, original);
    original.collections.financialRequests['request-mutated'] = { id: 'request-mutated' };
    await cache.persistCachedHistory('user-b', scope, state(2));
    await cache.persistCachedHistory('user-a', 'preview', state(3));

    const restored = await cache.readCachedHistory('user-a', scope);
    expect(restored).toEqual(state(1));
    if (restored) {
      restored.collections.financialRequests['request-mutated'] = { id: 'request-mutated' };
    }
    await expect(cache.readCachedHistory('user-a', scope)).resolves.toEqual(state(1));
    await expect(cache.readCachedHistory('user-b', scope)).resolves.toEqual(state(2));
    await expect(cache.readCachedHistory('user-a', 'preview')).resolves.toEqual(state(3));
    await expect(cache.readCachedHistory('unknown', scope)).resolves.toBeNull();
  });

  it('bootstraps again after a browser reload', async () => {
    await cache.persistCachedHistory('user-a', scope, state(1));

    vi.resetModules();
    cache = await import('./history-sync-cache.web');

    await expect(cache.readCachedHistory('user-a', scope)).resolves.toBeNull();
  });

  it('serializes cycles and releases the lock after a rejected callback', async () => {
    const calls: string[] = [];
    const failure = cache.withHistorySyncLock('user-a', scope, async () => {
      calls.push('failed');
      await Promise.resolve();
      throw new Error('offline');
    });
    const next = cache.withHistorySyncLock('user-a', scope, async () => {
      calls.push('retry');
      return 'synced';
    });

    await expect(failure).rejects.toThrow('offline');
    await expect(next).resolves.toBe('synced');
    expect(calls).toEqual(['failed', 'retry']);
  });
});
