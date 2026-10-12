import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as WebCache from '../history-sync-cache.web';
import type { AppSnapshot, FinancialRequestRow, LiveSnapshotRows, PeopleOverview } from '../types';
import type { HistorySyncState } from '../history-sync';

const cache = vi.hoisted(() => ({
  actor: '00000000-0000-4000-8000-000000000001',
  raw: null as HistorySyncState | null,
  queries: new Map<string, AppSnapshot | PeopleOverview>(),
  disk: new Map<string, AppSnapshot>(),
  cancelQueries: vi.fn(async () => undefined),
  setQueryData: vi.fn(),
  readHistory: vi.fn(),
  persistHistory: vi.fn(),
  readSnapshot: vi.fn(),
  persistSnapshot: vi.fn(),
  persistPeople: vi.fn(),
}));

vi.mock('@/lib/query-client', () => ({
  queryClient: {
    cancelQueries: cache.cancelQueries,
    getQueryData: (key: unknown) => cache.queries.get(JSON.stringify(key)),
    setQueryData: cache.setQueryData,
  },
}));
vi.mock('../../config', () => ({ appConfig: { supabaseUrl: 'https://cache-test.supabase.co' } }));
vi.mock('../client', () => ({
  assertSupabaseClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: { user: { id: cache.actor } } } }),
    },
  }),
}));
vi.mock('../history-sync-cache', async () => ({
  withHistorySyncLock: (await vi.importActual<typeof WebCache>('../history-sync-cache.web'))
    .withHistorySyncLock,
  readCachedHistory: cache.readHistory,
  persistCachedHistory: cache.persistHistory,
}));
vi.mock('../snapshot-cache', () => ({
  readCachedAppSnapshot: cache.readSnapshot,
  persistCachedAppSnapshot: cache.persistSnapshot,
}));
vi.mock('../people-overview-cache', () => ({ persistCachedPeopleOverview: cache.persistPeople }));
vi.mock('react-native', () => ({
  Platform: { OS: 'web', select: (value: Record<string, unknown>) => value.web ?? value.default },
}));
vi.mock('react-native-url-polyfill/auto', () => ({}));
vi.mock('expo-constants', () => ({ default: { expoConfig: { extra: {} } } }));
vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}));
vi.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digest: vi.fn(async () => new ArrayBuffer(32)),
  randomUUID: vi.fn(),
  getRandomValues: vi.fn((value: Uint8Array) => value),
}));

import { confirmSenderRequestInCache } from './confirmed-sender-request-cache';
import { buildLiveSnapshot } from '../build-snapshot';
import { emptyHistorySyncState, mergeHistoryWithLiveRows } from '../history-sync';
import { APP_SNAPSHOT_QUERY_KEY, PEOPLE_OVERVIEW_QUERY_KEY } from '../constants';
import {
  applyConfirmedRequestOverlay,
  cachedSnapshotMatchesBackend,
} from '../confirmed-request-overlay';
import { prepareSnapshotCacheHydration } from '../app-snapshot-hydration';

const ACTOR = '00000000-0000-4000-8000-000000000001';
const FRIEND = '00000000-0000-4000-8000-000000000002';
const OTHER = '00000000-0000-4000-8000-000000000003';
const EPOCH = '11111111-1111-4111-8111-111111111111';
const CREATED = '2026-10-12T11:00:00.000Z';
const CLOSED = '2026-10-12T11:10:00.000Z';
const snapshotKey = (actor = ACTOR) => JSON.stringify([APP_SNAPSHOT_QUERY_KEY, actor]);

