import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  hydrateControlResponse,
  readControlRequest,
  readCorrection,
} from '../supabase/functions/_shared/financial-request-controls';

const state = vi.hoisted(() => ({
  actor: '00000000-0000-0000-0000-00000000fc01',
  body: {} as Record<string, unknown>,
  authorize: vi.fn(),
  rpc: vi.fn<(...args: unknown[]) => Promise<{ data: unknown; error: unknown }>>(),
  readRows: vi.fn(),
  push: vi.fn(),
  verified: vi.fn(),
}));
vi.mock('../supabase/functions/_shared/http.ts', () => ({
  handleRpc: (
    _request: Request,
    handler: (body: Record<string, unknown>, actor: string, context: unknown) => Promise<unknown>,
  ) =>
    handler(state.body, state.actor, {
      actorUserId: state.actor,
      accessToken: 'verified-session',
      claims: { session_id: 'session' },
    }),
  createVerifiedUserClient: (context: unknown) => {
    state.verified(context);
    return 'user-jwt-client';
  },
  createServiceRoleClient: () => ({
    rpc: state.rpc,
    from: () => ({ select: () => ({ in: state.readRows }) }),
  }),
}));
vi.mock('../supabase/functions/_shared/authorized-device-session.ts', () => ({
  requireAuthorizedDeviceSession: state.authorize,
}));
vi.mock('../supabase/functions/_shared/push-notifications.ts', () => ({
  notifyFinancialRequestPending: state.push,
  readPayloadString: (data: Record<string, unknown>, key: string) => data[key] ?? null,
}));
let correct: (request: Request) => Promise<unknown>;
let cancel: (request: Request) => Promise<unknown>;
const id = '00000000-0000-0000-0000-00000000fc11';
const corrected = '00000000-0000-0000-0000-00000000fc12';

beforeAll(async () => {
  vi.stubGlobal('Deno', {
    serve: (handler: typeof correct) => {
      correct = handler;
    },
  });
  await import('../supabase/functions/correct-financial-request/index.ts');
  vi.stubGlobal('Deno', {
    serve: (handler: typeof cancel) => {
      cancel = handler;
    },
  });
  await import('../supabase/functions/cancel-financial-request/index.ts');
  vi.unstubAllGlobals();
});
beforeEach(() => {
  vi.resetAllMocks();
  state.body = {
    requestId: id,
    idempotencyKey: 'correction-idempotent',
    amountMinor: 2000,
    description: 'Correction',
    category: 'other',
    expectedVersion: 1,
  };
  state.authorize.mockResolvedValue(undefined);
  state.rpc.mockResolvedValue({
    data: {
      originalRequestId: id,
      correctedRequestId: corrected,
      status: 'pending',
      financialRequests: [
        { id, status: 'amended' },
        { id: corrected, status: 'pending' },
      ],
    },
    error: null,
  });
  state.readRows.mockResolvedValue({
    data: null,
    error: new Error('read temporarily unavailable'),
  });
  state.push.mockResolvedValue(undefined);
});
afterEach(() => vi.restoreAllMocks());

describe('sender request payload validation', () => {
  it('uses explicit current version and rejects imprecise amounts or malformed IDs', () => {
    expect(readCorrection(state.body)).toEqual({ ...state.body });
    expect(() =>
      readCorrection({ ...state.body, amountMinor: Number.MAX_SAFE_INTEGER + 1 }),
    ).toThrow('Invalid amountMinor');
    expect(() => readCorrection({ ...state.body, amountMinor: '2000' })).toThrow(
      'Invalid amountMinor',
    );
    expect(() => readControlRequest({ ...state.body, requestId: 'user supplied SQL' })).toThrow(
      'Invalid requestId',
    );
    expect(() => readControlRequest({ ...state.body, expectedVersion: 0 })).toThrow(
      'Invalid expectedVersion',
    );
    expect(() => readCorrection({ ...state.body, category: 'cycle' })).toThrow('Invalid category');
    expect(() => readCorrection({ ...state.body, description: 'x'.repeat(241) })).toThrow(
      'Invalid description',
    );
  });
  it('allows old clients to omit the expected version but requires a body idempotency key', () => {
    expect(readControlRequest({ requestId: id, idempotencyKey: 'cancel-stable' })).toEqual({
      requestId: id,
      idempotencyKey: 'cancel-stable',
      expectedVersion: null,
    });
    expect(() => readControlRequest({ requestId: id })).toThrow('Invalid idempotencyKey');
  });
});

