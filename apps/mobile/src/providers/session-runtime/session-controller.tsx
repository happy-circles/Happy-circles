import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
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

import { buildPhoneE164, normalizeCallingCode, normalizePhoneDigits } from '@/lib/phone';
import {
  authenticateWithBiometrics,
  authenticateWithBiometricsResult,
  type BiometricAuthResult,
} from '@/lib/security';
import { isLowQualityDisplayName } from '@/lib/setup-account';
import { recordProductEventSafe } from '@/lib/analytics-client';
import { buildEmailAuthRedirect } from '@/lib/auth-redirects';
import { readPendingInviteIntent } from '@/lib/invite-intent';
import { removeStoredItem, setStoredItem } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import {
  createSupportId,
  readFunctionErrorDetails,
  reportClientErrorSafe,
  withSupportCode,
} from '@/lib/support-errors';
import { performNativeAppleAuth } from './apple-native-auth';
import { traceAuthDebugEvent } from './auth-debug';
import { performGoogleAuthFlow } from './google-auth-flow';
import { reportSocialAuthFailure } from './social-auth-reporting';
import { loadSessionAccountState } from './session-account-loader';
import { createSessionAuthorizationActions } from './session-authorization-actions';
import {
  isSameAuthSession,
  readAuthSessionIdentity,
  type StepUpProof,
} from './device-session-authorization';
import { readSessionBootstrapPreferences } from './session-bootstrap';
import { useNativeSecuritySettings } from './use-native-security-settings';
import { applyAuthSessionFromUrl } from './session-callback';
import { invokeSessionEdgeAction, trustCurrentSessionDevice } from './session-edge-action';
import {
  SESSION_ACCOUNT_LOAD_TIMEOUT_MS,
  SESSION_AUTH_OPERATION_TIMEOUT_MS,
  SESSION_SOCIAL_AUTH_TIMEOUT_MS,
  sessionOperationErrorMessage,
  withSessionOperationTimeout,
} from './session-operation';
import { hashInviteTokenForRegistration } from './session-controller-helpers';
import { isSessionEmailConfirmed, resolveStatusAfterAccountLoad } from '../session/account-state';
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
  REMEMBERED_ACCOUNT_KEY,
  STEP_UP_WINDOW_MS,
} from '../session/constants';
import { persistRememberedAccountSnapshot } from '../session/remembered-account';
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
  SessionLoadingStage,
  SessionStatus,
  SetupState,
  TrustCurrentDeviceInput,
  TrustedDeviceRow,
  UserProfileRow,
} from '../session/types';

const ACCOUNT_INVITE_USED_OR_UNAVAILABLE_MESSAGE =
  'Esta invitación ya fue utilizada o no está disponible. Pídele a quien te invitó que genere una nueva desde la app.';

interface AccountStateLoadOptions {
  readonly biometricPreference?: boolean;
  readonly initialLock: boolean;
  readonly preserveLocked: boolean;
  readonly preserveTrustedDeviceDuringLoad: boolean;
  readonly setSessionStatusLoading?: boolean;
  readonly authorizeSession?: boolean;
  readonly allowRevokedAuthorization?: boolean;
}

