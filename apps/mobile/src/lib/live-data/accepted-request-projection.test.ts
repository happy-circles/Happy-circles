import { describe, expect, it, vi } from 'vitest';
import {
  acceptedProjectionResponse,
  mergeAcceptedProjectionResponses,
  reconcileAcceptedProjection,
} from './accepted-request-projection';
import {
  applyConfirmedRequestOverlay,
  cachedSnapshotMatchesBackend,
} from './confirmed-request-overlay';
import { buildLiveSnapshot } from './build-snapshot';
import {
  applyHistorySyncPage,
  emptyHistorySyncState,
  mergeHistoryWithLiveRows,
  parseHistorySyncState,
  type HistorySyncState,
} from './history-sync';
import type {
  FinancialRequestRow,
  AppSnapshot,
  LiveSnapshotRows,
  OpenDebtRow,
  RelationshipHistoryRow,
} from './types';

vi.mock('react-native', () => ({
  Platform: {
    OS: 'web',
    select: (options: Record<string, unknown>) => options.web ?? options.default,
  },
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
  getRandomValues: vi.fn((value: Uint8Array) => value),
  randomUUID: vi.fn(),
}));

const ACTOR = '00000000-0000-4000-8000-000000000001';
const FRIEND = '00000000-0000-4000-8000-000000000002';
const OTHER = '00000000-0000-4000-8000-000000000003';
const RELATIONSHIP = '10000000-0000-4000-8000-000000000001';
const SECOND_RELATIONSHIP = '10000000-0000-4000-8000-000000000002';
const REQUEST = '20000000-0000-4000-8000-000000000001';
const LEDGER = '30000000-0000-4000-8000-000000000001';
const CREATED = '2026-10-13T10:00:00.000Z';
const ACCEPTED = '2026-10-13T10:01:00.000Z';
const OBSERVED = '2026-10-13T10:01:01.000Z';

function request(): FinancialRequestRow {
  return {
    id: REQUEST,
    relationship_id: RELATIONSHIP,
    request_type: 'balance_increase',
    status: 'accepted',
    creator_user_id: FRIEND,
    responder_user_id: ACTOR,
    debtor_user_id: FRIEND,
    creditor_user_id: ACTOR,
    amount_minor: 1500,
    currency_code: 'COP',
    description: 'Lunch',
    category: 'food_drinks',
    created_at: CREATED,
    updated_at: ACCEPTED,
    resolved_at: ACCEPTED,
    parent_request_id: null,
    target_ledger_transaction_id: null,
    request_case_id: REQUEST,
    version_number: 1,
    amendment_kind: null,
    resolved_by_user_id: ACTOR,
  };
}
function debt(amount = 4123): OpenDebtRow {
  return {
    relationship_id: RELATIONSHIP,
    user_low_id: ACTOR,
    user_high_id: FRIEND,
    debtor_user_id: FRIEND,
    creditor_user_id: ACTOR,
    currency_code: 'COP',
    amount_minor: amount,
  };
}
function history(): RelationshipHistoryRow {
  return {
    relationship_id: RELATIONSHIP,
    item_id: LEDGER,
    item_kind: 'ledger_transaction',
    status: 'posted',
    subtype: 'balance_increase_acceptance',
    source_type: 'user',
    creator_user_id: ACTOR,
    responder_user_id: ACTOR,
    debtor_user_id: FRIEND,
    creditor_user_id: ACTOR,
    amount_minor: 1500,
    description: 'Lunch',
    category: 'food_drinks',
    origin_request_id: REQUEST,
    origin_settlement_proposal_id: null,
    happened_at: ACCEPTED,
    request_case_id: REQUEST,
    version_number: 1,
    resolved_by_user_id: ACTOR,
    amendment_kind: null,
    parent_request_id: null,
    resolved_at: ACCEPTED,
  };
}
function response() {
  return {
    requestId: REQUEST,
    ledgerTransactionId: LEDGER,
    status: 'accepted',
    financialRequests: [request()],
    acceptedProjection: {
      requestId: REQUEST,
      relationshipId: RELATIONSHIP,
      observedAt: OBSERVED,
      history: history(),
      openDebt: debt(),
    },
  };
}
function initial(): HistorySyncState {
  const empty = emptyHistorySyncState();
  const unrelated = {
    ...history(),
    relationship_id: SECOND_RELATIONSHIP,
    debtor_user_id: OTHER,
    origin_request_id: 'other-request',
  };
  const liveRows: LiveSnapshotRows = {
    ...Object.fromEntries(Object.keys(empty.collections).map((name) => [name, []])),
    relationships: [
      {
        id: RELATIONSHIP,
        user_low_id: ACTOR,
        user_high_id: FRIEND,
        status: 'active',
        created_at: CREATED,
        updated_at: CREATED,
      },
    ],
    openDebts: [
      debt(5000),
      {
        ...debt(700),
        relationship_id: SECOND_RELATIONSHIP,
        user_high_id: OTHER,
        debtor_user_id: OTHER,
      },
    ],
    history: [unrelated],
    financialRequests: [request()],
    inboxItems: [
      {
        owner_user_id: ACTOR,
        item_id: REQUEST,
        item_kind: 'financial_request',
        status: 'pending',
        subtype: 'balance_increase',
        created_at: CREATED,
      },
    ],
    notificationViews: [],
    avatarSignedUrlsByPath: {},
    limits: {},
    fetchedAt: CREATED,
  } as unknown as LiveSnapshotRows;
  return {
    ...empty,
    cursor: '11111111-1111-4111-8111-111111111111:50',
    bootstrapComplete: true,
    liveRows,
  };
}

