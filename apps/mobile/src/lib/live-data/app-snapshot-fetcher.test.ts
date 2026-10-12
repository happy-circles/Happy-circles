import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppSnapshot, LiveSnapshotRows } from './types';
import type { HistorySyncPage, HistorySyncState } from './history-sync';
import type * as WebHistoryCache from './history-sync-cache.web';
import type * as SnapshotBuilder from './build-snapshot';

const pipeline = vi.hoisted(() => ({
  actor: 'account-a',
  config: { supabaseUrl: 'https://production.supabase.co' },
  history: new Map<string, HistorySyncState>(),
  derived: new Map<string, AppSnapshot>(),
  invoke: vi.fn(),
  readHistory: vi.fn(),
  persistHistory: vi.fn(),
  buildSnapshot: vi.fn(),
  buildPeopleOverview: vi.fn(),
  persistPeople: vi.fn(),
  persistSnapshot: vi.fn(),
  hydrateAvatarUrls: vi.fn(),
  reportError: vi.fn(),
  metric: vi.fn(),
}));

vi.mock('../config', () => ({ appConfig: pipeline.config }));
vi.mock('react-native', () => ({
  Platform: {
    OS: 'web',
    select: (options: Record<string, unknown>) => options.web ?? options.default,
  },
}));
vi.mock('react-native-url-polyfill/auto', () => ({}));
vi.mock('expo-constants', () => ({ default: { expoConfig: { extra: {} } } }));
vi.mock('expo-secure-store', () => ({
  deleteItemAsync: vi.fn(),
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
}));
vi.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digest: vi.fn(async () => new ArrayBuffer(32)),
  getRandomValues: vi.fn((array: Uint8Array) => array),
  randomUUID: vi.fn(() => '00000000-0000-4000-8000-000000000000'),
}));
vi.mock('../avatar', () => ({ hydrateSignedAvatarUrlCache: pipeline.hydrateAvatarUrls }));
vi.mock('../avatar-prefetch', () => ({
  prefetchCriticalAvatarImages: vi.fn(async () => undefined),
  scheduleDeferredAvatarPrefetch: vi.fn(),
}));
vi.mock('../performance-metrics', () => ({ recordSnapshotNetworkResolved: pipeline.metric }));
vi.mock('../support-errors', () => ({ reportAndCreateSupportError: pipeline.reportError }));
vi.mock('./build-snapshot', () => ({ buildLiveSnapshot: pipeline.buildSnapshot }));
vi.mock('./build-people-overview', () => ({
  buildPeopleOverviewFromAppSnapshot: pipeline.buildPeopleOverview,
}));
vi.mock('./people-overview-cache', () => ({ persistCachedPeopleOverview: pipeline.persistPeople }));
vi.mock('./snapshot-cache', () => ({ persistCachedAppSnapshot: pipeline.persistSnapshot }));
vi.mock('./client', () => ({
  invokeSupabaseFunction: pipeline.invoke,
  assertSupabaseClient: () => ({
    auth: { getSession: async () => ({ data: { session: { user: { id: pipeline.actor } } } }) },
  }),
  createSnapshotAbortSignal: () => ({
    timeoutPromise: new Promise<never>(() => undefined),
    cleanup: vi.fn(),
  }),
}));
vi.mock('./history-sync-cache', async () => {
  const web = await vi.importActual<typeof WebHistoryCache>('./history-sync-cache.web');
  return {
    withHistorySyncLock: web.withHistorySyncLock,
    readCachedHistory: pipeline.readHistory,
    persistCachedHistory: pipeline.persistHistory,
  };
});

import { fetchAppSnapshotForUser } from './app-snapshot-fetcher';
import { emptyHistorySyncState, mergeHistoryWithLiveRows } from './history-sync';

const EPOCH = '11111111-1111-4111-8111-111111111111';
const PRODUCTION = 'https://production.supabase.co';
const PREVIEW = 'https://preview.supabase.co';
const historyKey = (user: string, scope: string) => JSON.stringify([scope, user]);

interface ObservedSnapshot extends AppSnapshot {
  readonly actor: string;
  readonly requestIds: readonly string[];
}

