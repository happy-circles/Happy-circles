import { describe, expect, it, vi } from 'vitest';

import {
  canRestoreDerivedSnapshotImmediately,
  restoreCachedAppSnapshot,
} from './app-snapshot-hydration';
import { emptyHistorySyncState, type HistorySyncState } from './history-sync';
import type { HistoryCacheReceipt } from './history-cache-receipt';
import type { CachedAppSnapshot } from './snapshot-cache';
import type { AppSnapshot, LiveSnapshotRows } from './types';

vi.mock('react-native', () => ({
  Platform: {
    OS: 'web',
    select: (options: Record<string, unknown>) => options.web ?? options.default,
  },
}));
vi.mock('../avatar', () => ({ resolveAvatarUrl: () => null }));

const USER = 'account-a';
const SCOPE = 'https://production.supabase.co';
const FETCHED = '2026-10-13T12:00:00.000Z';
const receipt: HistoryCacheReceipt = {
  userId: USER,
  backendScope: SCOPE,
  generation: 'raw-commit-one',
  cursor: '11111111-1111-4111-8111-111111111111:1',
  bootstrapComplete: true,
  fetchedAt: FETCHED,
};

function cached(stamp: HistoryCacheReceipt | undefined = receipt): CachedAppSnapshot {
  return {
    snapshot: {
      localHistoryCache: stamp,
      pendingCount: 1,
    } as AppSnapshot,
    avatarSignedUrlsByPath: {},
    updatedAt: FETCHED,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((release) => {
    resolve = release;
  });
  return { promise, resolve };
}

function history(): HistorySyncState {
  const collections = emptyHistorySyncState().collections;
  const rows = {
    ...Object.fromEntries(Object.keys(collections).map((name) => [name, []])),
    financialRequests: [],
    relationships: [],
    openDebts: [],
    inboxItems: [],
    notificationViews: [],
    avatarSignedUrlsByPath: {},
    limits: {},
    fetchedAt: FETCHED,
  } as unknown as LiveSnapshotRows;
  return {
    protocol: 1,
    cursor: receipt.cursor,
    bootstrapComplete: true,
    liveRows: rows,
    collections: {
      ...collections,
      financialRequests: { one: { id: 'one', status: 'accepted' } },
    },
  };
}

function operations() {
  return {
    userId: USER,
    backendScope: SCOPE,
    readDerived: vi.fn(async () => cached()),
    readReceipt: vi.fn(async () => receipt as HistoryCacheReceipt | null),
    readHistory: vi.fn(async () => history() as HistorySyncState | null),
    canRestore: vi.fn(() => true),
    buildSnapshot: vi.fn((rows: LiveSnapshotRows) => ({
      ...cached(),
      snapshot: {
        pendingCount: rows.financialRequests.filter((row) => row.status === 'pending').length,
      } as AppSnapshot,
    })),
  };
}

describe('fast durable snapshot restoration', () => {
  it('displays the matching stored view without waiting for or rebuilding the full raw journal', async () => {
    const input = operations();
    const slowRaw = deferred<HistorySyncState | null>();
    input.readHistory.mockImplementation(() => slowRaw.promise);
    const stored = await input.readDerived();
    input.readDerived.mockResolvedValue(stored);

    expect(await restoreCachedAppSnapshot(input)).toBe(stored);
    expect(input.readHistory).not.toHaveBeenCalled();
    expect(input.buildSnapshot).not.toHaveBeenCalled();
  });

  it('never shows stale pending rows when the raw commit advanced after a derived write failed', async () => {
    const input = operations();
    input.readReceipt.mockResolvedValue({ ...receipt, generation: 'raw-commit-two' });
    const restored = await restoreCachedAppSnapshot(input);
    expect(restored?.snapshot.pendingCount).toBe(0);
    const rebuilt = input.buildSnapshot.mock.calls[0][0];
    expect(rebuilt.financialRequests.map((row) => [row.id, row.status])).toEqual([
      ['one', 'accepted'],
    ]);
    expect(new Set(rebuilt.financialRequests.map((row) => row.id)).size).toBe(1);
  });

  it('falls back to journal reconciliation for old caches without a local commit identity', async () => {
    const input = operations();
    input.readDerived.mockResolvedValue({
      ...cached(),
      snapshot: { pendingCount: 1 } as AppSnapshot,
    });
    input.readReceipt.mockResolvedValue({ ...receipt, generation: null });
    expect((await restoreCachedAppSnapshot(input))?.snapshot.pendingCount).toBe(0);
    expect(input.readHistory).toHaveBeenCalledOnce();
  });

  it('keeps a stored confirmed fallback overlay when its durable raw identity still matches', async () => {
    const input = operations();
    const stored = cached();
    input.readDerived.mockResolvedValue({
      ...stored,
      snapshot: {
        ...stored.snapshot,
        pendingCount: 0,
        confirmedFinancialRequests: { backendScope: SCOPE, rows: [] },
      },
    });
    expect((await restoreCachedAppSnapshot(input))?.snapshot.pendingCount).toBe(0);
    expect(input.readHistory).not.toHaveBeenCalled();
  });

  it('does not resurrect the older derived state when reading a known newer raw commit fails', async () => {
    const input = operations();
    input.readReceipt.mockResolvedValue({ ...receipt, generation: 'raw-commit-two' });
    input.readHistory.mockRejectedValue(new Error('raw unavailable'));
    expect(await restoreCachedAppSnapshot(input)).toBeNull();
    expect(input.buildSnapshot).not.toHaveBeenCalled();
  });

  it.each(['account switch', 'fresh network snapshot', 'confirmed command'])(
    'cancels a late raw rebuild after %s rather than replacing newer state',
    async () => {
      const input = operations();
      input.readReceipt.mockResolvedValue({ ...receipt, generation: null });
      const slowRaw = deferred<HistorySyncState | null>();
      input.readHistory.mockImplementation(() => slowRaw.promise);
      const restoring = restoreCachedAppSnapshot(input);
      await vi.waitFor(() => expect(input.readHistory).toHaveBeenCalledOnce());
      input.canRestore.mockReturnValue(false);
      slowRaw.resolve(history());
      expect(await restoring).toBeNull();
      expect(input.buildSnapshot).not.toHaveBeenCalled();
    },
  );

  it('does not publish even a matching derived view if a command wins while its receipt is loading', async () => {
    const input = operations();
    const slowReceipt = deferred<HistoryCacheReceipt | null>();
    input.readReceipt.mockImplementation(() => slowReceipt.promise);
    const restoring = restoreCachedAppSnapshot(input);
    input.canRestore.mockReturnValue(false);
    slowReceipt.resolve(receipt);
    expect(await restoring).toBeNull();
    expect(input.readHistory).not.toHaveBeenCalled();
  });

  it.each([
    { userId: 'account-b' },
    { backendScope: 'https://preview.supabase.co' },
    { generation: null },
    { generation: 'different-commit' },
    { cursor: '11111111-1111-4111-8111-111111111111:2' },
    { fetchedAt: '2026-10-13T12:01:00.000Z' },
    { bootstrapComplete: false },
  ])('requires the exact complete account/backend commit (%j)', (change) => {
    expect(
      canRestoreDerivedSnapshotImmediately(cached(), { ...receipt, ...change }, USER, SCOPE),
    ).toBe(false);
  });

  it('rejects foreign derived fallback acknowledgements even when no raw journal exists', async () => {
    const input = operations();
    input.readReceipt.mockResolvedValue(null);
    input.readHistory.mockResolvedValue(null);
    input.readDerived.mockResolvedValue({
      ...cached(),
      snapshot: {
        ...cached().snapshot,
        confirmedFinancialRequests: { backendScope: 'https://foreign.supabase.co', rows: [] },
      },
    });
    expect(await restoreCachedAppSnapshot(input)).toBeNull();
  });

  it('rejects a stamped derived view from another account even if its raw journal is absent', async () => {
    const input = operations();
    input.readReceipt.mockResolvedValue(null);
    input.readHistory.mockResolvedValue(null);
    input.readDerived.mockResolvedValue(cached({ ...receipt, userId: 'account-b' }));
    expect(await restoreCachedAppSnapshot(input)).toBeNull();
  });

  it('does not fast-restore a foreign outcome owner even when the raw receipt is otherwise equal', () => {
    const stored = {
      ...cached(),
      snapshot: {
        ...cached().snapshot,
        confirmedRequestOutcomes: { backendScope: SCOPE, userId: 'account-b', outcomes: [] },
      },
    };
    expect(canRestoreDerivedSnapshotImmediately(stored, receipt, USER, SCOPE)).toBe(false);
  });
});
