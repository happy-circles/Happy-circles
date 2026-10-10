import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  body: {} as Record<string, unknown>,
  rpc: vi.fn(),
  verifyProof: vi.fn(),
  options: undefined as
    | { rateLimit?: readonly { actorRequired?: boolean; limit: number }[]; maxBodyBytes?: number }
    | undefined,
}));

vi.mock('../../supabase/functions/_shared/http.ts', () => ({
  createServiceRoleClient: () => ({ rpc: state.rpc }),
  createSha256Hex: vi.fn(async () => 'hashed-invitation'),
  handlePublicRpc: (
    _request: Request,
    handler: (body: Record<string, unknown>) => Promise<unknown>,
    options: typeof state.options,
  ) => {
    state.options = options;
    return handler(state.body);
  },
  requireString: (value: unknown) => {
    if (typeof value !== 'string' || !value.trim()) throw new Error('Invalid deliveryToken');
    return value.trim();
  },
}));
vi.mock('../../supabase/functions/_shared/social-registration-proof.ts', () => ({
  readSocialRegistrationAudiences: (value: string | undefined) => value?.split(',') ?? [],
  verifySocialRegistrationCredential: state.verifyProof,
}));

let invoke: (request: Request) => Promise<unknown>;
beforeAll(async () => {
  vi.stubGlobal('Deno', {
    env: {
      get: (name: string) =>
        name === 'SOCIAL_REGISTRATION_GOOGLE_AUDIENCES'
          ? 'server-google-client'
          : 'server-apple-client',
    },
    serve: (handler: typeof invoke) => {
      invoke = handler;
    },
  });
  await import('../../supabase/functions/prepare-social-registration/index.ts');
  vi.unstubAllGlobals();
});

beforeEach(() => {
  vi.clearAllMocks();
  state.body = {
    provider: 'google',
    idToken: 'untrusted-input-id-token',
    deliveryToken: 'private-invitation',
    email: 'forged@example.com',
    subject: 'forged-subject',
  };
  state.verifyProof.mockResolvedValue({
    provider: 'google',
    subject: 'verified-subject',
    email: 'verified@example.com',
    expiresAt: '2026-10-10T18:30:00Z',
  });
  state.rpc.mockResolvedValue({
    data: { authorized: true, expiresAt: '2026-10-10T18:00:00Z' },
    error: null,
  });
});

describe('public invited social registration endpoint', () => {
  it('passes only verified identity claims to the service-role reservation and has public rate limits', async () => {
    const result = await invoke(
      new Request('https://example.test/prepare-social-registration', { method: 'POST' }),
    );
    expect(result).toEqual({ authorized: true, expiresAt: '2026-10-10T18:00:00Z' });
    expect(state.rpc).toHaveBeenCalledWith('prepare_social_registration', {
      p_delivery_token: 'private-invitation',
      p_provider: 'google',
      p_provider_subject: 'verified-subject',
      p_email: 'verified@example.com',
      p_credential_expires_at: '2026-10-10T18:30:00Z',
    });
    expect(state.verifyProof).toHaveBeenCalledWith(
      { provider: 'google', idToken: 'untrusted-input-id-token', nonce: undefined },
      { googleAudiences: ['server-google-client'], appleAudiences: ['server-apple-client'] },
    );
    expect(state.options?.rateLimit).toHaveLength(3);
    expect(
      state.options?.rateLimit?.every((limit) => limit.actorRequired === false && limit.limit > 0),
    ).toBe(true);
    expect(state.options?.maxBodyBytes).toBe(40 * 1024);
    expect(JSON.stringify(state.rpc.mock.calls)).not.toContain('untrusted-input-id-token');
  });

  it('does not reserve or look up accounts/invitations when credential verification fails', async () => {
    state.verifyProof.mockRejectedValue(new Error('Invalid social registration proof'));
    await expect(invoke(new Request('https://example.test', { method: 'POST' }))).rejects.toThrow(
      /^Invalid social registration proof$/,
    );
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it.each([
    'account_invite_required',
    'account_invite_already_used',
    'invitation does not exist',
    'identity conflict',
  ])('hides internal lookup outcomes: %s', async (message) => {
    state.rpc.mockResolvedValue({ data: null, error: { message } });
    await expect(invoke(new Request('https://example.test', { method: 'POST' }))).rejects.toThrow(
      /^Invalid social registration proof$/,
    );
  });
});
