import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getNativeGoogleCredential: vi.fn(),
  invokeSessionEdgeAction: vi.fn(),
  isAppleAvailable: vi.fn(),
  reportSocialAuthFailure: vi.fn(),
  signInWithApple: vi.fn(),
}));
vi.mock('./google-auth', () => ({ getNativeGoogleCredential: mocks.getNativeGoogleCredential }));
vi.mock('./session-edge-action', () => ({
  invokeSessionEdgeAction: mocks.invokeSessionEdgeAction,
}));
vi.mock('./social-auth-reporting', () => ({
  reportSocialAuthFailure: mocks.reportSocialAuthFailure,
}));
vi.mock('expo-apple-authentication', () => ({
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
  isAvailableAsync: mocks.isAppleAvailable,
  signInAsync: mocks.signInWithApple,
}));
vi.mock('../session/apple-auth', () => ({
  buildAppleFullName: () => null,
  generateSecureNonce: () => 'original-nonce',
  hashNonceForApple: async () => 'hashed-nonce',
}));
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
vi.mock('@/lib/config', () => ({ appConfig: {} }));
vi.mock('@/lib/device-trust', () => ({ getCurrentAppVersion: () => '1.0.3' }));
vi.mock('@/lib/supabase', () => ({ supabase: null }));

import { performSocialAccountRegistration } from './social-registration';

const idToken = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJleGFtcGxlLXN1YmplY3QifQ.signature0123456789012345';
const credential = {
  accessToken: 'google-access-token',
  displayName: null,
  email: 'person@example.test',
  familyName: null,
  givenName: null,
  idToken,
  photoUrl: null,
};
const deliveryToken = 'account-invitation-123456';

function createInput(provider: 'google' | 'apple' = 'google') {
  const auth = {
    getSession: vi.fn(async () => ({ data: { session: { user: { id: 'user-1' } } } })),
    signInWithIdToken: vi.fn(async () => ({ error: null as { message: string } | null })),
    signInWithOAuth: vi.fn(),
    updateUser: vi.fn(async () => ({ error: null })),
  };
  const client = { auth };
  return {
    auth,
    client: client as never,
    finishAuthenticatedSignIn: vi.fn(async () => {}),
    platform: 'ios',
    publicClient: { functions: {} } as never,
    registration: { deliveryToken, provider },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getNativeGoogleCredential.mockResolvedValue({ credential, ok: true });
  mocks.isAppleAvailable.mockResolvedValue(true);
  mocks.signInWithApple.mockResolvedValue({ identityToken: idToken, fullName: null });
  mocks.invokeSessionEdgeAction.mockResolvedValue({
    data: { authorized: true, expiresAt: new Date(Date.now() + 60_000).toISOString() },
    ok: true,
  });
});
afterEach(() => vi.useRealTimers());

