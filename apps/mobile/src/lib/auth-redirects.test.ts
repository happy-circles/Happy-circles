import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  platform: {
    OS: 'ios',
  },
}));

vi.mock('react-native', () => ({
  Platform: mocks.platform,
}));

vi.mock('expo-constants', () => ({
  default: {
    expoConfig: {
      extra: {
        appWebOrigin: 'https://app.example.com',
        authRedirectMode: 'universal-link',
      },
    },
  },
}));

import { buildEmailAuthRedirect, buildSocialOAuthRedirect } from './auth-redirects';

describe('auth redirect builders', () => {
  beforeEach(() => {
    mocks.platform.OS = 'ios';
  });

  it('keeps email auth on universal links when configured', () => {
    expect(buildEmailAuthRedirect('/setup-account?step=email')).toBe(
      'https://app.example.com/setup-account?step=email',
    );
  });

  it('uses the native scheme for social OAuth callbacks on mobile', () => {
    expect(buildSocialOAuthRedirect('/setup-account?auth_callback=google-link')).toBe(
      'happycircles://setup-account?auth_callback=google-link',
    );
  });

  it('keeps social OAuth callbacks on the web origin for web builds', () => {
    mocks.platform.OS = 'web';

    expect(buildSocialOAuthRedirect('/setup-account?auth_callback=google')).toBe(
      'https://app.example.com/setup-account?auth_callback=google',
    );
  });
});
