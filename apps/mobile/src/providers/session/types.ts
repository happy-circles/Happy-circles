import type { Session } from '@supabase/supabase-js';
import type { ContactsPermissionStatus } from '@/lib/contacts-permissions';
import type { NotificationPermissionStatus } from '@/lib/notifications';
import type { SetupStep } from '@/lib/setup-account';
import type { BiometricAuthResult } from '@/lib/security';
import type { Database } from '@happy-circles/shared';

export type SessionStatus =
  | 'loading'
  | 'signed_out'
  | 'signed_in_untrusted'
  | 'signed_in_unlocked'
  | 'signed_in_locked';
export type AuthMode = 'supabase';
export type AccountAccessState = 'loading' | 'needs_invite' | 'needs_activation' | 'active';
export type ProfileCompletionState = 'loading' | 'incomplete' | 'complete';
export type DeviceTrustState = 'loading' | 'unknown' | 'pending' | 'trusted' | 'revoked';
export type IdentityProvider = 'email' | 'google' | 'apple' | 'phone' | 'unknown';
export type TrustedDeviceAuthMethod = 'google' | 'apple' | 'password';
export type SetupPermissionStatus =
  | 'loading'
  | ContactsPermissionStatus
  | NotificationPermissionStatus;

export type UserProfileRow = Database['public']['Tables']['user_profiles']['Row'];
export type TrustedDeviceRow = Database['public']['Tables']['trusted_devices']['Row'];

export interface BiometricToggleResult {
  readonly ok: boolean;
  readonly message: string;
}

export interface AuthCallbackTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
}

export interface AuthIdentity {
  readonly provider?: string | null;
}

export interface LinkedMethods {
  readonly hasEmailPassword: boolean;
  readonly hasGoogle: boolean;
  readonly hasApple: boolean;
  readonly hasPhone: boolean;
  readonly providers: readonly string[];
}

export interface EmailPasswordCredentials {
  readonly email: string;
  readonly password: string;
}

export interface RegistrationInput extends EmailPasswordCredentials {
  readonly confirmPassword: string;
  readonly phoneCountryIso2: string;
  readonly phoneCountryCallingCode: string;
  readonly phoneNationalNumber: string;
}

export interface AccountRegistrationPreviewResult {
  readonly deliveryStatus?: string | null;
  readonly reason?: string | null;
  readonly status?: string | null;
}

export interface CompleteProfileInput {
  readonly fullName: string;
  readonly phoneCountryIso2: string;
  readonly phoneCountryCallingCode: string;
  readonly phoneNationalNumber: string;
}

export interface AttachEmailPasswordInput {
  readonly password: string;
  readonly confirmPassword: string;
}

export interface PasswordResetInput {
  readonly password: string;
  readonly confirmPassword: string;
}

export interface EmailOtpVerificationInput {
  readonly email: string;
  readonly code: string;
}

export interface TrustCurrentDeviceInput {
  readonly method?: TrustedDeviceAuthMethod;
  readonly password?: string;
}

export interface StepUpAuthInput {
  readonly force?: boolean;
  readonly password?: string;
}

export interface LinkSocialInput {
  readonly password?: string;
}

export interface RefreshAccountStateOptions {
  readonly preserveLocked?: boolean;
  readonly preserveTrustedDeviceDuringLoad?: boolean;
}

export interface RememberedAccountSnapshot {
  readonly userId: string;
  readonly displayName: string;
  readonly email: string | null;
  readonly avatarPath: string | null;
  readonly accountAccessState: Exclude<AccountAccessState, 'loading'>;
  readonly lastUsedAt: string;
}

export interface SetupState {
  readonly requiredComplete: boolean;
  readonly pendingRequiredSteps: readonly SetupStep[];
  readonly emailConfirmed: boolean;
  readonly securityPending: boolean;
  readonly biometricsEligible: boolean;
  readonly contactsPermissionStatus: SetupPermissionStatus;
  readonly notificationsPermissionStatus: SetupPermissionStatus;
}

export interface SessionContextValue {
  readonly authMode: AuthMode;
  readonly status: SessionStatus;
  readonly userId: string | null;
  readonly email: string | null;
  readonly isEmailConfirmed: boolean;
  readonly authProvider: IdentityProvider | null;
  readonly profile: UserProfileRow | null;
  readonly accountAccessState: AccountAccessState;
  readonly rememberedAccount: RememberedAccountSnapshot | null;
  readonly linkedMethods: LinkedMethods;
  readonly profileCompletionState: ProfileCompletionState;
  readonly setupState: SetupState;
  readonly deviceTrustState: DeviceTrustState;
  readonly trustedDevices: readonly TrustedDeviceRow[];
  readonly currentDeviceId: string | null;
  readonly stepUpFreshUntil: number | null;
  readonly biometricsEnabled: boolean;
  readonly notificationsEnabled: boolean;
  readonly biometricLabel: string;
  readonly biometricAvailable: boolean;
  readonly appleSignInAvailable: boolean;
  readonly isSignedIn: boolean;
  readonly isPasswordRecoverySession: boolean;
  readonly isLocked: boolean;
  readonly isTrustedDevice: boolean;
  readonly canTrustCurrentDeviceWithoutPassword: boolean;
  readonly requiresProfileCompletion: boolean;
  readonly requiresInvite: boolean;
  readonly requiresAccountActivation: boolean;
  requestPasswordReset(email: string): Promise<string>;
  resendEmailConfirmation(email?: string): Promise<string>;
  verifyEmailOtp(input: EmailOtpVerificationInput): Promise<string>;
  verifyPasswordRecoveryOtp(input: EmailOtpVerificationInput): Promise<string>;
  updatePassword(input: PasswordResetInput): Promise<string>;
  signInWithPassword(input: EmailPasswordCredentials): Promise<string>;
  registerAccount(input: RegistrationInput): Promise<string>;
  signInWithGoogle(): Promise<string>;
  signInWithApple(): Promise<string>;
  completeProfile(input: CompleteProfileInput): Promise<string>;
  linkGoogle(input?: LinkSocialInput): Promise<string>;
  linkApple(input?: LinkSocialInput): Promise<string>;
  attachEmailPassword(input: AttachEmailPasswordInput): Promise<string>;
  trustCurrentDevice(input?: TrustCurrentDeviceInput): Promise<string>;
  revokeTrustedDevice(deviceId: string): Promise<string>;
  readonly refreshAccountState: (options?: RefreshAccountStateOptions) => Promise<void>;
  signOut(): Promise<void>;
  unlock(): Promise<BiometricAuthResult>;
  lock(): void;
  stepUpAuth(input?: boolean | StepUpAuthInput): Promise<BiometricAuthResult>;
  setBiometricsEnabled(enabled: boolean): Promise<BiometricToggleResult>;
  setNotificationsEnabled(enabled: boolean): Promise<void>;
  requestContactsPermission(): Promise<string>;
  requestNotificationsPermission(): Promise<string>;
  clearRememberedAccount(): Promise<void>;
}

export type SessionLike = Pick<Session, 'user'> | null;
