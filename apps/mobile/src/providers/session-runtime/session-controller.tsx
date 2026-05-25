import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Linking from 'expo-linking';
import { AppState, Platform } from 'react-native';
import {
  attachEmailPasswordSchema,
  completeProfileSchema,
  emailOtpVerificationSchema,
  emailPasswordSignInSchema,
  passwordResetRequestSchema,
  passwordResetSchema,
  registrationSchema,
} from '@happy-circles/shared';

import {
  getCurrentAppVersion,
  getCurrentDeviceName,
  getOrCreateDeviceId,
} from '@/lib/device-trust';
import { buildPhoneE164, normalizeCallingCode, normalizePhoneDigits } from '@/lib/phone';
import {
  getBiometricSupport,
  authenticateWithBiometrics,
  authenticateWithBiometricsResult,
  type BiometricAuthResult,
} from '@/lib/security';
import {
  getContactsPermissionStatus,
  requestContactsPermissionStatus,
} from '@/lib/contacts-permissions';
import { isLowQualityDisplayName } from '@/lib/setup-account';
import { recordProductEventSafe } from '@/lib/analytics-client';
import { buildEmailAuthRedirect } from '@/lib/auth-redirects';
import { appConfig } from '@/lib/config';
import { readPendingInviteIntent } from '@/lib/invite-intent';
import { prefetchAppSnapshot } from '@/lib/live-data/app-snapshot-prefetch';
import { getStoredItem, removeStoredItem, setStoredItem } from '@/lib/storage';
import {
  getLocalNotificationPermissionStatus,
  requestLocalNotificationPermissionStatus,
} from '@/lib/notifications';
import { supabase } from '@/lib/supabase';
import {
  createSupportId,
  readFunctionErrorDetails,
  reportClientErrorSafe,
  withSupportCode,
} from '@/lib/support-errors';
import {
  extractAuthCallbackCode,
  extractAuthCallbackTokens,
  isAppAuthCallbackUrl,
  isPasswordRecoveryCallbackUrl,
} from '../session/auth-callbacks';
import { performNativeAppleAuth } from './apple-native-auth';
import { traceAuthDebugEvent } from './auth-debug';
import { performGoogleAuthFlow } from './google-auth-flow';
import { reportSocialAuthFailure } from './social-auth-reporting';
import {
  hashInviteTokenForRegistration,
  normalizeStepUpAuthInput,
  resolveUserIdentities,
  revokeDuplicateActiveDeviceRows,
} from './session-controller-helpers';
import {
  deriveAccountAccessState,
  deriveDeviceTrustState,
  deriveProfileCompletionState,
  isAuthUserEmailConfirmed,
  isSessionEmailConfirmed,
  resolveStatusAfterAccountLoad,
} from '../session/account-state';
import {
  formatSupabaseAuthErrorMessage,
  formatValidationMessage,
  readErrorMessage,
} from '../session/auth-errors';
import {
  BIOMETRICS_KEY,
  EMPTY_LINKED_METHODS,
  EMPTY_SETUP_STATE,
  LOCK_AFTER_MS,
  NOTIFICATIONS_KEY,
  REMEMBERED_ACCOUNT_KEY,
  STEP_UP_WINDOW_MS,
} from '../session/constants';
import { deriveLinkedMethods, normalizeIdentityProvider } from '../session/linked-methods';
import {
  persistRememberedAccountSnapshot,
  readRememberedAccountSnapshot,
} from '../session/remembered-account';
import {
  createRecentPasswordAuth,
  isRecentPasswordAuthValid,
  type RecentPasswordAuth,
} from '../session/recent-password-auth';
import { buildSetupState } from '../session/setup-state';
import { formatStepUpErrorMessage, wait } from '../session/step-up';
import type {
  AccountAccessState,
  AccountRegistrationPreviewResult,
  AttachEmailPasswordInput,
  AuthMode,
  BiometricToggleResult,
  CompleteProfileInput,
  DeviceTrustState,
  EmailOtpVerificationInput,
  EmailPasswordCredentials,
  IdentityProvider,
  LinkSocialInput,
  LinkedMethods,
  PasswordResetInput,
  ProfileCompletionState,
  RefreshAccountStateOptions,
  RegistrationInput,
  RememberedAccountSnapshot,
  SessionContextValue,
  SessionStatus,
  SetupPermissionStatus,
  SetupState,
  StepUpAuthInput,
  TrustCurrentDeviceInput,
  TrustedDeviceRow,
  UserProfileRow,
} from '../session/types';