function dynamicRows(historySync: HistorySyncPage): LiveSnapshotRows {
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
    historySync,
  } as unknown as LiveSnapshotRows;
}

function response(revision: number, ids: string[], options: Partial<HistorySyncPage> = {}) {
  return dynamicRows({
    protocol: 1,
    cursor: `${EPOCH}:${revision}`,
    hasMore: false,
    reset: false,
    changes: ids.map((id) => ({
      collection: 'financialRequests',
      key: id,
      row: { id, status: 'accepted', amount_minor: 100 },
    })),
    ...options,
  });
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((release) => {
    resolve = release;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  pipeline.actor = 'account-a';
  pipeline.config.supabaseUrl = PRODUCTION;
  pipeline.history.clear();
  pipeline.derived.clear();
  pipeline.invoke.mockReset();
  pipeline.readHistory.mockImplementation(
    async (user: string, scope: string) => pipeline.history.get(historyKey(user, scope)) ?? null,
  );
  pipeline.persistHistory.mockImplementation(
    async (user: string, scope: string, state: HistorySyncState) => {
      pipeline.history.set(
        historyKey(user, scope),
        JSON.parse(JSON.stringify(state)) as HistorySyncState,
      );
    },
  );
  pipeline.buildSnapshot.mockImplementation(
    (input: LiveSnapshotRows & { readonly currentUserId: string }) =>
      ({
        actor: input.currentUserId,
        requestIds: input.financialRequests.map((row) => row.id),
      }) as unknown as ObservedSnapshot,
  );
  pipeline.buildPeopleOverview.mockImplementation((snapshot: ObservedSnapshot) => ({
    requestIds: snapshot.requestIds,
  }));
  pipeline.persistPeople.mockReset().mockResolvedValue(undefined);
  pipeline.persistSnapshot
    .mockReset()
    .mockImplementation(async (user: string, snapshot: AppSnapshot) => {
      pipeline.derived.set(user, snapshot);
    });
  pipeline.reportError.mockImplementation(({ error }: { readonly error: unknown }) => error);
});

describe('snapshot fetch pipeline with durable incremental history', () => {
  it('binds every page to the requested account and separates cursors by backend and account', async () => {
    pipeline.invoke
      .mockResolvedValueOnce({
        ...response(1, ['one'], { reset: true, hasMore: true }),
        avatarSignedUrlsByPath: { 'avatar-one': 'https://storage.example/one' },
      })
      .mockResolvedValueOnce({
        ...response(2, ['two']),
        avatarSignedUrlsByPath: { 'avatar-two': 'https://storage.example/two' },
      });

    const result = await fetchAppSnapshotForUser('account-a');

    expect(result).toMatchObject({ actor: 'account-a', requestIds: ['one', 'two'] });
    const avatarUrls = {
      'avatar-one': 'https://storage.example/one',
      'avatar-two': 'https://storage.example/two',
    };
    expect(pipeline.hydrateAvatarUrls).toHaveBeenCalledWith(avatarUrls);
    expect(pipeline.persistSnapshot).toHaveBeenCalledWith('account-a', result, avatarUrls);
    expect(pipeline.invoke.mock.calls).toEqual([
      [
        'get-app-snapshot',
        { historySync: { protocol: 1, cursor: null, pageSize: 250 } },
        { expectedUserId: 'account-a' },
      ],
      [
        'get-app-snapshot',
        { historySync: { protocol: 1, cursor: `${EPOCH}:1`, pageSize: 250 } },
        { expectedUserId: 'account-a' },
      ],
    ]);
    expect(pipeline.readHistory).toHaveBeenCalledWith('account-a', PRODUCTION);
    const historyWrites = pipeline.persistHistory.mock.calls as [
      string,
      string,
      HistorySyncState,
    ][];
    expect(historyWrites.map(([user, scope]) => [user, scope])).toEqual([
      ['account-a', PRODUCTION],
      ['account-a', PRODUCTION],
    ]);

    pipeline.config.supabaseUrl = PREVIEW;
    pipeline.invoke.mockResolvedValueOnce(response(1, ['preview-only'], { reset: true }));
    expect(await fetchAppSnapshotForUser('account-a')).toMatchObject({
      requestIds: ['preview-only'],
    });
    expect(pipeline.invoke.mock.calls[2]?.[1]).toMatchObject({ historySync: { cursor: null } });
    expect(pipeline.readHistory).toHaveBeenCalledWith('account-a', PREVIEW);

    pipeline.actor = 'account-b';
    pipeline.invoke.mockResolvedValueOnce(response(1, ['other-account'], { reset: true }));
    expect(await fetchAppSnapshotForUser('account-b')).toMatchObject({
      actor: 'account-b',
      requestIds: ['other-account'],
    });
    expect(pipeline.invoke.mock.calls[3]?.[2]).toEqual({ expectedUserId: 'account-b' });
    expect(
      pipeline.history.get(historyKey('account-a', PRODUCTION))?.collections.financialRequests,
    ).toHaveProperty('two');
    expect(
      pipeline.history.get(historyKey('account-a', PREVIEW))?.collections.financialRequests,
    ).not.toHaveProperty('other-account');
  });

  it('serializes requests, derivation and both cache writes so a slow first refresh cannot replace a newer snapshot', async () => {
    const started = deferred();
    const release = deferred();
    pipeline.persistPeople.mockImplementationOnce(async () => {
      started.resolve();
      await release.promise;
    });
    pipeline.invoke
      .mockResolvedValueOnce(response(1, ['one'], { reset: true }))
      .mockResolvedValueOnce(response(2, ['two']));

    const first = fetchAppSnapshotForUser('account-a');
    await started.promise;
    const second = fetchAppSnapshotForUser('account-a');
    await Promise.resolve();
    await Promise.resolve();

    expect(pipeline.invoke).toHaveBeenCalledTimes(1);
    expect(pipeline.buildSnapshot).toHaveBeenCalledTimes(1);
    expect(pipeline.persistSnapshot).not.toHaveBeenCalled();
    release.resolve();
    await Promise.all([first, second]);

    const derivedWrites = pipeline.persistSnapshot.mock.calls as [string, ObservedSnapshot][];
    expect(derivedWrites.map(([, snapshot]) => snapshot.requestIds)).toEqual([
      ['one'],
      ['one', 'two'],
    ]);
    expect(pipeline.derived.get('account-a')).toMatchObject({ requestIds: ['one', 'two'] });
    expect(pipeline.history.get(historyKey('account-a', PRODUCTION))?.cursor).toBe(`${EPOCH}:2`);
  });

  it('rejects a session change during derivation and never writes derived data under the new account', async () => {
    pipeline.derived.set('account-b', {
      actor: 'account-b',
      requestIds: ['existing-b'],
    } as unknown as AppSnapshot);
    pipeline.invoke.mockResolvedValue(response(1, ['one'], { reset: true }));
    pipeline.persistPeople.mockImplementationOnce(async () => {
      pipeline.actor = 'account-b';
    });

    await expect(fetchAppSnapshotForUser('account-a')).rejects.toThrow('sesión cambió');

    expect(pipeline.derived.get('account-b')).toMatchObject({ requestIds: ['existing-b'] });
    expect(pipeline.persistPeople.mock.calls.every(([user]) => user === 'account-a')).toBe(true);
    expect(pipeline.persistSnapshot.mock.calls.every(([user]) => user === 'account-a')).toBe(true);
    expect(pipeline.history.has(historyKey('account-b', PRODUCTION))).toBe(false);
    expect(pipeline.metric).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'error' }));
  });

  it('rebuilds the final history from the atomic raw cache after a derived snapshot write fails', async () => {
    pipeline.invoke.mockResolvedValue(response(2, ['one', 'two'], { reset: true }));
    pipeline.persistSnapshot.mockRejectedValueOnce(new Error('simulated derived cache failure'));

    expect(await fetchAppSnapshotForUser('account-a')).toMatchObject({
      requestIds: ['one', 'two'],
    });
    expect(pipeline.derived.has('account-a')).toBe(false);
    const durable = pipeline.history.get(historyKey('account-a', PRODUCTION));
    expect(durable?.bootstrapComplete).toBe(true);
    expect(durable?.liveRows).toBeDefined();
    if (!durable?.liveRows) throw new Error('Missing durable context after a completed sync');
    const rebuiltRows = mergeHistoryWithLiveRows(durable.liveRows, durable);
    expect(pipeline.buildSnapshot({ ...rebuiltRows, currentUserId: 'account-a' })).toMatchObject({
      requestIds: ['one', 'two'],
    });
  });

  it('reconstructs the real offline timeline with one accepted request and its posted movement after derived storage fails', async () => {
    const { buildLiveSnapshot } = await vi.importActual<typeof SnapshotBuilder>('./build-snapshot');
    pipeline.buildSnapshot.mockImplementation(buildLiveSnapshot);
    const happenedAt = '2026-10-11T11:00:00.000Z';
    const resolvedAt = '2026-10-11T11:30:00.000Z';
    const profile = (id: string) => ({
      id,
      email: `${id}@example.com`,
      display_name: id,
      avatar_path: null,
      created_at: happenedAt,
      updated_at: happenedAt,
    });
    const acceptedRequest = {
      id: 'closed-one',
      relationship_id: 'relationship',
      request_type: 'balance_increase',
      status: 'accepted',
      creator_user_id: 'account-a',
      responder_user_id: 'friend',
      debtor_user_id: 'friend',
      creditor_user_id: 'account-a',
      amount_minor: 1500,
      currency_code: 'COP',
      description: 'Recorded movement',
      category: 'food_drinks',
      parent_request_id: null,
      target_ledger_transaction_id: null,
      created_at: happenedAt,
      updated_at: resolvedAt,
      resolved_at: resolvedAt,
    };
    const postedMovement = {
      relationship_id: 'relationship',
      item_id: 'ledger-one',
      item_kind: 'ledger_transaction',
      status: 'posted',
      subtype: 'balance_increase_acceptance',
      source_type: 'user',
      creator_user_id: 'account-a',
      responder_user_id: 'friend',
      debtor_user_id: 'friend',
      creditor_user_id: 'account-a',
      amount_minor: 1500,
      description: 'Recorded movement',
      category: 'food_drinks',
      origin_request_id: 'closed-one',
      origin_settlement_proposal_id: null,
      happened_at: resolvedAt,
    };
    const live = dynamicRows({
      protocol: 1,
      cursor: `${EPOCH}:4`,
      hasMore: false,
      reset: true,
      changes: [
        { collection: 'financialRequests', key: 'closed-one', row: acceptedRequest },
        {
          collection: 'history',
          key: 'ledger_transaction:relationship:ledger-one',
          row: postedMovement,
        },
        { collection: 'profiles', key: 'account-a', row: profile('account-a') },
        { collection: 'profiles', key: 'friend', row: profile('friend') },
      ],
    });
    pipeline.invoke.mockResolvedValue({
      ...live,
      relationships: [
        {
          id: 'relationship',
          user_low_id: 'account-a',
          user_high_id: 'friend',
          status: 'active',
          created_at: happenedAt,
          updated_at: happenedAt,
        },
      ],
    });
    pipeline.persistSnapshot.mockRejectedValueOnce(new Error('simulated derived cache failure'));

    const fetched = await fetchAppSnapshotForUser('account-a');
    expect(fetched.peopleById.friend?.timeline).toHaveLength(3);
    expect(pipeline.derived.has('account-a')).toBe(false);
    const stored = pipeline.history.get(historyKey('account-a', PRODUCTION));
    if (!stored?.liveRows) throw new Error('Missing raw offline snapshot');
    const restored = buildLiveSnapshot({
      ...mergeHistoryWithLiveRows(stored.liveRows, stored),
      currentUserId: 'account-a',
    });
    expect(restored.peopleById.friend?.timeline).toEqual(fetched.peopleById.friend?.timeline);
    expect(restored.peopleById.friend?.pendingCount).toBe(0);
    const timelineIds = restored.peopleById.friend?.timeline.map((item) => item.id) ?? [];
    expect(new Set(timelineIds).size).toBe(3);
    expect(timelineIds.filter((id) => id === 'ledger-one')).toHaveLength(1);
  });
});
