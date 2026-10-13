import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
  getClaims: vi.fn(),
  rpc: vi.fn(),
}));

// Exercise the real HTTP/auth wrapper; only the Supabase SDK transport is mocked.
vi.mock('npm:@supabase/supabase-js@2', () => ({
  createClient: (...args: unknown[]) => {
    state.createClient(...args);
    return { auth: { getUser: state.getUser, getClaims: state.getClaims }, rpc: state.rpc };
  },
}));

let handleRequest: (request: Request) => Promise<Response>;

beforeAll(async () => {
  const environment: Record<string, string> = {
    SUPABASE_URL: 'https://example.test',
    SUPABASE_ANON_KEY: 'test-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
  };
  vi.stubGlobal('Deno', {
    env: { get: (name: string) => environment[name] },
    serve: (handler: typeof handleRequest) => {
      handleRequest = handler;
    },
  });
  await import('../../supabase/functions/propose-transaction-reversal/index.ts');
  vi.unstubAllGlobals();
});

beforeEach(() => {
  vi.resetAllMocks();
  state.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  state.getClaims.mockResolvedValue({ data: { claims: { sub: 'user-1' } }, error: null });
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function request(
  body: Record<string, unknown> = {},
  authorization: string | null = 'Bearer user-token',
) {
  return new Request('https://example.test/propose-transaction-reversal', {
    method: 'POST',
    headers: {
      ...(authorization ? { Authorization: authorization } : {}),
      'Content-Type': 'application/json',
      'x-request-id': 'reversal-disabled-1',
    },
    body: JSON.stringify(body),
  });
}

describe('disabled propose-transaction-reversal endpoint', () => {
  it.each([
    {},
    {
      idempotencyKey: 'reversal-attempt-1',
      responderUserId: 'user-2',
      debtorUserId: 'user-1',
      creditorUserId: 'user-2',
      amountMinor: 1200,
      description: 'Reverse movement',
      category: 'food_drinks',
      targetLedgerTransactionId: 'transaction-1',
    },
    { amountMinor: -1, category: 'invalid', targetLedgerTransactionId: null },
  ])('returns the disabled response without processing movement fields: %j', async (body) => {
    const response = await handleRequest(request(body));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      code: 'transaction_reversal_disabled',
      error: 'Los reversos de movimientos están deshabilitados.',
      requestId: 'reversal-disabled-1',
    });
    expect(state.getUser).toHaveBeenCalledWith('user-token');
    expect(state.getClaims).toHaveBeenCalledWith('user-token');
    expect(state.createClient).toHaveBeenCalledExactlyOnceWith(
      'https://example.test',
      'test-anon-key',
      { global: { headers: { Authorization: 'Bearer user-token' } } },
    );
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it('still requires an Authorization header', async () => {
    const response = await handleRequest(request({}, null));

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: 'auth_required' });
    expect(state.createClient).not.toHaveBeenCalled();
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it('rejects an invalid user session before returning the authenticated disabled response', async () => {
    state.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'Invalid JWT' } });

    const response = await handleRequest(request());

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: 'auth_required' });
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it.each([
    { data: null, error: { message: 'Invalid JWT' } },
    { data: { claims: { sub: 'another-user' } }, error: null },
  ])('retains JWT claims verification: %j', async (claimsResult) => {
    state.getClaims.mockResolvedValue(claimsResult);

    const response = await handleRequest(request());

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: 'auth_required' });
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it('keeps gateway JWT verification enabled', () => {
    const config = readFileSync(new URL('../../supabase/config.toml', import.meta.url), 'utf8');
    const endpointConfig = config
      .split('[functions.propose-transaction-reversal]')[1]
      ?.split('\n[')[0];

    expect(endpointConfig).toMatch(/^verify_jwt\s*=\s*true\s*$/m);
  });
});
