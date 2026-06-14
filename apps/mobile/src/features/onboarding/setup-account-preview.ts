import { useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

import type { SetupStep } from '@/lib/setup-account';
import type {
  CompleteProfileInput,
  SessionContextValue,
  SetupState,
  UserProfileRow,
} from '@/providers/session/types';
import type { SetupAccountPreviewCase, SetupAccountPreviewParams } from './setup-account-helpers';

const PREVIEW_EMAIL = 'qa.onboarding@happy.test';
const PREVIEW_USER_ID = 'qa-onboarding-user';
const PREVIEW_DEVICE_ID = 'qa-onboarding-device';
const PREVIEW_NOW = '2026-01-01T00:00:00.000Z';

interface SetupAccountPreviewState {
  readonly biometricsEnabled: boolean;
  readonly emailConfirmed: boolean;
  readonly profile: UserProfileRow;
  readonly profileComplete: boolean;
  readonly trustedDevice: boolean;
}

function buildPreviewProfile(input: {
  readonly avatarPath?: string | null;
  readonly displayName: string;
  readonly phoneCountryCallingCode?: string | null;
  readonly phoneCountryIso2?: string | null;
  readonly phoneE164?: string | null;
  readonly phoneNationalNumber?: string | null;
  readonly phoneVerifiedAt?: string | null;
}): UserProfileRow {
  return {
    account_access_state: 'active',
    activated_at: PREVIEW_NOW,
    activated_via_account_invite_id: null,
    avatar_path: input.avatarPath ?? null,
    created_at: PREVIEW_NOW,
    deleted_at: null,
    deletion_requested_at: null,
    display_name: input.displayName,
    email: PREVIEW_EMAIL,
    id: PREVIEW_USER_ID,
    invited_by_user_id: null,
    onboarding_completed_at: null,
    phone_country_calling_code: input.phoneCountryCallingCode ?? null,
    phone_country_iso2: input.phoneCountryIso2 ?? null,
    phone_e164: input.phoneE164 ?? null,
    phone_national_number: input.phoneNationalNumber ?? null,
    phone_verified_at: input.phoneVerifiedAt ?? null,
    updated_at: PREVIEW_NOW,
    welcome_email_last_error: null,
    welcome_email_queued_at: null,
    welcome_email_sent_at: null,
  };
}

function buildCompleteProfile() {
  return buildPreviewProfile({
    avatarPath: 'preview/avatar.png',
    displayName: 'QA Onboarding',
    phoneCountryCallingCode: '+57',
    phoneCountryIso2: 'CO',
    phoneE164: '+573001234567',
    phoneNationalNumber: '3001234567',
    phoneVerifiedAt: PREVIEW_NOW,
  });
}

function buildIncompleteProfile() {
  return buildPreviewProfile({
    displayName: PREVIEW_EMAIL,
  });
}

function createInitialPreviewState(previewCase: SetupAccountPreviewCase): SetupAccountPreviewState {
  const profileComplete =
    previewCase === 'complete' || previewCase === 'email' || previewCase === 'security';
  const emailConfirmed = previewCase === 'complete' || previewCase === 'security';
  const trustedDevice = previewCase === 'complete';

  return {
    biometricsEnabled: trustedDevice,
    emailConfirmed,
    profile: profileComplete ? buildCompleteProfile() : buildIncompleteProfile(),
    profileComplete,
    trustedDevice,
  };
}

function buildPreviewSetupState(state: SetupAccountPreviewState): SetupState {
  const pendingRequiredSteps: SetupStep[] = [];

  if (!state.emailConfirmed) {
    pendingRequiredSteps.push('email');
  }

  if (!state.profileComplete) {
    pendingRequiredSteps.push('profile');
  }

  return {
    biometricsEligible: state.trustedDevice,
    contactsPermissionStatus: 'granted',
    emailConfirmed: state.emailConfirmed,
    notificationsPermissionStatus: 'granted',
    pendingRequiredSteps,
    requiredComplete: pendingRequiredSteps.length === 0,
    securityPending: !state.trustedDevice,
  };
}

function normalizePreviewPhone(input: CompleteProfileInput) {
  const nationalNumber = input.phoneNationalNumber.trim();

  return {
    phoneCountryCallingCode: input.phoneCountryCallingCode,
    phoneCountryIso2: input.phoneCountryIso2,
    phoneE164: nationalNumber
      ? `${input.phoneCountryCallingCode}${nationalNumber.replace(/\D/g, '')}`
      : null,
    phoneNationalNumber: nationalNumber,
    phoneVerifiedAt: nationalNumber ? PREVIEW_NOW : null,
  };
}

export function useSetupAccountPreviewSession(
  liveSession: SessionContextValue,
  previewParams: SetupAccountPreviewParams,
): SessionContextValue | null {
  const [previewState, setPreviewState] = useState<SetupAccountPreviewState>(() =>
    createInitialPreviewState(previewParams.case),
  );

  useEffect(() => {
    if (!previewParams.enabled) {
      return;
    }

    setPreviewState(createInitialPreviewState(previewParams.case));
  }, [previewParams.case, previewParams.enabled]);

  return useMemo(() => {
    if (!previewParams.enabled) {
      return null;
    }

    const setupState = buildPreviewSetupState(previewState);

    return {
      ...liveSession,
      accountAccessState: 'active',
      biometricAvailable: true,
      biometricLabel: Platform.OS === 'ios' ? 'Face ID' : 'biometría',
      biometricsEnabled: previewState.biometricsEnabled,
      canTrustCurrentDeviceWithoutPassword: false,
      currentDeviceId: PREVIEW_DEVICE_ID,
      deviceTrustState: previewState.trustedDevice ? 'trusted' : 'pending',
      email: PREVIEW_EMAIL,
      isEmailConfirmed: previewState.emailConfirmed,
      isLocked: false,
      isPasswordRecoverySession: false,
      isSignedIn: true,
      isTrustedDevice: previewState.trustedDevice,
      linkedMethods: {
        hasApple: false,
        hasEmailPassword: true,
        hasGoogle: true,
        hasPhone: false,
        providers: ['email', 'google'],
      },
      loadingStage: 'account',
      notificationsEnabled: false,
      profile: previewState.profile,
      profileCompletionState: previewState.profileComplete ? 'complete' : 'incomplete',
      requiresAccountActivation: false,
      requiresInvite: false,
      requiresProfileCompletion: !setupState.requiredComplete,
      setupState,
      status: 'signed_in_unlocked',
      trustedDevices: [],
      userId: PREVIEW_USER_ID,
      async completeProfile(input) {
        const phone = normalizePreviewPhone(input);

        setPreviewState((current) => ({
          ...current,
          profile: buildPreviewProfile({
            avatarPath: current.profile.avatar_path,
            displayName: input.fullName.trim(),
            ...phone,
          }),
          profileComplete: true,
        }));

        return 'Perfil actualizado.';
      },
      async refreshAccountState() {
        return undefined;
      },
      async resendEmailConfirmation() {
        return 'Preview QA: reenviamos el correo simulado.';
      },
      async setBiometricsEnabled(enabled) {
        setPreviewState((current) => ({
          ...current,
          biometricsEnabled: enabled,
        }));

        return {
          ok: true,
          message: enabled ? 'Biometria activada en preview.' : 'Biometria desactivada en preview.',
        };
      },
      async trustCurrentDevice() {
        setPreviewState((current) => ({
          ...current,
          trustedDevice: true,
        }));

        return 'Este telefono ahora es confiable.';
      },
      async verifyEmailOtp() {
        setPreviewState((current) => ({
          ...current,
          emailConfirmed: true,
        }));

        return 'Correo confirmado.';
      },
    };
  }, [liveSession, previewParams.enabled, previewState]);
}