describe('canonical accepted request projection', () => {
  it('uses the server balance and adds one scoped ledger while preserving cursor, inbox and other balances', () => {
    const state = initial();
    const next = reconcileAcceptedProjection(state, response(), ACTOR);
    expect(next.liveRows?.openDebts).toEqual([state.liveRows?.openDebts[1], debt()]);
    expect(next.liveRows?.history).toHaveLength(2);
    expect(next.collections.history[`ledger_transaction:${RELATIONSHIP}:${LEDGER}`]).toEqual(
      history(),
    );
    expect(next.cursor).toBe(state.cursor);
    expect(next.liveRows?.inboxItems).toBe(state.liveRows?.inboxItems);
    expect(next.liveRows?.fetchedAt).toBe(CREATED);
    expect(state.liveRows?.openDebts[0].amount_minor).toBe(5000);
  });

  it('deduplicates repeat acknowledgements and a later journal delivery by the same history identity', () => {
    const first = reconcileAcceptedProjection(initial(), response(), ACTOR);
    const second = reconcileAcceptedProjection(first, response(), ACTOR);
    expect(second.liveRows?.history).toHaveLength(2);
    expect(Object.keys(second.collections.history)).toEqual([
      `ledger_transaction:${RELATIONSHIP}:${LEDGER}`,
    ]);
    expect(
      second.liveRows?.openDebts.filter((row) => row.relationship_id === RELATIONSHIP),
    ).toEqual([debt()]);
    const journal = applyHistorySyncPage(second, {
      protocol: 1,
      cursor: '11111111-1111-4111-8111-111111111111:51',
      reset: false,
      hasMore: false,
      changes: [
        {
          collection: 'history',
          key: `ledger_transaction:${RELATIONSHIP}:${LEDGER}`,
          row: history(),
        },
      ],
    });
    expect(mergeHistoryWithLiveRows(journal.liveRows!, journal).history).toHaveLength(2);
    expect(journal.cursor).toBe('11111111-1111-4111-8111-111111111111:51');
  });

  it('keeps a fresher full snapshot balance when an older acknowledgement arrives late', () => {
    const state = initial();
    const fresh = {
      ...state,
      liveRows: {
        ...state.liveRows!,
        fetchedAt: '2026-10-13T10:02:00.000Z',
        openDebts: [debt(9000)],
      },
    };
    const next = reconcileAcceptedProjection(fresh, response(), ACTOR);
    expect(next.liveRows?.openDebts).toBe(fresh.liveRows.openDebts);
    expect(next.liveRows?.history).toHaveLength(2);
    expect(next.cursor).toBe(fresh.cursor);
  });

  it('rejects older partial balances after a newer acknowledgement even across a cache reload', () => {
    const newer = response();
    newer.acceptedProjection.observedAt = '2026-10-13T10:02:00.000Z';
    newer.acceptedProjection.openDebt = debt(7200);
    const updated = reconcileAcceptedProjection(initial(), newer, ACTOR);
    const loaded = parseHistorySyncState(JSON.parse(JSON.stringify(updated)));
    expect(loaded).not.toBeNull();
    const next = reconcileAcceptedProjection(loaded!, response(), ACTOR);
    expect(
      next.liveRows?.openDebts.find((row) => row.relationship_id === RELATIONSHIP)?.amount_minor,
    ).toBe(7200);
    expect(next.liveRows?.fetchedAt).toBe(CREATED);
  });

  it('removes only the affected open debt when the server confirms a zero balance', () => {
    const ack = response();
    const zero = { ...ack, acceptedProjection: { ...ack.acceptedProjection, openDebt: null } };
    const state = initial();
    const next = reconcileAcceptedProjection(state, zero, ACTOR);
    expect(next.liveRows?.openDebts).toEqual([state.liveRows?.openDebts[1]]);
  });

  it('records the ledger without fabricating a balance when raw dynamic context is absent', () => {
    const state = { ...emptyHistorySyncState(), cursor: null };
    const next = reconcileAcceptedProjection(state, response(), ACTOR);
    expect(Object.keys(next.collections.history)).toHaveLength(1);
    expect(next.liveRows).toBeUndefined();
    expect(next.cursor).toBeNull();
  });

  it('does not accept another account acknowledgement', () => {
    const state = initial();
    expect(reconcileAcceptedProjection(state, response(), OTHER)).toBe(state);
  });

  it.each([
    { item_id: 'wrong-ledger' },
    { origin_request_id: 'wrong-request' },
    { relationship_id: 'wrong-relationship' },
    { amount_minor: 1501 },
    { creditor_user_id: OTHER },
    { subtype: 'cycle_settlement' },
    { status: 'pending' },
  ])('ignores a ledger row that does not match the accepted command: %j', (changed) => {
    const ack = response();
    Object.assign(ack.acceptedProjection.history, changed);
    const state = initial();
    expect(reconcileAcceptedProjection(state, ack, ACTOR)).toBe(state);
  });

  it('does not project balance rows from a different currency or participant pair', () => {
    const ack = response();
    ack.acceptedProjection.openDebt = { ...ack.acceptedProjection.openDebt, currency_code: 'USD' };
    const state = initial();
    expect(reconcileAcceptedProjection(state, ack, ACTOR)).toBe(state);
    ack.acceptedProjection.openDebt = {
      ...ack.acceptedProjection.openDebt,
      currency_code: 'COP',
      user_high_id: OTHER,
    };
    expect(reconcileAcceptedProjection(state, ack, ACTOR)).toBe(state);
  });

  it('checks the stored relationship participants instead of trusting a matching relationship id alone', () => {
    const state = initial();
    const wrong = {
      ...state,
      liveRows: {
        ...state.liveRows!,
        relationships: [{ ...state.liveRows!.relationships[0], user_high_id: OTHER }],
      },
    };
    expect(reconcileAcceptedProjection(wrong, response(), ACTOR)).toBe(wrong);
  });
});

