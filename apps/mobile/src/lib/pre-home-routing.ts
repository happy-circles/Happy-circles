import type { Href } from 'expo-router';

import type { PendingInviteIntent } from '@/lib/invite-intent';
import type { PendingNavigationIntent } from '@/lib/pending-navigation-intent';
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
      readonly clearPendingAccountInvite?: boolean;
      readonly consumePendingNavigationIntentId?: string;
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
  readonly isAuthCallbackRoute?: boolean;
  readonly isOAuthCallbackRoute?: boolean;
  readonly isPublicInviteRoute: boolean;
  readonly isQaPreviewRoute: boolean;
  readonly isResetPasswordRoute: boolean;
  readonly isRootRoute: boolean;
  readonly isSetupAccountRoute: boolean;
  readonly hasJoinToken: boolean;
  readonly pendingInviteIntent: PendingInviteIntent | null;
  readonly pendingAccountVerificationToken: string | null;
  readonly pendingNavigationIntent?: PendingNavigationIntent | null;
  readonly profileCompletionState: PreHomeProfileCompletionState;
  readonly rawAuthCallback: string | undefined;
  readonly rawJoinMode: string | undefined;
  readonly setupState: PreHomeSetupState;
  readonly status: PreHomeSessionStatus;
}

function stay(): PreHomeRouteDecision {
  return { action: 'stay' };
}

