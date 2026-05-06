import type { Session } from '@supabase/supabase-js';
import { derivePendingRequiredSetupSteps } from '@/lib/setup-account';
import type {
  AccountAccessState,
  DeviceTrustState,
  ProfileCompletionState,
  SessionStatus,
  TrustedDeviceRow,
  UserProfileRow,
} from './types';

export function deriveAccountAccessState(profile: UserProfileRow | null): AccountAccessState {
  if (!profile) {
    return 'loading';
  }

  if (profile.account_access_state === 'needs_invite') {
    return 'needs_invite';
  }

  if (profile.account_access_state === 'needs_activation') {
    return 'needs_activation';
  }

  return 'active';
}

export function isAuthUserEmailConfirmed(
  user: {
    readonly confirmed_at?: string | null;
    readonly email?: string | null;
    readonly email_confirmed_at?: string | null;
  } | null,
): boolean {
  if (!user?.email) {
    return false;
  }

  return Boolean(user.email_confirmed_at ?? user.confirmed_at);
}

export function isSessionEmailConfirmed(session: Session | null): boolean {
  return isAuthUserEmailConfirmed(session?.user ?? null);
}

export function deriveProfileCompletionState(
  profile: UserProfileRow | null,
  emailConfirmed: boolean,
): ProfileCompletionState {
  if (!profile) {
    return 'loading';
  }

  if (derivePendingRequiredSetupSteps(profile, emailConfirmed).length > 0) {
    return 'incomplete';
  }

  return 'complete';
}

export function deriveDeviceTrustState(row: TrustedDeviceRow | null): DeviceTrustState {
  if (!row) {
    return 'unknown';
  }

  if (row.trust_state === 'trusted') {
    return 'trusted';
  }

  if (row.trust_state === 'revoked') {
    return 'revoked';
  }

  return 'pending';
}

export function resolveStatusAfterAccountLoad(input: {
  readonly hasSession: boolean;
  readonly biometricsEnabled: boolean;
  readonly deviceTrustState: DeviceTrustState;
  readonly initialLock: boolean;
  readonly preserveLocked: boolean;
}): SessionStatus {
  if (!input.hasSession) {
    return 'signed_out';
  }

  if (input.deviceTrustState !== 'trusted') {
    return 'signed_in_untrusted';
  }

  if (input.biometricsEnabled && (input.initialLock || input.preserveLocked)) {
    return 'signed_in_locked';
  }

  return 'signed_in_unlocked';
}