export function useSessionController(): SessionContextValue {
  const authMode: AuthMode = 'supabase';

  const [status, setStatusState] = useState<SessionStatus>('loading');
  const [loadingStage, setLoadingStage] = useState<SessionLoadingStage>('starting');
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
  const [isAuthorizedDeviceSession, setIsAuthorizedDeviceSession] = useState(false);
  const [trustedDevices, setTrustedDevices] = useState<readonly TrustedDeviceRow[]>([]);
  const [currentDeviceId, setCurrentDeviceId] = useState<string | null>(null);
  const [authProvider, setAuthProvider] = useState<IdentityProvider | null>(null);
  const [stepUpFreshUntil, setStepUpFreshUntilState] = useState<number | null>(null);
  const [recentPasswordAuth, setRecentPasswordAuth] = useState<RecentPasswordAuth | null>(null);
  const [biometricsEnabled, setBiometricsEnabledState] = useState(false);
  const [appleSignInAvailable, setAppleSignInAvailable] = useState(false);
  const [passwordRecoverySessionUserId, setPasswordRecoverySessionUserIdState] = useState<
    string | null
  >(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const backgroundedAtRef = useRef<number | null>(null);
  const accountLoadIdRef = useRef(0);
  const authCallbackAppliedUrlsRef = useRef(new Set<string>());
  const authCallbackUrlsInFlightRef = useRef(new Map<string, Promise<boolean>>());
  const sessionRef = useRef<Session | null>(null);
  const stepUpProofRef = useRef<StepUpProof | null>(null);
  const authorizedDeviceSessionRef = useRef(false);
  const currentDeviceIdRef = useRef<string | null>(null);
  const linkedMethodsRef = useRef<LinkedMethods>(EMPTY_LINKED_METHODS);
  const statusRef = useRef<SessionStatus>('loading');
  const biometricsEnabledRef = useRef(false);
  const bootstrapStartedRef = useRef(false);
  const bootstrapRunRef = useRef<(() => Promise<void>) | null>(null);
  const accountLoadsInFlightRef = useRef(new Map<string, Promise<void>>());
  const mountedRef = useRef(true);
  const passwordRecoverySessionUserIdRef = useRef<string | null>(null);
  const welcomeEmailAttemptedUserIdsRef = useRef(new Set<string>());
  const {
    biometricAvailable,
    biometricLabel,
    notificationsEnabled,
    contactsPermissionStatus,
    notificationsPermissionStatus,
    applyInitialNativePreferences,
    refreshBiometricSupport,
    refreshNativePermissionStatuses,
    beginNotificationEnableFromSettings,
    cancelNotificationEnableFromSettings,
    setNotificationsEnabled,
    requestContactsPermission,
    requestNotificationsPermission,
  } = useNativeSecuritySettings({ sessionRef, mountedRef });

  const setSessionStatus = useCallback((nextStatus: SessionStatus) => {
    statusRef.current = nextStatus;
    setStatusState(nextStatus);
  }, []);

  const setStepUpFreshUntil = useCallback(
    (value: number | null | ((current: number | null) => number | null)) => {
      const expiresAt =
        typeof value === 'function' ? value(stepUpProofRef.current?.expiresAt ?? null) : value;
      const identity = readAuthSessionIdentity(sessionRef.current);
      stepUpProofRef.current = expiresAt && identity ? { ...identity, expiresAt } : null;
      setStepUpFreshUntilState(stepUpProofRef.current?.expiresAt ?? null);
    },
    [],
  );

  const adoptSession = useCallback(
    (nextSession: Session) => {
      if (sessionRef.current && sessionRef.current.user.id !== nextSession.user.id) {
        linkedMethodsRef.current = EMPTY_LINKED_METHODS;
        setLinkedMethods(EMPTY_LINKED_METHODS);
        setProfile(null);
        setIsEmailConfirmed(false);
        setAccountAccessState('loading');
        setProfileCompletionState('loading');
        setDeviceTrustState('loading');
        setTrustedDevices([]);
        setAuthProvider(null);
        setSessionStatus('loading');
      }
      if (
        !isSameAuthSession(
          readAuthSessionIdentity(sessionRef.current),
          readAuthSessionIdentity(nextSession),
        )
      ) {
        authorizedDeviceSessionRef.current = false;
        setIsAuthorizedDeviceSession(false);
        setStepUpFreshUntil(null);
      }
      sessionRef.current = nextSession;
      setSession(nextSession);
    },
    [setSessionStatus, setStepUpFreshUntil],
  );

  const applyBiometricsEnabled = useCallback((enabled: boolean) => {
    biometricsEnabledRef.current = enabled;
    setBiometricsEnabledState(enabled);
  }, []);

  const setPasswordRecoverySessionUserId = useCallback((userId: string | null) => {
    passwordRecoverySessionUserIdRef.current = userId;
    setPasswordRecoverySessionUserIdState(userId);
  }, []);

  const clearSignedInState = useCallback(() => {
    accountLoadIdRef.current += 1;
    sessionRef.current = null;
    authorizedDeviceSessionRef.current = false;
    currentDeviceIdRef.current = null;
    linkedMethodsRef.current = EMPTY_LINKED_METHODS;
    setIsAuthorizedDeviceSession(false);
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
    cancelNotificationEnableFromSettings();
    welcomeEmailAttemptedUserIdsRef.current.clear();
  }, [cancelNotificationEnableFromSettings, setPasswordRecoverySessionUserId, setStepUpFreshUntil]);

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

      const callbackPromise = applyAuthSessionFromUrl({
        client: supabase,
        onPasswordRecoverySession: (nextSession) =>
          setPasswordRecoverySessionUserId(nextSession.user.id),
        url,
      }).catch((error) => {
        reportClientErrorSafe({
          error,
          errorCode: 'auth_callback_failed',
          errorMessage: readErrorMessage(error),
          fatal: false,
          kind: 'client_action',
          metadata: { operation: 'apply_session_from_url', source: 'auth_callback' },
        });
        return false;
      });

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
    async (nextSession: Session, options: AccountStateLoadOptions) => {
      if (!supabase) {
        return;
      }
      const client = supabase;
      adoptSession(nextSession);

      const loadId = accountLoadIdRef.current + 1;
      accountLoadIdRef.current = loadId;
      const shouldPreserveLockedStatus =
        options.preserveLocked && statusRef.current === 'signed_in_locked';
      const shouldSetSessionStatusLoading = options.setSessionStatusLoading ?? true;

      if (!shouldPreserveLockedStatus && shouldSetSessionStatusLoading) {
        setLoadingStage('account');
        setSessionStatus('loading');
      }

      setProfileCompletionState('loading');
      setDeviceTrustState((current) =>
        options.preserveTrustedDeviceDuringLoad && current === 'trusted' ? 'trusted' : 'loading',
      );
      const loadedAccountState = await withSessionOperationTimeout(
        'load-account-state',
        loadSessionAccountState({
          client,
          nextSession,
          setLoadingStage,
          authorizeSession: options.authorizeSession,
          allowRevokedAuthorization: options.allowRevokedAuthorization,
        }),
        SESSION_ACCOUNT_LOAD_TIMEOUT_MS,
      );

      if (
        loadId !== accountLoadIdRef.current ||
        !mountedRef.current ||
        !isSameAuthSession(
          readAuthSessionIdentity(nextSession),
          readAuthSessionIdentity(sessionRef.current),
        )
      ) {
        return;
      }

      sessionRef.current = nextSession;
      setSession(nextSession);
      setProfile(loadedAccountState.profile);
      setIsEmailConfirmed(loadedAccountState.emailConfirmed);
      setAccountAccessState(loadedAccountState.accountAccessState);
      setLinkedMethods(loadedAccountState.linkedMethods);
      setProfileCompletionState(loadedAccountState.profileCompletionState);
      setDeviceTrustState(loadedAccountState.deviceTrustState);
      authorizedDeviceSessionRef.current = loadedAccountState.isAuthorizedDeviceSession;
      setIsAuthorizedDeviceSession(loadedAccountState.isAuthorizedDeviceSession);
      currentDeviceIdRef.current = loadedAccountState.currentDeviceId;
      linkedMethodsRef.current = loadedAccountState.linkedMethods;
      setTrustedDevices(loadedAccountState.trustedDevices);
      setCurrentDeviceId(loadedAccountState.currentDeviceId);
      setAuthProvider(loadedAccountState.authProvider);
      setSessionError(null);
      void persistRememberedAccountSnapshot(loadedAccountState.profile).then((snapshot) => {
        if (loadId === accountLoadIdRef.current) {
          setRememberedAccount(
            snapshot
              ? {
                  ...snapshot,
                  accountAccessState:
                    loadedAccountState.accountAccessState === 'loading'
                      ? 'needs_invite'
                      : loadedAccountState.accountAccessState,
                }
              : null,
          );
        }
      });
      setSessionStatus(
        resolveStatusAfterAccountLoad({
          hasSession: true,
          biometricsEnabled: options.biometricPreference ?? biometricsEnabledRef.current,
          deviceTrustState: loadedAccountState.isAuthorizedDeviceSession
            ? loadedAccountState.deviceTrustState
            : loadedAccountState.deviceTrustState === 'trusted'
              ? 'pending'
              : loadedAccountState.deviceTrustState,
          initialLock: options.initialLock,
          preserveLocked: options.preserveLocked && statusRef.current === 'signed_in_locked',
        }),
      );
    },
    [adoptSession, setSessionStatus],
  );

  const loadAccountStateSingleFlight = useCallback(
    async (nextSession: Session, options: AccountStateLoadOptions) => {
      const accountLoadKey = [
        nextSession.user.id,
        readAuthSessionIdentity(nextSession)?.sessionId ?? nextSession.access_token,
        options.initialLock,
        options.preserveLocked,
        options.preserveTrustedDeviceDuringLoad,
        options.setSessionStatusLoading ?? true,
        options.authorizeSession ?? true,
        options.allowRevokedAuthorization ?? false,
      ].join(':');
      const existingLoad = accountLoadsInFlightRef.current.get(accountLoadKey);
      if (existingLoad) {
        return existingLoad;
      }

      const accountLoad = loadAccountState(nextSession, options);
      accountLoadsInFlightRef.current.set(accountLoadKey, accountLoad);
      try {
        await accountLoad;
      } finally {
        if (accountLoadsInFlightRef.current.get(accountLoadKey) === accountLoad) {
          accountLoadsInFlightRef.current.delete(accountLoadKey);
        }
      }
    },
    [loadAccountState],
  );

  const refreshAccountState = useCallback(
    async (options?: RefreshAccountStateOptions) => {
      if (!supabase) {
        return;
      }

      const sourceLoadId = accountLoadIdRef.current;

      const { data, error } = await withSessionOperationTimeout(
        'refresh-session',
        supabase.auth.getSession(),
        SESSION_AUTH_OPERATION_TIMEOUT_MS,
      );
      if (error) {
        throw new Error(error.message);
      }
      const nextSession = data.session;
      if (
        sourceLoadId !== accountLoadIdRef.current &&
        !isSameAuthSession(
          readAuthSessionIdentity(nextSession),
          readAuthSessionIdentity(sessionRef.current),
        )
      ) {
        return;
      }

      if (!nextSession) {
        clearSignedInState();
        setSessionStatus('signed_out');
        return;
      }

      await loadAccountStateSingleFlight(nextSession, {
        initialLock: false,
        preserveLocked: options?.preserveLocked ?? statusRef.current === 'signed_in_locked',
        preserveTrustedDeviceDuringLoad: options?.preserveTrustedDeviceDuringLoad ?? false,
        biometricPreference: biometricsEnabledRef.current,
        setSessionStatusLoading: false,
      });
    },
    [clearSignedInState, loadAccountStateSingleFlight, setSessionStatus],
  );

  const hydrateSession = useCallback(async () => {
    const active = () => mountedRef.current;
    setLoadingStage('starting');
    setSessionError(null);

    let preferences: Awaited<ReturnType<typeof readSessionBootstrapPreferences>>;
    try {
      preferences = await readSessionBootstrapPreferences();
    } catch (error) {
      if (active()) {
        setSessionError(sessionOperationErrorMessage(error));
        setSessionStatus('loading');
        setHydrated(true);
      }
      return;
    }

    if (!active()) {
      return;
    }

    applyBiometricsEnabled(preferences.biometricsEnabled);
    applyInitialNativePreferences(preferences);
    setAppleSignInAvailable(preferences.appleSignInAvailable);
    setRememberedAccount(preferences.rememberedAccount);

    if (!supabase) {
      clearSignedInState();
      setSessionStatus('signed_out');
      setHydrated(true);
      return;
    }

    try {
      setLoadingStage('auth');
      const { data, error } = await withSessionOperationTimeout(
        'bootstrap-session',
        supabase.auth.getSession(),
        SESSION_AUTH_OPERATION_TIMEOUT_MS,
      );
      if (error) {
        throw new Error(error.message);
      }
      if (!active()) {
        return;
      }

      const nextSession = data.session;
      if (!nextSession) {
        clearSignedInState();
        setRememberedAccount(preferences.rememberedAccount);
        setSessionStatus('signed_out');
        setHydrated(true);
        return;
      }

      await loadAccountStateSingleFlight(nextSession, {
        initialLock: preferences.biometricsEnabled,
        preserveLocked: false,
        preserveTrustedDeviceDuringLoad: false,
        biometricPreference: preferences.biometricsEnabled,
        setSessionStatusLoading: true,
      });
    } catch (error) {
      console.warn(
        'Failed to hydrate account state',
        error instanceof Error ? error.message : String(error),
      );
      if (!active()) {
        return;
      }
      sessionRef.current = null;
      setSession(null);
      setSessionError(sessionOperationErrorMessage(error));
      setSessionStatus('loading');
    }

    if (active()) {
      setHydrated(true);
    }
  }, [
    applyBiometricsEnabled,
    applyInitialNativePreferences,
    clearSignedInState,
    loadAccountStateSingleFlight,
    setSessionStatus,
  ]);

  bootstrapRunRef.current = hydrateSession;

  const retrySession = useCallback(async () => {
    try {
      await bootstrapRunRef.current?.();
    } catch (error) {
      if (mountedRef.current) {
        setSessionError(sessionOperationErrorMessage(error));
        setSessionStatus('loading');
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    if (!bootstrapStartedRef.current) {
      bootstrapStartedRef.current = true;
      void hydrateSession();
    }

    return () => {
      mountedRef.current = false;
    };
  }, [hydrateSession]);

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

      void loadAccountStateSingleFlight(nextSession, {
        initialLock: false,
        preserveLocked: event !== 'SIGNED_IN' && statusRef.current === 'signed_in_locked',
        preserveTrustedDeviceDuringLoad: event !== 'SIGNED_IN',
        biometricPreference: biometricsEnabledRef.current,
        setSessionStatusLoading: false,
      }).catch((error) => {
        console.warn(
          'Failed to refresh account state after auth change',
          error instanceof Error ? error.message : String(error),
        );
        if (
          mountedRef.current &&
          isSameAuthSession(
            readAuthSessionIdentity(nextSession),
            readAuthSessionIdentity(sessionRef.current),
          )
        ) {
          setSessionError(sessionOperationErrorMessage(error));
          setSessionStatus('loading');
        }
      });
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [
    clearSignedInState,
    hydrated,
    loadAccountStateSingleFlight,
    setPasswordRecoverySessionUserId,
    setSessionStatus,
  ]);

  useEffect(() => {
    if (!supabase || !hydrated) {
      return;
    }

    void Linking.getInitialURL()
      .then((url) => applySessionFromUrl(url))
      .catch((error) => {
        reportClientErrorSafe({
          error,
          errorCode: 'auth_callback_initial_url',
          errorMessage: readErrorMessage(error),
          fatal: false,
          kind: 'client_action',
          metadata: { operation: 'get_initial_url', source: 'auth_callback' },
        });
      });

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
        void refreshBiometricSupport();
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
  }, [
    biometricsEnabled,
    refreshBiometricSupport,
    refreshNativePermissionStatuses,
    setSessionStatus,
    status,
  ]);

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
  }, [setStepUpFreshUntil, stepUpFreshUntil]);

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

      return withSessionOperationTimeout(
        `google-${mode}`,
        performGoogleAuthFlow({
          applySessionFromUrl,
          client: supabase,
          mode,
          platform: Platform.OS,
        }),
        SESSION_SOCIAL_AUTH_TIMEOUT_MS,
      );
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

      return withSessionOperationTimeout(
        `apple-${mode}`,
        performNativeAppleAuth({
          client: supabase,
          mode,
          reportFailure: (failure) =>
            reportSocialAuthFailure({
              ...failure,
              mode,
            }),
        }),
        SESSION_SOCIAL_AUTH_TIMEOUT_MS,
      );
    },
    [],
  );

  const finishAuthenticatedSignIn = useCallback(
    async (expectedUserId: string) => {
      if (!supabase) return;
      const { data, error } = await withSessionOperationTimeout(
        'login-session',
        supabase.auth.getSession(),
      );
      if (error) throw error;
      const nextSession = data.session;
      if (!nextSession || nextSession.user.id !== expectedUserId) {
        throw new Error('La sesión cambió. Intenta nuevamente desde la cuenta actual.');
      }
      await loadAccountStateSingleFlight(nextSession, {
        initialLock: false,
        preserveLocked: false,
        preserveTrustedDeviceDuringLoad: false,
        setSessionStatusLoading: false,
        allowRevokedAuthorization: true,
      });
      if (
        mountedRef.current &&
        isSameAuthSession(
          readAuthSessionIdentity(nextSession),
          readAuthSessionIdentity(sessionRef.current),
        )
      ) {
        setStepUpFreshUntil(Date.now() + STEP_UP_WINDOW_MS);
      }
    },
    [loadAccountStateSingleFlight, setStepUpFreshUntil],
  );

  const signInWithPassword = useCallback(
    async (input: EmailPasswordCredentials) => {
      try {
        const parsed = emailPasswordSignInSchema.parse(input);
        const normalizedEmail = parsed.email.trim().toLocaleLowerCase('en-US');

        if (!supabase) {
          return 'El servicio de acceso no está disponible en este momento.';
        }

        const { data, error } = await withSessionOperationTimeout(
          'password-sign-in',
          supabase.auth.signInWithPassword({
            email: normalizedEmail,
            password: parsed.password,
          }),
          SESSION_AUTH_OPERATION_TIMEOUT_MS,
        );

        if (error) {
          return formatSupabaseAuthErrorMessage(error.message);
        }

        if (data.user?.id) {
          setRecentPasswordAuth(createRecentPasswordAuth(data.user.id));
          await finishAuthenticatedSignIn(data.user.id);
        }

        return 'Sesión iniciada.';
      } catch (error) {
        return sessionOperationErrorMessage(error, formatValidationMessage(error));
      }
    },
    [finishAuthenticatedSignIn],
  );

  const registerAccount = useCallback(
    async (input: RegistrationInput) => {
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
        const registrationPreview = await withSessionOperationTimeout(
          'registration-invite-preview',
          supabase.functions.invoke<AccountRegistrationPreviewResult>(
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
          ),
          SESSION_AUTH_OPERATION_TIMEOUT_MS,
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
          return ACCOUNT_INVITE_USED_OR_UNAVAILABLE_MESSAGE;
        }

        const accountInviteDeliveryTokenHash = await hashInviteTokenForRegistration(
          pendingIntent.token,
        );
        const redirectTo = buildEmailAuthRedirect('/setup-account?step=profile');
        const { data, error } = await withSessionOperationTimeout(
          'account-sign-up',
          supabase.auth.signUp({
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
          }),
          SESSION_AUTH_OPERATION_TIMEOUT_MS,
        );

        if (error) {
          return formatSupabaseAuthErrorMessage(error.message);
        }

        if (data.session) {
          setRecentPasswordAuth(createRecentPasswordAuth(data.session.user.id));
          await finishAuthenticatedSignIn(data.session.user.id);
          return 'Cuenta creada. Ahora completa tu configuración.';
        }

        return 'Cuenta creada. Revisa tu correo.';
      } catch (error) {
        return sessionOperationErrorMessage(error, formatValidationMessage(error));
      }
    },
    [finishAuthenticatedSignIn],
  );

  const signInWithGoogle = useCallback(async () => {
    try {
      const result = await performGoogleAuth('sign-in');
      if (result.userId) {
        await finishAuthenticatedSignIn(result.userId);
      }
      return result.message;
    } catch (error) {
      return sessionOperationErrorMessage(error, formatValidationMessage(error));
    }
  }, [finishAuthenticatedSignIn, performGoogleAuth]);

  const signInWithApple = useCallback(async () => {
    try {
      const result = await performAppleAuth('sign-in');
      if (result.userId) {
        await finishAuthenticatedSignIn(result.userId);
      }
      return result.message;
    } catch (error) {
      return sessionOperationErrorMessage(error, formatValidationMessage(error));
    }
  }, [finishAuthenticatedSignIn, performAppleAuth]);

  const requestPasswordReset = useCallback(async (email: string) => {
    try {
      const parsed = passwordResetRequestSchema.parse({ email });
      const normalizedEmail = parsed.email.trim().toLocaleLowerCase('en-US');

      if (!supabase) {
        return 'El servicio de acceso no está disponible en este momento.';
      }

      const redirectTo = buildEmailAuthRedirect('/reset-password');
      const { error } = await withSessionOperationTimeout(
        'request-password-reset',
        supabase.auth.resetPasswordForEmail(normalizedEmail, { redirectTo }),
        SESSION_AUTH_OPERATION_TIMEOUT_MS,
      );

      if (error) {
        return formatSupabaseAuthErrorMessage(error.message);
      }

      return 'Si el correo existe, enviamos un enlace para restablecer la contraseña.';
    } catch (error) {
      return sessionOperationErrorMessage(error, formatValidationMessage(error));
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
      const { error } = await withSessionOperationTimeout(
        'resend-email-confirmation',
        supabase.auth.resend({
          email,
          options: {
            emailRedirectTo: redirectTo,
          },
          type: 'signup',
        }),
        SESSION_AUTH_OPERATION_TIMEOUT_MS,
      );

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

        const { error } = await withSessionOperationTimeout(
          'verify-signup-otp',
          supabase.auth.verifyOtp({
            email: normalizedEmail,
            token,
            type: 'signup',
          }),
          SESSION_AUTH_OPERATION_TIMEOUT_MS,
        );

        if (error) {
          return formatSupabaseAuthErrorMessage(error.message);
        }

        await refreshAccountState({
          preserveLocked: false,
          preserveTrustedDeviceDuringLoad: true,
        });
        return 'Correo confirmado.';
      } catch (error) {
        return sessionOperationErrorMessage(error, formatValidationMessage(error));
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

        const { data, error } = await withSessionOperationTimeout(
          'verify-recovery-otp',
          supabase.auth.verifyOtp({
            email: normalizedEmail,
            token,
            type: 'recovery',
          }),
          SESSION_AUTH_OPERATION_TIMEOUT_MS,
        );

        if (error) {
          return formatSupabaseAuthErrorMessage(error.message);
        }

        const nextSession =
          data.session ??
          (
            await withSessionOperationTimeout(
              'get-recovery-session',
              supabase.auth.getSession(),
              SESSION_AUTH_OPERATION_TIMEOUT_MS,
            )
          ).data.session;
        if (!nextSession) {
          return 'Código verificado, pero no pudimos abrir la sesión de recuperación. Pide un enlace nuevo.';
        }

        setPasswordRecoverySessionUserId(nextSession.user.id);
        await refreshAccountState({ preserveLocked: false });
        return 'Código verificado.';
      } catch (error) {
        return sessionOperationErrorMessage(error, formatValidationMessage(error));
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
        return sessionOperationErrorMessage(error, formatValidationMessage(error));
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

  const { authorizeCurrentDeviceSession, stepUpAuth, trustCurrentDevice } = useMemo(
    () =>
      createSessionAuthorizationActions({
        readRuntime: () => ({
          session: sessionRef.current,
          deviceId: currentDeviceIdRef.current,
          isAuthorized: authorizedDeviceSessionRef.current,
          linkedMethods: linkedMethodsRef.current,
          proof: stepUpProofRef.current,
        }),
        readSession: async () => {
          if (!supabase) return null;
          const { data, error } = await withSessionOperationTimeout(
            'authorization-session',
            supabase.auth.getSession(),
          );
          if (error) throw error;
          return data.session;
        },
        adoptSession,
        confirm: (activeSession, deviceId) =>
          trustCurrentSessionDevice(supabase!, deviceId, activeSession.access_token),
        refresh: (activeSession) =>
          loadAccountStateSingleFlight(activeSession, {
            initialLock: false,
            preserveLocked: statusRef.current === 'signed_in_locked',
            preserveTrustedDeviceDuringLoad: true,
            setSessionStatusLoading: false,
            authorizeSession: false,
          }),
        authenticate: async (method, password) => {
          if (method === 'google') return performGoogleAuth('sign-in');
          if (method === 'apple') return performAppleAuth('sign-in');
          const email = sessionRef.current?.user.email;
          if (!supabase || !email) return { userId: null, error: 'session_unavailable' };
          const { data, error } = await withSessionOperationTimeout(
            'account-password-reauth',
            supabase.auth.signInWithPassword({ email, password: password! }),
          );
          return {
            userId: error ? null : (data.user?.id ?? null),
            error: error ? 'password_failed' : undefined,
            message: error ? formatSupabaseAuthErrorMessage(error.message) : undefined,
          };
        },
        authenticateBiometrics: authenticateWithBiometricsResult,
        wait,
        onAccountMismatch: async () => {
          try {
            if (supabase)
              await withSessionOperationTimeout(
                'account-mismatch-sign-out',
                supabase.auth.signOut(),
              );
          } catch {
            // Clear local account data even if remote sign-out cannot finish.
          } finally {
            clearSignedInState();
            setSessionStatus('signed_out');
          }
        },
        onAuthorizationFailure: (code) => {
          if (!code) return;
          authorizedDeviceSessionRef.current = false;
          setIsAuthorizedDeviceSession(false);
          setStepUpFreshUntil(null);
        },
        onProof: () => setStepUpFreshUntil(Date.now() + STEP_UP_WINDOW_MS),
        onUnlock: () => {
          if (statusRef.current === 'signed_in_locked') setSessionStatus('signed_in_unlocked');
        },
        isMounted: () => mountedRef.current,
        errorMessage: (error) =>
          sessionOperationErrorMessage(
            error,
            'No pudimos validar tu identidad. Inténtalo de nuevo.',
          ),
      }),
    [
      adoptSession,
      clearSignedInState,
      loadAccountStateSingleFlight,
      performAppleAuth,
      performGoogleAuth,
      setSessionStatus,
      setStepUpFreshUntil,
    ],
  );

  const unlock = useCallback(async (): Promise<BiometricAuthResult> => {
    if (!authorizedDeviceSessionRef.current) {
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

    const previousIdentity = readAuthSessionIdentity(sessionRef.current);
    const result = await authenticateWithBiometricsResult();
    if (
      !mountedRef.current ||
      !isSameAuthSession(previousIdentity, readAuthSessionIdentity(sessionRef.current))
    ) {
      return {
        success: false,
        error: 'session_changed',
        message: 'La sesión cambió. Intenta nuevamente.',
      };
    }
    if (result.success) {
      setSessionStatus('signed_in_unlocked');
      setStepUpFreshUntil(Date.now() + STEP_UP_WINDOW_MS);
    }

    return result;
  }, [biometricsEnabled, setSessionStatus, setStepUpFreshUntil]);

  const lock = useCallback(() => {
    if (status === 'signed_in_unlocked') {
      setSessionStatus('signed_in_locked');
      setStepUpFreshUntil(null);
    }
  }, [setSessionStatus, setStepUpFreshUntil, status]);

  const setBiometricsEnabled = useCallback(
    async (enabled: boolean): Promise<BiometricToggleResult> => {
      if (!enabled) {
        if (biometricsEnabled && authorizedDeviceSessionRef.current) {
          const result = await stepUpAuth();
          if (!result.success) {
            return {
              ok: false,
              message: 'No se pudo validar tu identidad para desactivar la biometría.',
            };
          }
        }

        await removeStoredItem(BIOMETRICS_KEY);
        applyBiometricsEnabled(false);
        setStepUpFreshUntil(null);

        if (sessionRef.current && authorizedDeviceSessionRef.current) {
          setSessionStatus('signed_in_unlocked');
        }

        return {
          ok: true,
          message: 'Ingreso con biometría desactivado.',
        };
      }

      if (!authorizedDeviceSessionRef.current) {
        return {
          ok: false,
          message: 'Primero confía este teléfono para activar la biometría.',
        };
      }

      const support = await refreshBiometricSupport();
      if (support.error) return { ok: false, message: support.error };

      if (!support.available) {
        return {
          ok: false,
          message: 'Este dispositivo no tiene biometría disponible.',
        };
      }

      const previousIdentity = readAuthSessionIdentity(sessionRef.current);
      const authenticated = await authenticateWithBiometrics();
      if (
        !mountedRef.current ||
        !isSameAuthSession(previousIdentity, readAuthSessionIdentity(sessionRef.current))
      ) {
        return { ok: false, message: 'La sesión cambió. Intenta nuevamente.' };
      }
      if (!authenticated) {
        return {
          ok: false,
          message: 'No se pudo confirmar la biometría.',
        };
      }

      await setStoredItem(BIOMETRICS_KEY, 'true');
      applyBiometricsEnabled(true);
      setStepUpFreshUntil(Date.now() + STEP_UP_WINDOW_MS);

      return {
        ok: true,
        message: `Happy Circles pedirá ${support.label} al abrirse y volverá a entrar apenas se valide.`,
      };
    },
    [
      applyBiometricsEnabled,
      biometricsEnabled,
      refreshBiometricSupport,
      setSessionStatus,
      setStepUpFreshUntil,
      stepUpAuth,
    ],
  );

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

        const expectedUserId = sessionRef.current.user.id;
        const wasCompletingRequiredProfile = profileCompletionState !== 'complete';
        const changingProtectedProfileData =
          profileCompletionState === 'complete' &&
          profile?.phone_e164 &&
          profile.phone_e164 !== phoneE164;

        if (changingProtectedProfileData && !authorizedDeviceSessionRef.current) {
          return 'Confiar este dispositivo es obligatorio antes de cambiar el celular.';
        }

        if (changingProtectedProfileData) {
          const result = await stepUpAuth();
          if (!result.success) {
            return (
              result.message ??
              formatStepUpErrorMessage('cambiar el perfil', biometricLabel, result.error)
            );
          }
        }
        if (sessionRef.current?.user.id !== expectedUserId) {
          return 'La sesión cambió. Intenta nuevamente desde la cuenta actual.';
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
          .eq('id', expectedUserId);

        if (error) {
          return formatSupabaseAuthErrorMessage(error.message);
        }
        if (sessionRef.current?.user.id !== expectedUserId) {
          return 'La sesión cambió. Intenta nuevamente desde la cuenta actual.';
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

        const pendingIntent = await readPendingInviteIntent();
        if (sessionRef.current?.user.id !== expectedUserId) {
          return 'La sesión cambió. Intenta nuevamente desde la cuenta actual.';
        }
        if (pendingIntent?.type === 'account_invite' && accountAccessState !== 'active') {
          const claimResult = await invokeSessionEdgeAction({
            body: { deliveryToken: pendingIntent.token },
            client: supabase,
            name: 'claim-account-invite',
          });
          if (!claimResult.ok) {
            return claimResult.message;
          }
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
        return sessionOperationErrorMessage(error, formatValidationMessage(error));
      }
    },
    [
      biometricLabel,
      accountAccessState,
      deviceTrustState,
      profile,
      profileCompletionState,
      refreshAccountState,
      stepUpAuth,
    ],
  );

  const linkGoogle = useCallback(
    async (input?: LinkSocialInput) => {
      if (!authorizedDeviceSessionRef.current) {
        return 'Solo puedes vincular Google desde un dispositivo confiable.';
      }
      const expectedUserId = sessionRef.current?.user.id;

      const authResult = await stepUpAuth(
        input?.password !== undefined ? { password: input.password } : undefined,
      );
      if (!authResult.success) {
        return (
          authResult.message ??
          formatStepUpErrorMessage('vincular Google', biometricLabel, authResult.error)
        );
      }
      if (sessionRef.current?.user.id !== expectedUserId)
        return 'La sesión cambió. Intenta nuevamente.';

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
      if (!authorizedDeviceSessionRef.current) {
        return 'Solo puedes vincular Apple desde un dispositivo confiable.';
      }
      const expectedUserId = sessionRef.current?.user.id;

      const authResult = await stepUpAuth(
        input?.password !== undefined ? { password: input.password } : undefined,
      );
      if (!authResult.success) {
        return (
          authResult.message ??
          formatStepUpErrorMessage('vincular Apple', biometricLabel, authResult.error)
        );
      }
      if (sessionRef.current?.user.id !== expectedUserId)
        return 'La sesión cambió. Intenta nuevamente.';

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
        const expectedUserId = sessionRef.current.user.id;

        if (!authorizedDeviceSessionRef.current) {
          return 'Solo puedes agregar contraseña desde un dispositivo confiable.';
        }

        const result = await stepUpAuth();
        if (!result.success) {
          return (
            result.message ??
            formatStepUpErrorMessage('agregar una contraseña', biometricLabel, result.error)
          );
        }
        if (sessionRef.current?.user.id !== expectedUserId)
          return 'La sesión cambió. Intenta nuevamente.';

        const { error } = await withSessionOperationTimeout(
          'attach-email-password',
          supabase.auth.updateUser({ password: parsed.password }),
        );

        if (error) {
          return formatSupabaseAuthErrorMessage(error.message);
        }

        await refreshAccountState({ preserveTrustedDeviceDuringLoad: true });
        return 'Contraseña agregada a tu cuenta actual.';
      } catch (error) {
        return sessionOperationErrorMessage(error, formatValidationMessage(error));
      }
    },
    [biometricLabel, deviceTrustState, refreshAccountState, stepUpAuth],
  );

  const revokeTrustedDevice = useCallback(
    async (deviceId: string, input?: TrustCurrentDeviceInput) => {
      const expectedUserId = sessionRef.current?.user.id;
      if (!supabase || !expectedUserId) return 'No hay una sesión activa.';
      try {
        const authorization =
          input?.method && input.method !== 'recent_auth'
            ? await stepUpAuth({ method: input.method, password: input.password, force: true })
            : await authorizeCurrentDeviceSession();
        if (!authorization.success)
          return authorization.message ?? 'Confirma tu cuenta antes de revocar el dispositivo.';
        const activeSession = sessionRef.current;
        const originDeviceId = currentDeviceIdRef.current;
        if (
          !activeSession ||
          activeSession.user.id !== expectedUserId ||
          !originDeviceId ||
          !authorizedDeviceSessionRef.current
        ) {
          return 'La sesión cambió. Intenta nuevamente desde la cuenta actual.';
        }
        const revokeResult = await invokeSessionEdgeAction({
          accessToken: activeSession.access_token,
          body: { currentDeviceId: originDeviceId, deviceId },
          client: supabase,
          name: 'revoke-trusted-device',
        });
        if (
          !isSameAuthSession(
            readAuthSessionIdentity(activeSession),
            readAuthSessionIdentity(sessionRef.current),
          )
        ) {
          return 'La sesión cambió. Intenta nuevamente desde la cuenta actual.';
        }
        if (!revokeResult.ok) return revokeResult.message;
        if (deviceId === originDeviceId) {
          authorizedDeviceSessionRef.current = false;
          setIsAuthorizedDeviceSession(false);
          setStepUpFreshUntil(null);
        }
        await refreshAccountState();
        return deviceId === originDeviceId
          ? 'Este dispositivo fue revocado y quedo sin confianza.'
          : 'Dispositivo revocado.';
      } catch (error) {
        return sessionOperationErrorMessage(
          error,
          'No pudimos revocar el dispositivo. Inténtalo de nuevo.',
        );
      }
    },
    [authorizeCurrentDeviceSession, refreshAccountState, setStepUpFreshUntil, stepUpAuth],
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
      loadingStage,
      sessionError,
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
      isAuthorizedDeviceSession,
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
      authorizeCurrentDeviceSession,
      revokeTrustedDevice,
      refreshAccountState,
      retrySession,
      signOut,
      unlock,
      lock,
      stepUpAuth,
      setBiometricsEnabled,
      refreshBiometricSupport,
      beginNotificationEnableFromSettings,
      setNotificationsEnabled,
      requestContactsPermission,
      requestNotificationsPermission,
      clearRememberedAccount,
    }),
    [
      attachEmailPassword,
      authorizeCurrentDeviceSession,
      accountAccessState,
      authMode,
      authProvider,
      biometricAvailable,
      biometricLabel,
      biometricsEnabled,
      beginNotificationEnableFromSettings,
      canTrustCurrentDeviceWithoutPassword,
      completeProfile,
      contactsPermissionStatus,
      currentDeviceId,
      deviceTrustState,
      isAuthorizedDeviceSession,
      isEmailConfirmed,
      appleSignInAvailable,
      clearRememberedAccount,
      linkApple,
      linkGoogle,
      linkedMethods,
      loadingStage,
      sessionError,
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
      refreshBiometricSupport,
      retrySession,
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
