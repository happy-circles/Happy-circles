import { beforeEach, describe, expect, it, vi } from 'vitest';

interface FunctionErrorDetails {
  readonly code?: string;
  readonly message: string;
  readonly status?: number;
}

const mocks = vi.hoisted(() => ({
  createSupportId: vi.fn(() => 'HC-TEST-0000-0000'),
  explicitInvoke: vi.fn(),
  getSession: vi.fn(),
  invoke: vi.fn(),
  isJwtAuthError: vi.fn(() => false),
  publicInvoke: vi.fn(),
  readFunctionErrorDetails: vi.fn(
    (error: Error): Promise<FunctionErrorDetails> => Promise.resolve({ message: error.message }),
  ),
  refreshSession: vi.fn(),
  reportAndCreateSupportError: vi.fn((input: { readonly error: Error }) => input.error),
  signOut: vi.fn(),
}));

vi.mock('../query-client', () => ({
  queryClient: { invalidateQueries: vi.fn() },
}));

vi.mock('../supabase', () => ({
  explicitTokenEdgeSupabase: {
    functions: { invoke: mocks.explicitInvoke },
  },
  publicEdgeSupabase: {
    functions: { invoke: mocks.publicInvoke },
  },
  supabase: {
    auth: {
      getSession: mocks.getSession,
      refreshSession: mocks.refreshSession,
      signOut: mocks.signOut,
    },
    functions: { invoke: mocks.invoke },
  },
}));

vi.mock('../support-errors', () => ({
  createSupportId: mocks.createSupportId,
  isJwtAuthError: mocks.isJwtAuthError,
  readFunctionErrorDetails: mocks.readFunctionErrorDetails,
  reportAndCreateSupportError: mocks.reportAndCreateSupportError,
}));

import { EDGE_FUNCTION_TIMEOUT_MS } from './constants';
import { invokeSupabaseFunction } from './client';

