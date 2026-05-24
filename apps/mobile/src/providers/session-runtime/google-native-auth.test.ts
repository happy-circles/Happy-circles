import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getNativeGoogleCredential: vi.fn(),
}));

vi.mock('./google-auth', () => ({
  getNativeGoogleCredential: mocks.getNativeGoogleCredential,
}));

import { performNativeGoogleAuth } from './google-native-auth';

const credential = {
  accessToken: 'access-token',
  displayName: 'Sam User',
  email: 'sam@example.com',
  familyName: 'User',
  givenName: 'Sam',
  idToken: 'id-token',
  photoUrl: null,
};

function createClient(
  input: {
    readonly linkError?: string;
    readonly signInError?: string;
  } = {},
) {
  const getSession = vi.fn(async () => ({
    data: { session: { user: { id: 'user-1' } } },
  }));
  const linkIdentity = vi.fn(async () => ({
    error: input.linkError ? { message: input.linkError } : null,
  }));
  const signInWithIdToken = vi.fn(async () => ({
    error: input.signInError ? { message: input.signInError } : null,
  }));
  const updateUser = vi.fn(async () => ({ error: null }));

  return {
    client: {
      auth: {
        getSession,
        linkIdentity,
        signInWithIdToken,
        updateUser,
      },
    },
    linkIdentity,
    signInWithIdToken,
  };
}

describe('performNativeGoogleAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getNativeGoogleCredential.mockResolvedValue({ credential, ok: true });
  });

  it('marks Supabase id token rejection as eligible for OAuth fallback', async () => {
    const { client, signInWithIdToken } = createClient({
      signInError: 'Invalid login credentials',
    });
    const reportFailure = vi.fn();

    const result = await performNativeGoogleAuth({
      client: client as never,
      mode: 'sign-in',
      reportFailure,
    });

    expect(signInWithIdToken).toHaveBeenCalledWith({
      access_token: 'access-token',
      provider: 'google',
      token: 'id-token',
    });
    expect(result).toMatchObject({
      failureCode: 'supabase_token_rejected',
      message: 'Correo o contraseña incorrectos.',
      shouldFallbackToOAuth: true,
      userId: null,
    });
    expect(reportFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'supabase_token_rejected',
        stage: 'sign_in_with_id_token',
      }),
    );
  });

  it('does not show Apple copy when a Google id token nonce is rejected', async () => {
    const { client } = createClient({
      signInError: 'Nonces mismatch',
    });
    const reportFailure = vi.fn();

    const result = await performNativeGoogleAuth({
      client: client as never,
      mode: 'sign-in',
      reportFailure,
    });

    expect(result).toMatchObject({
      failureCode: 'supabase_token_rejected',
      message: 'No pudimos validar Google. Intenta de nuevo.',
      shouldFallbackToOAuth: true,
      userId: null,
    });
  });

  it('does not fallback when Google is already linked to another account', async () => {
    const { client, linkIdentity } = createClient({
      linkError: 'identity_already_exists',
    });
    const reportFailure = vi.fn();

    const result = await performNativeGoogleAuth({
      client: client as never,
      mode: 'link',
      reportFailure,
    });

    expect(linkIdentity).toHaveBeenCalledWith({
      access_token: 'access-token',
      provider: 'google',
      token: 'id-token',
    });
    expect(result).toMatchObject({
      failureCode: 'identity_conflict',
      shouldFallbackToOAuth: false,
      userId: null,
    });
  });

  it('keeps cancellation local without reporting a failure', async () => {
    mocks.getNativeGoogleCredential.mockResolvedValue({
      message: 'Inicio con Google cancelado.',
      ok: false,
    });
    const { client } = createClient();
    const reportFailure = vi.fn();

    const result = await performNativeGoogleAuth({
      client: client as never,
      mode: 'link',
      reportFailure,
    });

    expect(result).toMatchObject({
      failureCode: 'cancelled',
      shouldFallbackToOAuth: false,
      userId: null,
    });
    expect(reportFailure).not.toHaveBeenCalled();
  });
});
