import type { Href } from 'expo-router';

import type { PendingInviteIntent } from '@/lib/invite-intent';
import type { SetupStep } from '@/lib/setup-account';

export type PreHomeSessionStatus =
  | 'loading'
  | 'signed_out'
  | 'signed_in_untrusted'
  | 'signed_in_unlocked'
  | 'signed_in_locked';
export type PreHomeAccountAccessState = 'loading' | 'needs_invite' | 'needs_activation' | 'active';
export type PreHomeProfileCompletionState = 'loading' | 'incomplete' | 'complete';

export interface PreHomeSetupState {
  readonly pendingRequiredSteps: readonly SetupStep[];
  readonly requiredComplete: boolean;
  readonly securityPending: boolean;
}

export type PreHomeRouteDecision =
  | {
      readonly action: 'replace';
      readonly handoff?: 'home';
      readonly href: Href;
    }
  | {
      readonly action: 'stay';
    };

export interface PreHomeRouteInput {
  readonly accountAccessState: PreHomeAccountAccessState;
  readonly isAuthRouteTransitionHeld: boolean;
  readonly isInviteLinkRoute: boolean;
  readonly isJoinRoute: boolean;
  readonly isOAuthCallbackRoute: boolean;
  readonly isPublicInviteRoute: boolean;
  readonly isQaPreviewRoute: boolean;
  readonly isResetPasswordRoute: boolean;
  readonly isRootRoute: boolean;
  readonly isSetupAccountRoute: boolean;
  readonly hasJoinToken: boolean;
  readonly pendingInviteIntent: PendingInviteIntent | null;
  readonly profileCompletionState: PreHomeProfileCompletionState;
  readonly rawAuthCallback: string | undefined;
  readonly setupState: PreHomeSetupState;
  readonly status: PreHomeSessionStatus;
}

function stay(): PreHomeRouteDecision {
  return { action: 'stay' };
}

function replace(href: Href, handoff?: 'home'): PreHomeRouteDecision {
  return handoff ? { action: 'replace', handoff, href } : { action: 'replace', href };
}

function hrefForPreHomePendingInviteIntent(intent: PendingInviteIntent): Href {
  if (intent.type === 'account_invite') {
    return {
      pathname: '/join/[token]',
      params: { token: intent.token },
    } as unknown as Href;
  }

  return {
    pathname: '/invite/[token]',
    params: { token: intent.token },
  } as Href;
}

function buildPreHomeSetupAccountHref(step: SetupStep): Href {
  return {
    pathname: '/setup-account',
    params: { step },
  } as Href;
}

function nextRequiredSetupStep(input: PreHomeRouteInput): SetupStep {
  return input.setupState.pendingRequiredSteps[0] ?? 'profile';
}

function shouldWaitForAuthHandoff(input: PreHomeRouteInput) {
  return input.isJoinRoute && !input.hasJoinToken && input.isAuthRouteTransitionHeld;
}

export function resolvePreHomeRouteDecision(input: PreHomeRouteInput): PreHomeRouteDecision {
  if (input.status === 'loading') {
    return stay();
  }

  if (input.isQaPreviewRoute) {
    return stay();
  }

  const isPublicSignedOutRoute =
    input.isPublicInviteRoute || input.isResetPasswordRoute || input.isOAuthCallbackRoute;

  if (input.status === 'signed_out') {
    if (input.isRootRoute) {
      return replace('/join');
    }

    if (!isPublicSignedOutRoute) {
      return replace('/join?mode=sign-in');
    }

    return stay();
  }

  if (input.status === 'signed_in_locked') {
    if (!input.isJoinRoute && !input.isInviteLinkRoute && !input.isResetPasswordRoute) {
      return replace('/join');
    }

    return stay();
  }

  const inviteAwareHref = input.pendingInviteIntent
    ? hrefForPreHomePendingInviteIntent(input.pendingInviteIntent)
    : null;

  if (input.accountAccessState === 'needs_invite') {
    if (!input.isJoinRoute) {
      return replace(inviteAwareHref ?? '/join');
    }

    return stay();
  }

  if (
    !input.setupState.requiredComplete &&
    !input.isSetupAccountRoute &&
    !input.isResetPasswordRoute &&
    !input.isPublicInviteRoute
  ) {
    if (shouldWaitForAuthHandoff(input)) {
      return stay();
    }

    return replace(buildPreHomeSetupAccountHref(nextRequiredSetupStep(input)));
  }

  if (
    input.accountAccessState === 'needs_activation' &&
    !input.isJoinRoute &&
    !input.isSetupAccountRoute
  ) {
    return replace(inviteAwareHref ?? '/join');
  }

  if (
    input.accountAccessState === 'active' &&
    input.profileCompletionState === 'complete' &&
    input.isOAuthCallbackRoute
  ) {
    return replace(
      input.rawAuthCallback === 'google-link'
        ? '/profile'
        : '/home',
    );
  }

  if (
    input.accountAccessState === 'active' &&
    input.profileCompletionState === 'complete' &&
    input.isJoinRoute &&
    !input.hasJoinToken &&
    !inviteAwareHref &&
    !input.isAuthRouteTransitionHeld &&
    !input.isQaPreviewRoute
  ) {
    return replace('/home', 'home');
  }

  return stay();
}
