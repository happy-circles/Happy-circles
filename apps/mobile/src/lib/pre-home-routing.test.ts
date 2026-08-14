import { describe, expect, it } from 'vitest';

import {
  resolvePreHomeRouteDecision,
  resolveSetupCompletionRouteDecision,
  type PreHomeRouteInput,
} from './pre-home-routing';

const baseInput: PreHomeRouteInput = {
  accountAccessState: 'active',
  hasJoinToken: false,
  isAuthRouteTransitionHeld: false,
  isInviteLinkRoute: false,
  isJoinRoute: false,
  isAuthCallbackRoute: false,
  isPublicInviteRoute: false,
  isQaPreviewRoute: false,
  isResetPasswordRoute: false,
  isRootRoute: false,
  isSetupAccountRoute: false,
  pendingInviteIntent: null,
  pendingAccountVerificationToken: null,
  pendingNavigationIntent: null,
  profileCompletionState: 'complete',
  rawAuthCallback: undefined,
  rawJoinMode: undefined,
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
        isAuthCallbackRoute: true,
        status: 'signed_out',
      }),
    ).toEqual({ action: 'stay' });

    expect(resolve({ isRootRoute: true, status: 'signed_out' })).toEqual({
      action: 'replace',
      href: '/join',
    });
  });

  it('resumes a pending account verification from a signed-out cold start', () => {
    expect(
      resolve({
        isRootRoute: true,
        pendingAccountVerificationToken: 'verification-token-123456',
        status: 'signed_out',
      }),
    ).toEqual({
      action: 'replace',
      href: {
        pathname: '/join/[token]/create-account',
        params: { token: 'verification-token-123456' },
      },
    });
  });

  it('resumes pending verification from plain join while signed out', () => {
    expect(
      resolve({
        isJoinRoute: true,
        isPublicInviteRoute: true,
        pendingAccountVerificationToken: 'verification-token-123456',
        status: 'signed_out',
      }),
    ).toEqual({
      action: 'replace',
      href: {
        pathname: '/join/[token]/create-account',
        params: { token: 'verification-token-123456' },
      },
    });
  });

  it('keeps explicit sign-in as the escape from pending verification', () => {
    expect(
      resolve({
        isJoinRoute: true,
        isPublicInviteRoute: true,
        pendingAccountVerificationToken: 'verification-token-123456',
        rawJoinMode: 'sign-in',
        status: 'signed_out',
      }),
    ).toEqual({ action: 'stay' });
  });

  it('keeps qa preview routes in place before auth redirects run', () => {
    expect(
      resolve({
        isQaPreviewRoute: true,
        isSetupAccountRoute: true,
        status: 'signed_out',
      }),
    ).toEqual({ action: 'stay' });

    expect(
      resolve({
        isJoinRoute: true,
        isQaPreviewRoute: true,
      }),
    ).toEqual({ action: 'stay' });
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

  it('keeps tokenized join handoff in place until invite reconciliation finishes', () => {
    expect(
      resolve({
        hasJoinToken: true,
        isAuthRouteTransitionHeld: true,
        isJoinRoute: true,
        setupState: {
          pendingRequiredSteps: ['profile'],
          requiredComplete: false,
        },
      }),
    ).toEqual({ action: 'stay' });
  });

  it('does not force complete but untrusted users into security setup', () => {
    expect(
      resolve({
        setupState: {
          pendingRequiredSteps: [],
          requiredComplete: true,
          securityPending: true,
        },
        status: 'signed_in_untrusted',
      }),
    ).toEqual({ action: 'stay' });
  });

  it('lets auth success handoff own join-to-home routing while the hold is active', () => {
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

  it('keeps password recovery available when the recovery session is locked', () => {
    expect(
      resolve({
        isResetPasswordRoute: true,
        status: 'signed_in_locked',
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

  it('routes invite-gated accounts to their pending account invite without fake activation state', () => {
    expect(
      resolve({
        accountAccessState: 'needs_invite',
        pendingInviteIntent: {
          createdAt: new Date().toISOString(),
          source: 'account_invite_link',
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

  it('does not mistake a friendship intent for the account invite required by gating', () => {
    expect(
      resolve({
        accountAccessState: 'needs_invite',
        pendingInviteIntent: {
          createdAt: new Date().toISOString(),
          source: 'friendship_invite_link',
          token: 'friend-token-123456',
          type: 'friendship_invite',
        },
      }),
    ).toEqual({ action: 'replace', href: '/join' });
  });

  it('sends required setup ahead of account gating to avoid invite/setup redirect loops', () => {
    expect(
      resolve({
        accountAccessState: 'needs_invite',
        pendingInviteIntent: {
          createdAt: new Date().toISOString(),
          source: 'account_invite_link',
          token: 'invite-token-123456',
          type: 'account_invite',
        },
        setupState: {
          pendingRequiredSteps: ['profile'],
          requiredComplete: false,
        },
      }),
    ).toEqual({
      action: 'replace',
      href: { pathname: '/setup-account', params: { step: 'profile' } },
    });
  });

  it('sends required setup ahead of public friendship and account invite routes', () => {
    expect(
      resolve({
        accountAccessState: 'needs_activation',
        isInviteLinkRoute: true,
        isPublicInviteRoute: true,
        setupState: {
          pendingRequiredSteps: ['profile'],
          requiredComplete: false,
        },
      }),
    ).toEqual({
      action: 'replace',
      href: { pathname: '/setup-account', params: { step: 'profile' } },
    });

    expect(
      resolve({
        accountAccessState: 'needs_activation',
        hasJoinToken: true,
        isJoinRoute: true,
        isPublicInviteRoute: true,
        setupState: {
          pendingRequiredSteps: ['email'],
          requiredComplete: false,
        },
      }),
    ).toEqual({
      action: 'replace',
      href: { pathname: '/setup-account', params: { step: 'email' } },
    });
  });

  it('sends active complete users from join to Home after auth handoff clears', () => {
    expect(resolve({ isJoinRoute: true })).toEqual({
      action: 'replace',
      handoff: 'home',
      href: '/home',
    });
  });

  it('returns active complete Google link callbacks to the profile screen', () => {
    expect(
      resolve({
        isAuthCallbackRoute: true,
        isSetupAccountRoute: true,
        rawAuthCallback: 'google-link',
      }),
    ).toEqual({
      action: 'replace',
      href: '/profile',
    });
  });

  it('sends untrusted active users from join to Home after auth handoff clears', () => {
    expect(
      resolve({
        isJoinRoute: true,
        setupState: {
          pendingRequiredSteps: [],
          requiredComplete: true,
          securityPending: true,
        },
        status: 'signed_in_untrusted',
      }),
    ).toEqual({
      action: 'replace',
      handoff: 'home',
      href: '/home',
    });
  });

  it('keeps email code callbacks public until session exchange finishes', () => {
    expect(
      resolve({
        isAuthCallbackRoute: true,
        isSetupAccountRoute: true,
        status: 'signed_out',
      }),
    ).toEqual({ action: 'stay' });
  });

  it('clears a stale account intent instead of trapping an active account on join', () => {
    expect(
      resolve({
        isJoinRoute: true,
        pendingInviteIntent: {
          createdAt: new Date().toISOString(),
          source: 'account_invite_auth',
          token: 'invite-token-123456',
          type: 'account_invite',
        },
      }),
    ).toEqual({
      action: 'replace',
      clearPendingAccountInvite: true,
      handoff: 'home',
      href: '/home',
    });
  });

  it('restores friendship and notification destinations after pre-home completes', () => {
    const friendshipIntent = {
      createdAt: new Date().toISOString(),
      source: 'friendship_invite_link' as const,
      token: 'friend-token-123456',
      type: 'friendship_invite' as const,
    };

    expect(resolve({ isJoinRoute: true, pendingInviteIntent: friendshipIntent })).toEqual({
      action: 'replace',
      href: {
        pathname: '/invite/[token]',
        params: { token: 'friend-token-123456' },
      },
    });

    expect(
      resolve({
        isJoinRoute: true,
        pendingNavigationIntent: {
          createdAt: new Date().toISOString(),
          href: '/activity',
          id: 'notification-1',
          type: 'notification',
        },
      }),
    ).toEqual({
      action: 'replace',
      consumePendingNavigationIntentId: 'notification-1',
      href: '/activity',
    });
  });

  it('restores a deferred notification after a friendship flow returns to home', () => {
    expect(
      resolve({
        pendingNavigationIntent: {
          createdAt: new Date().toISOString(),
          href: '/activity',
          id: 'notification-after-friendship',
          type: 'notification',
        },
      }),
    ).toEqual({
      action: 'replace',
      consumePendingNavigationIntentId: 'notification-after-friendship',
      href: '/activity',
    });
  });
});

describe('resolveSetupCompletionRouteDecision', () => {
  const accountIntent = {
    createdAt: new Date().toISOString(),
    source: 'account_invite_signup' as const,
    token: 'invite-token-123456',
    type: 'account_invite' as const,
  };

  it('activates a pending account invite only after trust is complete', () => {
    expect(
      resolveSetupCompletionRouteDecision({
        accountAccessState: 'needs_activation',
        isTrustedDevice: true,
        pendingInviteIntent: accountIntent,
        pendingNavigationIntent: null,
        returnToProfile: false,
      }),
    ).toEqual({ action: 'activate_account_invite', intent: accountIntent });
  });

  it('does not return an already-active account to its stale account invite', () => {
    expect(
      resolveSetupCompletionRouteDecision({
        accountAccessState: 'active',
        isTrustedDevice: true,
        pendingInviteIntent: accountIntent,
        pendingNavigationIntent: null,
        returnToProfile: false,
      }),
    ).toEqual({
      action: 'navigate',
      clearPendingAccountInvite: true,
      handoff: 'home',
      href: '/home',
    });
  });

  it('resumes a claimed activation when the original delivery token is unavailable', () => {
    expect(
      resolveSetupCompletionRouteDecision({
        accountAccessState: 'needs_activation',
        isTrustedDevice: true,
        pendingInviteIntent: null,
        pendingNavigationIntent: null,
        returnToProfile: false,
      }),
    ).toEqual({ action: 'resume_account_invite' });
  });

  it('restores friendship before notification while preserving both independent intents', () => {
    expect(
      resolveSetupCompletionRouteDecision({
        accountAccessState: 'active',
        isTrustedDevice: true,
        pendingInviteIntent: {
          createdAt: new Date().toISOString(),
          source: 'friendship_invite_link',
          token: 'friend-token-123456',
          type: 'friendship_invite',
        },
        pendingNavigationIntent: {
          createdAt: new Date().toISOString(),
          href: '/activity',
          id: 'notification-1',
          type: 'notification',
        },
        returnToProfile: false,
      }),
    ).toEqual({
      action: 'navigate',
      href: { pathname: '/invite/[token]', params: { token: 'friend-token-123456' } },
    });
  });
});