function request(overrides: Partial<FinancialRequestRow> = {}): FinancialRequestRow {
  return {
    id: 'request-one',
    relationship_id: 'relationship-one',
    request_type: 'balance_increase',
    status: 'pending',
    creator_user_id: ACTOR,
    responder_user_id: FRIEND,
    debtor_user_id: FRIEND,
    creditor_user_id: ACTOR,
    amount_minor: 1500,
    currency_code: 'COP',
    description: 'Lunch',
    category: 'food_drinks',
    parent_request_id: null,
    target_ledger_transaction_id: null,
    created_at: CREATED,
    updated_at: CREATED,
    resolved_at: null,
    request_case_id: 'request-one',
    version_number: 1,
    resolved_by_user_id: null,
    amendment_kind: null,
    ...overrides,
  };
}

function initialState(): HistorySyncState {
  const state = emptyHistorySyncState();
  const historic = request({
    id: 'historic',
    request_case_id: 'historic',
    status: 'rejected',
    resolved_at: CREATED,
  });
  const liveRows = {
    ...Object.fromEntries(Object.keys(state.collections).map((name) => [name, []])),
    profiles: [ACTOR, FRIEND].map((id) => ({
      id,
      email: `${id}@example.com`,
      display_name: id === ACTOR ? 'Ana' : 'Sofia',
      avatar_path: null,
      created_at: CREATED,
      updated_at: CREATED,
    })),
    relationships: [
      {
        id: 'relationship-one',
        user_low_id: ACTOR,
        user_high_id: FRIEND,
        status: 'active',
        created_at: CREATED,
        updated_at: CREATED,
      },
    ],
    openDebts: [
      {
        relationship_id: 'relationship-one',
        user_low_id: ACTOR,
        user_high_id: FRIEND,
        debtor_user_id: FRIEND,
        creditor_user_id: ACTOR,
        amount_minor: 5000,
        currency_code: 'COP',
      },
    ],
    financialRequests: [request()],
    history: [
      {
        item_id: 'request-one',
        item_kind: 'financial_request',
        relationship_id: 'relationship-one',
        status: 'pending',
        source_type: 'user',
        subtype: 'balance_increase',
        happened_at: CREATED,
        amount_minor: 1500,
      },
    ],
    inboxItems: [
      {
        item_id: 'request-one',
        item_kind: 'financial_request',
        owner_user_id: ACTOR,
        created_at: CREATED,
        status: 'waiting_other_side',
      },
    ],
    notificationViews: [],
    avatarSignedUrlsByPath: {},
    limits: {},
    fetchedAt: CREATED,
  } as unknown as LiveSnapshotRows;
  return {
    ...state,
    cursor: `${EPOCH}:100`,
    bootstrapComplete: true,
    liveRows,
    collections: { ...state.collections, financialRequests: { historic } },
  };
}

function offline(state: HistorySyncState): AppSnapshot {
  if (!state.liveRows) throw new Error('Missing durable context');
  return buildLiveSnapshot({
    ...mergeHistoryWithLiveRows(state.liveRows, state),
    currentUserId: ACTOR,
  });
}

