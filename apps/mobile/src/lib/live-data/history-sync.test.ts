import { describe, expect, it, vi } from 'vitest';

import {
  applyHistorySyncPage,
  emptyHistorySyncState,
  mergeHistoryWithLiveRows,
  parseHistorySyncPage,
  parseHistorySyncState,
  type HistorySyncChange,
  type HistorySyncPage,
  type HistorySyncState,
} from './history-sync';
import { synchronizeHistorySnapshot } from './history-sync-runner';
import type { LiveSnapshotRows } from './types';

const EPOCH = '11111111-1111-4111-8111-111111111111';
const OTHER_EPOCH = '22222222-2222-4222-8222-222222222222';
const cursor = (revision: number | string, epoch = EPOCH) => `${epoch}:${revision}`;
const clone = (state: HistorySyncState): HistorySyncState =>
  parseHistorySyncState(JSON.parse(JSON.stringify(state)))!;

function change(id: string, amount = 100): HistorySyncChange {
  return {
    collection: 'financialRequests',
    key: id,
    row: { id, status: 'accepted', amount_minor: amount },
  };
}

function page(
  revision: number | string,
  changes: HistorySyncChange[] = [],
  options: Partial<HistorySyncPage> = {},
): HistorySyncPage {
  return {
    protocol: 1,
    cursor: cursor(revision),
    hasMore: false,
    reset: false,
    changes,
    ...options,
  };
}

function rows(historySync?: HistorySyncPage): LiveSnapshotRows {
  return {
    ...Object.fromEntries(
      Object.keys(emptyHistorySyncState().collections).map((name) => [name, []]),
    ),
    relationships: [],
    openDebts: [],
    inboxItems: [],
    notificationViews: [],
    avatarSignedUrlsByPath: {},
    limits: {},
    fetchedAt: '2026-10-11T12:00:00.000Z',
    ...(historySync ? { historySync } : {}),
  } as unknown as LiveSnapshotRows;
}

describe('history sync merge and validation', () => {
  it('replays a page without duplicating a record or mutating the prior durable state', () => {
    const original = emptyHistorySyncState();
    const first = applyHistorySyncPage(original, page(1, [change('one')]));
    const repeated = applyHistorySyncPage(first, page(1, [change('one')]));
    expect(repeated).toEqual(first);
    expect(original.collections.financialRequests).toEqual({});
    expect(Object.keys(repeated.collections.financialRequests)).toEqual(['one']);
  });

  it('updates late changes to closed records and applies deletions without duplicates', () => {
    const first = applyHistorySyncPage(
      emptyHistorySyncState(),
      page(2, [change('one'), change('two')]),
    );
    const next = applyHistorySyncPage(
      first,
      page(4, [change('one', 500), { collection: 'financialRequests', key: 'two', row: null }]),
    );
    expect(Object.values(next.collections.financialRequests)).toEqual([
      { id: 'one', status: 'accepted', amount_minor: 500 },
    ]);
    expect(first.collections.financialRequests.two).toBeDefined();
  });

  it('retains old history when there are no new events and prioritizes current active rows', () => {
    let state = emptyHistorySyncState();
    const changes = Array.from({ length: 1200 }, (_, i) => change(`request-${i}`));
    state = applyHistorySyncPage(state, page(1200, changes));
    state = applyHistorySyncPage(state, page(1200));
    const live = {
      ...rows(),
      financialRequests: [{ id: 'request-1', status: 'pending' }],
    } as unknown as LiveSnapshotRows;
    const merged = mergeHistoryWithLiveRows(live, state);
    expect(merged.financialRequests).toHaveLength(1200);
    expect(merged.financialRequests.find((row) => row.id === 'request-1')?.status).toBe('pending');
  });

  it('keeps request and posted movement identities distinct across the same relationship', () => {
    const state = applyHistorySyncPage(
      emptyHistorySyncState(),
      page(2, [
        {
          collection: 'history',
          key: 'financial_request:relationship:one',
          row: { relationship_id: 'relationship', item_kind: 'financial_request', item_id: 'one' },
        },
        {
          collection: 'history',
          key: 'transaction:relationship:one',
          row: { relationship_id: 'relationship', item_kind: 'transaction', item_id: 'one' },
        },
      ]),
    );
    const merged = mergeHistoryWithLiveRows(rows(), state);
    expect(merged.history).toHaveLength(2);
  });

  it('uses precise revision ordering beyond JavaScript safe integers', () => {
    const first = applyHistorySyncPage(
      emptyHistorySyncState(),
      page('9007199254740992', [change('one')]),
    );
    expect(applyHistorySyncPage(first, page('9007199254740993')).cursor).toBe(
      cursor('9007199254740993'),
    );
    expect(() => applyHistorySyncPage(first, page('9007199254740991'))).toThrow('cursor');
    expect(() => parseHistorySyncPage(page('9223372036854775808'))).toThrow();
  });

  it('requires a reset when server history belongs to another epoch', () => {
    const first = applyHistorySyncPage(emptyHistorySyncState(), page(99, [change('old')]));
    const other = page(1, [change('new')], { cursor: cursor(1, OTHER_EPOCH) });
    expect(() => applyHistorySyncPage(first, other)).toThrow('cursor');
    const next = applyHistorySyncPage(first, { ...other, reset: true });
    expect(Object.keys(next.collections.financialRequests)).toEqual(['new']);
  });

  it('rejects missing row identities, incomplete cache and prototype keys', () => {
    const state = applyHistorySyncPage(emptyHistorySyncState(), page(1, [change('one')]));
    expect(parseHistorySyncState(state)).toEqual(state);
    expect(parseHistorySyncState({ protocol: 1, cursor: cursor(1) })).toBeNull();
    expect(
      parseHistorySyncState({
        ...state,
        collections: { ...state.collections, profiles: { one: {} } },
      }),
    ).toBeNull();
    expect(() =>
      parseHistorySyncPage(page(2, [{ collection: 'profiles', key: 'one', row: {} }])),
    ).toThrow();
    expect(() => parseHistorySyncPage(page(2, [{ ...change('one'), key: '__proto__' }]))).toThrow();
  });

  it('rejects pagination without progress, including an empty first page', () => {
    expect(() =>
      applyHistorySyncPage(emptyHistorySyncState(), page(0, [], { reset: true, hasMore: true })),
    ).toThrow('avanzó');
    const state = applyHistorySyncPage(emptyHistorySyncState(), page(1, [change('one')]));
    expect(() => applyHistorySyncPage(state, page(1, [change('two')], { hasMore: true }))).toThrow(
      'avanzó',
    );
  });

  it('applies anonymization and reward claims to records already present locally', () => {
    const initial = applyHistorySyncPage(
      emptyHistorySyncState(),
      page(2, [
        { collection: 'profiles', key: 'person', row: { id: 'person', display_name: 'Name' } },
        {
          collection: 'happyCircleScoreEvents',
          key: 'award',
          row: { id: 'award', treasure_claimed_at: null },
        },
      ]),
    );
    const next = applyHistorySyncPage(
      initial,
      page(4, [
        {
          collection: 'profiles',
          key: 'person',
          row: { id: 'person', display_name: 'Cuenta eliminada' },
        },
        {
          collection: 'happyCircleScoreEvents',
          key: 'award',
          row: { id: 'award', treasure_claimed_at: '2026-10-11' },
        },
      ]),
    );
    const result = mergeHistoryWithLiveRows(rows(), next);
    expect(result.profiles[0]?.display_name).toBe('Cuenta eliminada');
    expect(result.happyCircleScoreEvents[0]?.treasure_claimed_at).toBe('2026-10-11');
  });
});

