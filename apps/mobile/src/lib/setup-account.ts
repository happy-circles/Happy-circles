import type { Href } from 'expo-router';
import type { Database } from '@happy-circles/shared';

type UserProfileRow = Database['public']['Tables']['user_profiles']['Row'];

export type SetupStep = 'profile' | 'photo' | 'security';

export function isLowQualityDisplayName(displayName: string | null | undefined): boolean {
  const normalized = displayName?.trim() ?? '';
  if (normalized.length < 3) {
    return true;
  }

  return normalized.includes('@');
}

export function hasRequiredProfileInfo(profile: UserProfileRow | null): boolean {
  if (!profile) {
    return false;
  }

  return !isLowQualityDisplayName(profile.display_name) && Boolean(profile.phone_e164);
}

export function hasProfilePhoto(profile: UserProfileRow | null): boolean {
  return Boolean(profile?.avatar_path);
}

export function derivePendingRequiredSetupSteps(profile: UserProfileRow | null): SetupStep[] {
  const pendingSteps: SetupStep[] = [];

  if (!hasRequiredProfileInfo(profile)) {
    pendingSteps.push('profile');
  }

  if (!hasProfilePhoto(profile)) {
    pendingSteps.push('photo');
  }

  return pendingSteps;
}

export function resolveSetupStep(input: {
  readonly requestedStep?: string | null;
  readonly pendingRequiredSteps: readonly SetupStep[];
  readonly securityPending: boolean;
}): SetupStep {
  const requestedStep = input.requestedStep;
  if (
    (requestedStep === 'profile' || requestedStep === 'photo') &&
    input.pendingRequiredSteps.includes(requestedStep)
  ) {
    return requestedStep;
  }

  if (requestedStep === 'security' && input.pendingRequiredSteps.length === 0) {
    return 'security';
  }

  return input.pendingRequiredSteps[0] ?? (input.securityPending ? 'security' : 'profile');
}

export function buildSetupAccountHref(
  step: SetupStep,
  params?: Record<string, string | undefined>,
): Href {
  return {
    pathname: '/setup-account',
    params: {
      ...params,
      step,
    },
  } as Href;
}