describe('durable accepted projection fallback', () => {
  const BACKEND = 'https://projection-test.supabase.co';

  function fallback(ack: ReturnType<typeof response>) {
    const sanitized = acceptedProjectionResponse(ack, ACTOR);
    if (!sanitized) throw new Error('Invalid fixture');
    return {
      confirmedFinancialRequests: { backendScope: BACKEND, rows: sanitized.financialRequests },
      confirmedAcceptedProjections: {
        backendScope: BACKEND,
        userId: ACTOR,
        responses: [sanitized],
      },
    };
  }

  it('persists only public fields and the matching accepted request', () => {
    const ack = response();
    const input = {
      ...ack,
      session: 'private-token',
      financialRequests: [
        { ...request(), private_auth_field: 'not-public' },
        { ...request(), id: 'unrelated' },
      ],
      acceptedProjection: {
        ...ack.acceptedProjection,
        history: {
          ...ack.acceptedProjection.history,
          service_role_key: 'never-cache',
        },
        openDebt: { ...ack.acceptedProjection.openDebt, private_graph_field: 'never-cache' },
      },
    };
    const sanitized = acceptedProjectionResponse(input, ACTOR);
    expect(sanitized?.financialRequests).toHaveLength(1);
    expect(sanitized).not.toHaveProperty('session');
    expect(sanitized?.financialRequests[0]).not.toHaveProperty('private_auth_field');
    expect(sanitized?.acceptedProjection.history).not.toHaveProperty('service_role_key');
    expect(sanitized?.acceptedProjection.openDebt).not.toHaveProperty('private_graph_field');
    expect(acceptedProjectionResponse(input, OTHER)).toBeNull();
  });

  it('does not persist nested or invalid public row values', () => {
    const ack = response();
    Object.assign(ack.acceptedProjection.history, { description: { private: 'token' } });
    expect(acceptedProjectionResponse(ack, ACTOR)).toBeNull();
  });

  it('keeps a single immutable ledger and the freshest canonical balance on idempotent replay', () => {
    const older = acceptedProjectionResponse(response(), ACTOR)!;
    const fresh = response();
    fresh.acceptedProjection.observedAt = '2026-10-13T10:02:00.000Z';
    fresh.acceptedProjection.openDebt = debt(7000);
    fresh.acceptedProjection.history = {
      ...fresh.acceptedProjection.history,
      description: 'later-metadata',
    };
    const newer = acceptedProjectionResponse(fresh, ACTOR)!;
    const merged = mergeAcceptedProjectionResponses([older], [newer, older]);
    expect(merged).toHaveLength(1);
    expect(merged[0].acceptedProjection.history.description).toBe('Lunch');
    expect(merged[0].acceptedProjection.openDebt?.amount_minor).toBe(7000);
    expect(merged[0].acceptedProjection.observedAt).toBe(newer.acceptedProjection.observedAt);
  });

  it('recovers confirmed ledger and balance on restart when only the fallback snapshot write survived', () => {
    const rawBeforeWriteFailure = initial();
    const persistedFallback = JSON.parse(JSON.stringify(fallback(response()))) as AppSnapshot;
    const restored = applyConfirmedRequestOverlay(
      rawBeforeWriteFailure,
      persistedFallback,
      ACTOR,
      BACKEND,
    );
    const replayed = applyConfirmedRequestOverlay(restored, persistedFallback, ACTOR, BACKEND);
    const snapshot = buildLiveSnapshot({
      ...mergeHistoryWithLiveRows(replayed.liveRows!, replayed),
      currentUserId: ACTOR,
    });
    expect(replayed.cursor).toBe(rawBeforeWriteFailure.cursor);
    expect(
      replayed.liveRows?.openDebts.find((row) => row.relationship_id === RELATIONSHIP)
        ?.amount_minor,
    ).toBe(4123);
    expect(
      replayed.liveRows?.history.filter(
        (row) => row.relationship_id === RELATIONSHIP && row.item_id === LEDGER,
      ),
    ).toHaveLength(1);
    expect(snapshot.peopleById[FRIEND].netAmountMinor).toBe(4123);
    expect(snapshot.peopleById[FRIEND].timeline.filter((row) => row.id === LEDGER)).toHaveLength(1);
  });

  it('does not regress a newer raw balance while recovering an older fallback ledger', () => {
    const raw = initial();
    const fresh = {
      ...raw,
      liveRows: {
        ...raw.liveRows!,
        fetchedAt: '2026-10-13T10:03:00.000Z',
        openDebts: [debt(9000)],
      },
    };
    const restored = applyConfirmedRequestOverlay(
      fresh,
      fallback(response()) as unknown as AppSnapshot,
      ACTOR,
      BACKEND,
    );
    expect(restored.liveRows?.openDebts[0].amount_minor).toBe(9000);
    expect(
      restored.liveRows?.history.filter(
        (row) => row.relationship_id === RELATIONSHIP && row.item_id === LEDGER,
      ),
    ).toHaveLength(1);
  });

  it('restores both relationship balances from multiple confirmations without advancing the full snapshot clock', () => {
    const first = acceptedProjectionResponse(response(), ACTOR)!;
    const nextRequest = '20000000-0000-4000-8000-000000000002';
    const nextLedger = '30000000-0000-4000-8000-000000000002';
    const nextTime = '2026-10-13T10:02:00.000Z';
    const second = acceptedProjectionResponse(
      {
        status: 'accepted',
        requestId: nextRequest,
        ledgerTransactionId: nextLedger,
        financialRequests: [
          {
            ...request(),
            id: nextRequest,
            request_case_id: nextRequest,
            relationship_id: SECOND_RELATIONSHIP,
            creator_user_id: OTHER,
            debtor_user_id: OTHER,
            updated_at: nextTime,
            resolved_at: nextTime,
          },
        ],
        acceptedProjection: {
          requestId: nextRequest,
          relationshipId: SECOND_RELATIONSHIP,
          observedAt: '2026-10-13T10:02:01.000Z',
          history: {
            ...history(),
            item_id: nextLedger,
            origin_request_id: nextRequest,
            request_case_id: nextRequest,
            relationship_id: SECOND_RELATIONSHIP,
            debtor_user_id: OTHER,
            happened_at: nextTime,
            resolved_at: nextTime,
          },
          openDebt: {
            ...debt(2500),
            relationship_id: SECOND_RELATIONSHIP,
            user_high_id: OTHER,
            debtor_user_id: OTHER,
          },
        },
      },
      ACTOR,
    )!;
    expect(second).not.toBeNull();
    const state = initial();
    const raw = {
      ...state,
      liveRows: {
        ...state.liveRows!,
        relationships: [
          ...state.liveRows!.relationships,
          { ...state.liveRows!.relationships[0], id: SECOND_RELATIONSHIP, user_high_id: OTHER },
        ],
      },
    };
    const responses = mergeAcceptedProjectionResponses([second], [first]);
    const stored = JSON.parse(
      JSON.stringify({
        confirmedFinancialRequests: {
          backendScope: BACKEND,
          rows: responses.flatMap((ack) => ack.financialRequests),
        },
        confirmedAcceptedProjections: { backendScope: BACKEND, userId: ACTOR, responses },
      }),
    ) as AppSnapshot;
    const restored = applyConfirmedRequestOverlay(raw, stored, ACTOR, BACKEND);
    const replayed = applyConfirmedRequestOverlay(restored, stored, ACTOR, BACKEND);
    expect(
      replayed.liveRows?.openDebts.find((row) => row.relationship_id === RELATIONSHIP)
        ?.amount_minor,
    ).toBe(4123);
    expect(
      replayed.liveRows?.openDebts.find((row) => row.relationship_id === SECOND_RELATIONSHIP)
        ?.amount_minor,
    ).toBe(2500);
    expect(Object.keys(replayed.collections.history)).toHaveLength(2);
    expect(replayed.liveRows?.fetchedAt).toBe(CREATED);
    expect(replayed.cursor).toBe(raw.cursor);
  });

  it.each([
    { backendScope: 'https://other-backend.supabase.co', userId: ACTOR },
    { backendScope: BACKEND, userId: OTHER },
  ])('isolates persisted projection metadata by account and backend: %j', (scope) => {
    const state = initial();
    const stored = {
      confirmedAcceptedProjections: {
        ...scope,
        responses: fallback(response()).confirmedAcceptedProjections.responses,
      },
    } as unknown as AppSnapshot;
    expect(applyConfirmedRequestOverlay(state, stored, ACTOR, BACKEND)).toBe(state);
    if (scope.backendScope !== BACKEND)
      expect(cachedSnapshotMatchesBackend(stored, BACKEND)).toBe(false);
  });
});