function replace(
  href: Href,
  options?: Omit<Extract<PreHomeRouteDecision, { readonly action: 'replace' }>, 'action' | 'href'>,
): PreHomeRouteDecision {
  return { action: 'replace', href, ...options };
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

function buildPendingAccountVerificationHref(token: string): Href {
  return {
    pathname: '/join/[token]/create-account',
    params: { token },
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

  const isAuthCallbackRoute = input.isAuthCallbackRoute ?? input.isOAuthCallbackRoute ?? false;
  const isPublicSignedOutRoute =
    input.isPublicInviteRoute || input.isResetPasswordRoute || isAuthCallbackRoute;

  if (input.status === 'signed_out') {
    const shouldResumePendingVerification =
      Boolean(input.pendingAccountVerificationToken) &&
      (input.isRootRoute ||
        (input.isJoinRoute && !input.hasJoinToken && !input.rawJoinMode?.trim()));
    if (shouldResumePendingVerification && input.pendingAccountVerificationToken) {
      return replace(buildPendingAccountVerificationHref(input.pendingAccountVerificationToken));
    }

    if (input.isRootRoute) {
      return replace('/join');
    }

    if (!isPublicSignedOutRoute) {
      return replace('/join?mode=sign-in');
    }

    return stay();
  }

  if (input.status === 'signed_in_locked') {
    if (
      !input.isJoinRoute &&
      !input.isInviteLinkRoute &&
      !input.isResetPasswordRoute &&
      !isAuthCallbackRoute
    ) {
      return replace('/join');
    }

    return stay();
  }

  if (
    !input.setupState.requiredComplete &&
    !input.isSetupAccountRoute &&
    !input.isResetPasswordRoute
  ) {
    if (shouldWaitForAuthHandoff(input)) {
      return stay();
    }

    return replace(buildPreHomeSetupAccountHref(nextRequiredSetupStep(input)));
  }

  const pendingAccountInvite =
    input.pendingInviteIntent?.type === 'account_invite' ? input.pendingInviteIntent : null;
  const pendingFriendshipInvite =
    input.pendingInviteIntent?.type === 'friendship_invite' ? input.pendingInviteIntent : null;
  const accountInviteHref = pendingAccountInvite
    ? hrefForPreHomePendingInviteIntent(pendingAccountInvite)
    : null;

  if (input.accountAccessState === 'needs_invite') {
    if (!input.isJoinRoute && !input.isSetupAccountRoute) {
      return replace(accountInviteHref ?? '/join');
    }

    return stay();
  }

  if (
    input.accountAccessState === 'needs_activation' &&
    !input.isJoinRoute &&
    !input.isSetupAccountRoute
  ) {
    return replace(accountInviteHref ?? '/join');
  }

  if (
    input.accountAccessState === 'active' &&
    input.profileCompletionState === 'complete' &&
    isAuthCallbackRoute &&
    input.rawAuthCallback === 'google-link'
  ) {
    return replace('/profile');
  }

  if (
    input.accountAccessState === 'active' &&
    input.profileCompletionState === 'complete' &&
    input.pendingNavigationIntent &&
    !pendingFriendshipInvite &&
    !input.isSetupAccountRoute &&
    !input.isInviteLinkRoute &&
    !input.isJoinRoute &&
    !input.isResetPasswordRoute
  ) {
    return replace(input.pendingNavigationIntent.href as Href, {
      consumePendingNavigationIntentId: input.pendingNavigationIntent.id,
    });
  }

  const isPreHomeExitRoute =
    input.isRootRoute || (input.isJoinRoute && !input.hasJoinToken) || isAuthCallbackRoute;

  if (
    input.accountAccessState === 'active' &&
    input.profileCompletionState === 'complete' &&
    isPreHomeExitRoute &&
    !input.isAuthRouteTransitionHeld &&
    !input.isQaPreviewRoute
  ) {
    if (pendingFriendshipInvite) {
      return replace(hrefForPreHomePendingInviteIntent(pendingFriendshipInvite));
    }

    if (input.pendingNavigationIntent) {
      return replace(input.pendingNavigationIntent.href as Href, {
        consumePendingNavigationIntentId: input.pendingNavigationIntent.id,
      });
    }

    return replace('/home', {
      ...(pendingAccountInvite ? { clearPendingAccountInvite: true } : {}),
      handoff: 'home',
    });
  }

  return stay();
}

export type SetupCompletionRouteDecision =
  | {
      readonly action: 'activate_account_invite';
      readonly intent: Extract<PendingInviteIntent, { readonly type: 'account_invite' }>;
    }
  | {
      readonly action: 'resume_account_invite';
    }
  | {
      readonly action: 'navigate';
      readonly clearPendingAccountInvite?: boolean;
      readonly consumePendingNavigationIntentId?: string;
      readonly handoff?: 'home';
      readonly href: Href;
    };

export interface SetupCompletionRouteInput {
  readonly accountAccessState: PreHomeAccountAccessState;
  readonly isTrustedDevice: boolean;
  readonly pendingInviteIntent: PendingInviteIntent | null;
  readonly pendingNavigationIntent: PendingNavigationIntent | null;
  readonly returnToProfile: boolean;
}

export function resolveSetupCompletionRouteDecision(
  input: SetupCompletionRouteInput,
): SetupCompletionRouteDecision {
  if (input.returnToProfile) {
    return { action: 'navigate', href: '/profile' };
  }

  if (input.pendingInviteIntent?.type === 'account_invite') {
    if (input.accountAccessState !== 'active' && !input.isTrustedDevice) {
      return {
        action: 'navigate',
        href: hrefForPreHomePendingInviteIntent(input.pendingInviteIntent),
      };
    }

    if (input.accountAccessState !== 'active') {
      return { action: 'activate_account_invite', intent: input.pendingInviteIntent };
    }

    if (input.pendingNavigationIntent) {
      return {
        action: 'navigate',
        clearPendingAccountInvite: true,
        consumePendingNavigationIntentId: input.pendingNavigationIntent.id,
        href: input.pendingNavigationIntent.href as Href,
      };
    }

    return {
      action: 'navigate',
      clearPendingAccountInvite: true,
      handoff: 'home',
      href: '/home',
    };
  }

  if (input.accountAccessState !== 'active') {
    if (input.accountAccessState === 'needs_activation' && input.isTrustedDevice) {
      return { action: 'resume_account_invite' };
    }

    return { action: 'navigate', href: '/join?mode=token' };
  }

  if (input.pendingInviteIntent?.type === 'friendship_invite') {
    return {
      action: 'navigate',
      href: hrefForPreHomePendingInviteIntent(input.pendingInviteIntent),
    };
  }

  if (input.pendingNavigationIntent) {
    return {
      action: 'navigate',
      consumePendingNavigationIntentId: input.pendingNavigationIntent.id,
      href: input.pendingNavigationIntent.href as Href,
    };
  }

  return { action: 'navigate', handoff: 'home', href: '/home' };
}