export function useSessionController(): SessionContextValue {
  const authMode: AuthMode = 'supabase';

  const [status, setStatusState] = useState<SessionStatus>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfileRow | null>(null);
  const [isEmailConfirmed, setIsEmailConfirmed] = useState(false);
  const [accountAccessState, setAccountAccessState] = useState<AccountAccessState>('loading');
  const [rememberedAccount, setRememberedAccount] = useState<RememberedAccountSnapshot | null>(
    null,
  );
  const [linkedMethods, setLinkedMethods] = useState<LinkedMethods>(EMPTY_LINKED_METHODS);
  const [profileCompletionState, setProfileCompletionState] =
    useState<ProfileCompletionState>('loading');
  const [deviceTrustState, setDeviceTrustState] = useState<DeviceTrustState>('loading');
  const [trustedDevices, setTrustedDevices] = useState<readonly TrustedDeviceRow[]>([]);
  const [currentDeviceId, setCurrentDeviceId] = useState<string | null>(null);
  const [authProvider, setAuthProvider] = useState<IdentityProvider | null>(null);
  const [stepUpFreshUntil, setStepUpFreshUntil] = useState<number | null>(null);
  const [recentPasswordAuth, setRecentPasswordAuth] = useState<RecentPasswordAuth | null>(null);
  const [biometricsEnabled, setBiometricsEnabledState] = useState(false);
  const [notificationsEnabled, setNotificationsEnabledState] = useState(false);
  const [contactsPermissionStatus, setContactsPermissionStatus] =
    useState<SetupPermissionStatus>('loading');
  const [notificationsPermissionStatus, setNotificationsPermissionStatus] =
    useState<SetupPermissionStatus>('loading');
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState('biometría');
  const [appleSignInAvailable, setAppleSignInAvailable] = useState(false);
  const [passwordRecoverySessionUserId, setPasswordRecoverySessionUserIdState] = useState<
    string | null
  >(null);
  const [hydrated, setHydrated] = useState(false);

  const backgroundedAtRef = useRef<number | null>(null);
  const accountLoadIdRef = useRef(0);
  const authCallbackAppliedUrlsRef = useRef(new Set<string>());
  const authCallbackUrlsInFlightRef = useRef(new Map<string, Promise<boolean>>());
  const sessionRef = useRef<Session | null>(null);
  const statusRef = useRef<SessionStatus>('loading');
  const passwordRecoverySessionUserIdRef = useRef<string | null>(null);
  const welcomeEmailAttemptedUserIdsRef = useRef(new Set<string>());

  const setSessionStatus = useCallback((nextStatus: SessionStatus) => {
    statusRef.current = nextStatus;
    setStatusState(nextStatus);
  }, []);

  const setPasswordRecoverySessionUserId = useCallback((userId: string | null) => {
    passwordRecoverySessionUserIdRef.current = userId;
    setPasswordRecoverySessionUserIdState(userId);
  }, []);

  const clearSignedInState = useCallback(() => {
    accountLoadIdRef.current += 1;
    sessionRef.current = null;
    setPasswordRecoverySessionUserId(null);
    setSession(null);
    setProfile(null);
    setIsEmailConfirmed(false);
    setAccountAccessState('loading');
    setLinkedMethods(EMPTY_LINKED_METHODS);
    setProfileCompletionState('loading');
    setDeviceTrustState('unknown');
    setTrustedDevices([]);
    setCurrentDeviceId(null);
    setAuthProvider(null);
    setStepUpFreshUntil(null);
    setRecentPasswordAuth(null);
    welcomeEmailAttemptedUserIdsRef.current.clear();
  }, [setPasswordRecoverySessionUserId]);

  const refreshNativePermissionStatuses = useCallback(async () => {
    const [nextContactsPermissionStatus, nextNotificationsPermissionStatus] = await Promise.all([
      getContactsPermissionStatus(),
      getLocalNotificationPermissionStatus(),
    ]);

    setContactsPermissionStatus(nextContactsPermissionStatus);
    setNotificationsPermissionStatus(nextNotificationsPermissionStatus);
  }, []);

  const applySessionFromUrl = useCallback(
    async (url: string | null): Promise<boolean> => {
      if (!supabase || !url) {
        traceAuthDebugEvent({
          metadata: { hasSupabaseClient: Boolean(supabase), hasUrl: Boolean(url) },
          provider: 'supabase',
          result: 'skipped',
          source: 'session_callback',
          stage: 'callback_unavailable',
        });
        return false;
      }

      if (!isAppAuthCallbackUrl(url, appConfig.appWebOrigin)) {
        traceAuthDebugEvent({
          provider: 'supabase',
          reason: 'not_app_auth_callback',
          result: 'skipped',
          source: 'session_callback',
          stage: 'callback_ignored',
        });
        return false;
      }

      if (authCallbackAppliedUrlsRef.current.has(url)) {
        traceAuthDebugEvent({
          provider: 'supabase',
          reason: 'callback_already_applied',
          result: 'skipped',
          source: 'session_callback',
          stage: 'callback_duplicate',
        });
        return true;
      }

      const inFlightCallback = authCallbackUrlsInFlightRef.current.get(url);
      if (inFlightCallback) {
        traceAuthDebugEvent({
          provider: 'supabase',
          reason: 'callback_in_flight',
          result: 'skipped',
          source: 'session_callback',
          stage: 'callback_duplicate',
        });
        return inFlightCallback;
      }

      const callbackPromise = (async () => {
        const isPasswordRecoveryCallback = isPasswordRecoveryCallbackUrl(url);
        const authCode = extractAuthCallbackCode(url);
        if (authCode) {
          traceAuthDebugEvent({
            metadata: { passwordRecovery: isPasswordRecoveryCallback },
            mode: isPasswordRecoveryCallback ? 'password-recovery' : 'sign-in',
            provider: 'supabase',
            result: 'started',
            source: 'session_callback',
            stage: 'exchange_code_for_session',
          });
          const { data, error } = await supabase.auth.exchangeCodeForSession(authCode);

          if (error) {
            traceAuthDebugEvent({
              message: error.message,
              mode: isPasswordRecoveryCallback ? 'password-recovery' : 'sign-in',
              provider: 'supabase',
              reason: 'supabase_error',
              result: 'failed',
              source: 'session_callback',
              stage: 'exchange_code_for_session',
            });
            reportClientErrorSafe({
              error,
              errorCode: 'auth_callback_exchange_code',
              errorMessage: error.message,
              fatal: false,
              kind: 'client_action',
              metadata: {
                operation: 'exchange_code_for_session',
                reason: 'supabase_error',
                result: 'failed',
                source: 'auth_callback',
              },
            });
            console.warn(
              'Failed to exchange Supabase auth code from auth callback',
              error instanceof Error ? error.message : String(error),
            );
            return false;
          } else if (isPasswordRecoveryCallback && data.session) {
            setPasswordRecoverySessionUserId(data.session.user.id);
          }

          traceAuthDebugEvent({
            metadata: {
              hasSession: Boolean(data.session),
              passwordRecovery: isPasswordRecoveryCallback,
            },
            mode: isPasswordRecoveryCallback ? 'password-recovery' : 'sign-in',
            provider: 'supabase',
            result: 'succeeded',
            source: 'session_callback',
            stage: 'exchange_code_for_session',
          });
          return true;
        }

        const tokens = extractAuthCallbackTokens(url);
        if (!tokens) {
          traceAuthDebugEvent({
            provider: 'supabase',
            reason: 'missing_code_or_tokens',
            result: 'skipped',
            source: 'session_callback',
            stage: 'callback_without_credentials',
          });
          return false;
        }

        traceAuthDebugEvent({
          metadata: { passwordRecovery: isPasswordRecoveryCallback },
          mode: isPasswordRecoveryCallback ? 'password-recovery' : 'sign-in',
          provider: 'supabase',
          result: 'started',
          source: 'session_callback',
          stage: 'set_session_from_tokens',
        });
        const { data, error } = await supabase.auth.setSession({
          access_token: tokens.accessToken,
          refresh_token: tokens.refreshToken,
        });

        if (error) {
          traceAuthDebugEvent({
            message: error.message,
            mode: isPasswordRecoveryCallback ? 'password-recovery' : 'sign-in',
            provider: 'supabase',
            reason: 'supabase_error',
            result: 'failed',
            source: 'session_callback',
            stage: 'set_session_from_tokens',
          });
          reportClientErrorSafe({
            error,
            errorCode: 'auth_callback_set_session',
            errorMessage: error.message,
            fatal: false,
            kind: 'client_action',
            metadata: {
              operation: 'set_session_from_callback',
              reason: 'supabase_error',
              result: 'failed',
              source: 'auth_callback',
            },
          });
          console.warn(
            'Failed to restore Supabase session from auth callback',
            error instanceof Error ? error.message : String(error),
          );
          return false;
        } else if (isPasswordRecoveryCallback && data.session) {
          setPasswordRecoverySessionUserId(data.session.user.id);
        }

        traceAuthDebugEvent({
          metadata: {
            hasSession: Boolean(data.session),
            passwordRecovery: isPasswordRecoveryCallback,
          },
          mode: isPasswordRecoveryCallback ? 'password-recovery' : 'sign-in',
          provider: 'supabase',
          result: 'succeeded',
          source: 'session_callback',
          stage: 'set_session_from_tokens',
        });
        return true;
      })();

      authCallbackUrlsInFlightRef.current.set(url, callbackPromise);
      try {
        const callbackApplied = await callbackPromise;
        if (callbackApplied) {
          authCallbackAppliedUrlsRef.current.add(url);
          const oldestUrl = authCallbackAppliedUrlsRef.current.values().next().value;
          if (authCallbackAppliedUrlsRef.current.size > 8 && oldestUrl) {
            authCallbackAppliedUrlsRef.current.delete(oldestUrl);
          }
        }
        return callbackApplied;
      } finally {
        authCallbackUrlsInFlightRef.current.delete(url);
      }
    },
    [setPasswordRecoverySessionUserId],
  );

  const loadAccountState = useCallback(
    async (
      nextSession: Session,
      options: {
        readonly initialLock: boolean;
        readonly preserveLocked: boolean;
        readonly preserveTrustedDeviceDuringLoad: boolean;
        readonly biometricPreference?: boolean;
        readonly setSessionStatusLoading?: boolean;
      },
    ) => {
      if (!supabase) {
        return;
      }
      const client = supabase;

      const loadId = accountLoadIdRef.current + 1;
      accountLoadIdRef.current = loadId;
      const shouldPreserveLockedStatus =
        options.preserveLocked && statusRef.current === 'signed_in_locked';
      const shouldSetSessionStatusLoading = options.setSessionStatusLoading ?? true;

      if (!shouldPreserveLockedStatus && shouldSetSessionStatusLoading) {
        setSessionStatus('loading');
      }

      setProfileCompletionState('loading');
      setDeviceTrustState((current) =>
        options.preserveTrustedDeviceDuringLoad && current === 'trusted' ? 'trusted' : 'loading',
      );
      setAuthProvider(normalizeIdentityProvider(nextSession.user.app_metadata?.provider ?? null));

      const deviceId = await getOrCreateDeviceId();
      const timestamp = new Date().toISOString();
      const devicePatch = {
        platform: Platform.OS,
        device_name: getCurrentDeviceName(),
        app_version: getCurrentAppVersion(),
        last_seen_at: timestamp,
      };
      const devicePayload = {
        user_id: nextSession.user.id,
        device_id: deviceId,
        ...devicePatch,
      };

      async function persistCurrentDevice(): Promise<TrustedDeviceRow> {
        const existingResult = await client
          .from('trusted_devices')
          .select('*')
          .eq('user_id', nextSession.user.id)
          .eq('device_id', deviceId)
          .maybeSingle();

        if (existingResult.error) {
          throw new Error(existingResult.error.message);
        }

        const existingDevice = existingResult.data as TrustedDeviceRow | null;

        if (existingDevice) {
          const updateResult = await client
            .from('trusted_devices')
            .update(devicePatch as never)
            .eq('id', existingDevice.id)
            .select('*')
            .single();

          if (updateResult.error) {
            throw new Error(updateResult.error.message);
          }

          return updateResult.data as TrustedDeviceRow;
        }

        const insertResult = await client
          .from('trusted_devices')
          .insert(devicePayload as never)
          .select('*')
          .single();

        if (!insertResult.error) {
          return insertResult.data as TrustedDeviceRow;
        }

        if (!insertResult.error.message.includes('duplicate key')) {
          throw new Error(insertResult.error.message);
        }

        const retryUpdateResult = await client
          .from('trusted_devices')
          .update(devicePatch as never)
          .eq('user_id', nextSession.user.id)
          .eq('device_id', deviceId)
          .select('*')
          .single();

        if (retryUpdateResult.error) {
          throw new Error(retryUpdateResult.error.message);
        }

        return retryUpdateResult.data as TrustedDeviceRow;
      }

      const [profileResult, identities, currentDevice, pendingInviteIntent, authUserResult] =
        await Promise.all([
          client
            .from('user_profiles')
            .select(
              'id, email, display_name, avatar_path, account_access_state, invited_by_user_id, activated_via_account_invite_id, activated_at, phone_country_iso2, phone_country_calling_code, phone_national_number, phone_e164, phone_verified_at, created_at, updated_at, deleted_at, deletion_requested_at, onboarding_completed_at, welcome_email_last_error, welcome_email_queued_at, welcome_email_sent_at',
            )
            .eq('id', nextSession.user.id)
            .single(),
          resolveUserIdentities(client, nextSession),
          persistCurrentDevice(),
          readPendingInviteIntent(),
          client.auth.getUser(),
        ]);

      if (profileResult.error) {
        throw new Error(profileResult.error.message);
      }

      if (authUserResult.error) {
        throw new Error(authUserResult.error.message);
      }

      const nextProfile = profileResult.data;
      const nextEmailConfirmed = isAuthUserEmailConfirmed(
        authUserResult.data.user ?? nextSession.user,
      );
      const nextAccountAccessState =
        deriveAccountAccessState(nextProfile) === 'needs_invite' &&
        pendingInviteIntent?.type === 'account_invite'
          ? 'needs_activation'
          : deriveAccountAccessState(nextProfile);
      const nextLinkedMethods = deriveLinkedMethods({
        session: nextSession,
        profile: nextProfile,
        identities,
      });
      const nextDeviceTrustState = deriveDeviceTrustState(currentDevice);
      const nextProfileCompletionState = deriveProfileCompletionState(
        nextProfile,
        nextEmailConfirmed,
      );

      if (currentDevice.trust_state === 'trusted') {
        try {
          await revokeDuplicateActiveDeviceRows({
            client,
            currentDeviceId: deviceId,
            deviceName: currentDevice.device_name,
            platform: currentDevice.platform,
            timestamp,
            userId: nextSession.user.id,
          });
        } catch (error) {
          console.warn(
            'Failed to revoke duplicate trusted devices during account load',
            error instanceof Error ? error.message : String(error),
          );
        }
      }

      if (
        loadId === accountLoadIdRef.current &&
        nextAccountAccessState === 'active' &&
        nextEmailConfirmed &&
        nextProfileCompletionState === 'complete' &&
        nextDeviceTrustState === 'trusted'
      ) {
        void prefetchAppSnapshot(nextSession.user.id).catch(() => undefined);
      }

      const devicesResult = await client
        .from('trusted_devices')
        .select('*')
        .eq('user_id', nextSession.user.id)
        .neq('trust_state', 'revoked')
        .order('created_at', { ascending: false });

      if (devicesResult.error) {
        throw new Error(devicesResult.error.message);
      }

      if (loadId !== accountLoadIdRef.current) {
        return;
      }

      sessionRef.current = nextSession;
      setSession(nextSession);
      setProfile(nextProfile);
      setIsEmailConfirmed(nextEmailConfirmed);
      setAccountAccessState(nextAccountAccessState);
      setLinkedMethods(nextLinkedMethods);
      setProfileCompletionState(nextProfileCompletionState);
      setDeviceTrustState(nextDeviceTrustState);
      setTrustedDevices(devicesResult.data ?? []);
      setCurrentDeviceId(deviceId);
      void persistRememberedAccountSnapshot(nextProfile).then((snapshot) => {
        if (loadId === accountLoadIdRef.current) {
          setRememberedAccount(
            snapshot
              ? {
                  ...snapshot,
                  accountAccessState:
                    nextAccountAccessState === 'loading' ? 'needs_invite' : nextAccountAccessState,
                }
              : null,
          );
        }
      });
      setSessionStatus(
        resolveStatusAfterAccountLoad({
          hasSession: true,
          biometricsEnabled: options.biometricPreference ?? biometricsEnabled,
          deviceTrustState: nextDeviceTrustState,
          initialLock: options.initialLock,
          preserveLocked: options.preserveLocked && statusRef.current === 'signed_in_locked',
        }),
      );
    },
    [biometricsEnabled, setSessionStatus],
  );

  const refreshAccountState = useCallback(
    async (options?: RefreshAccountStateOptions) => {
      if (!supabase) {
        return;
      }

      const { data } = await supabase.auth.getSession();
      const nextSession = data.session;

      if (!nextSession) {
        clearSignedInState();
        setSessionStatus('signed_out');
        return;
      }

      await loadAccountState(nextSession, {
        initialLock: false,
        preserveLocked: options?.preserveLocked ?? statusRef.current === 'signed_in_locked',
        preserveTrustedDeviceDuringLoad: options?.preserveTrustedDeviceDuringLoad ?? false,
        biometricPreference: biometricsEnabled,
        setSessionStatusLoading: false,
      });
    },
    [biometricsEnabled, clearSignedInState, loadAccountState, setSessionStatus],
  );

  useEffect(() => {
    let active = true;

    async function hydrate() {
      const [
        biometricValue,
        notificationValue,
        support,
        appleAvailable,
        nextContactsPermissionStatus,
        nextNotificationsPermissionStatus,
        rememberedSnapshot,
      ] = await Promise.all([
        getStoredItem(BIOMETRICS_KEY),
        getStoredItem(NOTIFICATIONS_KEY),
        getBiometricSupport(),
        Platform.OS === 'ios'
          ? AppleAuthentication.isAvailableAsync().catch(() => false)
          : Promise.resolve(false),
        getContactsPermissionStatus(),
        getLocalNotificationPermissionStatus(),
        readRememberedAccountSnapshot(),
      ]);

      if (!active) {
        return;
      }

      const nextBiometricsEnabled = biometricValue === 'true';
      const nextNotificationsEnabled = notificationValue === 'true';

      setBiometricsEnabledState(nextBiometricsEnabled);
      setNotificationsEnabledState(nextNotificationsEnabled);
      setBiometricAvailable(support.available);
      setBiometricLabel(support.label);
      setAppleSignInAvailable(appleAvailable);
      setContactsPermissionStatus(nextContactsPermissionStatus);
      setNotificationsPermissionStatus(nextNotificationsPermissionStatus);
      setRememberedAccount(rememberedSnapshot);

      if (!supabase) {
        clearSignedInState();
        setSessionStatus('signed_out');
        setHydrated(true);
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (!active) {
        return;
      }

      const nextSession = data.session;
      if (!nextSession) {
        clearSignedInState();
        setRememberedAccount(rememberedSnapshot);
        setSessionStatus('signed_out');
        setHydrated(true);
        return;
      }

      try {
        await loadAccountState(nextSession, {
          initialLock: nextBiometricsEnabled,
          preserveLocked: false,
          preserveTrustedDeviceDuringLoad: false,
          biometricPreference: nextBiometricsEnabled,
          setSessionStatusLoading: true,
        });
      } catch (error) {
        console.warn(
          'Failed to hydrate account state',
          error instanceof Error ? error.message : String(error),
        );
        clearSignedInState();
        setSessionStatus('signed_out');
      }

      if (active) {
        setHydrated(true);
      }
    }

    void hydrate();

    return () => {
      active = false;
    };
  }, [clearSignedInState, loadAccountState]);

  useEffect(() => {
    if (!supabase || !hydrated) {
      return;
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!nextSession) {
        clearSignedInState();
        setSessionStatus('signed_out');
        return;
      }

      if (event === 'PASSWORD_RECOVERY') {
        setPasswordRecoverySessionUserId(nextSession.user.id);
      } else if (
        event === 'SIGNED_IN' &&
        passwordRecoverySessionUserIdRef.current !== nextSession.user.id
      ) {
        setPasswordRecoverySessionUserId(null);
      }

      void loadAccountState(nextSession, {
        initialLock: false,
        preserveLocked: event !== 'SIGNED_IN' && statusRef.current === 'signed_in_locked',
        preserveTrustedDeviceDuringLoad: event !== 'SIGNED_IN',
        biometricPreference: biometricsEnabled,
        setSessionStatusLoading: false,
      }).catch((error) => {
        console.warn(
          'Failed to refresh account state after auth change',
          error instanceof Error ? error.message : String(error),
        );
      });
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [
    biometricsEnabled,
    clearSignedInState,
    hydrated,
    loadAccountState,
    setPasswordRecoverySessionUserId,
    setSessionStatus,
  ]);

  useEffect(() => {
    if (!supabase || !hydrated) {
      return;
    }

    void Linking.getInitialURL().then((url) => applySessionFromUrl(url));

    const subscription = Linking.addEventListener('url', ({ url }) => {
      void applySessionFromUrl(url);
    });

    return () => {
      subscription.remove();
    };
  }, [applySessionFromUrl, hydrated]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'inactive' || nextState === 'background') {
        backgroundedAtRef.current = Date.now();
        return;
      }

      if (nextState === 'active') {
        void refreshNativePermissionStatuses();
        const backgroundedAt = backgroundedAtRef.current;
        backgroundedAtRef.current = null;

        if (
          biometricsEnabled &&
          status === 'signed_in_unlocked' &&
          backgroundedAt &&
          Date.now() - backgroundedAt >= LOCK_AFTER_MS
        ) {
          setSessionStatus('signed_in_locked');
          setStepUpFreshUntil(null);
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [biometricsEnabled, refreshNativePermissionStatuses, setSessionStatus, status]);

  useEffect(() => {
    if (!recentPasswordAuth) {
      return;
    }

    const timeoutMs = Math.max(0, recentPasswordAuth.expiresAt - Date.now());
    const timer = setTimeout(() => {
      setRecentPasswordAuth((current) => (current === recentPasswordAuth ? null : current));
    }, timeoutMs);

    return () => clearTimeout(timer);
  }, [recentPasswordAuth]);

  useEffect(() => {
    if (!stepUpFreshUntil) {
      return;
    }

    const timeoutMs = Math.max(0, stepUpFreshUntil - Date.now());
    const timer = setTimeout(() => {
      setStepUpFreshUntil((current) => (current === stepUpFreshUntil ? null : current));
    }, timeoutMs);

    return () => clearTimeout(timer);
  }, [stepUpFreshUntil]);

  const performGoogleAuth = useCallback(
    async (
      mode: 'sign-in' | 'link',
    ): Promise<{ readonly message: string; readonly userId: string | null }> => {
      if (!supabase) {
        return {
          message: 'El servicio de acceso no está disponible en este momento.',
          userId: null,
        };
      }

      return performGoogleAuthFlow({
        applySessionFromUrl,
        client: supabase,
        mode,
        platform: Platform.OS,
      });
    },
    [applySessionFromUrl],
  );

  const performAppleAuth = useCallback(
    async (
      mode: 'sign-in' | 'link',
    ): Promise<{ readonly message: string; readonly userId: string | null }> => {
      if (Platform.OS !== 'ios') {
        return {
          message: 'Apple solo está disponible en iPhone.',
          userId: null,
        };
      }

      if (!supabase) {
        return {
          message: 'El servicio de acceso no está disponible en este momento.',
          userId: null,
        };
      }

      return performNativeAppleAuth({
        client: supabase,
        mode,
        reportFailure: (failure) =>
          reportSocialAuthFailure({
            ...failure,
            mode,
          }),
      });
    },
    [],
  );

  const signInWithPassword = useCallback(async (input: EmailPasswordCredentials) => {
    try {
      const parsed = emailPasswordSignInSchema.parse(input);
      const normalizedEmail = parsed.email.trim().toLocaleLowerCase('en-US');

      if (!supabase) {
        return 'El servicio de acceso no está disponible en este momento.';
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password: parsed.password,
      });

      if (error) {
        return formatSupabaseAuthErrorMessage(error.message);
      }

      if (data.user?.id) {
        setRecentPasswordAuth(createRecentPasswordAuth(data.user.id));
        setStepUpFreshUntil(Date.now() + STEP_UP_WINDOW_MS);
      }

      return 'Sesión iniciada.';
    } catch (error) {
      return formatValidationMessage(error);
    }
  }, []);

  const registerAccount = useCallback(async (input: RegistrationInput) => {
    try {
      const parsed = registrationSchema.parse(input);
      const normalizedEmail = parsed.email.trim().toLocaleLowerCase('en-US');
      const phoneCountryCallingCode = normalizeCallingCode(parsed.phoneCountryCallingCode);
      const phoneNationalNumber = normalizePhoneDigits(parsed.phoneNationalNumber);
      const phoneE164 = buildPhoneE164(phoneCountryCallingCode, phoneNationalNumber);
      const pendingIntent = await readPendingInviteIntent();

      if (!supabase) {
        return 'El servicio de acceso no está disponible en este momento.';
      }

      if (pendingIntent?.type !== 'account_invite') {
        return 'Necesitas una invitación válida para crear una cuenta nueva.';
      }

      const supportId = createSupportId();
      const registrationPreview = await supabase.functions.invoke<AccountRegistrationPreviewResult>(
        'get-account-invite-preview-public',
        {
          body: {
            deliveryToken: pendingIntent.token,
            recordAppOpen: false,
          },
          headers: {
            'x-client-info': 'happy-circles-mobile',
            'x-request-id': supportId,
          },
        },
      );

      if (registrationPreview.error) {
        const details = await readFunctionErrorDetails(registrationPreview.error);
        return formatSupabaseAuthErrorMessage(
          withSupportCode(
            details.message || readErrorMessage(registrationPreview.error),
            supportId,
          ),
        );
      }

      if (
        !registrationPreview.data ||
        registrationPreview.data.status !== 'pending_activation' ||
        registrationPreview.data.deliveryStatus !== 'issued'
      ) {
        return 'Esta invitación ya fue usada o ya no está disponible.';
      }

      const accountInviteDeliveryTokenHash = await hashInviteTokenForRegistration(
        pendingIntent.token,
      );
      const redirectTo = buildEmailAuthRedirect('/setup-account?step=profile');
      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password: parsed.password,
        options: {
          data: {
            account_invite_delivery_token_hash: accountInviteDeliveryTokenHash,
            phone_country_iso2: parsed.phoneCountryIso2.trim().toUpperCase(),
            phone_country_calling_code: phoneCountryCallingCode,
            phone_national_number: phoneNationalNumber,
            phone_e164: phoneE164,
          },
          emailRedirectTo: redirectTo,
        },
      });

      if (error) {
        return formatSupabaseAuthErrorMessage(error.message);
      }

      if (data.session) {
        setRecentPasswordAuth(createRecentPasswordAuth(data.session.user.id));
        setStepUpFreshUntil(Date.now() + STEP_UP_WINDOW_MS);
        return 'Cuenta creada. Ahora completa tu configuración.';
      }

      return 'Cuenta creada. Revisa tu correo.';
    } catch (error) {
      return formatValidationMessage(error);
    }
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const result = await performGoogleAuth('sign-in');
    if (result.userId) {
      setStepUpFreshUntil(Date.now() + STEP_UP_WINDOW_MS);
    }
    return result.message;
  }, [performGoogleAuth]);

  const signInWithApple = useCallback(async () => {
    const result = await performAppleAuth('sign-in');
    if (result.userId) {
      setStepUpFreshUntil(Date.now() + STEP_UP_WINDOW_MS);
    }
    return result.message;
  }, [performAppleAuth]);

  const requestPasswordReset = useCallback(async (email: string) => {
    try {
      const parsed = passwordResetRequestSchema.parse({ email });
      const normalizedEmail = parsed.email.trim().toLocaleLowerCase('en-US');

      if (!supabase) {
        return 'El servicio de acceso no está disponible en este momento.';
      }

      const redirectTo = buildEmailAuthRedirect('/reset-password');
      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo,
      });

      if (error) {
        return formatSupabaseAuthErrorMessage(error.message);
      }

      return 'Si el correo existe, enviamos un enlace para restablecer la contraseña.';
    } catch (error) {
      return formatValidationMessage(error);
    }
  }, []);

  const resendEmailConfirmation = useCallback(
    async (emailInput?: string) => {
      if (!supabase) {
        return 'El servicio de acceso no está disponible en este momento.';
      }

      const email = (emailInput ?? sessionRef.current?.user.email)
        ?.trim()
        .toLocaleLowerCase('en-US');
      if (!email) {
        return 'Escribe el correo para reenviar la confirmación.';
      }

      if (sessionRef.current && isSessionEmailConfirmed(sessionRef.current)) {
        await refreshAccountState({ preserveTrustedDeviceDuringLoad: true });
        return 'Tu correo ya está confirmado.';
      }

      const redirectTo = buildEmailAuthRedirect('/setup-account?step=email');
      const { error } = await supabase.auth.resend({
        email,
        options: {
          emailRedirectTo: redirectTo,
        },
        type: 'signup',
      });

      if (error) {
        return formatSupabaseAuthErrorMessage(error.message);
      }

      return 'Enviamos un nuevo correo de confirmación. Puedes abrir el enlace o copiar el código de 8 dígitos.';
    },
    [refreshAccountState],
  );

  const verifyEmailOtp = useCallback(
    async (input: EmailOtpVerificationInput) => {
      try {
        const parsed = emailOtpVerificationSchema.parse(input);
        const normalizedEmail = parsed.email.trim().toLocaleLowerCase('en-US');
        const token = parsed.code.trim();

        if (!supabase) {
          return 'El servicio de acceso no está disponible en este momento.';
        }

        const { error } = await supabase.auth.verifyOtp({
          email: normalizedEmail,
          token,
          type: 'signup',
        });

        if (error) {
          return formatSupabaseAuthErrorMessage(error.message);
        }

        await refreshAccountState({
          preserveLocked: false,
          preserveTrustedDeviceDuringLoad: true,
        });
        return 'Correo confirmado.';
      } catch (error) {
        return formatValidationMessage(error);
      }
    },
    [refreshAccountState],
  );

  const verifyPasswordRecoveryOtp = useCallback(
    async (input: EmailOtpVerificationInput) => {
      try {
        const parsed = emailOtpVerificationSchema.parse(input);
        const normalizedEmail = parsed.email.trim().toLocaleLowerCase('en-US');
        const token = parsed.code.trim();

        if (!supabase) {
          return 'El servicio de acceso no está disponible en este momento.';
        }

        const { data, error } = await supabase.auth.verifyOtp({
          email: normalizedEmail,
          token,
          type: 'recovery',
        });

        if (error) {
          return formatSupabaseAuthErrorMessage(error.message);
        }

        const nextSession = data.session ?? (await supabase.auth.getSession()).data.session;
        if (!nextSession) {
          return 'Código verificado, pero no pudimos abrir la sesión de recuperación. Pide un enlace nuevo.';
        }

        setPasswordRecoverySessionUserId(nextSession.user.id);
        await refreshAccountState({ preserveLocked: false });
        return 'Código verificado.';
      } catch (error) {
        return formatValidationMessage(error);
      }
    },
    [refreshAccountState, setPasswordRecoverySessionUserId],
  );

  const updatePassword = useCallback(
    async (input: PasswordResetInput) => {
      try {
        const parsed = passwordResetSchema.parse(input);

        if (
          !supabase ||
          !sessionRef.current ||
          passwordRecoverySessionUserIdRef.current !== sessionRef.current.user.id
        ) {
          return 'El enlace de recuperación ya no es válido. Pide uno nuevo.';
        }

        const { error } = await supabase.auth.updateUser({
          password: parsed.password,
        });

        if (error) {
          return formatSupabaseAuthErrorMessage(error.message);
        }

        setPasswordRecoverySessionUserId(null);
        await refreshAccountState();
        return 'Contraseña actualizada.';
      } catch (error) {
        return formatValidationMessage(error);
      }
    },
    [refreshAccountState, setPasswordRecoverySessionUserId],
  );

  const signOut = useCallback(async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }

    clearSignedInState();
    setSessionStatus('signed_out');
  }, [clearSignedInState, setSessionStatus]);

  const stepUpAuth = useCallback(
    async (input?: boolean | StepUpAuthInput): Promise<BiometricAuthResult> => {
      const options = normalizeStepUpAuthInput(input);

      if (deviceTrustState !== 'trusted') {
        return {
          success: false,
          error: 'device_untrusted',
        };
      }

      if (!options.force && stepUpFreshUntil && stepUpFreshUntil > Date.now()) {
        return {
          success: true,
          error: null,
        };
      }

      if (options.password !== undefined) {
        const password = options.password;

        if (!linkedMethods.hasEmailPassword || !supabase || !sessionRef.current?.user.email) {
          return {
            success: false,
            error: 'password_unavailable',
          };
        }

        if (!password.trim()) {
          return {
            success: false,
            error: 'password_required',
          };
        }

        const expectedUserId = sessionRef.current.user.id;
        const { error, data } = await supabase.auth.signInWithPassword({
          email: sessionRef.current.user.email,
          password,
        });

        if (error) {
          return {
            success: false,
            error: 'password_failed',
          };
        }

        if (data.user?.id !== expectedUserId) {
          await supabase.auth.signOut();
          clearSignedInState();
          setSessionStatus('signed_out');
          return {
            success: false,
            error: 'account_mismatch',
          };
        }

        setRecentPasswordAuth(createRecentPasswordAuth(expectedUserId));
        setStepUpFreshUntil(Date.now() + STEP_UP_WINDOW_MS);
        if (status === 'signed_in_locked') {
          setSessionStatus('signed_in_unlocked');
        }

        return {
          success: true,
          error: null,
        };
      }

      let result = await authenticateWithBiometricsResult();

      if (!result.success && (result.error === 'app_cancel' || result.error === 'system_cancel')) {
        await wait(250);
        result = await authenticateWithBiometricsResult();
      }

      if (result.success) {
        setStepUpFreshUntil(Date.now() + STEP_UP_WINDOW_MS);
        if (status === 'signed_in_locked') {
          setSessionStatus('signed_in_unlocked');
        }
      }

      return result;
    },
    [
      clearSignedInState,
      deviceTrustState,
      linkedMethods.hasEmailPassword,
      setSessionStatus,
      status,
      stepUpFreshUntil,
    ],
  );

  const unlock = useCallback(async (): Promise<BiometricAuthResult> => {
    if (status === 'signed_in_untrusted') {
      return {
        success: false,
        error: 'device_untrusted',
      };
    }

    if (!biometricsEnabled) {
      setSessionStatus('signed_in_unlocked');
      return {
        success: true,
        error: null,
      };
    }

    const result = await authenticateWithBiometricsResult();
    if (result.success) {
      setSessionStatus('signed_in_unlocked');
      setStepUpFreshUntil(Date.now() + STEP_UP_WINDOW_MS);
    }

    return result;
  }, [biometricsEnabled, setSessionStatus, status]);

  const lock = useCallback(() => {
    if (status === 'signed_in_unlocked') {
      setSessionStatus('signed_in_locked');
      setStepUpFreshUntil(null);
    }
  }, [setSessionStatus, status]);

  const setBiometricsEnabled = useCallback(
    async (enabled: boolean): Promise<BiometricToggleResult> => {
      if (!enabled) {
        if (biometricsEnabled && deviceTrustState === 'trusted') {
          const result = await stepUpAuth(true);
          if (!result.success) {
            return {
              ok: false,
              message: 'No se pudo validar tu identidad para desactivar la biometría.',
            };
          }
        }

        await removeStoredItem(BIOMETRICS_KEY);
        setBiometricsEnabledState(false);
        setStepUpFreshUntil(null);

        if (sessionRef.current && deviceTrustState === 'trusted') {
          setSessionStatus('signed_in_unlocked');
        }

        return {
          ok: true,
          message: 'Ingreso con biometría desactivado.',
        };
      }

      if (deviceTrustState !== 'trusted') {
        return {
          ok: false,
          message: 'Primero confía este teléfono para activar la biometría.',
        };
      }

      const support = await getBiometricSupport();
      setBiometricAvailable(support.available);
      setBiometricLabel(support.label);

      if (!support.available) {
        return {
          ok: false,
          message: 'Este dispositivo no tiene biometría disponible.',
        };
      }

      const authenticated = await authenticateWithBiometrics();
      if (!authenticated) {
        return {
          ok: false,
          message: 'No se pudo confirmar la biometría.',
        };
      }

      await setStoredItem(BIOMETRICS_KEY, 'true');
      setBiometricsEnabledState(true);
      setStepUpFreshUntil(Date.now() + STEP_UP_WINDOW_MS);

      return {
        ok: true,
        message: `Happy Circles pedirá ${support.label} al abrirse y volverá a entrar apenas se valide.`,
      };
    },
    [biometricsEnabled, deviceTrustState, setSessionStatus, stepUpAuth],
  );

  const setNotificationsEnabled = useCallback(async (enabled: boolean) => {
    setNotificationsEnabledState(enabled);

    if (enabled) {
      await setStoredItem(NOTIFICATIONS_KEY, 'true');
      return;
    }

    await removeStoredItem(NOTIFICATIONS_KEY);
  }, []);

  const requestContactsPermission = useCallback(async () => {
    const nextStatus = await requestContactsPermissionStatus();
    setContactsPermissionStatus(nextStatus);

    if (nextStatus === 'granted') {
      return 'Contactos activados.';
    }

    if (nextStatus === 'limited') {
      return 'El sistema compartio solo algunos contactos. Puedes ampliar el acceso despues desde Personas.';
    }

    if (nextStatus === 'unavailable') {
      return 'Contactos no disponibles en este entorno.';
    }

    if (nextStatus === 'denied') {
      return 'Contactos bloqueados. Abre Ajustes para permitir el acceso.';
    }

    return 'Puedes seguir sin contactos por ahora.';
  }, []);

  const requestNotificationsPermission = useCallback(async () => {
    const nextStatus = await requestLocalNotificationPermissionStatus();
    setNotificationsPermissionStatus(nextStatus);

    if (nextStatus !== 'granted') {
      await removeStoredItem(NOTIFICATIONS_KEY);
      setNotificationsEnabledState(false);

      if (nextStatus === 'unavailable') {
        return 'Notificaciones no disponibles en este entorno.';
      }

      if (nextStatus === 'denied') {
        return 'Notificaciones bloqueadas. Abre Ajustes para activarlas.';
      }

      return 'Puedes seguir sin notificaciones por ahora.';
    }

    await setStoredItem(NOTIFICATIONS_KEY, 'true');
    setNotificationsEnabledState(true);
    return 'Recordatorios activados.';
  }, []);

  const completeProfile = useCallback(
    async (input: CompleteProfileInput) => {
      try {
        const parsed = completeProfileSchema.parse(input);
        const normalizedDisplayName = parsed.fullName.trim();
        const phoneCountryCallingCode = normalizeCallingCode(parsed.phoneCountryCallingCode);
        const phoneNationalNumber = normalizePhoneDigits(parsed.phoneNationalNumber);
        const phoneE164 = buildPhoneE164(phoneCountryCallingCode, phoneNationalNumber);

        if (isLowQualityDisplayName(normalizedDisplayName)) {
          return 'Escribe tu nombre, no el correo.';
        }

        if (!supabase || !sessionRef.current) {
          return 'No hay una sesión activa.';
        }

        const wasCompletingRequiredProfile = profileCompletionState !== 'complete';
        const changingProtectedProfileData =
          profileCompletionState === 'complete' &&
          profile?.phone_e164 &&
          profile.phone_e164 !== phoneE164;

        if (changingProtectedProfileData && deviceTrustState !== 'trusted') {
          return 'Confiar este dispositivo es obligatorio antes de cambiar el celular.';
        }

        if (changingProtectedProfileData) {
          const result = await stepUpAuth(true);
          if (!result.success) {
            return formatStepUpErrorMessage('cambiar el perfil', biometricLabel, result.error);
          }
        }

        const updatePayload = {
          display_name: normalizedDisplayName,
          phone_country_iso2: parsed.phoneCountryIso2.trim().toUpperCase(),
          phone_country_calling_code: phoneCountryCallingCode,
          phone_national_number: phoneNationalNumber,
          phone_e164: phoneE164,
        };

        if (wasCompletingRequiredProfile) {
          recordProductEventSafe({
            eventName: 'registration_started',
            screenName: 'setup_account',
            metadata: { source: 'complete_profile' },
          });
        }

        const { error } = await supabase
          .from('user_profiles')
          .update(updatePayload as never)
          .eq('id', sessionRef.current.user.id);

        if (error) {
          return formatSupabaseAuthErrorMessage(error.message);
        }

        const { error: metadataError } = await supabase.auth.updateUser({
          data: updatePayload,
        });

        if (metadataError) {
          console.warn(
            'Failed to mirror profile metadata into auth user',
            metadataError instanceof Error ? metadataError.message : String(metadataError),
          );
        }

        await refreshAccountState({ preserveTrustedDeviceDuringLoad: true });
        if (wasCompletingRequiredProfile) {
          recordProductEventSafe({
            eventName: 'registration_completed',
            screenName: 'setup_account',
            metadata: { source: 'complete_profile' },
          });
        }
        return 'Perfil actualizado.';
      } catch (error) {
        return formatValidationMessage(error);
      }
    },
    [
      biometricLabel,
      deviceTrustState,
      profile,
      profileCompletionState,
      refreshAccountState,
      stepUpAuth,
    ],
  );

  const linkGoogle = useCallback(
    async (input?: LinkSocialInput) => {
      if (deviceTrustState !== 'trusted') {
        return 'Solo puedes vincular Google desde un dispositivo confiable.';
      }

      const authResult = await stepUpAuth({ force: true, password: input?.password });
      if (!authResult.success) {
        return formatStepUpErrorMessage('vincular Google', biometricLabel, authResult.error);
      }

      const googleResult = await performGoogleAuth('link');
      if (googleResult.message === 'Google vinculado.') {
        try {
          await refreshAccountState({ preserveTrustedDeviceDuringLoad: true });
        } catch (error) {
          console.warn(
            'Failed to refresh account state after Google link',
            error instanceof Error ? error.message : String(error),
          );
        }
      }

      return googleResult.message;
    },
    [biometricLabel, deviceTrustState, performGoogleAuth, refreshAccountState, stepUpAuth],
  );

  const linkApple = useCallback(
    async (input?: LinkSocialInput) => {
      if (deviceTrustState !== 'trusted') {
        return 'Solo puedes vincular Apple desde un dispositivo confiable.';
      }

      const authResult = await stepUpAuth({ force: true, password: input?.password });
      if (!authResult.success) {
        return formatStepUpErrorMessage('vincular Apple', biometricLabel, authResult.error);
      }

      const appleResult = await performAppleAuth('link');
      if (appleResult.message === 'Apple vinculado.') {
        try {
          await refreshAccountState({ preserveTrustedDeviceDuringLoad: true });
        } catch (error) {
          console.warn(
            'Failed to refresh account state after Apple link',
            error instanceof Error ? error.message : String(error),
          );
        }
      }

      return appleResult.message;
    },
    [biometricLabel, deviceTrustState, performAppleAuth, refreshAccountState, stepUpAuth],
  );

  const attachEmailPassword = useCallback(
    async (input: AttachEmailPasswordInput) => {
      try {
        const parsed = attachEmailPasswordSchema.parse(input);

        if (!supabase || !sessionRef.current) {
          return 'No hay una sesión activa.';
        }

        if (!sessionRef.current.user.email) {
          return 'Esta cuenta no tiene un correo disponible para agregar contraseña.';
        }

        if (deviceTrustState !== 'trusted') {
          return 'Solo puedes agregar contraseña desde un dispositivo confiable.';
        }

        const result = await stepUpAuth(true);
        if (!result.success) {
          return formatStepUpErrorMessage('agregar una contraseña', biometricLabel, result.error);
        }

        const { error } = await supabase.auth.updateUser({
          password: parsed.password,
        });

        if (error) {
          return formatSupabaseAuthErrorMessage(error.message);
        }

        await refreshAccountState({ preserveTrustedDeviceDuringLoad: true });
        return 'Contraseña agregada a tu cuenta actual.';
      } catch (error) {
        return formatValidationMessage(error);
      }
    },
    [biometricLabel, deviceTrustState, refreshAccountState, stepUpAuth],
  );

  const trustCurrentDevice = useCallback(
    async (input?: TrustCurrentDeviceInput) => {
      if (!supabase || !sessionRef.current || !currentDeviceId) {
        return 'No hay una sesión activa.';
      }

      if (deviceTrustState === 'trusted') {
        return 'Este teléfono ya es confiable.';
      }

      const expectedUserId = sessionRef.current.user.id;
      const hasRecentPasswordAuth = isRecentPasswordAuthValid({
        recentPasswordAuth,
        userId: expectedUserId,
      });
      const hasFreshStepUpAuth = Boolean(stepUpFreshUntil && stepUpFreshUntil > Date.now());
      let trustValidated = !input?.method && (hasFreshStepUpAuth || hasRecentPasswordAuth);

      if (!input?.method && !trustValidated) {
        const support = await getBiometricSupport();
        setBiometricAvailable(support.available);
        setBiometricLabel(support.label);

        if (support.available) {
          let biometricResult = await authenticateWithBiometricsResult();

          if (
            !biometricResult.success &&
            (biometricResult.error === 'app_cancel' || biometricResult.error === 'system_cancel')
          ) {
            await wait(250);
            biometricResult = await authenticateWithBiometricsResult();
          }

          if (!biometricResult.success) {
            return formatStepUpErrorMessage(
              'confiar este celular',
              support.label,
              biometricResult.error,
            );
          }

          setStepUpFreshUntil(Date.now() + STEP_UP_WINDOW_MS);
          trustValidated = true;
        }
      }

      const method = trustValidated
        ? null
        : (input?.method ??
          (hasRecentPasswordAuth
            ? 'password'
            : linkedMethods.hasGoogle
              ? 'google'
              : linkedMethods.hasApple
                ? 'apple'
                : linkedMethods.hasEmailPassword
                  ? 'password'
                  : null));

      if (method === 'password') {
        if (!linkedMethods.hasEmailPassword) {
          return 'Esta cuenta no tiene contraseña para respaldar la confianza del teléfono.';
        }

        if (!hasRecentPasswordAuth) {
          if (!sessionRef.current.user.email) {
            return 'No encontramos un correo para verificar esta cuenta.';
          }

          if (!input?.password) {
            return 'Escribe tu contraseña actual para confiar este teléfono.';
          }

          const { error, data } = await supabase.auth.signInWithPassword({
            email: sessionRef.current.user.email,
            password: input.password,
          });

          if (error) {
            return formatSupabaseAuthErrorMessage(error.message);
          }

          if (data.user?.id !== expectedUserId) {
            await supabase.auth.signOut();
            clearSignedInState();
            setSessionStatus('signed_out');
            return 'La validación abrió otra cuenta. Cerramos la sesión por seguridad.';
          }

          setRecentPasswordAuth(createRecentPasswordAuth(expectedUserId));
        }
      } else if (method === 'google') {
        if (!linkedMethods.hasGoogle) {
          return 'Google no está vinculado a esta cuenta.';
        }

        const result = await performGoogleAuth('sign-in');
        if (!result.userId) {
          return result.message;
        }

        const { data } = await supabase.auth.getSession();
        const reauthenticatedUserId = result.userId ?? data.session?.user.id ?? null;
        if (reauthenticatedUserId !== expectedUserId) {
          await supabase.auth.signOut();
          clearSignedInState();
          setSessionStatus('signed_out');
          return 'Google abrió otra cuenta. Cerramos la sesión por seguridad.';
        }
      } else if (method === 'apple') {
        if (!linkedMethods.hasApple) {
          return 'Apple no está vinculado a esta cuenta.';
        }

        const result = await performAppleAuth('sign-in');
        if (!result.userId) {
          return result.message;
        }

        const { data } = await supabase.auth.getSession();
        const reauthenticatedUserId = result.userId ?? data.session?.user.id ?? null;
        if (reauthenticatedUserId !== expectedUserId) {
          await supabase.auth.signOut();
          clearSignedInState();
          setSessionStatus('signed_out');
          return 'Apple abrió otra cuenta. Cerramos la sesión por seguridad.';
        }
      } else if (!trustValidated) {
        return 'Esta cuenta no tiene un método disponible para respaldar la confianza del teléfono.';
      }

      const timestamp = new Date().toISOString();
      const updateResult = await supabase
        .from('trusted_devices')
        .update({
          trust_state: 'trusted',
          trusted_at: timestamp,
          revoked_at: null,
          last_seen_at: timestamp,
        } as never)
        .eq('user_id', expectedUserId)
        .eq('device_id', currentDeviceId);

      if (updateResult.error) {
        return updateResult.error.message;
      }

      try {
        await revokeDuplicateActiveDeviceRows({
          client: supabase,
          currentDeviceId,
          deviceName: getCurrentDeviceName(),
          platform: Platform.OS,
          timestamp,
          userId: expectedUserId,
        });
      } catch (error) {
        console.warn(
          'Failed to revoke duplicate trusted devices',
          error instanceof Error ? error.message : String(error),
        );
      }

      setRecentPasswordAuth(null);
      await refreshAccountState({ preserveTrustedDeviceDuringLoad: true });
      return 'Este teléfono ahora es confiable.';
    },
    [
      clearSignedInState,
      currentDeviceId,
      deviceTrustState,
      linkedMethods,
      performAppleAuth,
      performGoogleAuth,
      recentPasswordAuth,
      refreshAccountState,
      setSessionStatus,
      stepUpFreshUntil,
    ],
  );

  const revokeTrustedDevice = useCallback(
    async (deviceId: string) => {
      if (!supabase || !sessionRef.current) {
        return 'No hay una sesión activa.';
      }

      if (deviceTrustState !== 'trusted') {
        return 'Solo puedes revocar dispositivos desde un dispositivo confiable.';
      }

      const result = await stepUpAuth(true);
      if (!result.success) {
        return formatStepUpErrorMessage('revocar el dispositivo', biometricLabel, result.error);
      }

      const timestamp = new Date().toISOString();
      const { error } = await supabase
        .from('trusted_devices')
        .update({
          trust_state: 'revoked',
          revoked_at: timestamp,
          last_seen_at: timestamp,
        } as never)
        .eq('user_id', sessionRef.current.user.id)
        .eq('device_id', deviceId);

      if (error) {
        return error.message;
      }

      await refreshAccountState();
      return deviceId === currentDeviceId
        ? 'Este dispositivo fue revocado y quedo sin confianza.'
        : 'Dispositivo revocado.';
    },
    [biometricLabel, currentDeviceId, deviceTrustState, refreshAccountState, stepUpAuth],
  );

  const clearRememberedAccount = useCallback(async () => {
    await removeStoredItem(REMEMBERED_ACCOUNT_KEY);
    setRememberedAccount(null);
  }, []);

  const canTrustCurrentDeviceWithoutPassword = useMemo(
    () =>
      deviceTrustState !== 'trusted' &&
      (Boolean(stepUpFreshUntil && stepUpFreshUntil > Date.now()) ||
        (linkedMethods.hasEmailPassword &&
          isRecentPasswordAuthValid({
            recentPasswordAuth,
            userId: session?.user.id,
          }))),
    [
      deviceTrustState,
      linkedMethods.hasEmailPassword,
      recentPasswordAuth,
      session?.user.id,
      stepUpFreshUntil,
    ],
  );

  const setupState = useMemo<SetupState>(() => {
    return buildSetupState({
      profile,
      isEmailConfirmed,
      deviceTrustState,
      biometricAvailable,
      contactsPermissionStatus,
      notificationsPermissionStatus,
      emptyState: EMPTY_SETUP_STATE,
    });
  }, [
    biometricAvailable,
    contactsPermissionStatus,
    deviceTrustState,
    isEmailConfirmed,
    notificationsPermissionStatus,
    profile,
  ]);

  useEffect(() => {
    const userId = session?.user.id;
    if (
      !supabase ||
      !userId ||
      accountAccessState !== 'active' ||
      !isEmailConfirmed ||
      !setupState.requiredComplete ||
      setupState.securityPending
    ) {
      return;
    }

    if (welcomeEmailAttemptedUserIdsRef.current.has(userId)) {
      return;
    }

    welcomeEmailAttemptedUserIdsRef.current.add(userId);
    const supportId = createSupportId();
    void supabase.functions
      .invoke('send-welcome-email', {
        body: {},
        headers: {
          'x-client-info': 'happy-circles-mobile',
          'x-request-id': supportId,
        },
      })
      .then(async (result) => {
        if (result.error) {
          const details = await readFunctionErrorDetails(result.error);
          reportClientErrorSafe({
            error: new Error(details.message),
            errorCode: details.code,
            errorMessage: details.message,
            functionName: 'send-welcome-email',
            kind: 'edge_function',
            metadata: { source: 'welcome_email_effect', status: details.status ?? null },
            requestId: details.requestId ?? supportId,
            supportId,
          });
        }
      })
      .catch((error) => {
        reportClientErrorSafe({
          error,
          errorMessage: readErrorMessage(error),
          functionName: 'send-welcome-email',
          kind: 'client_action',
          metadata: { source: 'welcome_email_effect' },
          requestId: supportId,
          supportId,
        });
        // Welcome email delivery is best-effort and should never block setup.
      });
  }, [
    accountAccessState,
    isEmailConfirmed,
    session?.user.id,
    setupState.requiredComplete,
    setupState.securityPending,
  ]);

  const value = useMemo<SessionContextValue>(
    () => ({
      authMode,
      status,
      userId: session?.user.id ?? null,
      email: session?.user.email ?? null,
      isEmailConfirmed,
      authProvider,
      profile,
      accountAccessState,
      rememberedAccount,
      linkedMethods,
      profileCompletionState,
      setupState,
      deviceTrustState,
      trustedDevices,
      currentDeviceId,
      stepUpFreshUntil,
      biometricsEnabled,
      notificationsEnabled,
      biometricLabel,
      biometricAvailable,
      appleSignInAvailable,
      isSignedIn:
        status === 'signed_in_unlocked' ||
        status === 'signed_in_locked' ||
        status === 'signed_in_untrusted',
      isPasswordRecoverySession: session
        ? passwordRecoverySessionUserId === session.user.id
        : false,
      isLocked: status === 'signed_in_locked',
      isTrustedDevice: deviceTrustState === 'trusted',
      canTrustCurrentDeviceWithoutPassword,
      requiresProfileCompletion: !setupState.requiredComplete,
      requiresInvite: accountAccessState === 'needs_invite',
      requiresAccountActivation: accountAccessState === 'needs_activation',
      requestPasswordReset,
      resendEmailConfirmation,
      verifyEmailOtp,
      verifyPasswordRecoveryOtp,
      updatePassword,
      signInWithPassword,
      registerAccount,
      signInWithGoogle,
      signInWithApple,
      completeProfile,
      linkGoogle,
      linkApple,
      attachEmailPassword,
      trustCurrentDevice,
      revokeTrustedDevice,
      refreshAccountState,
      signOut,
      unlock,
      lock,
      stepUpAuth,
      setBiometricsEnabled,
      setNotificationsEnabled,
      requestContactsPermission,
      requestNotificationsPermission,
      clearRememberedAccount,
    }),
    [
      attachEmailPassword,
      accountAccessState,
      authMode,
      authProvider,
      biometricAvailable,
      biometricLabel,
      biometricsEnabled,
      canTrustCurrentDeviceWithoutPassword,
      completeProfile,
      contactsPermissionStatus,
      currentDeviceId,
      deviceTrustState,
      isEmailConfirmed,
      appleSignInAvailable,
      clearRememberedAccount,
      linkApple,
      linkGoogle,
      linkedMethods,
      lock,
      notificationsEnabled,
      notificationsPermissionStatus,
      passwordRecoverySessionUserId,
      profile,
      profileCompletionState,
      resendEmailConfirmation,
      requestPasswordReset,
      requestContactsPermission,
      requestNotificationsPermission,
      rememberedAccount,
      refreshAccountState,
      registerAccount,
      revokeTrustedDevice,
      session,
      setBiometricsEnabled,
      setNotificationsEnabled,
      setupState,
      signInWithApple,
      signInWithGoogle,
      signInWithPassword,
      signOut,
      status,
      updatePassword,
      stepUpAuth,
      stepUpFreshUntil,
      trustCurrentDevice,
      trustedDevices,
      unlock,
      verifyEmailOtp,
      verifyPasswordRecoveryOtp,
    ],
  );

  return value;
}
