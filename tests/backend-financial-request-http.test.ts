import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { handleRpc as handleRpcFunction } from '../supabase/functions/_shared/http';

const state = vi.hoisted(() => ({ getUser: vi.fn(), getClaims: vi.fn() }));
vi.mock('npm:@supabase/supabase-js@2', () => ({
  createClient: () => ({ auth: { getUser: state.getUser, getClaims: state.getClaims } }),
}));
let handleRpc: typeof handleRpcFunction;
beforeAll(async () => {
  vi.stubGlobal('Deno', { env: { get: () => 'test-config' } });
  ({ handleRpc } = await import('../supabase/functions/_shared/http.ts'));
  vi.unstubAllGlobals();
});
beforeEach(() => {
  vi.resetAllMocks();
  state.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  state.getClaims.mockResolvedValue({ data: { claims: { sub: 'user-1' } }, error: null });
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe('sender financial request conflict responses', () => {
  it.each([
    'financial_request_not_pending',
    'financial_request_not_current',
    'financial_request_version_conflict',
    'financial_request_correction_not_supported',
  ])('returns a recoverable HTTP409 for %s', async (code) => {
    const request = new Request('https://example.test/correct-financial-request', {
      method: 'POST',
      headers: { Authorization: 'Bearer verified-session', 'Content-Type': 'application/json' },
      body: '{}',
    });
    const response = await handleRpc(request, () => Promise.reject(new Error(code)), {
      rateLimit: false,
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toHaveProperty('code', code);
  });
});
