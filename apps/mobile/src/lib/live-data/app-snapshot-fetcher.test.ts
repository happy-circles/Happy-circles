import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppSnapshot, LiveSnapshotRows } from './types';
import type { HistorySyncPage, HistorySyncState } from './history-sync';
import type * as WebHistoryCache from './history-sync-cache.web';
import type * as SnapshotBuilder from './build-snapshot';
import type { HistoryCacheReceipt } from './history-cache-receipt';

const pipeline = vi.hoisted(() => ({
  actor: 'account-a',
  config: { supabaseUrl: 'https://production.supabase.co' },
  history: new Map<string, HistorySyncState>(),
  derived: new Map<string, AppSnapshot>(),
  memory: new Map<string, AppSnapshot>(),
  receipts: new Map<string, HistoryCacheReceipt>(),
  generation: 0,
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
vi.mock('./snapshot-cache', () => ({
  persistCachedAppSnapshot: pipeline.persistSnapshot,
  readCachedAppSnapshot: async (user: string) => {
    const snapshot = pipeline.derived.get(user);
    return snapshot
      ? { snapshot, avatarSignedUrlsByPath: {}, updatedAt: '2026-10-11T12:00:00.000Z' }
      : null;
  },
}));
vi.mock('../query-client', () => ({
  queryClient: { getQueryData: (key: readonly string[]) => pipeline.memory.get(key[1]) },
}));
vi.mock('./client', () => ({
  invokeSupabaseFunction: pipeline.invoke,
  assertSupabaseClient: () => ({
    auth: { getSession: async () => ({ data: { session: { user: { id: pipeline.actor } } } }) },
  }),
  createSnapshotAbortSignal: (parent?: AbortSignal) => {
    if (!parent)
      return {
        timeoutPromise: new Promise<never>(() => undefined),
        cleanup: vi.fn(),
      };
    let reject!: (error: Error) => void;
    const timeoutPromise = new Promise<never>((_resolve, fail) => {
      reject = fail;
    });
    const onAbort = () => reject(new Error('Sincronización cancelada.'));
    parent.addEventListener('abort', onAbort, { once: true });
    return {
      signal: parent,
      timeoutPromise,
      cleanup: () => parent.removeEventListener('abort', onAbort),
    };
  },
}));
vi.mock('./history-sync-cache', async () => {
  const web = await vi.importActual<typeof WebHistoryCache>('./history-sync-cache.web');
  return {
    withHistorySyncLock: web.withHistorySyncLock,
    readCachedHistory: pipeline.readHistory,
    persistCachedHistory: pipeline.persistHistory,
    readCachedHistoryReceipt: async (user: string, scope: string) =>
      pipeline.receipts.get(historyKey(user, scope)) ?? null,
  };
});

import { fetchAppSnapshotForUser } from './app-snapshot-fetcher';
import { emptyHistorySyncState, mergeHistoryWithLiveRows } from './history-sync';
import { withHistorySyncLock } from './history-sync-cache';

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

async function flushDerived(user = 'account-a', scope = PRODUCTION) {
  await withHistorySyncLock(user, scope, async () => undefined);
}

beforeEach(() => {
  vi.clearAllMocks();
  pipeline.actor = 'account-a';
  pipeline.config.supabaseUrl = PRODUCTION;
  pipeline.history.clear();
  pipeline.derived.clear();
  pipeline.memory.clear();
  pipeline.receipts.clear();
  pipeline.generation = 0;
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
      const receipt: HistoryCacheReceipt = {
        userId: user,
        backendScope: scope,
        generation: `commit-${++pipeline.generation}`,
        cursor: state.cursor,
        bootstrapComplete: state.bootstrapComplete === true,
        fetchedAt: state.liveRows?.fetchedAt ?? null,
      };
      pipeline.receipts.set(historyKey(user, scope), receipt);
      return receipt;
    },
  );
  pipeline.buildSnapshot.mockImplementation(
    (input: LiveSnapshotRows & { readonly currentUserId: string }) =>
      ({
        actor: input.currentUserId,
        requestIds: input.financialRequests
          .filter(
            (row) =>
              row.status !== 'pending' ||
              !input.confirmedRequestOutcomes?.some((outcome) => outcome.requestId === row.id),
          )
          .map((row) => row.id),
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
  it.each(['memory', 'disk'] as const)(
    'carries a fallback exact-ID outcome from %s through a server reset without resurrecting pending',
    async (source) => {
      const id = '00000000-0000-4000-8000-000000000011';
      const overlay = {
        confirmedRequestOutcomes: {
          userId: 'account-a',
          backendScope: PRODUCTION,
          outcomes: [{ requestId: id, status: 'accepted' }],
        },
        } as unknown as AppSnapshot;
      (source === 'memory' ? pipeline.memory : pipeline.derived).set('account-a', overlay);
      const incoming = response(1, [], { reset: true });
      pipeline.invoke.mockResolvedValueOnce({
        ...incoming,
        financialRequests: [{ id, status: 'pending', amount_minor: 100 }],
      });
      expect(await fetchAppSnapshotForUser('account-a')).toMatchObject({ requestIds: [] });
      await flushDerived();
      const durable = pipeline.history.get(historyKey('account-a', PRODUCTION))!;
      expect(durable.cursor).toBe(`${EPOCH}:1`);
      expect(durable.confirmedRequestOutcomes).toEqual(overlay.confirmedRequestOutcomes?.outcomes);
      expect(durable.liveRows?.financialRequests).toEqual([
        { id, status: 'pending', amount_minor: 100 },
      ]);
      expect(pipeline.buildSnapshot.mock.calls[0][0]).toMatchObject({
        confirmedRequestOutcomes: overlay.confirmedRequestOutcomes?.outcomes,
        financialRequests: [{ id, status: 'pending' }],
      });
      expect(durable.collections.history).toEqual({});
    },
  );

  it.each([
    { userId: 'account-b', backendScope: PRODUCTION },
    { userId: 'account-a', backendScope: PREVIEW },
  ])('ignores foreign fallback outcomes on the network path (%j)', async (scope) => {
    const id = '00000000-0000-4000-8000-000000000011';
    pipeline.derived.set('account-a', {
      confirmedRequestOutcomes: { ...scope, outcomes: [{ requestId: id, status: 'accepted' }] },
    } as unknown as AppSnapshot);
    const incoming = response(1, [], { reset: true });
    pipeline.invoke.mockResolvedValueOnce({
      ...incoming,
      financialRequests: [{ id, status: 'pending', amount_minor: 100 }],
    });
    expect(await fetchAppSnapshotForUser('account-a')).toMatchObject({ requestIds: [id] });
    await flushDerived();
    expect(
      pipeline.history.get(historyKey('account-a', PRODUCTION))?.confirmedRequestOutcomes,
    ).toBeUndefined();
  });

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
    await flushDerived();

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

  it('returns after durable raw confirmation while slow derived writes remain ordered before the next refresh', async () => {
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
    expect(await first).toMatchObject({ requestIds: ['one'] });
    const second = fetchAppSnapshotForUser('account-a');
    await Promise.resolve();
    await Promise.resolve();

    expect(pipeline.invoke).toHaveBeenCalledTimes(1);
    expect(pipeline.buildSnapshot).toHaveBeenCalledTimes(1);
    expect(pipeline.persistSnapshot).not.toHaveBeenCalled();
    release.resolve();
    await Promise.all([first, second]);
    await flushDerived();

    const derivedWrites = pipeline.persistSnapshot.mock.calls as [string, ObservedSnapshot][];
    expect(derivedWrites.map(([, snapshot]) => snapshot.requestIds)).toEqual([
      ['one'],
      ['one', 'two'],
    ]);
    expect(pipeline.derived.get('account-a')).toMatchObject({ requestIds: ['one', 'two'] });
    expect(pipeline.history.get(historyKey('account-a', PRODUCTION))?.cursor).toBe(`${EPOCH}:2`);
  });

  it('skips a queued older derived write if a newer refresh was already waiting on the journal lock', async () => {
    const started = deferred();
    const release = deferred();
    pipeline.invoke
      .mockImplementationOnce(async () => {
        started.resolve();
        await release.promise;
        return response(1, ['one'], { reset: true });
      })
      .mockResolvedValueOnce(response(2, ['two']));
    const first = fetchAppSnapshotForUser('account-a');
    await started.promise;
    const second = fetchAppSnapshotForUser('account-a');
    release.resolve();
    await Promise.all([first, second]);
    await flushDerived();

    expect(pipeline.persistSnapshot).toHaveBeenCalledOnce();
    expect(pipeline.derived.get('account-a')).toMatchObject({ requestIds: ['one', 'two'] });
    expect(pipeline.derived.get('account-a')?.localHistoryCache).toEqual(
      pipeline.receipts.get(historyKey('account-a', PRODUCTION)),
    );
    expect(pipeline.history.get(historyKey('account-a', PRODUCTION))?.cursor).toBe(`${EPOCH}:2`);
  });

  it.each([false, true])(
    'preserves an acknowledgement queued ahead of a derived write when raw persistence failed (derived durable: %s)',
    async (derivedDurable) => {
      const started = deferred();
      const release = deferred();
      pipeline.invoke.mockImplementationOnce(async () => {
        started.resolve();
        await release.promise;
        return response(1, ['one'], { reset: true });
      });
      const fetched = fetchAppSnapshotForUser('account-a');
      await started.promise;
      const acknowledged = {
        actor: 'account-a',
        requestIds: ['one'],
        confirmedFinancialRequests: {
          backendScope: PRODUCTION,
          rows: [{ id: 'one', status: 'canceled' }],
        },
      } as unknown as AppSnapshot;
      const command = withHistorySyncLock('account-a', PRODUCTION, async () => {
        pipeline.memory.set('account-a', acknowledged);
        if (derivedDurable) pipeline.derived.set('account-a', acknowledged);
      });
      release.resolve();
      await Promise.all([fetched, command]);
      await flushDerived();

      expect(pipeline.memory.get('account-a')).toBe(acknowledged);
      expect(pipeline.persistSnapshot).not.toHaveBeenCalled();
      expect(pipeline.persistPeople).not.toHaveBeenCalled();
      if (derivedDurable) expect(pipeline.derived.get('account-a')).toBe(acknowledged);
    },
  );

  it('replaces a fallback acknowledgement once the canonical delta has observed it, restoring the fast derived cache', async () => {
    const confirmed = {
      id: 'one',
      status: 'canceled',
      amount_minor: 100,
      updated_at: '2026-10-13T12:00:00.000Z',
      version_number: 1,
    };
    const oldReceipt: HistoryCacheReceipt = {
      userId: 'account-a',
      backendScope: PRODUCTION,
      generation: 'previous-raw-commit',
      cursor: null,
      bootstrapComplete: true,
      fetchedAt: '2026-10-11T12:00:00.000Z',
    };
    const fallback = {
      actor: 'account-a',
      requestIds: ['one'],
      localHistoryCache: oldReceipt,
      confirmedFinancialRequests: { backendScope: PRODUCTION, rows: [confirmed] },
    } as unknown as AppSnapshot;
    pipeline.memory.set('account-a', fallback);
    pipeline.derived.set('account-a', fallback);
    const canonical = response(1, [], { reset: true });
    pipeline.invoke.mockResolvedValueOnce({
      ...canonical,
      historySync: {
        ...canonical.historySync!,
        changes: [{ collection: 'financialRequests', key: 'one', row: confirmed }],
      },
    });
    const restored = await fetchAppSnapshotForUser('account-a');
    await flushDerived();

    expect(pipeline.persistSnapshot).toHaveBeenCalledOnce();
    expect(pipeline.derived.get('account-a')).toBe(restored);
    expect(restored.confirmedFinancialRequests).toBeUndefined();
    expect(restored.localHistoryCache?.generation).not.toBe(oldReceipt.generation);
    expect(
      pipeline.history.get(historyKey('account-a', PRODUCTION))?.collections.financialRequests.one,
    ).toEqual(confirmed);
  });

  it.each([
    { amount_minor: 99 },
    { version_number: 0 },
    { status: 'accepted' },
    { updated_at: '2026-10-13T11:59:00.000Z' },
  ])(
    'preserves an unobserved fallback acknowledgement when canonical fields differ (%j)',
    async (change) => {
      const confirmed = {
        id: 'one',
        status: 'canceled',
        amount_minor: 100,
        version_number: 1,
        updated_at: '2026-10-13T12:00:00.000Z',
      };
      pipeline.memory.set('account-a', {
        confirmedFinancialRequests: { backendScope: PRODUCTION, rows: [confirmed] },
      } as unknown as AppSnapshot);
      const canonical = response(1, [], { reset: true });
      pipeline.invoke.mockResolvedValueOnce({
        ...canonical,
        historySync: {
          ...canonical.historySync!,
          changes: [
            { collection: 'financialRequests', key: 'one', row: { ...confirmed, ...change } },
          ],
        },
      });
      await fetchAppSnapshotForUser('account-a');
      await flushDerived();
      expect(pipeline.persistSnapshot).not.toHaveBeenCalled();
      expect(pipeline.persistPeople).not.toHaveBeenCalled();
    },
  );

  it('does not return until raw rows and their cursor are durable, then ignores a slow derivative cache', async () => {
    const started = deferred();
    const release = deferred();
    const persist = pipeline.persistHistory.getMockImplementation() as (
      user: string,
      scope: string,
      state: HistorySyncState,
    ) => Promise<HistoryCacheReceipt>;
    pipeline.persistHistory.mockImplementationOnce(
      async (user: string, scope: string, state: HistorySyncState) => {
        started.resolve();
        await release.promise;
        return persist(user, scope, state);
      },
    );
    pipeline.invoke.mockResolvedValueOnce(response(1, ['one'], { reset: true }));
    let resolved = false;
    const fetched = fetchAppSnapshotForUser('account-a').then((snapshot) => {
      resolved = true;
      return snapshot;
    });
    await started.promise;
    expect(resolved).toBe(false);
    expect(pipeline.history.size).toBe(0);
    expect(pipeline.persistSnapshot).not.toHaveBeenCalled();
    release.resolve();
    const snapshot = await fetched;
    expect(snapshot.localHistoryCache?.cursor).toBe(`${EPOCH}:1`);
    expect(pipeline.history.get(historyKey('account-a', PRODUCTION))?.cursor).toBe(`${EPOCH}:1`);
    await flushDerived();
  });

  it('retries from the last durable cursor after a raw write fails, without losing or duplicating rows', async () => {
    pipeline.invoke.mockResolvedValue(response(1, ['one'], { reset: true }));
    pipeline.persistHistory.mockRejectedValueOnce(new Error('raw write failed'));
    await expect(fetchAppSnapshotForUser('account-a')).rejects.toThrow('raw write failed');
    expect(pipeline.receipts.size).toBe(0);
    expect(pipeline.history.size).toBe(0);
    expect(pipeline.persistSnapshot).not.toHaveBeenCalled();

    expect(await fetchAppSnapshotForUser('account-a')).toMatchObject({ requestIds: ['one'] });
    await flushDerived();
    const invocations = pipeline.invoke.mock.calls as [
      string,
      { historySync: { cursor: string | null } },
    ][];
    expect(invocations.map(([, input]) => input.historySync.cursor)).toEqual([null, null]);
    expect(
      Object.keys(
        pipeline.history.get(historyKey('account-a', PRODUCTION))!.collections.financialRequests,
      ),
    ).toEqual(['one']);
    expect(pipeline.derived.get('account-a')).toMatchObject({ requestIds: ['one'] });
  });

  it('cancels a slow request immediately and releases the raw lock before its late response can arrive', async () => {
    const started = deferred();
    const lateResponse = deferred();
    pipeline.invoke.mockImplementationOnce(async () => {
      started.resolve();
      await lateResponse.promise;
      return response(1, ['one'], { reset: true });
    });
    const controller = new AbortController();
    const fetched = fetchAppSnapshotForUser('account-a', controller.signal);
    const rejection = expect(fetched).rejects.toThrow('cancelada');
    await started.promise;
    const confirmed = vi.fn();
    const command = withHistorySyncLock('account-a', PRODUCTION, async () => {
      confirmed();
    });
    expect(confirmed).not.toHaveBeenCalled();
    controller.abort();
    await rejection;
    await command;
    expect(confirmed).toHaveBeenCalledOnce();
    expect(pipeline.invoke.mock.calls[0]?.[2]).toMatchObject({
      expectedUserId: 'account-a',
      signal: controller.signal,
    });
    lateResponse.resolve();
    await flushDerived();
    expect(pipeline.persistHistory).not.toHaveBeenCalled();
    expect(pipeline.persistSnapshot).not.toHaveBeenCalled();
    expect(pipeline.history.size).toBe(0);
  });

  it('rejects a session change during derivation and never writes derived data under the new account', async () => {
    pipeline.derived.set('account-b', {
      actor: 'account-b',
      requestIds: ['existing-b'],
    } as unknown as AppSnapshot);
    pipeline.invoke.mockResolvedValue(response(1, ['one'], { reset: true }));
    pipeline.buildSnapshot.mockImplementationOnce(
      (input: LiveSnapshotRows & { currentUserId: string }) => {
        pipeline.actor = 'account-b';
        return { actor: input.currentUserId, requestIds: ['one'] } as unknown as AppSnapshot;
      },
    );

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
    await flushDerived();
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
