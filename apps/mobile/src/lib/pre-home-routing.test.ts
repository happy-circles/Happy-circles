import { describe, expect, it } from 'vitest';

import { resolvePreHomeRouteDecision, type PreHomeRouteInput } from './pre-home-routing';

const baseInput: PreHomeRouteInput = {
  accountAccessState: 'active',
  hasJoinToken: false,
  isAuthRouteTransitionHeld: false,
  isInviteLinkRoute: false,
  isJoinRoute: false,
  isOAuthCallbackRoute: false,
  isPublicInviteRoute: false,
  isQaPreviewRoute: false,
  isResetPasswordRoute: false,
  isRootRoute: false,
  isSetupAccountRoute: false,
  pendingInviteIntent: null,
  profileCompletionState: 'complete',
  rawAuthCallback: undefined,
  setupState: {
    pendingRequiredSteps: [],
    requiredComplete: true,
    securityPending: false,
  },
  status: 'signed_in_unlocked',
};

function resolve(
  overrides: Partial<Omit<PreHomeRouteInput, 'setupState'>> & {
    readonly setupState?: Partial<PreHomeRouteInput['setupState']>;
  },
) {
  return resolvePreHomeRouteDecision({
    ...baseInput,
    ...overrides,
    setupState: {
      ...baseInput.setupState,
      ...(overrides.setupState ?? {}),
    },
  });
}

describe('resolvePreHomeRouteDecision', () => {
  it('keeps public auth routes available while signed out', () => {
    expect(
      resolve({
        isSetupAccountRoute: true,
        isOAuthCallbackRoute: true,
        status: 'signed_out',
      }),
    ).toEqual({ action: 'stay' });

    expect(resolve({ isRootRoute: true, status: 'signed_out' })).toEqual({
      action: 'replace',
      href: '/join',
    });
  });

  it('routes incomplete authenticated users to the next setup step', () => {
    expect(
      resolve({
        setupState: {
          pendingRequiredSteps: ['email', 'profile'],
          requiredComplete: false,
        },
      }),
    ).toEqual({
      action: 'replace',
      href: {
        pathname: '/setup-account',
        params: { step: 'email' },
      },
    });
  });

  it('lets auth success handoff own join-to-setup routing while the hold is active', () => {
    expect(
      resolve({
        isAuthRouteTransitionHeld: true,
        isJoinRoute: true,
        setupState: {
          pendingRequiredSteps: ['profile'],
          requiredComplete: false,
        },
      }),
    ).toEqual({ action: 'stay' });
  });

  it('routes complete but untrusted users to security before Home', () => {
    expect(
      resolve({
        setupState: {
          pendingRequiredSteps: [],
          requiredComplete: true,
          securityPending: true,
        },
        status: 'signed_in_untrusted',
      }),
    ).toEqual({
      action: 'replace',
      href: {
        pathname: '/setup-account',
        params: { step: 'security' },
      },
    });
  });

  it('lets auth success handoff own join-to-security routing while the hold is active', () => {
    expect(
      resolve({
        isAuthRouteTransitionHeld: true,
        isJoinRoute: true,
        setupState: {
          pendingRequiredSteps: [],
          requiredComplete: true,
          securityPending: true,
        },
        status: 'signed_in_untrusted',
      }),
    ).toEqual({ action: 'stay' });
  });

  it('routes activation-only accounts back to their pending invite', () => {
    expect(
      resolve({
        accountAccessState: 'needs_activation',
        pendingInviteIntent: {
          createdAt: new Date().toISOString(),
          source: 'account_invite_signup',
          token: 'invite-token-123456',
          type: 'account_invite',
        },
      }),
    ).toEqual({
      action: 'replace',
      href: {
        pathname: '/join/[token]',
        params: { token: 'invite-token-123456' },
      },
    });
  });

  it('sends active complete users from join to Home after auth handoff clears', () => {
    expect(resolve({ isJoinRoute: true })).toEqual({
      action: 'replace',
      handoff: 'home',
      href: '/home',
    });
  });
});
