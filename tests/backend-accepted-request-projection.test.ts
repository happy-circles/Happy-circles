import { describe, expect, it, vi } from 'vitest';
import {
  ACCEPTED_HISTORY_SELECT,
  ACCEPTED_OPEN_DEBT_SELECT,
  hydrateAcceptedProjection,
} from '../supabase/functions/_shared/accepted-request-projection';

const ACTOR = '00000000-0000-4000-8000-000000000001';
const FRIEND = '00000000-0000-4000-8000-000000000002';
const REQUEST = '20000000-0000-4000-8000-000000000001';
const LEDGER = '30000000-0000-4000-8000-000000000001';
const RELATIONSHIP = '10000000-0000-4000-8000-000000000001';
const OBSERVED = '2026-10-13T10:01:01.000Z';

function acknowledgement() {
  return {
    requestId: REQUEST,
    ledgerTransactionId: LEDGER,
    status: 'accepted',
    financialRequests: [
      {
        id: REQUEST,
        relationship_id: RELATIONSHIP,
        creator_user_id: FRIEND,
        responder_user_id: ACTOR,
        debtor_user_id: FRIEND,
        creditor_user_id: ACTOR,
        amount_minor: 1500,
        currency_code: 'COP',
        request_type: 'balance_increase',
        status: 'accepted',
      },
    ],
  };
}
function rows() {
  return {
    history: {
      item_kind: 'ledger_transaction',
      item_id: LEDGER,
      relationship_id: RELATIONSHIP,
      origin_request_id: REQUEST,
      subtype: 'balance_increase_acceptance',
      status: 'posted',
      source_type: 'user',
      creator_user_id: ACTOR,
      responder_user_id: ACTOR,
      debtor_user_id: FRIEND,
      creditor_user_id: ACTOR,
      amount_minor: 1500,
      happened_at: '2026-10-13T10:01:00.000Z',
      internal_secret: 'not-public',
    },
    debt: {
      relationship_id: RELATIONSHIP,
      user_low_id: ACTOR,
      user_high_id: FRIEND,
      debtor_user_id: FRIEND,
      creditor_user_id: ACTOR,
      amount_minor: 4123,
      currency_code: 'COP',
    },
  };
}
function client(history: unknown, debt: unknown, error: unknown = null) {
  const queries: Array<{ table: string; fields: string; filters: Record<string, unknown> }> = [];
  const value = {
    from: vi.fn((table: string) => {
      const plan = { table, fields: '', filters: {} as Record<string, unknown> };
      queries.push(plan);
      const query = {
        select(fields: string) {
          plan.fields = fields;
          return query;
        },
        eq(field: string, value: unknown) {
          plan.filters[field] = value;
          return query;
        },
        abortSignal() {
          return query;
        },
        maybeSingle: () =>
          Promise.resolve({ data: table === 'v_relationship_history' ? history : debt, error }),
      };
      return query;
    }),
  };
  return { value: value as unknown as Parameters<typeof hydrateAcceptedProjection>[0], queries };
}

describe('accepted request canonical read enrichment', () => {
  it('reads only the acknowledged ledger and relationship and publishes allowlisted canonical rows', async () => {
    const read = rows();
    const mock = client(read.history, read.debt);
    const result = await hydrateAcceptedProjection(mock.value, ACTOR, acknowledgement(), {
      observedAt: OBSERVED,
    });
    expect(result).toHaveProperty('acceptedProjection.observedAt', OBSERVED);
    expect(result).toHaveProperty('acceptedProjection.openDebt.amount_minor', 4123);
    expect(result).not.toHaveProperty('acceptedProjection.history.internal_secret');
    expect(mock.queries).toEqual([
      {
        table: 'v_relationship_history',
        fields: ACCEPTED_HISTORY_SELECT,
        filters: {
          item_kind: 'ledger_transaction',
          item_id: LEDGER,
          relationship_id: RELATIONSHIP,
          origin_request_id: REQUEST,
        },
      },
      {
        table: 'v_open_debts',
        fields: ACCEPTED_OPEN_DEBT_SELECT,
        filters: { relationship_id: RELATIONSHIP },
      },
    ]);
  });

  it('represents an absent open debt as the canonical zero balance', async () => {
    const mock = client(rows().history, null);
    const result = await hydrateAcceptedProjection(mock.value, ACTOR, acknowledgement());
    expect(result).toHaveProperty('acceptedProjection.openDebt', null);
  });

  it('does not query projection views for a foreign actor', async () => {
    const mock = client(rows().history, rows().debt);
    const data = acknowledgement();
    expect(await hydrateAcceptedProjection(mock.value, 'foreign-actor', data)).toBe(data);
    expect(mock.queries).toHaveLength(0);
  });

  it.each([
    { origin_request_id: FRIEND },
    { item_id: REQUEST },
    { amount_minor: 1499 },
    { creditor_user_id: 'foreign' },
    { subtype: 'cycle_settlement' },
  ])('preserves the committed RPC result when the ledger does not match: %j', async (change) => {
    const mock = client({ ...rows().history, ...change }, rows().debt);
    const data = acknowledgement();
    expect(await hydrateAcceptedProjection(mock.value, ACTOR, data)).toBe(data);
  });

  it('never treats a failed debt read as a confirmed zero or as an RPC failure', async () => {
    const mock = client(rows().history, null, new Error('read failed'));
    const data = acknowledgement();
    expect(await hydrateAcceptedProjection(mock.value, ACTOR, data)).toBe(data);
  });

  it('releases the response on abort even when the view client never resolves', async () => {
    const mock = client(rows().history, rows().debt);
    const pending = new Promise(() => undefined);
    const from = vi.fn(() => {
      const query = {
        select: () => query,
        eq: () => query,
        abortSignal: () => query,
        maybeSingle: () => pending,
      };
      return query;
    });
    const hanging = { ...mock.value, from } as unknown as Parameters<
      typeof hydrateAcceptedProjection
    >[0];
    const abort = new AbortController();
    const data = acknowledgement();
    const response = hydrateAcceptedProjection(hanging, ACTOR, data, { signal: abort.signal });
    abort.abort();
    expect(await response).toBe(data);
  });

  it('hydrates a replay from fresh balance reads rather than its original accepted amount', async () => {
    const read = rows();
    read.debt.amount_minor = 7000;
    const mock = client(read.history, read.debt);
    const result = await hydrateAcceptedProjection(mock.value, ACTOR, acknowledgement());
    expect(result).toHaveProperty('acceptedProjection.openDebt.amount_minor', 7000);
  });
});
