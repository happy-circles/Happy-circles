import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isAvailableAsync: vi.fn(),
  signInAsync: vi.fn(),
}));
vi.mock('expo-apple-authentication', () => ({
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
  isAvailableAsync: mocks.isAvailableAsync,
  signInAsync: mocks.signInAsync,
}));
vi.mock('../session/apple-auth', () => ({
  buildAppleFullName: () => null,
  generateSecureNonce: () => 'original-nonce',
  hashNonceForApple: async () => 'hashed-nonce',
}));

import { performNativeAppleAuth } from './apple-native-auth';

function createClient() {
  const signInWithIdToken = vi.fn(async () => ({ error: null }));
  const linkIdentity = vi.fn(async () => ({ error: null }));
  return {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: { user: { id: 'user-1' } } } })),
      linkIdentity,
      signInWithIdToken,
      updateUser: vi.fn(async () => ({ error: null })),
    },
  };
}

describe('native Apple registration admission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isAvailableAsync.mockResolvedValue(true);
    mocks.signInAsync.mockResolvedValue({ identityToken: 'apple-id-token', fullName: null });
  });

  it('sends the original nonce to authorization before exchanging the credential', async () => {
    const client = createClient();
    const beforeSignIn = vi.fn(async () => {
      expect(client.auth.signInWithIdToken).not.toHaveBeenCalled();
      return null;
    });
    const result = await performNativeAppleAuth({
      beforeSignIn,
      client: client as never,
      mode: 'sign-in',
      reportFailure: vi.fn(),
    });

    expect(mocks.signInAsync).toHaveBeenCalledWith({
      nonce: 'hashed-nonce',
      requestedScopes: [0, 1],
    });
    expect(beforeSignIn).toHaveBeenCalledWith({
      idToken: 'apple-id-token',
      nonce: 'original-nonce',
    });
    expect(client.auth.signInWithIdToken).toHaveBeenCalledWith({
      nonce: 'original-nonce',
      provider: 'apple',
      token: 'apple-id-token',
    });
    expect(result.userId).toBe('user-1');
  });

  it('stops before Auth when the invitation is rejected', async () => {
    const client = createClient();
    const reportFailure = vi.fn();
    const result = await performNativeAppleAuth({
      beforeSignIn: async () => 'Invitación no disponible.',
      client: client as never,
      mode: 'sign-in',
      reportFailure,
    });

    expect(client.auth.signInWithIdToken).not.toHaveBeenCalled();
    expect(client.auth.getSession).not.toHaveBeenCalled();
    expect(reportFailure).not.toHaveBeenCalled();
    expect(result).toEqual({ message: 'Invitación no disponible.', userId: null });
  });

  it('keeps normal login and existing linking independent of registration admission', async () => {
    const client = createClient();
    const beforeSignIn = vi.fn(async () => 'Not permitted');
    await performNativeAppleAuth({
      client: client as never,
      mode: 'sign-in',
      reportFailure: vi.fn(),
    });
    await performNativeAppleAuth({
      beforeSignIn,
      client: client as never,
      mode: 'link',
      reportFailure: vi.fn(),
    });
    expect(client.auth.signInWithIdToken).toHaveBeenCalledOnce();
    expect(client.auth.linkIdentity).toHaveBeenCalledOnce();
    expect(beforeSignIn).not.toHaveBeenCalled();
  });
});