function canceled(): FinancialRequestRow {
  return request({
    status: 'canceled',
    updated_at: CLOSED,
    resolved_at: CLOSED,
    resolved_by_user_id: ACTOR,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  cache.actor = ACTOR;
  cache.raw = initialState();
  cache.queries.clear();
  cache.disk.clear();
  const snapshot = offline(cache.raw);
  cache.queries.set(snapshotKey(), snapshot);
  cache.disk.set(ACTOR, snapshot);
  cache.cancelQueries.mockReset().mockResolvedValue(undefined);
  cache.readHistory.mockReset().mockImplementation(async () => cache.raw);
  cache.persistHistory
    .mockReset()
    .mockImplementation(async (_user: string, _scope: string, state: HistorySyncState) => {
      cache.raw = JSON.parse(JSON.stringify(state)) as HistorySyncState;
    });
  cache.readSnapshot
    .mockReset()
    .mockImplementation(async (user: string) =>
      cache.disk.has(user) ? { snapshot: cache.disk.get(user), avatarSignedUrlsByPath: {} } : null,
    );
  cache.persistSnapshot.mockReset().mockImplementation(async (user: string, value: AppSnapshot) => {
    cache.disk.set(user, value);
  });
  cache.persistPeople.mockReset().mockResolvedValue(undefined);
  cache.setQueryData
    .mockReset()
    .mockImplementation((key: unknown, value: AppSnapshot | PeopleOverview) => {
      cache.queries.set(JSON.stringify(key), value);
    });
});

describe('server-confirmed sender request cache', () => {
  it('persists cancellation before derived writes and rebuilds offline without moving cursor, balances or unrelated history', async () => {
    await confirmSenderRequestInCache(ACTOR, { financialRequests: [canceled()] });
    expect(cache.raw?.cursor).toBe(`${EPOCH}:100`);
    expect(cache.raw?.collections.financialRequests.historic).toBeDefined();
    expect(cache.raw?.collections.financialRequests['request-one']?.status).toBe('canceled');
    expect(cache.raw?.liveRows?.inboxItems).toEqual([]);
    expect(cache.raw?.liveRows?.history).toEqual([]);
    expect(cache.persistHistory.mock.invocationCallOrder[0]).toBeLessThan(
      cache.persistSnapshot.mock.invocationCallOrder[0],
    );
    const snapshot = offline(cache.raw!);
    expect(snapshot.pendingCount).toBe(0);
    expect(snapshot.peopleById[FRIEND]?.netAmountMinor).toBe(5000);
    expect(
      snapshot.peopleById[FRIEND]?.timeline.filter((row) => row.id === 'request-one:canceled'),
    ).toHaveLength(1);
    expect(cache.queries.has(JSON.stringify([PEOPLE_OVERVIEW_QUERY_KEY, ACTOR]))).toBe(true);
  });

  it('keeps one corrected version pending with the same author, recipient and financial direction', async () => {
    const parent = request({
      status: 'amended',
      updated_at: CLOSED,
      resolved_at: CLOSED,
      resolved_by_user_id: ACTOR,
    });
    const child = request({
      id: 'request-two',
      parent_request_id: parent.id,
      version_number: 2,
      amendment_kind: 'sender_correction',
      amount_minor: 2000,
      description: 'Corrected lunch',
      created_at: CLOSED,
      updated_at: CLOSED,
    });
    await confirmSenderRequestInCache(ACTOR, { financialRequests: [parent, child] });
    const snapshot = offline(cache.raw!);
    expect(snapshot.pendingCount).toBe(1);
    expect(snapshot.peopleById[FRIEND]?.pendingItems.map((item) => item.id)).toEqual([
      'request-two',
    ]);
    expect(snapshot.peopleById[FRIEND]?.pendingRequest).toMatchObject({
      id: 'request-two',
      amountMinor: 2000,
      responseState: 'waiting_other_side',
      versionNumber: 2,
    });
    expect(cache.raw?.collections.financialRequests['request-one']?.status).toBe('amended');
    expect(cache.raw?.collections.financialRequests['request-two']).toBeUndefined();
    expect(
      cache.raw?.liveRows?.financialRequests.find((row) => row.id === 'request-two'),
    ).toMatchObject({
      creator_user_id: ACTOR,
      responder_user_id: FRIEND,
      debtor_user_id: FRIEND,
      creditor_user_id: ACTOR,
    });
  });

  it('replays confirmed rows without duplicate terminal events or pending proposals', async () => {
    const response = { financialRequests: [canceled()] };
    await confirmSenderRequestInCache(ACTOR, response);
    const once = offline(cache.raw!);
    await confirmSenderRequestInCache(ACTOR, response);
    expect(offline(cache.raw!)).toEqual(once);
    expect(
      cache.raw?.liveRows?.financialRequests.filter((row) => row.id === 'request-one'),
    ).toHaveLength(1);
  });

  it('does not resurrect a terminal row or an older case version from a delayed correction response', async () => {
    const current = request({
      id: 'request-three',
      parent_request_id: 'request-two',
      version_number: 3,
      created_at: CLOSED,
      updated_at: CLOSED,
    });
    cache.raw = {
      ...cache.raw!,
      liveRows: { ...cache.raw!.liveRows!, financialRequests: [current] },
    };
    const old = request({ id: 'request-two', parent_request_id: 'request-one', version_number: 2 });
    await confirmSenderRequestInCache(ACTOR, { financialRequests: [old] });
    expect(offline(cache.raw).peopleById[FRIEND]?.pendingItems.map((item) => item.id)).toEqual([
      'request-three',
    ]);
    cache.raw.collections.financialRequests['request-two'] = {
      ...old,
      status: 'accepted',
      updated_at: CLOSED,
    };
    await confirmSenderRequestInCache(ACTOR, { financialRequests: [old] });
    expect(cache.raw?.collections.financialRequests['request-two']?.status).toBe('accepted');
  });

  it('does not replace a more recent terminal update with an older reply', async () => {
    const recent = canceled();
    cache.raw = {
      ...cache.raw!,
      collections: {
        ...cache.raw!.collections,
        financialRequests: { ...cache.raw!.collections.financialRequests, [recent.id]: recent },
      },
      liveRows: { ...cache.raw!.liveRows!, financialRequests: [] },
    };
    await confirmSenderRequestInCache(ACTOR, {
      financialRequests: [request({ status: 'amended', resolved_at: CREATED })],
    });
    expect(cache.raw?.collections.financialRequests['request-one']?.status).toBe('canceled');
  });

  it('survives derived persistence failure because the raw context already contains the confirmed state', async () => {
    cache.persistSnapshot.mockRejectedValueOnce(new Error('disk cache unavailable'));
    await expect(
      confirmSenderRequestInCache(ACTOR, { financialRequests: [canceled()] }),
    ).resolves.toBeUndefined();
    expect(offline(cache.raw!).pendingCount).toBe(0);
    expect((cache.queries.get(snapshotKey()) as AppSnapshot).pendingCount).toBe(0);
  });

  it('keeps server success and the in-memory confirmation when raw persistence fails', async () => {
    cache.persistHistory.mockRejectedValueOnce(new Error('raw disk unavailable'));
    await expect(
      confirmSenderRequestInCache(ACTOR, { financialRequests: [canceled()] }),
    ).resolves.toBeUndefined();
    expect((cache.queries.get(snapshotKey()) as AppSnapshot).pendingCount).toBe(0);
    expect(console.warn).toHaveBeenCalled();
  });

  it('rebuilds the confirmed cancellation after a restart using the derived overlay when the raw disk write failed', async () => {
    const oldRaw = cache.raw!;
    cache.persistHistory.mockRejectedValueOnce(new Error('raw disk unavailable'));
    await confirmSenderRequestInCache(ACTOR, { financialRequests: [canceled()] });
    const saved = cache.disk.get(ACTOR)!;
    expect(saved.confirmedFinancialRequests?.rows.map((row) => row.id)).toEqual(['request-one']);
    const restarted = applyConfirmedRequestOverlay(
      oldRaw,
      saved,
      ACTOR,
      'https://cache-test.supabase.co',
    );
    expect(restarted.cursor).toBe(oldRaw.cursor);
    expect(offline(restarted).pendingCount).toBe(0);
    expect(
      offline(restarted).peopleById[FRIEND]?.timeline.some(
        (item) => item.id === 'request-one:canceled',
      ),
    ).toBe(true);
    const plan = prepareSnapshotCacheHydration(
      oldRaw,
      { snapshot: saved, avatarSignedUrlsByPath: {}, updatedAt: CLOSED },
      ACTOR,
      'https://cache-test.supabase.co',
    );
    expect(plan.kind).toBe('raw');
    if (plan.kind !== 'raw') throw new Error('Expected raw hydration plan');
    expect(buildLiveSnapshot({ ...plan.rows, currentUserId: ACTOR }).pendingCount).toBe(0);
  });

  it('accumulates multiple acknowledgements until the raw context becomes durable, then clears the overlay', async () => {
    cache.persistHistory
      .mockRejectedValueOnce(new Error('raw disk unavailable'))
      .mockRejectedValueOnce(new Error('raw disk unavailable again'));
    await confirmSenderRequestInCache(ACTOR, { financialRequests: [canceled()] });
    const second = request({
      id: 'second-confirmed',
      request_case_id: 'second-confirmed',
      status: 'canceled',
      updated_at: CLOSED,
      resolved_at: CLOSED,
      resolved_by_user_id: ACTOR,
    });
    await confirmSenderRequestInCache(ACTOR, { financialRequests: [second] });
    expect(
      cache.disk
        .get(ACTOR)
        ?.confirmedFinancialRequests?.rows.map((row) => row.id)
        .sort(),
    ).toEqual(['request-one', 'second-confirmed']);
    const restarted = applyConfirmedRequestOverlay(
      cache.raw!,
      cache.disk.get(ACTOR),
      ACTOR,
      'https://cache-test.supabase.co',
    );
    expect(offline(restarted).pendingCount).toBe(0);
    await confirmSenderRequestInCache(ACTOR, { financialRequests: [second] });
    expect(cache.disk.get(ACTOR)?.confirmedFinancialRequests).toBeUndefined();
    expect(offline(cache.raw!).pendingCount).toBe(0);
  });

  it('never restores an acknowledgement from another backend or an unrelated account', async () => {
    const state = cache.raw!;
    const snapshot = cache.disk.get(ACTOR)!;
    const scoped = {
      ...snapshot,
      confirmedFinancialRequests: {
        backendScope: 'https://different.supabase.co',
        rows: [canceled()],
      },
    };
    expect(
      applyConfirmedRequestOverlay(state, scoped, ACTOR, 'https://cache-test.supabase.co'),
    ).toBe(state);
    const unrelated = {
      ...scoped,
      confirmedFinancialRequests: {
        backendScope: 'https://cache-test.supabase.co',
        rows: [canceled()],
      },
    };
    expect(
      applyConfirmedRequestOverlay(state, unrelated, OTHER, 'https://cache-test.supabase.co'),
    ).toBe(state);
    expect(cachedSnapshotMatchesBackend(scoped, 'https://cache-test.supabase.co')).toBe(false);
    expect(cachedSnapshotMatchesBackend(unrelated, 'https://cache-test.supabase.co')).toBe(true);
    expect(cachedSnapshotMatchesBackend(snapshot, 'https://cache-test.supabase.co')).toBe(true);
  });

  it('restores a confirmed correction from an incomplete raw bootstrap after the derived disk write failed', async () => {
    const previous = cache.disk.get(ACTOR)!;
    cache.raw = { ...cache.raw!, bootstrapComplete: false };
    cache.persistSnapshot.mockRejectedValueOnce(new Error('derived disk unavailable'));
    const parent = request({
      status: 'amended',
      updated_at: CLOSED,
      resolved_at: CLOSED,
      resolved_by_user_id: ACTOR,
    });
    const child = request({
      id: 'request-two',
      parent_request_id: parent.id,
      version_number: 2,
      amendment_kind: 'sender_correction',
      amount_minor: 2000,
      created_at: CLOSED,
      updated_at: CLOSED,
    });
    await confirmSenderRequestInCache(ACTOR, { financialRequests: [parent, child] });
    expect(cache.disk.get(ACTOR)).toBe(previous);
    const state = cache.raw;
    const plan = prepareSnapshotCacheHydration(
      state,
      { snapshot: previous, avatarSignedUrlsByPath: {}, updatedAt: CREATED },
      ACTOR,
      'https://cache-test.supabase.co',
    );
    expect(plan.kind).toBe('derived');
    if (plan.kind !== 'derived') throw new Error('Expected derived hydration plan');
    const restored = plan.cached.snapshot;
    expect(restored.pendingCount).toBe(1);
    expect(restored.peopleById[FRIEND]?.pendingItems.map((item) => item.id)).toEqual([
      'request-two',
    ]);
    expect(restored.peopleById[FRIEND]?.timeline.map((item) => item.id)).toEqual(
      expect.arrayContaining(previous.peopleById[FRIEND].timeline.map((item) => item.id)),
    );
    expect(state.cursor).toBe(`${EPOCH}:100`);
  });

  it.each([true, false])(
    'never uses a foreign backend snapshot as fallback after a confirmed command (raw absent: %s)',
    async (absent) => {
      const foreign = {
        ...cache.disk.get(ACTOR)!,
        confirmedFinancialRequests: {
          backendScope: 'https://foreign.supabase.co',
          rows: [canceled()],
        },
      };
      cache.disk.set(ACTOR, foreign);
      cache.queries.set(snapshotKey(), foreign);
      cache.raw = absent ? null : { ...cache.raw!, liveRows: undefined, bootstrapComplete: false };
      await confirmSenderRequestInCache(ACTOR, { financialRequests: [canceled()] });
      expect(cache.persistSnapshot).not.toHaveBeenCalled();
      expect(cache.setQueryData).not.toHaveBeenCalled();
      const plan = prepareSnapshotCacheHydration(
        cache.raw,
        { snapshot: foreign, avatarSignedUrlsByPath: {}, updatedAt: CREATED },
        ACTOR,
        'https://cache-test.supabase.co',
      );
      expect(plan.kind).toBe('empty');
    },
  );

  it('carries an in-memory acknowledgement into a later command when both earlier disk writes failed', async () => {
    cache.persistHistory.mockRejectedValueOnce(new Error('raw disk unavailable'));
    cache.persistSnapshot.mockRejectedValueOnce(new Error('derived disk unavailable'));
    await confirmSenderRequestInCache(ACTOR, { financialRequests: [canceled()] });
    expect(
      (cache.queries.get(snapshotKey()) as AppSnapshot).confirmedFinancialRequests?.rows.map(
        (row) => row.id,
      ),
    ).toEqual(['request-one']);
    const second = request({
      id: 'second-confirmed',
      request_case_id: 'second-confirmed',
      status: 'canceled',
      updated_at: CLOSED,
      resolved_at: CLOSED,
      resolved_by_user_id: ACTOR,
    });
    await confirmSenderRequestInCache(ACTOR, { financialRequests: [second] });
    expect(cache.raw?.collections.financialRequests['request-one']?.status).toBe('canceled');
    expect(offline(cache.raw!).pendingCount).toBe(0);
    expect(cache.disk.get(ACTOR)?.confirmedFinancialRequests).toBeUndefined();
  });

  it('never publishes into a switched account during derived persistence', async () => {
    const unrelated = offline(cache.raw!);
    cache.queries.set(snapshotKey(OTHER), unrelated);
    cache.persistSnapshot.mockImplementationOnce(async () => {
      cache.actor = OTHER;
    });
    await confirmSenderRequestInCache(ACTOR, { financialRequests: [canceled()] });
    expect(cache.setQueryData).not.toHaveBeenCalled();
    expect(cache.queries.get(snapshotKey(OTHER))).toBe(unrelated);
    expect(cache.persistHistory.mock.calls[0]?.[0]).toBe(ACTOR);
    expect(cache.persistSnapshot.mock.calls.every(([user]) => user === ACTOR)).toBe(true);
  });

  it('cleans pending caches without deleting existing historical events when the raw state is absent', async () => {
    const previous = cache.disk.get(ACTOR)!;
    cache.raw = null;
    await confirmSenderRequestInCache(ACTOR, { financialRequests: [canceled()] });
    expect(cache.disk.get(ACTOR)?.pendingCount).toBe(0);
    const timeline = cache.disk.get(ACTOR)?.peopleById[FRIEND]?.timeline ?? [];
    expect(timeline.map((item) => item.id)).toEqual(
      expect.arrayContaining(previous.peopleById[FRIEND].timeline.map((item) => item.id)),
    );
    expect(timeline.filter((item) => item.id === 'request-one:canceled')).toHaveLength(1);
    expect(
      cache.disk
        .get(ACTOR)
        ?.activitySections.find((section) => section.key === 'history')
        ?.items.some((item) => item.id === 'request-one:canceled'),
    ).toBe(true);
    expect(cache.disk.get(ACTOR)?.peopleById[FRIEND]?.netAmountMinor).toBe(5000);
  });

  it.each([true, false])(
    'preserves the corrected pending proposal and previous history in the derived fallback (raw absent: %s)',
    async (absent) => {
      const previous = cache.disk.get(ACTOR)!;
      if (absent) cache.raw = null;
      else cache.raw = { ...cache.raw!, bootstrapComplete: false };
      const parent = request({
        status: 'amended',
        updated_at: CLOSED,
        resolved_at: CLOSED,
        resolved_by_user_id: ACTOR,
      });
      const child = request({
        id: 'request-two',
        parent_request_id: parent.id,
        version_number: 2,
        amendment_kind: 'sender_correction',
        amount_minor: 2000,
        created_at: CLOSED,
        updated_at: CLOSED,
      });
      await confirmSenderRequestInCache(ACTOR, { financialRequests: [parent, child] });
      const snapshot = cache.disk.get(ACTOR)!;
      expect(snapshot.pendingCount).toBe(1);
      expect(snapshot.peopleById[FRIEND]?.pendingItems.map((item) => item.id)).toEqual([
        'request-two',
      ]);
      expect(snapshot.peopleById[FRIEND]?.pendingRequest).toMatchObject({
        id: 'request-two',
        versionNumber: 2,
        amountMinor: 2000,
      });
      expect(
        snapshot.peopleById[FRIEND]?.pendingItems[0]?.pendingHistorySteps?.map((step) => step.id),
      ).toEqual(['request-one', 'request-two']);
      expect(snapshot.peopleById[FRIEND]?.timeline.map((item) => item.id)).toEqual(
        expect.arrayContaining(previous.peopleById[FRIEND].timeline.map((item) => item.id)),
      );
      expect(snapshot.peopleById[FRIEND]?.netAmountMinor).toBe(5000);
      expect(
        snapshot.activitySections
          .find((section) => section.key === 'pending')
          ?.items.map((item) => item.id),
      ).toEqual(['request-two']);
      expect(snapshot.dashboard.topPendingPreview?.id).toBe('request-two');
    },
  );

  it('does not touch any cache for an actor mismatch or an unrelated response', async () => {
    cache.actor = OTHER;
    await confirmSenderRequestInCache(ACTOR, { financialRequests: [canceled()] });
    cache.actor = ACTOR;
    await confirmSenderRequestInCache(ACTOR, {
      financialRequests: [
        request({
          creator_user_id: OTHER,
          responder_user_id: FRIEND,
          creditor_user_id: FRIEND,
          debtor_user_id: OTHER,
        }),
      ],
    });
    expect(cache.cancelQueries).not.toHaveBeenCalled();
    expect(cache.persistHistory).not.toHaveBeenCalled();
  });

  it('still reconciles the confirmed command when canceling an old query observer fails', async () => {
    cache.cancelQueries.mockRejectedValueOnce(new Error('observer cancellation failed'));
    await confirmSenderRequestInCache(ACTOR, { financialRequests: [canceled()] });
    expect(offline(cache.raw!).pendingCount).toBe(0);
    expect((cache.queries.get(snapshotKey()) as AppSnapshot).pendingCount).toBe(0);
  });
});
