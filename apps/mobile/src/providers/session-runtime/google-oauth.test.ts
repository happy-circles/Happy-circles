import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  buildSocialOAuthRedirect: vi.fn(),
  dismissBrowser: vi.fn(),
  linkingListeners: [] as Array<(event: { readonly url: string }) => void>,
  linkingRemove: vi.fn(),
  maybeCompleteAuthSession: vi.fn(),
  openAuthSessionAsync: vi.fn(),
  platform: {
    OS: 'ios',
  },
}));

vi.mock('expo-web-browser', () => ({
  dismissBrowser: mocks.dismissBrowser,
  maybeCompleteAuthSession: mocks.maybeCompleteAuthSession,
  openAuthSessionAsync: mocks.openAuthSessionAsync,
}));

vi.mock('react-native', () => ({
  Linking: {
    addEventListener: vi.fn(
      (_eventName: string, listener: (event: { readonly url: string }) => void) => {
      mocks.linkingListeners.push(listener);
      return { remove: mocks.linkingRemove };
      },
    ),
  },
  Platform: mocks.platform,
}));

vi.mock('@/lib/auth-redirects', () => ({
  buildSocialOAuthRedirect: mocks.buildSocialOAuthRedirect,
}));

import { performSupabaseGoogleOAuth } from './google-oauth';

const OAUTH_URL = 'https://auth.example.com/authorize/google';
const REDIRECT_URL = 'https://app.example.com/setup-account?auth_callback=google';
const LINK_REDIRECT_URL = 'https://app.example.com/setup-account?auth_callback=google-link';
const CALLBACK_URL =
  'happycircles://setup-account?auth_callback=google#access_token=access&refresh_token=refresh';
const LINK_CALLBACK_URL =
  'happycircles://setup-account?auth_callback=google-link#access_token=access&refresh_token=refresh';
const WEB_CALLBACK_URL =
  'https://app.example.com/setup-account?auth_callback=google#access_token=access&refresh_token=refresh';

function createClient(
  input: {
    readonly identities?: readonly { readonly provider: string }[];
    readonly oauthUrl?: string;
    readonly session?: {
      readonly user: {
        readonly id: string;
        readonly identities?: readonly { readonly provider: string }[];
      };
    } | null;
  } = {},
) {
  const signInWithOAuth = vi.fn(async () => ({
    data: { url: input.oauthUrl ?? OAUTH_URL },
    error: null,
  }));
  const linkIdentity = vi.fn(async () => ({
    data: { url: input.oauthUrl ?? OAUTH_URL },
    error: null,
  }));
  const getSession = vi.fn(async () => ({
    data: { session: input.session ?? null },
  }));
  const getUserIdentities = vi.fn(async () => ({
    data: { identities: input.identities ?? [] },
  }));

  return {
    client: {
      auth: {
        getSession,
        getUserIdentities,
        linkIdentity,
        signInWithOAuth,
      },
    },
    getSession,
    getUserIdentities,
    linkIdentity,
    signInWithOAuth,
  };
}

