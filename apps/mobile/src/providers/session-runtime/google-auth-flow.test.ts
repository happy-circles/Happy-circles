import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  nativeAuth: vi.fn(),
  oauthAuth: vi.fn(),
  reportEvent: vi.fn(),
  reportFailure: vi.fn(),
  traceAuthDebugEvent: vi.fn(),
}));

vi.mock('./google-native-auth', () => ({
  performNativeGoogleAuth: mocks.nativeAuth,
}));

vi.mock('./google-oauth', () => ({
  performSupabaseGoogleOAuth: mocks.oauthAuth,
}));

vi.mock('./social-auth-reporting', () => ({
  reportSocialAuthEvent: mocks.reportEvent,
  reportSocialAuthFailure: mocks.reportFailure,
}));

vi.mock('./auth-debug', () => ({
  traceAuthDebugEvent: mocks.traceAuthDebugEvent,
}));

import { performGoogleAuthFlow } from './google-auth-flow';

interface AuthResult {
  readonly message: string;
  readonly userId: string | null;
}

interface SocialAuthFailure {
  readonly message?: string;
  readonly mode: 'link' | 'sign-in';
  readonly provider: 'google';
  readonly reason?: string;
  readonly stage: 'browser_open' | 'oauth_callback' | 'oauth_start';
}

interface OAuthAuthInput {
  readonly reportEvent?: (event: {
    readonly mode: 'link' | 'sign-in';
    readonly provider: 'google';
    readonly result: 'cancelled' | 'started' | 'succeeded';
    readonly stage: 'browser_open' | 'oauth_callback' | 'oauth_start';
  }) => void;
  readonly reportFailure?: (failure: SocialAuthFailure) => void;
}

const client = {} as never;
const applySessionFromUrl = vi.fn(async () => true);

describe('performGoogleAuthFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    applySessionFromUrl.mockClear();
  });

  it('uses Supabase OAuth directly on web', async () => {
    const oauthResult: AuthResult = { message: 'Sesion iniciada.', userId: 'user-1' };
    mocks.oauthAuth.mockResolvedValue(oauthResult);

    const result = await performGoogleAuthFlow({
      applySessionFromUrl,
      client,
      mode: 'sign-in',
      platform: 'web',
    });

    expect(result).toBe(oauthResult);
    expect(mocks.oauthAuth).toHaveBeenCalledTimes(1);
  });

  it('uses native Google auth first on native platforms', async () => {
    const nativeResult: AuthResult = { message: 'SesiÃ³n iniciada.', userId: 'user-1' };
    mocks.nativeAuth.mockResolvedValue(nativeResult);

    const result = await performGoogleAuthFlow({
      applySessionFromUrl,
      client,
      mode: 'sign-in',
      platform: 'ios',
    });

    expect(result).toBe(nativeResult);
    expect(mocks.nativeAuth).toHaveBeenCalledTimes(1);
    expect(mocks.oauthAuth).not.toHaveBeenCalled();
    expect(mocks.traceAuthDebugEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'google',
        source: 'native_auth',
        stage: 'flow_start',
      }),
    );
  });

  it('does not fall back to web OAuth after a native Google failure', async () => {
    const nativeResult = {
      failureCode: 'native_unavailable',
      message: 'Google nativo no esta disponible.',
      shouldFallbackToOAuth: true,
      userId: null,
    };
    mocks.nativeAuth.mockResolvedValue(nativeResult);

    const result = await performGoogleAuthFlow({
      applySessionFromUrl,
      client,
      mode: 'sign-in',
      platform: 'android',
    });

    expect(result).toBe(nativeResult);
    expect(mocks.oauthAuth).not.toHaveBeenCalled();
  });

  it('marks OAuth callback reports with the OAuth source', async () => {
    mocks.oauthAuth.mockResolvedValue({ message: 'Sesion iniciada.', userId: 'user-1' });

    await performGoogleAuthFlow({
      applySessionFromUrl,
      client,
      mode: 'link',
      platform: 'web',
    });

    const oauthInput = mocks.oauthAuth.mock.calls[0]?.[0] as OAuthAuthInput;
    oauthInput.reportEvent?.({
      mode: 'link',
      provider: 'google',
      result: 'succeeded',
      stage: 'oauth_callback',
    });
    oauthInput.reportFailure?.({
      message: 'Callback failed.',
      mode: 'link',
      provider: 'google',
      reason: 'callback_not_applied',
      stage: 'oauth_start',
    });

    expect(mocks.reportEvent).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'link', source: 'oauth_auth', stage: 'oauth_callback' }),
    );
    expect(mocks.reportFailure).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'link', source: 'oauth_auth', stage: 'oauth_start' }),
    );
  });
});