describe('invited social account registration', () => {
  it.each(['google', 'apple'] as const)(
    'authorizes the invitation through the public client before %s exchanges its token',
    async (provider) => {
      const input = createInput(provider);
      mocks.invokeSessionEdgeAction.mockImplementation(async () => {
        expect(input.auth.signInWithIdToken).not.toHaveBeenCalled();
        return {
          data: { authorized: true, expiresAt: new Date(Date.now() + 60_000).toISOString() },
          ok: true,
        };
      });
      expect(await performSocialAccountRegistration(input)).toBe('Sesión iniciada.');
      expect(mocks.invokeSessionEdgeAction).toHaveBeenCalledWith({
        body: {
          deliveryToken,
          idToken,
          ...(provider === 'apple' ? { nonce: 'original-nonce' } : {}),
          provider,
        },
        client: input.publicClient,
        name: 'prepare-social-registration',
      });
      expect(input.auth.signInWithIdToken).toHaveBeenCalledOnce();
      expect(input.finishAuthenticatedSignIn).toHaveBeenCalledWith('user-1');
      expect(input.auth.signInWithOAuth).not.toHaveBeenCalled();
      expect(mocks.reportSocialAuthFailure).not.toHaveBeenCalled();
    },
  );

  it.each(['google', 'apple'] as const)(
    'does not send a credential to Auth when %s admission fails',
    async (provider) => {
      const input = createInput(provider);
      mocks.invokeSessionEdgeAction.mockResolvedValue({
        code: 'account_invite_required',
        message: `Rejected idToken=${idToken}. Código de soporte: HC-ABCD-1234-EFGH.`,
        ok: false,
      });
      const result = await performSocialAccountRegistration(input);
      expect(result).toBe(
        'Para crear una cuenta necesitas una invitación válida. Abre tu enlace o pega el código. Código de soporte: HC-ABCD-1234-EFGH.',
      );
      expect(result).not.toContain(idToken);
      expect(input.auth.signInWithIdToken).not.toHaveBeenCalled();
      expect(input.auth.signInWithOAuth).not.toHaveBeenCalled();
      expect(input.finishAuthenticatedSignIn).not.toHaveBeenCalled();
      expect(mocks.reportSocialAuthFailure).not.toHaveBeenCalled();
    },
  );

  it.each([
    null,
    { authorized: false, expiresAt: '2999-01-01T00:00:00Z' },
    { authorized: true },
    { authorized: true, expiresAt: 'invalid' },
    { authorized: true, expiresAt: '2000-01-01T00:00:00Z' },
  ])('requires an explicit, unexpired authorization response: %j', async (data) => {
    const input = createInput();
    mocks.invokeSessionEdgeAction.mockResolvedValue({ data, ok: true });
    expect(await performSocialAccountRegistration(input)).toContain('validar tu invitación');
    expect(input.auth.signInWithIdToken).not.toHaveBeenCalled();
    expect(input.auth.signInWithOAuth).not.toHaveBeenCalled();
  });

  it.each(['error response', 'exception'])(
    'hides raw credentials from an unknown gate %s',
    async (kind) => {
      const input = createInput();
      if (kind === 'exception') {
        mocks.invokeSessionEdgeAction.mockRejectedValue(new Error(idToken));
      } else {
        mocks.invokeSessionEdgeAction.mockResolvedValue({
          code: 'internal_error',
          message: idToken,
          ok: false,
        });
      }
      const result = await performSocialAccountRegistration(input);
      expect(result).toContain('validar tu invitación');
      expect(result).not.toContain(idToken);
      expect(input.auth.signInWithIdToken).not.toHaveBeenCalled();
      expect(mocks.reportSocialAuthFailure).not.toHaveBeenCalled();
    },
  );

  it('preserves the invitation and offers email signup when native Google is unavailable', async () => {
    const input = createInput();
    mocks.getNativeGoogleCredential.mockResolvedValue({
      message: 'Google nativo no está disponible.',
      ok: false,
    });
    expect(await performSocialAccountRegistration(input)).toContain('Usar correo y contraseña');
    expect(input.registration.deliveryToken).toBe(deliveryToken);
    expect(mocks.invokeSessionEdgeAction).not.toHaveBeenCalled();
    expect(input.auth.signInWithOAuth).not.toHaveBeenCalled();
    expect(input.auth.signInWithIdToken).not.toHaveBeenCalled();
  });

  it('does not start native auth without an invitation token', async () => {
    const input = createInput();
    input.registration.deliveryToken = ' ';
    expect(await performSocialAccountRegistration(input)).toContain('invitación válida');
    expect(mocks.getNativeGoogleCredential).not.toHaveBeenCalled();
    expect(mocks.invokeSessionEdgeAction).not.toHaveBeenCalled();
    expect(input.auth.signInWithIdToken).not.toHaveBeenCalled();
  });

  it('does not admit or exchange a late native credential after the operation times out', async () => {
    vi.useFakeTimers();
    const input = createInput();
    let releaseCredential!: (value: unknown) => void;
    mocks.getNativeGoogleCredential.mockReturnValue(
      new Promise((resolve) => {
        releaseCredential = resolve;
      }),
    );
    const pending = performSocialAccountRegistration(input);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(await pending).toContain('tardando demasiado');
    releaseCredential({ credential, ok: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.invokeSessionEdgeAction).not.toHaveBeenCalled();
    expect(input.auth.signInWithIdToken).not.toHaveBeenCalled();
    expect(input.auth.signInWithOAuth).not.toHaveBeenCalled();
  });

  it('redacts raw JWT text if Auth rejects an admitted credential', async () => {
    const input = createInput();
    input.auth.signInWithIdToken.mockResolvedValue({ error: { message: `Rejected ${idToken}` } });
    const result = await performSocialAccountRegistration(input);
    expect(result).toBe('Rejected [redacted_jwt]');
    expect(JSON.stringify(mocks.reportSocialAuthFailure.mock.calls)).not.toContain(idToken);
    expect(input.finishAuthenticatedSignIn).not.toHaveBeenCalled();
    expect(input.auth.signInWithOAuth).not.toHaveBeenCalled();
  });
});
