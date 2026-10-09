import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { handleRpc as handleRpcFunction } from '../../supabase/functions/_shared/http';

const state = vi.hoisted(() => ({ getUser: vi.fn(), getClaims: vi.fn() }));

vi.mock('npm:@supabase/supabase-js@2', () => ({
  createClient: () => ({ auth: { getUser: state.getUser, getClaims: state.getClaims } }),
}));

let handleRpc: typeof handleRpcFunction;

beforeAll(async () => {
  vi.stubGlobal('Deno', { env: { get: () => 'test-config' } });
  ({ handleRpc } = await import('../../supabase/functions/_shared/http.ts'));
  vi.unstubAllGlobals();
});

beforeEach(() => {
  vi.resetAllMocks();
  state.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  state.getClaims.mockResolvedValue({ data: { claims: { sub: 'user-1' } }, error: null });
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => vi.restoreAllMocks());

function request() {
  return new Request('https://example.test/create-balance-request', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer test-token',
      'Content-Type': 'application/json',
      'x-request-id': 'request-1',
    },
    body: '{}',
  });
}

describe('authenticated Edge HTTP recovery errors', () => {
  it.each(['Auth session missing!', 'JWT has expired', 'JWT expired', 'Invalid JWT'])(
    'returns an authentication error for %s without invoking the mutation',
    async (message) => {
      state.getUser.mockResolvedValue({ data: { user: null }, error: { message } });
      const handler = vi.fn();

      const response = await handleRpc(request(), handler, { rateLimit: false });

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        code: 'auth_required',
        error: 'Autenticación requerida.',
        requestId: 'request-1',
      });
      expect(handler).not.toHaveBeenCalled();
    },
  );

  it('preserves a missing relationship as a recoverable conflict', async () => {
    const response = await handleRpc(
      request(),
      () => Promise.reject(new Error('active_relationship_required')),
      { rateLimit: false },
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: 'active_relationship_required',
      error: 'Necesitas una relación activa con esta persona antes de crear un movimiento.',
    });
  });

  it('keeps recent identity confirmation separate from authentication failures', async () => {
    const response = await handleRpc(
      request(),
      () => Promise.reject(new Error('recent_auth_required')),
      { rateLimit: false },
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'recent_auth_required' });
  });
});