describe('performSupabaseGoogleOAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.linkingListeners = [];
    mocks.platform.OS = 'ios';
    mocks.buildSocialOAuthRedirect.mockReturnValue(REDIRECT_URL);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens an auth session on web without replacing the app window', async () => {
    mocks.platform.OS = 'web';
    const { client, signInWithOAuth } = createClient({
      session: { user: { id: 'user-web' } },
    });
    const applySessionFromUrl = vi.fn(async () => true);
    const reportEvent = vi.fn();
    const reportFailure = vi.fn();
    mocks.openAuthSessionAsync.mockResolvedValue({ type: 'success', url: WEB_CALLBACK_URL });

    const result = await performSupabaseGoogleOAuth({
      applySessionFromUrl,
      client: client as never,
      mode: 'sign-in',
      reportEvent,
      reportFailure,
    });

    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: REDIRECT_URL,
        skipBrowserRedirect: true,
      },
    });
    expect(mocks.dismissBrowser).toHaveBeenCalledTimes(1);
    expect(mocks.openAuthSessionAsync).toHaveBeenCalledWith(OAUTH_URL, REDIRECT_URL);
    expect(applySessionFromUrl).toHaveBeenCalledWith(WEB_CALLBACK_URL);
    expect(reportFailure).not.toHaveBeenCalled();
    expect(reportEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'callback_received',
        result: 'started',
        stage: 'oauth_callback',
      }),
    );
    expect(result).toEqual({ message: 'Sesión iniciada.', userId: 'user-web' });
  });

  it('keeps the native auth-session callback path outside web', async () => {
    const { client, getSession } = createClient({
      session: { user: { id: 'user-1' } },
    });
    const applySessionFromUrl = vi.fn(async () => true);
    const reportEvent = vi.fn();
    const reportFailure = vi.fn();
    mocks.openAuthSessionAsync.mockResolvedValue({ type: 'success', url: CALLBACK_URL });

    const result = await performSupabaseGoogleOAuth({
      applySessionFromUrl,
      client: client as never,
      mode: 'sign-in',
      reportEvent,
      reportFailure,
    });

    expect(mocks.dismissBrowser).toHaveBeenCalledTimes(1);
    expect(mocks.openAuthSessionAsync).toHaveBeenCalledWith(OAUTH_URL, REDIRECT_URL);
    expect(applySessionFromUrl).toHaveBeenCalledWith(CALLBACK_URL);
    expect(getSession).toHaveBeenCalledTimes(1);
    expect(reportFailure).not.toHaveBeenCalled();
    expect(result.userId).toBe('user-1');
  });

  it('accepts a native deep-link callback even when the auth session reports cancel', async () => {
    const { client } = createClient({
      session: { user: { id: 'user-1' } },
    });
    const applySessionFromUrl = vi.fn(async () => true);
    const reportEvent = vi.fn();
    const reportFailure = vi.fn();
    mocks.openAuthSessionAsync.mockImplementation(async () => {
      for (const listener of mocks.linkingListeners) {
        listener({ url: CALLBACK_URL });
      }
      return { type: 'cancel' };
    });

    const result = await performSupabaseGoogleOAuth({
      applySessionFromUrl,
      client: client as never,
      mode: 'sign-in',
      reportEvent,
      reportFailure,
    });

    expect(applySessionFromUrl).toHaveBeenCalledWith(CALLBACK_URL);
    expect(reportFailure).not.toHaveBeenCalled();
    expect(mocks.linkingRemove).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ message: 'Sesión iniciada.', userId: 'user-1' });
  });

  it('links Google through OAuth and verifies the refreshed identity list', async () => {
    mocks.buildSocialOAuthRedirect.mockReturnValue(LINK_REDIRECT_URL);
    const { client, getUserIdentities, linkIdentity } = createClient({
      identities: [{ provider: 'google' }],
      session: { user: { id: 'user-linked' } },
    });
    const applySessionFromUrl = vi.fn(async () => true);
    const reportEvent = vi.fn();
    const reportFailure = vi.fn();
    mocks.openAuthSessionAsync.mockResolvedValue({ type: 'success', url: LINK_CALLBACK_URL });

    const result = await performSupabaseGoogleOAuth({
      applySessionFromUrl,
      client: client as never,
      mode: 'link',
      reportEvent,
      reportFailure,
    });

    expect(linkIdentity).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: LINK_REDIRECT_URL,
        skipBrowserRedirect: true,
      },
    });
    expect(applySessionFromUrl).toHaveBeenCalledWith(LINK_CALLBACK_URL);
    expect(getUserIdentities).toHaveBeenCalledTimes(1);
    expect(reportFailure).not.toHaveBeenCalled();
    expect(result).toEqual({ message: 'Google vinculado.', userId: 'user-linked' });
  });

  it('reports a link callback that applied but did not attach Google', async () => {
    mocks.buildSocialOAuthRedirect.mockReturnValue(LINK_REDIRECT_URL);
    const { client } = createClient({
      identities: [{ provider: 'email' }],
      session: { user: { id: 'user-no-link' } },
    });
    const applySessionFromUrl = vi.fn(async () => true);
    const reportEvent = vi.fn();
    const reportFailure = vi.fn();
    mocks.openAuthSessionAsync.mockResolvedValue({ type: 'success', url: LINK_CALLBACK_URL });

    const result = await performSupabaseGoogleOAuth({
      applySessionFromUrl,
      client: client as never,
      mode: 'link',
      reportEvent,
      reportFailure,
    });

    expect(result).toEqual({
      message: 'No pudimos completar Google. Intentalo de nuevo.',
      userId: null,
    });
    expect(reportFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'missing_verified_session',
        stage: 'oauth_callback',
      }),
    );
  });
});