describe('history sync recovery', () => {
  it('retains signed avatars from earlier pages in the returned and offline snapshots', async () => {
    let durable: HistorySyncState | null = null;
    const firstAvatar = {
      url: 'https://example.com/avatar-one',
      expiresAt: '2026-10-12T12:00:00Z',
    };
    const secondAvatar = {
      url: 'https://example.com/avatar-two',
      expiresAt: '2026-10-12T12:00:00Z',
    };
    const result = await synchronizeHistorySnapshot({
      read: async () => durable,
      persist: async (state) => {
        durable = clone(state);
      },
      request: async (value): Promise<LiveSnapshotRows> =>
        value === null
          ? {
              ...rows(page(1, [change('one')], { reset: true, hasMore: true })),
              avatarSignedUrlsByPath: { one: firstAvatar },
            }
          : { ...rows(page(2, [change('two')])), avatarSignedUrlsByPath: { two: secondAvatar } },
    });
    expect(result.avatarSignedUrlsByPath).toEqual({ one: firstAvatar, two: secondAvatar });
    expect((durable as HistorySyncState | null)?.liveRows?.avatarSignedUrlsByPath).toEqual(
      result.avatarSignedUrlsByPath,
    );
  });

  it('bootstraps more than all former history limits in bounded pages', async () => {
    let durable: HistorySyncState | null = null;
    const requested: (string | null)[] = [];
    const saved: string[] = [];
    const source = Array.from({ length: 1603 }, (_, i) => change(`request-${i}`));
    const result = await synchronizeHistorySnapshot({
      read: async () => durable,
      persist: async (state) => {
        durable = clone(state);
        saved.push(state.cursor!);
      },
      request: async (value) => {
        requested.push(value);
        const offset = value ? Number(value.split(':')[1]) : 0;
        const end = Math.min(offset + 137, source.length);
        return rows(
          page(end, source.slice(offset, end), {
            reset: value === null,
            hasMore: end < source.length,
          }),
        );
      },
    });
    expect(result.financialRequests).toHaveLength(source.length);
    expect(new Set(result.financialRequests.map((row) => row.id)).size).toBe(source.length);
    expect(requested).toHaveLength(12);
    expect(saved.at(-1)).toBe(cursor(1603));
  });

  it('resumes after network interruption from the last saved page', async () => {
    let durable: HistorySyncState | null = null;
    const persist = async (state: HistorySyncState) => {
      durable = clone(state);
    };
    await expect(
      synchronizeHistorySnapshot({
        read: async () => durable,
        persist,
        request: async (value) => {
          if (value !== null) throw new Error('offline');
          return rows(page(1, [change('one')], { reset: true, hasMore: true }));
        },
      }),
    ).rejects.toThrow('offline');
    const request = vi.fn(async (value: string | null) => {
      expect(value).toBe(cursor(1));
      return rows(page(2, [change('two')]));
    });
    const result = await synchronizeHistorySnapshot({
      read: async () => durable,
      persist,
      request,
    });
    expect(result.financialRequests.map((row) => row.id)).toEqual(['one', 'two']);
    expect((durable as HistorySyncState | null)?.cursor).toBe(cursor(2));
  });

  it('retries the same page after a failed disk write without acknowledging it', async () => {
    let durable = applyHistorySyncPage(emptyHistorySyncState(), page(1, [change('one')]));
    const incoming = rows(page(2, [change('one', 200), change('two')]));
    await expect(
      synchronizeHistorySnapshot({
        read: async () => durable,
        persist: async () => {
          throw new Error('disk full');
        },
        request: async () => incoming,
      }),
    ).rejects.toThrow('disk full');
    expect(durable.cursor).toBe(cursor(1));
    expect(durable.collections.financialRequests.one?.amount_minor).toBe(100);
    const result = await synchronizeHistorySnapshot({
      read: async () => durable,
      persist: async (next) => {
        durable = clone(next);
      },
      request: async (value) => {
        expect(value).toBe(cursor(1));
        return incoming;
      },
    });
    expect(result.financialRequests).toHaveLength(2);
    expect(result.financialRequests[0]?.amount_minor).toBe(200);
  });

  it('ignores late responses after cancellation and preserves the cursor', async () => {
    const controller = new AbortController();
    const persist = vi.fn(async () => undefined);
    await expect(
      synchronizeHistorySnapshot({
        read: async () => null,
        persist,
        signal: controller.signal,
        request: async () => {
          controller.abort();
          return rows(page(1, [change('one')]));
        },
      }),
    ).rejects.toThrow('cancelada');
    expect(persist).not.toHaveBeenCalled();
  });

  it('can resume if cancellation arrives during an atomic disk commit', async () => {
    const controller = new AbortController();
    let durable: HistorySyncState | null = null;
    await expect(
      synchronizeHistorySnapshot({
        read: async () => durable,
        signal: controller.signal,
        persist: async (state) => {
          durable = clone(state);
          controller.abort();
        },
        request: async () => rows(page(1, [change('one')], { reset: true })),
      }),
    ).rejects.toThrow('cancelada');
    const result = await synchronizeHistorySnapshot({
      read: async () => durable,
      persist: async (state) => {
        durable = clone(state);
      },
      request: async (value) => {
        expect(value).toBe(cursor(1));
        return rows(page(1));
      },
    });
    expect(result.financialRequests.map((row) => row.id)).toEqual(['one']);
  });

  it('preserves a legacy server response without saving an unsupported cursor', async () => {
    const legacy = rows();
    const persist = vi.fn(async () => undefined);
    expect(
      await synchronizeHistorySnapshot({
        read: async () => null,
        persist,
        request: async () => legacy,
      }),
    ).toBe(legacy);
    expect(persist).not.toHaveBeenCalled();
  });

  it('does not save a malformed next page or return a partially synced snapshot', async () => {
    let durable: HistorySyncState | null = null;
    await expect(
      synchronizeHistorySnapshot({
        read: async () => durable,
        persist: async (state) => {
          durable = clone(state);
        },
        request: async (value) =>
          value === null
            ? rows(page(1, [change('one')], { reset: true, hasMore: true }))
            : rows({ ...page(2), changes: [{ collection: 'profiles', key: 'bad', row: {} }] }),
      }),
    ).rejects.toThrow('incompleta');
    expect((durable as HistorySyncState | null)?.cursor).toBe(cursor(1));
  });

  it('rejects a reset midway through a download and retries from its durable state', async () => {
    let durable: HistorySyncState | null = null;
    await expect(
      synchronizeHistorySnapshot({
        read: async () => durable,
        persist: async (state) => {
          durable = clone(state);
        },
        request: async (value) =>
          value === null
            ? rows(page(1, [change('one')], { reset: true, hasMore: true }))
            : rows(page(1, [change('two')], { reset: true })),
      }),
    ).rejects.toThrow('cambió');
    expect((durable as HistorySyncState | null)?.cursor).toBe(cursor(1));
  });
});
