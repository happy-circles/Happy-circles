import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  appConfig: {
    authDebugEnabled: '',
  },
  platform: {
    OS: 'ios',
  },
}));

vi.mock('react-native', () => ({
  Platform: mocks.platform,
}));

vi.mock('@/lib/config', () => ({
  appConfig: mocks.appConfig,
}));

import { isAuthDebugEnabled, traceAuthDebugEvent } from './auth-debug';

interface AuthDebugPayload {
  readonly message?: string;
  readonly metadata?: {
    readonly redirectUrl?: string;
    readonly safeStage?: string;
  };
  readonly platform?: string;
}

describe('auth debug tracing', () => {
  beforeEach(() => {
    mocks.appConfig.authDebugEnabled = '';
    vi.restoreAllMocks();
  });

  it('stays silent unless explicitly enabled', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    traceAuthDebugEvent({
      provider: 'google',
      result: 'started',
      source: 'oauth_auth',
      stage: 'oauth_start',
    });

    expect(isAuthDebugEnabled()).toBe(false);
    expect(info).not.toHaveBeenCalled();
  });

  it('redacts sensitive values from enabled traces', () => {
    mocks.appConfig.authDebugEnabled = '1';
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    traceAuthDebugEvent({
      message: 'callback code=oauth-secret',
      metadata: {
        redirectUrl: 'happycircles://setup-account?code=oauth-secret',
        safeStage: 'oauth_callback',
      },
      mode: 'sign-in',
      provider: 'google',
      result: 'succeeded',
      source: 'oauth_auth',
      stage: 'oauth_callback',
    });

    expect(isAuthDebugEnabled()).toBe(true);
    const calls = info.mock.calls as unknown as Array<[string, string]>;
    const [label, payloadJson] = calls[0] ?? [];
    const payload = JSON.parse(payloadJson) as AuthDebugPayload;

    expect(label).toBe('[auth-debug]');
    expect(payload).toMatchObject({
      message: 'callback code=[redacted]',
      metadata: {
        redirectUrl: '[redacted]',
        safeStage: 'oauth_callback',
      },
      platform: 'ios',
    });
  });
});