describe('live-data client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isJwtAuthError.mockReturnValue(false);
    mocks.getSession.mockReset();
    mocks.explicitInvoke.mockReset();
    mocks.readFunctionErrorDetails.mockImplementation((error: Error) =>
      Promise.resolve({ message: error.message }),
    );
  });

  it('bounds every Edge Function request and preserves its response', async () => {
    mocks.invoke.mockResolvedValue({ data: { ok: true }, error: null });

    await expect(invokeSupabaseFunction('example-action', { value: 1 })).resolves.toEqual({
      ok: true,
    });
    expect(mocks.invoke).toHaveBeenCalledWith('example-action', {
      body: { value: 1 },
      headers: {
        'x-client-info': 'happy-circles-mobile',
        'x-request-id': 'HC-TEST-0000-0000',
      },
      timeout: EDGE_FUNCTION_TIMEOUT_MS,
    });
    expect(mocks.publicInvoke).not.toHaveBeenCalled();
    expect(mocks.explicitInvoke).not.toHaveBeenCalled();
  });

  it('uses the authorization-free client only when omission is explicit', async () => {
    mocks.publicInvoke.mockResolvedValue({ data: { ok: true }, error: null });

    await expect(
      invokeSupabaseFunction(
        'public-preview',
        { token: 'delivery-token' },
        {
          authorization: 'omit',
        },
      ),
    ).resolves.toEqual({ ok: true });

    expect(mocks.publicInvoke).toHaveBeenCalledWith('public-preview', {
      body: { token: 'delivery-token' },
      headers: {
        'x-client-info': 'happy-circles-mobile',
        'x-request-id': 'HC-TEST-0000-0000',
      },
      timeout: EDGE_FUNCTION_TIMEOUT_MS,
    });
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(mocks.explicitInvoke).not.toHaveBeenCalled();
  });

  it('does not refresh or sign out a session for a public invocation error', async () => {
    mocks.isJwtAuthError.mockReturnValue(true);
    mocks.readFunctionErrorDetails.mockResolvedValue({
      code: 'auth_required',
      message: 'Authentication required',
      status: 401,
    });
    mocks.publicInvoke.mockResolvedValue({
      data: null,
      error: new Error('Authentication required'),
    });

    await expect(
      invokeSupabaseFunction('public-preview', {}, { authorization: 'omit' }),
    ).rejects.toThrow('Authentication required');

    expect(mocks.refreshSession).not.toHaveBeenCalled();
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it('turns an aborted request into a recoverable timeout message', async () => {
    mocks.invoke.mockResolvedValue({
      data: null,
      error: { context: { name: 'AbortError' }, name: 'FunctionsFetchError' },
    });

    await expect(invokeSupabaseFunction('slow-action', {})).rejects.toThrow(
      'La solicitud tardó demasiado. Revisa tu conexión e intenta de nuevo.',
    );
    expect(mocks.reportAndCreateSupportError).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: 'request_timeout',
        functionName: 'slow-action',
      }),
    );
  });

  it('binds contact requests to the actor token instead of the mutable global session', async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { id: 'actor-a' }, access_token: 'actor-a-token' } },
    });
    mocks.invoke.mockResolvedValue({ data: { ok: true }, error: null });
    await expect(
      invokeSupabaseFunction('resolve-people-targets', {}, { expectedUserId: 'actor-a' }),
    ).resolves.toEqual({ ok: true });
    const invocation = mocks.invoke.mock.calls[0]?.[1] as { headers: Record<string, string> };
    expect(invocation.headers.Authorization).toBe('Bearer actor-a-token');
    expect(mocks.explicitInvoke).not.toHaveBeenCalled();
  });

  it('refuses queued work from a previous account before sending it', async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { id: 'actor-b' }, access_token: 'actor-b-token' } },
    });
    await expect(
      invokeSupabaseFunction('create-people-outreach', {}, { expectedUserId: 'actor-a' }),
    ).rejects.toThrow('La sesión cambió');
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(mocks.explicitInvoke).not.toHaveBeenCalled();
  });

  it('sends actor-bound outreach through the explicit JWT transport with both session guards', async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { id: 'actor-a' }, access_token: 'actor-a-token' } },
    });
    mocks.explicitInvoke.mockResolvedValue({ data: { status: 'pending' }, error: null });
    const body = { intendedRecipientPhoneE164: '+573001234567', idempotencyKey: 'intent-a' };

    await expect(
      invokeSupabaseFunction('create-people-outreach', body, { expectedUserId: 'actor-a' }),
    ).resolves.toEqual({ status: 'pending' });

    expect(mocks.explicitInvoke).toHaveBeenCalledExactlyOnceWith('create-people-outreach', {
      body,
      headers: {
        Authorization: 'Bearer actor-a-token',
        'x-client-info': 'happy-circles-mobile',
        'x-request-id': 'HC-TEST-0000-0000',
      },
      timeout: EDGE_FUNCTION_TIMEOUT_MS,
    });
    expect(mocks.getSession).toHaveBeenCalledTimes(2);
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(mocks.publicInvoke).not.toHaveBeenCalled();
  });

  it('keeps outreach without an expected actor on the existing session transport', async () => {
    mocks.invoke.mockResolvedValue({ data: { ok: true }, error: null });

    await expect(invokeSupabaseFunction('create-people-outreach', {})).resolves.toEqual({
      ok: true,
    });

    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.explicitInvoke).not.toHaveBeenCalled();
  });

  it.each([undefined, '', '   '])(
    'rejects outreach with a missing JWT (%s) before sending',
    async (accessToken) => {
      mocks.getSession.mockResolvedValue({
        data: { session: { user: { id: 'actor-a' }, access_token: accessToken } },
      });

      await expect(
        invokeSupabaseFunction('create-people-outreach', {}, { expectedUserId: 'actor-a' }),
      ).rejects.toThrow('Tu sesión ya no es válida');

      expect(mocks.explicitInvoke).not.toHaveBeenCalled();
      expect(mocks.invoke).not.toHaveBeenCalled();
    },
  );

  it('rejects an account-bound command that tries to omit Authorization', async () => {
    await expect(
      invokeSupabaseFunction(
        'create-people-outreach',
        {},
        {
          authorization: 'omit',
          expectedUserId: 'actor-a',
        },
      ),
    ).rejects.toThrow('Una acción de cuenta requiere una sesión autenticada');

    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.explicitInvoke).not.toHaveBeenCalled();
    expect(mocks.publicInvoke).not.toHaveBeenCalled();
  });

  it('discards an outreach response after the account changes during the request', async () => {
    mocks.getSession
      .mockResolvedValueOnce({
        data: { session: { user: { id: 'actor-a' }, access_token: 'actor-a-token' } },
      })
      .mockResolvedValueOnce({
        data: { session: { user: { id: 'actor-b' }, access_token: 'actor-b-token' } },
      });
    mocks.explicitInvoke.mockResolvedValue({ data: { status: 'pending' }, error: null });

    await expect(
      invokeSupabaseFunction('create-people-outreach', {}, { expectedUserId: 'actor-a' }),
    ).rejects.toThrow('La sesión cambió');

    expect(mocks.explicitInvoke).toHaveBeenCalledTimes(1);
    expect(mocks.refreshSession).not.toHaveBeenCalled();
  });

  it('renews an expired outreach token and recaptures it for a retry of the same intention', async () => {
    const oldSession = {
      data: { session: { user: { id: 'actor-a' }, access_token: 'expired-token' } },
    };
    const freshSession = {
      data: { session: { user: { id: 'actor-a' }, access_token: 'fresh-token' } },
    };
    mocks.getSession
      .mockResolvedValueOnce(oldSession)
      .mockResolvedValueOnce(oldSession)
      .mockResolvedValueOnce(oldSession)
      .mockResolvedValue(freshSession);
    mocks.explicitInvoke
      .mockResolvedValueOnce({ data: null, error: new Error('jwt expired') })
      .mockResolvedValueOnce({ data: { status: 'pending' }, error: null });
    mocks.isJwtAuthError.mockReturnValue(true);
    mocks.refreshSession.mockResolvedValue({ ...freshSession, error: null });
    const body = { idempotencyKey: 'same-intention' };

    await expect(
      invokeSupabaseFunction('create-people-outreach', body, { expectedUserId: 'actor-a' }),
    ).resolves.toEqual({ status: 'pending' });

    expect(mocks.refreshSession).toHaveBeenCalledTimes(1);
    expect(mocks.explicitInvoke).toHaveBeenCalledTimes(2);
    const [initial, retry] = mocks.explicitInvoke.mock.calls.map(
      (call) =>
        call[1] as {
          body: typeof body;
          headers: Record<string, string>;
        },
    );
    expect(initial?.headers.Authorization).toBe('Bearer expired-token');
    expect(retry?.headers.Authorization).toBe('Bearer fresh-token');
    expect(initial?.body).toBe(body);
    expect(retry?.body).toBe(body);
    expect(initial?.headers['x-request-id']).toBe(retry?.headers['x-request-id']);
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(mocks.publicInvoke).not.toHaveBeenCalled();
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it('does not refresh outreach after an account change while reading the JWT error', async () => {
    const actorSession = {
      data: { session: { user: { id: 'actor-a' }, access_token: 'expired-token' } },
    };
    mocks.getSession
      .mockResolvedValueOnce(actorSession)
      .mockResolvedValueOnce(actorSession)
      .mockResolvedValueOnce({
        data: { session: { user: { id: 'actor-b' }, access_token: 'actor-b-token' } },
      });
    mocks.explicitInvoke.mockResolvedValue({ data: null, error: new Error('jwt expired') });
    mocks.isJwtAuthError.mockReturnValue(true);

    await expect(
      invokeSupabaseFunction('create-people-outreach', {}, { expectedUserId: 'actor-a' }),
    ).rejects.toThrow('La sesión cambió');

    expect(mocks.explicitInvoke).toHaveBeenCalledTimes(1);
    expect(mocks.refreshSession).not.toHaveBeenCalled();
  });

  it('does not resend outreach with a different account returned by token renewal', async () => {
    const actorSession = {
      data: { session: { user: { id: 'actor-a' }, access_token: 'expired-token' } },
    };
    mocks.getSession
      .mockResolvedValueOnce(actorSession)
      .mockResolvedValueOnce(actorSession)
      .mockResolvedValueOnce(actorSession)
      .mockResolvedValue({
        data: { session: { user: { id: 'actor-b' }, access_token: 'actor-b-token' } },
      });
    mocks.explicitInvoke.mockResolvedValue({ data: null, error: new Error('jwt expired') });
    mocks.isJwtAuthError.mockReturnValue(true);
    mocks.refreshSession.mockResolvedValue({
      data: { session: { user: { id: 'actor-b' }, access_token: 'actor-b-token' } },
      error: null,
    });

    await expect(
      invokeSupabaseFunction('create-people-outreach', {}, { expectedUserId: 'actor-a' }),
    ).rejects.toThrow('La sesión cambió');

    expect(mocks.explicitInvoke).toHaveBeenCalledTimes(1);
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it('preserves timeout reporting for the explicit-token outreach transport', async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { id: 'actor-a' }, access_token: 'actor-a-token' } },
    });
    mocks.explicitInvoke.mockResolvedValue({
      data: null,
      error: { context: { name: 'AbortError' }, name: 'FunctionsFetchError' },
    });

    await expect(
      invokeSupabaseFunction('create-people-outreach', {}, { expectedUserId: 'actor-a' }),
    ).rejects.toThrow('La solicitud tardó demasiado');
    expect(mocks.reportAndCreateSupportError).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: 'request_timeout',
        functionName: 'create-people-outreach',
      }),
    );
  });

  it('does not return a previous account response to the newly signed in account', async () => {
    mocks.getSession
      .mockResolvedValueOnce({
        data: { session: { user: { id: 'actor-a' }, access_token: 'actor-a-token' } },
      })
      .mockResolvedValueOnce({
        data: { session: { user: { id: 'actor-b' }, access_token: 'actor-b-token' } },
      });
    mocks.invoke.mockResolvedValue({ data: { status: 'accepted' }, error: null });
    await expect(
      invokeSupabaseFunction(
        'respond-internal-friendship-invite',
        {},
        { expectedUserId: 'actor-a' },
      ),
    ).rejects.toThrow('La sesión cambió');
    expect(mocks.refreshSession).not.toHaveBeenCalled();
  });

  it('does not retry an old account command with a different refreshed account', async () => {
    const actorSession = {
      data: { session: { user: { id: 'actor-a' }, access_token: 'actor-a-token' } },
    };
    mocks.getSession
      .mockResolvedValueOnce(actorSession)
      .mockResolvedValueOnce(actorSession)
      .mockResolvedValueOnce(actorSession)
      .mockResolvedValue({
        data: { session: { user: { id: 'actor-b' }, access_token: 'actor-b-token' } },
      });
    mocks.invoke.mockResolvedValue({ data: null, error: new Error('jwt expired') });
    mocks.isJwtAuthError.mockReturnValue(true);
    mocks.refreshSession.mockResolvedValue({
      data: { session: { user: { id: 'actor-b' } } },
      error: null,
    });
    await expect(
      invokeSupabaseFunction('cancel-friendship-invite', {}, { expectedUserId: 'actor-a' }),
    ).rejects.toThrow('La sesión cambió');
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it('does not sign out a new account when token renewal of an old command fails', async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { id: 'actor-a' }, access_token: 'actor-a-token' } },
    });
    mocks.invoke.mockResolvedValue({ data: null, error: new Error('jwt expired') });
    mocks.isJwtAuthError.mockReturnValue(true);
    mocks.refreshSession.mockResolvedValue({
      data: { session: null },
      error: new Error('refresh failed'),
    });
    await expect(
      invokeSupabaseFunction('cancel-friendship-invite', {}, { expectedUserId: 'actor-a' }),
    ).rejects.toThrow('Tu sesión ya no es válida');
    expect(mocks.signOut).not.toHaveBeenCalled();
  });
});