describe('authorized sender Edge commands', () => {
  it.each(['correct', 'cancel'])(
    'blocks %s before service mutation on an unauthorized device',
    async (operation) => {
      state.authorize.mockRejectedValue(new Error('device_authorization_required'));
      await expect(
        (operation === 'correct' ? correct : cancel)(new Request('https://example.test')),
      ).rejects.toThrow('device_authorization_required');
      expect(state.rpc).not.toHaveBeenCalled();
    },
  );
  it('uses verified actor and correction RPC, retaining acknowledged rows if the post-commit read fails', async () => {
    const committed = {
      originalRequestId: id,
      correctedRequestId: corrected,
      status: 'pending',
      financialRequests: [
        { id, status: 'amended' },
        { id: corrected, status: 'pending' },
      ],
    };
    state.rpc.mockResolvedValue({ data: committed, error: null });
    state.body.actorUserId = 'spoofed-user';
    const result = await correct(new Request('https://example.test'));
    expect(state.rpc).toHaveBeenCalledWith('correct_financial_request', {
      p_actor_user_id: state.actor,
      p_idempotency_key: 'correction-idempotent',
      p_request_id: id,
      p_amount_minor: 2000,
      p_description: 'Correction',
      p_category: 'other',
      p_expected_version: 1,
    });
    expect(result).toBe(committed);
    expect(state.authorize).toHaveBeenCalledWith(
      'user-jwt-client',
      expect.objectContaining({ actorUserId: state.actor }),
    );
  });
  it('keeps success when push delivery fails after the confirmed action', async () => {
    state.push.mockRejectedValue(new Error('push unavailable'));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(correct(new Request('https://example.test'))).resolves.toHaveProperty(
      'correctedRequestId',
      corrected,
    );
  });
  it('uses cancellation without enqueueing another pending notification', async () => {
    state.rpc.mockResolvedValue({
      data: { requestId: id, status: 'canceled', financialRequests: [{ id, status: 'canceled' }] },
      error: null,
    });
    await expect(cancel(new Request('https://example.test'))).resolves.toHaveProperty(
      'status',
      'canceled',
    );
    expect(state.rpc).toHaveBeenCalledWith('cancel_financial_request', {
      p_actor_user_id: state.actor,
      p_idempotency_key: 'correction-idempotent',
      p_request_id: id,
      p_expected_version: 1,
    });
    expect(state.push).not.toHaveBeenCalled();
  });
  it.each(['financial_request_not_pending', 'financial_request_correction_not_supported'])(
    'surfaces %s and never treats it as a committed action',
    async (code) => {
      state.rpc.mockResolvedValue({ data: null, error: new Error(code) });
      await expect(correct(new Request('https://example.test'))).rejects.toThrow(code);
      expect(state.readRows).not.toHaveBeenCalled();
      expect(state.push).not.toHaveBeenCalled();
    },
  );
});

describe('fresh authoritative row hydration', () => {
  it('replaces an earlier pending state with the current completed state on replay', async () => {
    const data = {
      requestId: id,
      status: 'canceled',
      financialRequests: [{ id, status: 'pending' }],
    };
    const latest = {
      id,
      status: 'canceled',
      creator_user_id: state.actor,
      responder_user_id: 'other',
    };
    const client = async () => ({ data: [latest], error: null });
    expect(await hydrateControlResponse(client, state.actor, data)).toEqual({
      ...data,
      financialRequests: [latest],
    });
  });
  it('preserves the transaction fallback when enrichment throws or returns another actor row', async () => {
    const data = { requestId: id, financialRequests: [{ id, status: 'canceled' }] };
    const throws = () => Promise.reject(new Error('network unavailable'));
    expect(await hydrateControlResponse(throws, state.actor, data)).toBe(data);
    const foreign = async () => ({
      data: [{ id, creator_user_id: 'foreign', responder_user_id: 'foreign2' }],
      error: null,
    });
    expect(await hydrateControlResponse(foreign, state.actor, data)).toBe(data);
  });
});
