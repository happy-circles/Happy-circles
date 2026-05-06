import { derivePendingRequiredSetupSteps } from '@/lib/setup-account';
import type { DeviceTrustState, SetupPermissionStatus, SetupState, UserProfileRow } from './types';

export function buildSetupState(input: {
  readonly profile: UserProfileRow | null;
  readonly isEmailConfirmed: boolean;
  readonly deviceTrustState: DeviceTrustState;
  readonly biometricAvailable: boolean;
  readonly contactsPermissionStatus: SetupPermissionStatus;
  readonly notificationsPermissionStatus: SetupPermissionStatus;
  readonly emptyState: SetupState;
}): SetupState {
  if (!input.profile) {
    return {
      ...input.emptyState,
      contactsPermissionStatus: input.contactsPermissionStatus,
      notificationsPermissionStatus: input.notificationsPermissionStatus,
    };
  }

  const pendingRequiredSteps = derivePendingRequiredSetupSteps(
    input.profile,
    input.isEmailConfirmed,
  );

  return {
    requiredComplete: pendingRequiredSteps.length === 0,
    pendingRequiredSteps,
    emailConfirmed: input.isEmailConfirmed,
    securityPending: input.deviceTrustState !== 'trusted',
    biometricsEligible: input.biometricAvailable && input.deviceTrustState === 'trusted',
    contactsPermissionStatus: input.contactsPermissionStatus,
    notificationsPermissionStatus: input.notificationsPermissionStatus,
  };
}
