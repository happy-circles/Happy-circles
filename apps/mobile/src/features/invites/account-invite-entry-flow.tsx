import { useEffect, useMemo, useRef, useState } from 'react';
import type { Ionicons } from '@expo/vector-icons';
import {
  Animated,
  Keyboard,
  LayoutAnimation,
  Platform,
  Pressable,
  UIManager,
  View,
} from 'react-native';
import { useRouter, type Href } from 'expo-router';

import {
  BRAND_VERIFICATION_EASING,
  BRAND_VERIFICATION_RESULT_MS,
  type BrandVerificationState,
} from '@/components/brand-verification-lockup';
import {
  IdentityFlowLogoCopy,
  IdentityFlowPrimaryAction,
  IdentityFlowScreen,
  IdentityFlowSecondaryAction,
} from '@/components/identity-flow';
import { MessageBanner } from '@/components/message-banner';
import {
  beginAuthRouteTransitionHold,
  clearAuthRouteTransitionHold,
} from '@/lib/auth-route-transition-hold';
import { resolveAvatarUrl } from '@/lib/avatar';
import { beginHomeEntryHandoffAfterScrollReset } from '@/lib/home-entry-handoff';
import {
  triggerIdentityErrorHaptic,
  triggerIdentityImpactHaptic,
  triggerIdentitySelectionHaptic,
  triggerIdentitySuccessHaptic,
  triggerIdentityWarningHaptic,
} from '@/lib/identity-flow-haptics';
import { writePendingInviteIntent } from '@/lib/invite-intent';
import { useAccountInvitePreviewQuery } from '@/lib/live-data';
import { pushRoute, returnToRoute } from '@/lib/navigation';
import { buildSetupAccountHref } from '@/lib/setup-account';
import { beginSetupEntryHandoff } from '@/lib/setup-entry-handoff';
import { useSession } from '@/providers/session-provider';
import { useAppTheme } from '@/providers/theme-provider';
import {
  emailAccordionCloseLayoutAnimation,
  emailAccordionOpenLayoutAnimation,
} from './account-invite-entry-animations';
import {
  MIN_ACCOUNT_INVITE_TOKEN_LENGTH,
  accountInviteStatusMessage,
  extractAccountInviteToken,
} from './account-invite-utils';
import { AccountInviteEntryTokenForm } from './account-invite-entry-token-form';
import { AuthEntryIdentity } from './account-invite-entry-identity';
import { AccountInviteEntryAuthForm } from './account-invite-entry-auth-form';
import { usePendingAccountInviteTokenPreparation } from './account-invite-entry-pending-token';
import { accountInviteEntryStyles as styles } from './account-invite-entry-screen.styles';
import {
  AUTH_ACTION_AFTER_KEYBOARD_DISMISS_MS,
  AUTH_ROUTE_TRANSITION_HOLD_MS,
  AUTH_SUCCESS_NAVIGATION_DELAY_MS,
  PASSWORD_RECOVERY_CODE_VERIFIED_MESSAGE,
  PASSWORD_RESET_RESEND_SECONDS,
  PASSWORD_RESET_SENT_MESSAGE,
  biometricMessage,
  isRecoveryCodeValid,
  resolveAuthLogoCopy,
  resolveSecondaryAuthAction,
  resolveTokenFieldError,
  resolveTokenLogoSubtitle,
  validateEmailForAuth,
  validatePasswordForAuth,
  type AuthEntryMode,
  type JoinEntrySurface,
  type RememberedReauthReason,
  type SignInEntryMode,
  type SocialProvider,
} from './account-invite-entry-helpers';
import { useLaunchIntroVisible } from '@/components/launch-intro-presence';

const AUTH_STATE_TRANSITION_MS = 260;
const AUTH_STATE_EASING = BRAND_VERIFICATION_EASING;
const AUTH_SURFACE_TRANSITION_SETTLE_MS = AUTH_STATE_TRANSITION_MS + 40;
const AUTH_STAGE_TRAVEL_SETTLE_MS = AUTH_STATE_TRANSITION_MS + 120;
const AUTH_TOKEN_KEYBOARD_ACTION_CLEARANCE = 148;
const AUTH_PASSWORD_KEYBOARD_ACTION_CLEARANCE = 148;

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function isSetupAccountDestination(destination: Href) {
  return typeof destination === 'string'
    ? destination.startsWith('/setup-account')
    : destination.pathname === '/setup-account';
}

export function AccountSignInEntry({
  autoUseRememberedAccount = false,
  initialMode = 'sign-in',
  initialSurface = 'auth',
  initialToken,
  isPreviewMode = false,
}: {
  readonly autoUseRememberedAccount?: boolean;
  readonly initialMode?: SignInEntryMode;
  readonly initialSurface?: JoinEntrySurface;
  readonly initialToken: string;
  readonly isPreviewMode?: boolean;
}) {
  const activeTheme = useAppTheme();
  const launchIntroVisible = useLaunchIntroVisible();
  const session = useSession();
  const router = useRouter();
  const account = session.rememberedAccount;
  const [entrySurface, setEntrySurface] = useState<JoinEntrySurface>(initialSurface);
  const [tokenInput, setTokenInput] = useState(initialToken);
  const [tokenTouched, setTokenTouched] = useState(false);
  const [tokenMessage, setTokenMessage] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<SignInEntryMode>(initialMode);
  const [authEntryMode, setAuthEntryMode] = useState<AuthEntryMode>('remembered');
  const [rememberedReauthReason, setRememberedReauthReason] =
    useState<RememberedReauthReason | null>(null);
  const [showAuthOptions, setShowAuthOptions] = useState(!account || initialMode === 'recover');
  const [showPasswordFallback, setShowPasswordFallback] = useState(initialMode === 'recover');
  const [authOptionsMounted, setAuthOptionsMounted] = useState(showAuthOptions);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [authErrors, setAuthErrors] = useState<{
    readonly email?: string;
    readonly password?: string;
  }>({});
  const [biometricBusy, setBiometricBusy] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [socialBusyProvider, setSocialBusyProvider] = useState<SocialProvider | null>(null);
  const [authSuccess, setAuthSuccess] = useState(false);
  const [authResultState, setAuthResultState] = useState<BrandVerificationState | null>(null);
  const [recoveryLinkSent, setRecoveryLinkSent] = useState(false);
  const [recoveryResendSeconds, setRecoveryResendSeconds] = useState(0);
  const [authContentVisible, setAuthContentVisible] = useState(true);
  const [authSurfaceTransitioning, setAuthSurfaceTransitioning] = useState(false);
  const [transitionTargetSurface, setTransitionTargetSurface] = useState<JoinEntrySurface | null>(
    null,
  );

  const avatarUrl = account ? resolveAvatarUrl(account.avatarPath) : null;
  const normalizedToken = useMemo(() => extractAccountInviteToken(tokenInput), [tokenInput]);
  const shouldPreview = normalizedToken.length >= MIN_ACCOUNT_INVITE_TOKEN_LENGTH;
  const previewQuery = useAccountInvitePreviewQuery(shouldPreview ? normalizedToken : null);
  const preview = previewQuery.data;
  const blockingMessage = preview
    ? accountInviteStatusMessage(preview.status, preview.deliveryStatus)
    : null;
  const pendingToken = shouldPreview ? normalizedToken : null;
  const pendingTokenPreparation = usePendingAccountInviteTokenPreparation({
    onIgnored: () => {
      setTokenInput('');
      setTokenTouched(false);
      setTokenMessage(null);
      router.setParams({ mode: 'sign-in', token: undefined });
    },
    pendingToken,
    preview,
    refetchPreview: () => previewQuery.refetch(),
  });
  const authRequestBusy = biometricBusy || passwordBusy || Boolean(socialBusyProvider);
  const authBusy =
    authRequestBusy || authSurfaceTransitioning || authResultState === 'success' || authSuccess;
  const authVisualState: BrandVerificationState =
    authResultState ?? (authRequestBusy ? 'loading' : 'idle');
  const isRecovery = authMode === 'recover';
  const showPasswordFields = isRecovery || showPasswordFallback;
  const recoveryCodeValid = isRecoveryCodeValid(recoveryCode);
  const isOtherAccountMode = showAuthOptions && authEntryMode === 'other';
  const isRememberedReauthMode =
    showAuthOptions &&
    authEntryMode === 'remembered' &&
    rememberedReauthReason !== null &&
    Boolean(account) &&
    !isRecovery;
  const locksRememberedEmail = isRememberedReauthMode && Boolean(account?.email);
  const authOptionsMotion = useRef(new Animated.Value(showAuthOptions ? 1 : 0)).current;
  const authEntryMotion = useRef(new Animated.Value(authEntryMode === 'other' ? 1 : 0)).current;
  const surfaceSwapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const surfaceRevealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const successNavigationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const successCompletionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasLockedForRememberedUnlockRef = useRef(session.status === 'signed_in_locked');
  const automaticUnlockHandledRef = useRef(false);
  const automaticBiometricPromptAttemptedRef = useRef(false);

  useEffect(() => {
    if (showAuthOptions) {
      setAuthOptionsMounted(true);
    }

    Animated.timing(authOptionsMotion, {
      duration: AUTH_STATE_TRANSITION_MS,
      easing: AUTH_STATE_EASING,
      toValue: showAuthOptions ? 1 : 0,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !showAuthOptions) {
        setAuthOptionsMounted(false);
      }
    });
  }, [authOptionsMotion, showAuthOptions]);

  useEffect(() => {
    Animated.timing(authEntryMotion, {
      duration: AUTH_STATE_TRANSITION_MS,
      easing: AUTH_STATE_EASING,
      toValue: authEntryMode === 'other' ? 1 : 0,
      useNativeDriver: true,
    }).start();
  }, [authEntryMode, authEntryMotion]);

  useEffect(
    () => () => {
      if (successNavigationTimerRef.current) {
        clearTimeout(successNavigationTimerRef.current);
      }
      if (successCompletionTimerRef.current) {
        clearTimeout(successCompletionTimerRef.current);
      }
      if (surfaceSwapTimerRef.current) {
        clearTimeout(surfaceSwapTimerRef.current);
      }
      if (surfaceRevealTimerRef.current) {
        clearTimeout(surfaceRevealTimerRef.current);
      }
      clearAuthRouteTransitionHold();
    },
    [],
  );

  useEffect(() => {
    pendingTokenPreparation.replaceInput(initialToken);
    setTokenInput(initialToken);
    setTokenTouched(false);
  }, [initialToken]);

  useEffect(() => {
    if (!autoUseRememberedAccount || !account || entrySurface !== 'token' || isPreviewMode) {
      return;
    }

    transitionAuthSurface(
      () => {
        setEntrySurface('auth');
        setAuthEntryMode('remembered');
        setAuthMode('sign-in');
        setEmail(account.email ?? '');
        setPassword('');
        setAuthErrors({});
        setAuthSuccess(false);
        setAuthResultState(null);
        setRememberedReauthReason(null);
        setShowPasswordFallback(false);
        setRecoveryLinkSent(false);
        setRecoveryResendSeconds(0);
        setRecoveryCode('');
        setMessage(null);
        setShowAuthOptions(false);
      },
      false,
      'auth',
    );
  }, [account, autoUseRememberedAccount, entrySurface, isPreviewMode]);

  useEffect(() => {
    if (
      !account ||
      entrySurface !== 'auth' ||
      authMode !== 'sign-in' ||
      authEntryMode !== 'remembered' ||
      rememberedReauthReason !== null ||
      authSurfaceTransitioning ||
      isPreviewMode
    ) {
      return;
    }

    if (!showAuthOptions && !authOptionsMounted) {
      return;
    }

    authEntryMotion.stopAnimation();
    authEntryMotion.setValue(0);
    authOptionsMotion.stopAnimation();
    authOptionsMotion.setValue(0);
    setEmail(account.email ?? '');
    setPassword('');
    setAuthErrors({});
    setAuthSuccess(false);
    setAuthResultState(null);
    setRememberedReauthReason(null);
    setRecoveryLinkSent(false);
    setRecoveryResendSeconds(0);
    setRecoveryCode('');
    setMessage(null);
    setAuthOptionsMounted(false);
    setShowAuthOptions(false);
  }, [
    account,
    authEntryMode,
    authEntryMotion,
    authMode,
    authOptionsMotion,
    authOptionsMounted,
    authSurfaceTransitioning,
    entrySurface,
    isPreviewMode,
    rememberedReauthReason,
    showAuthOptions,
  ]);

  useEffect(() => {
    if (session.status === 'signed_in_locked') {
      wasLockedForRememberedUnlockRef.current = true;
      automaticUnlockHandledRef.current = false;
      return;
    }

    if (session.status !== 'signed_in_unlocked') {
      wasLockedForRememberedUnlockRef.current = false;
      automaticUnlockHandledRef.current = false;
      return;
    }

    if (
      !wasLockedForRememberedUnlockRef.current ||
      automaticUnlockHandledRef.current ||
      !account ||
      entrySurface !== 'auth' ||
      authMode !== 'sign-in' ||
      authEntryMode !== 'remembered' ||
      showAuthOptions ||
      authRequestBusy ||
      authSurfaceTransitioning ||
      authSuccess ||
      authResultState === 'success' ||
      isPreviewMode
    ) {
      return;
    }

    automaticUnlockHandledRef.current = true;
    void pendingTokenPreparation
      .prepare()
      .then(() => {
        completeSuccessfulSignIn();
      })
      .catch((error) => {
        showRememberedReauthMode(
          error instanceof Error ? error.message : 'No pudimos validar esta invitación.',
        );
      });
  }, [
    account,
    authEntryMode,
    authMode,
    authResultState,
    authRequestBusy,
    authSuccess,
    authSurfaceTransitioning,
    entrySurface,
    isPreviewMode,
    session.status,
    showAuthOptions,
  ]);

  useEffect(() => {
    if (!recoveryLinkSent || recoveryResendSeconds <= 0) {
      return undefined;
    }

    const timer = setTimeout(() => {
      setRecoveryResendSeconds((current) => Math.max(0, current - 1));
    }, 1000);

    return () => clearTimeout(timer);
  }, [recoveryLinkSent, recoveryResendSeconds]);

  const authOptionsAnimatedStyle = {
    opacity: authOptionsMotion,
  };
  const rememberedIdentityStyle = {
    opacity: authEntryMotion.interpolate({
      inputRange: [0, 1],
      outputRange: [1, 0],
    }),
  };
  const otherAccountIdentityStyle = {
    opacity: authEntryMotion,
  };

  useEffect(() => {
    if (!authSuccess) {
      return undefined;
    }

    if (successNavigationTimerRef.current) {
      clearTimeout(successNavigationTimerRef.current);
      successNavigationTimerRef.current = null;
    }

    if (
      session.status === 'loading' ||
      session.status === 'signed_out' ||
      session.status === 'signed_in_locked'
    ) {
      return undefined;
    }

    if (session.accountAccessState === 'loading') {
      return undefined;
    }

    if (session.profileCompletionState === 'loading') {
      return undefined;
    }

    let cancelled = false;
    const destination = !session.setupState.requiredComplete
      ? buildSetupAccountHref(session.setupState.pendingRequiredSteps[0] ?? 'profile')
      : session.setupState.securityPending
        ? buildSetupAccountHref('security')
        : pendingToken
          ? ({
              pathname: '/join/[token]',
              params: { token: pendingToken },
            } as unknown as Href)
          : session.accountAccessState === 'active'
            ? ('/home' as Href)
            : ('/join' as Href);

    successNavigationTimerRef.current = setTimeout(() => {
      successNavigationTimerRef.current = null;
      void (async () => {
        clearAuthRouteTransitionHold();
        if (destination === '/home') {
          await beginHomeEntryHandoffAfterScrollReset();
        } else if (isSetupAccountDestination(destination)) {
          await beginSetupEntryHandoff();
        }
        if (cancelled) {
          return;
        }
        returnToRoute(router, destination);
      })();
    }, AUTH_SUCCESS_NAVIGATION_DELAY_MS);

    return () => {
      cancelled = true;
      if (successNavigationTimerRef.current) {
        clearTimeout(successNavigationTimerRef.current);
        successNavigationTimerRef.current = null;
      }
    };
  }, [
    authSuccess,
    pendingToken,
    router,
    session.accountAccessState,
    session.profileCompletionState,
    session.setupState.pendingRequiredSteps,
    session.setupState.requiredComplete,
    session.setupState.securityPending,
    session.status,
  ]);

  function clearSuccessCompletionTimer() {
    if (successCompletionTimerRef.current) {
      clearTimeout(successCompletionTimerRef.current);
      successCompletionTimerRef.current = null;
    }
  }

  function clearSurfaceTransitionTimers() {
    if (surfaceSwapTimerRef.current) {
      clearTimeout(surfaceSwapTimerRef.current);
      surfaceSwapTimerRef.current = null;
    }
    if (surfaceRevealTimerRef.current) {
      clearTimeout(surfaceRevealTimerRef.current);
      surfaceRevealTimerRef.current = null;
    }
    setTransitionTargetSurface(null);
  }

  function transitionAuthSurface(
    applyNextSurface: () => void,
    waitForStageTravel: boolean,
    targetSurface: JoinEntrySurface | null = null,
  ) {
    clearSurfaceTransitionTimers();
    setTransitionTargetSurface(targetSurface);
    setAuthSurfaceTransitioning(true);
    setAuthContentVisible(true);
    applyNextSurface();

    surfaceRevealTimerRef.current = setTimeout(
      () => {
        surfaceRevealTimerRef.current = null;
        setAuthSurfaceTransitioning(false);
        setTransitionTargetSurface(null);
      },
      waitForStageTravel ? AUTH_STAGE_TRAVEL_SETTLE_MS : AUTH_SURFACE_TRANSITION_SETTLE_MS,
    );
  }

  function syncJoinSurfaceParams(nextSurface: JoinEntrySurface) {
    router.setParams(
      pendingToken
        ? { mode: nextSurface === 'token' ? 'token' : 'sign-in', token: pendingToken }
        : { mode: nextSurface === 'token' ? 'token' : 'sign-in', token: undefined },
    );
  }

  function exitToInviteEntry() {
    if (authBusy) {
      return;
    }

    triggerIdentitySelectionHaptic();
    Keyboard.dismiss();
    clearAuthRouteTransitionHold();
    clearSuccessCompletionTimer();
    clearSurfaceTransitionTimers();
    setMessage(null);
    setTokenMessage(null);
    transitionAuthSurface(
      () => {
        setEntrySurface('token');
        setAuthEntryMode('remembered');
        setAuthMode('sign-in');
        setEmail(account?.email ?? '');
        setPassword('');
        setAuthErrors({});
        setAuthSuccess(false);
        setAuthResultState(null);
        setRememberedReauthReason(null);
        setRecoveryLinkSent(false);
        setRecoveryResendSeconds(0);
        setRecoveryCode('');
        setMessage(null);
        setShowAuthOptions(!account);
        syncJoinSurfaceParams('token');
      },
      true,
      'token',
    );
  }

  function completeSuccessfulSignIn() {
    triggerIdentitySuccessHaptic();
    beginAuthRouteTransitionHold(
      BRAND_VERIFICATION_RESULT_MS + AUTH_SUCCESS_NAVIGATION_DELAY_MS + 1000,
    );
    setAuthResultState('success');
    setRememberedReauthReason(null);
    setMessage(null);

    if (successNavigationTimerRef.current) {
      clearTimeout(successNavigationTimerRef.current);
      successNavigationTimerRef.current = null;
    }
    clearSuccessCompletionTimer();

    successCompletionTimerRef.current = setTimeout(() => {
      successCompletionTimerRef.current = null;
      setAuthSuccess(true);
    }, BRAND_VERIFICATION_RESULT_MS);
  }

  function showAuthFailure(nextMessage: string, preserveTransitionHold = false) {
    triggerIdentityErrorHaptic();
    if (!preserveTransitionHold) clearAuthRouteTransitionHold();
    clearSuccessCompletionTimer();
    setAuthResultState('error');
    setMessage(nextMessage);
  }

  function showRememberedReauthMode(
    nextMessage: string | null = null,
    reason: RememberedReauthReason = 'biometric-failed',
    preserveTransitionHold = false,
  ) {
    if (nextMessage) {
      triggerIdentityErrorHaptic();
    }
    if (!preserveTransitionHold) clearAuthRouteTransitionHold();
    clearSuccessCompletionTimer();
    transitionAuthSurface(
      () => {
        authEntryMotion.stopAnimation();
        authEntryMotion.setValue(0);
        setAuthEntryMode('remembered');
        setAuthMode('sign-in');
        setEmail(account?.email ?? '');
        setPassword('');
        setAuthErrors({});
        setAuthSuccess(false);
        setAuthResultState(nextMessage ? 'error' : null);
        setRememberedReauthReason(reason);
        setShowPasswordFallback(false);
        setRecoveryLinkSent(false);
        setRecoveryResendSeconds(0);
        setRecoveryCode('');
        setMessage(nextMessage);
        setAuthOptionsMounted(true);
        setShowAuthOptions(true);
      },
      !showAuthOptions,
      'auth',
    );
  }

  function showOtherAccountMode() {
    if (authBusy) {
      return;
    }

    triggerIdentitySelectionHaptic();
    clearAuthRouteTransitionHold();
    clearSuccessCompletionTimer();
    transitionAuthSurface(
      () => {
        setAuthEntryMode('other');
        setAuthMode('sign-in');
        setShowPasswordFallback(false);
        setEmail('');
        setPassword('');
        setAuthErrors({});
        setAuthSuccess(false);
        setAuthResultState(null);
        setRememberedReauthReason(null);
        setRecoveryLinkSent(false);
        setRecoveryResendSeconds(0);
        setRecoveryCode('');
        setMessage(null);
        setAuthOptionsMounted(true);
        setShowAuthOptions(true);
      },
      !showAuthOptions,
      'auth',
    );
  }

  function showRecoverMode() {
    if (authBusy) {
      return;
    }

    triggerIdentitySelectionHaptic();
    clearAuthRouteTransitionHold();
    clearSuccessCompletionTimer();
    transitionAuthSurface(
      () => {
        setAuthMode('recover');
        setShowPasswordFallback(true);
        setAuthErrors({});
        setAuthSuccess(false);
        setAuthResultState(null);
        setRememberedReauthReason(null);
        setRecoveryLinkSent(false);
        setRecoveryResendSeconds(0);
        setRecoveryCode('');
        setMessage(null);
        setAuthOptionsMounted(true);
        setShowAuthOptions(true);
      },
      false,
      'auth',
    );
  }

  function showSignInMode() {
    if (authBusy) {
      return;
    }

    triggerIdentitySelectionHaptic();
    clearAuthRouteTransitionHold();
    clearSuccessCompletionTimer();
    transitionAuthSurface(
      () => {
        setAuthMode('sign-in');
        setShowPasswordFallback(false);
        setAuthErrors({});
        setAuthSuccess(false);
        setAuthResultState(null);
        setRememberedReauthReason(null);
        setRecoveryLinkSent(false);
        setRecoveryResendSeconds(0);
        setRecoveryCode('');
        setMessage(null);
        setAuthOptionsMounted(true);
        setShowAuthOptions(true);
      },
      false,
      'auth',
    );
  }

  function handleEmailChange(value: string) {
    setEmail(value);
    setAuthErrors((current) => ({ ...current, email: undefined }));
    setAuthResultState(null);
    if (recoveryLinkSent) {
      setRecoveryLinkSent(false);
      setRecoveryResendSeconds(0);
      setRecoveryCode('');
      setMessage(null);
      return;
    }
    if (message && !isRecovery) {
      setMessage(null);
    }
  }

  function handleRecoveryCodeChange(value: string) {
    setRecoveryCode(value);
    setAuthResultState(null);
    if (message) {
      setMessage(null);
    }
  }

  function handlePasswordChange(value: string) {
    setPassword(value);
    setAuthErrors((current) => ({ ...current, password: undefined }));
    setAuthResultState(null);
    if (message && !isRecovery) {
      setMessage(null);
    }
  }

  function validateEmailField() {
    const resolvedEmail = locksRememberedEmail ? (account?.email ?? email) : email;
    const nextEmailError = validateEmailForAuth(resolvedEmail);

    setAuthErrors((current) => ({ ...current, email: nextEmailError }));
    return !nextEmailError;
  }

  function validatePasswordField() {
    const nextPasswordError = validatePasswordForAuth({ isRecovery, password });

    setAuthErrors((current) => ({ ...current, password: nextPasswordError }));
    return !nextPasswordError;
  }

  function validatePasswordAuthForm() {
    const emailValid = validateEmailField();
    const passwordValid = isRecovery ? true : validatePasswordField();

    if (!emailValid || !passwordValid) {
      triggerIdentityWarningHaptic();
      return false;
    }

    return true;
  }

  function runAfterKeyboardDismiss(action: () => void | Promise<void>) {
    Keyboard.dismiss();
    setTimeout(() => {
      void action();
    }, AUTH_ACTION_AFTER_KEYBOARD_DISMISS_MS);
  }

  function togglePasswordFallback() {
    LayoutAnimation.configureNext(
      showPasswordFallback ? emailAccordionCloseLayoutAnimation : emailAccordionOpenLayoutAnimation,
    );
    setShowPasswordFallback((open) => !open);

    if (showPasswordFallback) {
      setAuthErrors({});
      setAuthResultState(null);
      setMessage(null);
    }
  }

  async function handleContinue(options?: { readonly automatic?: boolean }) {
    if (authBusy || !account) {
      return;
    }

    const isAutomatic = options?.automatic ?? false;
    let authenticationSucceeded = false;

    if (!isAutomatic) {
      triggerIdentityImpactHaptic();
    }

    if (session.status === 'signed_out') {
      showRememberedReauthMode(
        'Tu sesión venció. Confirma tu acceso para continuar.',
        'session-expired',
      );
      return;
    }

    setBiometricBusy(true);
    beginAuthRouteTransitionHold(AUTH_ROUTE_TRANSITION_HOLD_MS);
    clearSuccessCompletionTimer();
    setAuthResultState(null);
    setMessage(null);

    try {
      const attempt = await pendingTokenPreparation.prepare();
      const result = await session.unlock();
      if (result.success) {
        authenticationSucceeded = true;
        beginAuthRouteTransitionHold(AUTH_ROUTE_TRANSITION_HOLD_MS);
      }
      await pendingTokenPreparation.reconcile(attempt);
      if (!result.success) {
        if (
          isAutomatic &&
          (result.error === 'user_cancel' ||
            result.error === 'app_cancel' ||
            result.error === 'system_cancel')
        ) {
          clearAuthRouteTransitionHold();
          setAuthResultState(null);
          setMessage(null);
          return;
        }

        showRememberedReauthMode(biometricMessage(result.error, session.biometricLabel));
        return;
      }

      completeSuccessfulSignIn();
    } catch (error) {
      showRememberedReauthMode(
        error instanceof Error ? error.message : 'No pudimos validar esta invitación.',
        'biometric-failed',
        authenticationSucceeded,
      );
    } finally {
      setBiometricBusy(false);
    }
  }

  useEffect(() => {
    if (session.status !== 'signed_in_locked') {
      automaticBiometricPromptAttemptedRef.current = false;
      return;
    }

    if (
      automaticBiometricPromptAttemptedRef.current ||
      launchIntroVisible ||
      !account ||
      entrySurface !== 'auth' ||
      authMode !== 'sign-in' ||
      authEntryMode !== 'remembered' ||
      rememberedReauthReason !== null ||
      showAuthOptions ||
      authBusy ||
      authSurfaceTransitioning ||
      authSuccess ||
      isPreviewMode
    ) {
      return;
    }

    automaticBiometricPromptAttemptedRef.current = true;
    void handleContinue({ automatic: true });
  }, [
    account,
    authBusy,
    authEntryMode,
    authMode,
    authSuccess,
    authSurfaceTransitioning,
    entrySurface,
    isPreviewMode,
    launchIntroVisible,
    rememberedReauthReason,
    session.status,
    showAuthOptions,
  ]);

  async function handleSocialSignIn(provider: SocialProvider) {
    if (authBusy) {
      return;
    }

    triggerIdentityImpactHaptic();

    beginAuthRouteTransitionHold(AUTH_ROUTE_TRANSITION_HOLD_MS);
    clearSuccessCompletionTimer();
    setAuthSuccess(false);
    setAuthResultState(null);
    setMessage(null);
    setSocialBusyProvider(provider);
    let authenticationSucceeded = false;

    try {
      const attempt = await pendingTokenPreparation.prepare();
      const result =
        provider === 'google' ? await session.signInWithGoogle() : await session.signInWithApple();
      const signInSucceeded = result === 'Sesión iniciada.';
      if (signInSucceeded) {
        authenticationSucceeded = true;
        beginAuthRouteTransitionHold(AUTH_ROUTE_TRANSITION_HOLD_MS);
      }
      const reconciledAttempt = await pendingTokenPreparation.reconcile(attempt);

      if (signInSucceeded) {
        await session.refreshAccountState({ preserveLocked: false });
        await pendingTokenPreparation.reconcile(reconciledAttempt);
        completeSuccessfulSignIn();
        return;
      }

      showAuthFailure(result);
    } catch (error) {
      showAuthFailure(
        error instanceof Error ? error.message : 'No pudimos validar tu sesion.',
        authenticationSucceeded,
      );
    } finally {
      setSocialBusyProvider(null);
    }
  }

  async function handlePasswordSignIn() {
    if (authBusy) {
      return;
    }

    triggerIdentityImpactHaptic();
    if (!validatePasswordAuthForm()) {
      return;
    }

    beginAuthRouteTransitionHold(AUTH_ROUTE_TRANSITION_HOLD_MS);
    clearSuccessCompletionTimer();
    setAuthSuccess(false);
    setAuthResultState(null);
    setMessage(null);
    setPasswordBusy(true);
    let authenticationSucceeded = false;

    try {
      const attempt = await pendingTokenPreparation.prepare();
      const result = await session.signInWithPassword({
        email: locksRememberedEmail ? (account?.email ?? email) : email,
        password,
      });
      const signInSucceeded = result === 'Sesión iniciada.';
      if (signInSucceeded) {
        authenticationSucceeded = true;
        beginAuthRouteTransitionHold(AUTH_ROUTE_TRANSITION_HOLD_MS);
      }
      const reconciledAttempt = await pendingTokenPreparation.reconcile(attempt);
      if (signInSucceeded) {
        await session.refreshAccountState({ preserveLocked: false });
        await pendingTokenPreparation.reconcile(reconciledAttempt);
        completeSuccessfulSignIn();
        return;
      }

      showAuthFailure(result);
    } catch (error) {
      showAuthFailure(
        error instanceof Error ? error.message : 'No pudimos validar tu sesion.',
        authenticationSucceeded,
      );
    } finally {
      setPasswordBusy(false);
    }
  }

  async function handlePasswordRecovery() {
    if (authBusy) {
      return;
    }

    triggerIdentityImpactHaptic();
    if (!validatePasswordAuthForm()) {
      return;
    }

    setMessage(null);
    clearSuccessCompletionTimer();
    setAuthResultState(null);
    setPasswordBusy(true);

    try {
      const result = await session.requestPasswordReset(email);
      if (result === PASSWORD_RESET_SENT_MESSAGE) {
        triggerIdentitySuccessHaptic();
        setRecoveryLinkSent(true);
        setRecoveryResendSeconds(PASSWORD_RESET_RESEND_SECONDS);
        setRecoveryCode('');
        setAuthResultState(null);
        setMessage(null);
      } else {
        triggerIdentityErrorHaptic();
        setRecoveryLinkSent(false);
        setRecoveryResendSeconds(0);
        setRecoveryCode('');
        setAuthResultState('error');
        setMessage(result);
      }
    } finally {
      setPasswordBusy(false);
    }
  }

  async function handlePasswordRecoveryCode() {
    if (authBusy) {
      return;
    }

    triggerIdentityImpactHaptic();
    if (!validateEmailField()) {
      return;
    }

    if (!recoveryCodeValid) {
      triggerIdentityWarningHaptic();
      setAuthResultState('error');
      setMessage('Ingresa el código de 8 dígitos del correo.');
      return;
    }

    beginAuthRouteTransitionHold(AUTH_ROUTE_TRANSITION_HOLD_MS);
    clearSuccessCompletionTimer();
    setAuthResultState(null);
    setMessage(null);
    setPasswordBusy(true);

    try {
      const result = await session.verifyPasswordRecoveryOtp({
        code: recoveryCode,
        email,
      });

      if (result === PASSWORD_RECOVERY_CODE_VERIFIED_MESSAGE) {
        triggerIdentitySuccessHaptic();
        setRecoveryCode('');
        setAuthResultState('success');
        returnToRoute(router, '/reset-password');
        return;
      }

      showAuthFailure(result);
    } finally {
      setPasswordBusy(false);
    }
  }

  function showSignInEntry() {
    if (authBusy || entrySurface === 'auth') {
      return;
    }

    triggerIdentitySelectionHaptic();
    Keyboard.dismiss();
    setTokenMessage(null);
    transitionAuthSurface(
      () => {
        const nextShowAuthOptions = !account;
        setEntrySurface('auth');
        setAuthEntryMode(account ? 'remembered' : 'other');
        setAuthMode('sign-in');
        setEmail(account?.email ?? '');
        setPassword('');
        setAuthErrors({});
        setAuthSuccess(false);
        setAuthResultState(null);
        setRememberedReauthReason(null);
        setRecoveryLinkSent(false);
        setRecoveryResendSeconds(0);
        setRecoveryCode('');
        setMessage(null);
        setAuthOptionsMounted(nextShowAuthOptions);
        setShowAuthOptions(nextShowAuthOptions);
        syncJoinSurfaceParams('auth');
      },
      !account,
      'auth',
    );
  }

  async function handleTokenContinue() {
    if (authBusy || previewQuery.isFetching) {
      return;
    }

    const token = extractAccountInviteToken(tokenInput);
    if (token.length < MIN_ACCOUNT_INVITE_TOKEN_LENGTH) {
      setTokenTouched(true);
      triggerIdentityWarningHaptic();
      setTokenMessage('Abre tu enlace de invitación o pega el código completo para continuar.');
      return;
    }

    triggerIdentityImpactHaptic();
    setTokenMessage(null);

    const previewResult = await previewQuery.refetch();
    if (previewResult.error) {
      triggerIdentityErrorHaptic();
      setTokenMessage(previewResult.error.message);
      return;
    }

    const nextPreview = previewResult.data;
    if (!nextPreview) {
      triggerIdentityErrorHaptic();
      setTokenMessage('No pudimos validar esta invitación. Intenta otra vez.');
      return;
    }

    const nextBlockingMessage = accountInviteStatusMessage(
      nextPreview.status,
      nextPreview.deliveryStatus,
    );
    if (nextBlockingMessage) {
      triggerIdentityErrorHaptic();
      setTokenMessage(nextBlockingMessage);
      return;
    }

    await writePendingInviteIntent({
      type: 'account_invite',
      token,
      source: 'account_invite_link',
    });

    triggerIdentitySuccessHaptic();
    pushRoute(router, {
      pathname: '/join/[token]/create-account',
      params: { token },
    } as unknown as Href);
  }

  const authIdentity =
    account && !isRecovery ? (
      <Animated.View style={styles.rememberedProfileMotion}>
        {showAuthOptions ? (
          <View style={styles.authIdentityStage}>
            <Animated.View
              pointerEvents={isOtherAccountMode ? 'none' : 'auto'}
              style={[styles.rememberedProfile, styles.authIdentityLayer, rememberedIdentityStyle]}
            >
              <AuthEntryIdentity
                avatarLabel={account.displayName}
                avatarUrl={avatarUrl}
                disabled={isOtherAccountMode}
                state={authVisualState}
                variant="remembered"
              />
            </Animated.View>

            <Animated.View
              pointerEvents={isOtherAccountMode ? 'auto' : 'none'}
              style={[
                styles.rememberedProfile,
                styles.authIdentityLayer,
                otherAccountIdentityStyle,
              ]}
            >
              <AuthEntryIdentity disabled={!isOtherAccountMode} state={authVisualState} />
            </Animated.View>
          </View>
        ) : (
          <Pressable
            disabled={authBusy}
            onPress={() => runAfterKeyboardDismiss(handleContinue)}
            style={({ pressed }) => [
              styles.rememberedProfile,
              pressed && !authBusy ? styles.pressed : null,
            ]}
          >
            <AuthEntryIdentity
              avatarLabel={account.displayName}
              avatarUrl={avatarUrl}
              state={authVisualState}
              variant="remembered"
            />
          </Pressable>
        )}
      </Animated.View>
    ) : (
      <Animated.View style={styles.rememberedProfileMotion}>
        <View style={isRecovery ? undefined : styles.authIdentityStage}>
          <View style={[styles.rememberedProfile, isRecovery ? null : styles.authIdentityLayer]}>
            <AuthEntryIdentity state={authVisualState} />
          </View>
        </View>
      </Animated.View>
    );

  const secondaryAuthAction = resolveSecondaryAuthAction({
    hasRememberedAccount: Boolean(account),
    isOtherAccountMode,
    isRecovery,
  });
  const secondaryAuthActionPress =
    secondaryAuthAction.intent === 'show_other_account'
      ? showOtherAccountMode
      : secondaryAuthAction.intent === 'show_sign_in'
        ? showSignInMode
        : exitToInviteEntry;

  const authPrimaryAction = (
    <IdentityFlowPrimaryAction
      disabled={authBusy}
      icon={!showAuthOptions && account && !isRecovery ? 'arrow-forward' : undefined}
      label={
        !showAuthOptions && account && !isRecovery
          ? biometricBusy
            ? 'Validando...'
            : 'Continuar'
          : passwordBusy
            ? 'Procesando...'
            : isRecovery
              ? recoveryLinkSent
                ? 'Confirmar código'
                : 'Enviar enlace'
              : 'Ingresar'
      }
      loading={biometricBusy || passwordBusy}
      onPress={
        authBusy
          ? undefined
          : () =>
              void (!showAuthOptions && account && !isRecovery
                ? handleContinue()
                : isRecovery
                  ? recoveryLinkSent
                    ? handlePasswordRecoveryCode()
                    : handlePasswordRecovery()
                  : handlePasswordSignIn())
      }
    />
  );

  const authFooterAction = (
    <IdentityFlowSecondaryAction
      disabled={authBusy}
      icon={secondaryAuthAction.icon as keyof typeof Ionicons.glyphMap}
      label={secondaryAuthAction.label}
      onPress={authBusy ? undefined : secondaryAuthActionPress}
    />
  );
  const authLogo = resolveAuthLogoCopy({
    accountDisplayName: account?.displayName,
    isOtherAccountMode,
    isRecovery,
    recoveryLinkSent,
    showAuthOptions,
    showPasswordFields,
  });
  const canTapSavedAccountCopy = Boolean(!showAuthOptions && account && !isRecovery);
  const authLogoCopy = <IdentityFlowLogoCopy subtitle={authLogo.subtitle} title={authLogo.title} />;
  const authIdentityPosition = isRecovery ? 'top' : 'center';
  const authContentTransitionKey =
    !showAuthOptions && account && !isRecovery
      ? 'auth:saved-account'
      : isRecovery
        ? 'auth:recover-form'
        : 'auth:sign-in-form';
  const tokenFieldError = resolveTokenFieldError({
    blockingMessage,
    normalizedToken,
    tokenMessage,
    tokenTouched,
  });
  const tokenLogoSubtitle = resolveTokenLogoSubtitle({
    blockingMessage,
    inviterDisplayName: preview?.inviterDisplayName,
    isFetching: previewQuery.isFetching,
  });
  const tokenFooterAction = (
    <IdentityFlowSecondaryAction
      disabled={authBusy}
      icon="person-circle-outline"
      label="Tengo cuenta"
      onPress={authBusy ? undefined : showSignInEntry}
    />
  );
  const tokenPrimaryDisabled = authBusy || !shouldPreview || Boolean(blockingMessage);
  const tokenPrimaryAction = (
    <IdentityFlowPrimaryAction
      disabled={tokenPrimaryDisabled}
      label={previewQuery.isFetching ? 'Validando...' : 'Continuar'}
      loading={previewQuery.isFetching}
      onPress={tokenPrimaryDisabled ? undefined : () => void handleTokenContinue()}
    />
  );
  const tokenIdentity =
    authSurfaceTransitioning && transitionTargetSurface === 'auth' && account ? (
      <AuthEntryIdentity
        avatarLabel={account.displayName}
        avatarUrl={avatarUrl}
        state="loading"
        variant="remembered"
      />
    ) : (
      <AuthEntryIdentity
        centerFaceSize="small"
        state={previewQuery.isFetching ? 'loading' : 'idle'}
        variant="brand"
      />
    );
  const tokenContent = (
    <View style={styles.tokenContent}>
      <AccountInviteEntryTokenForm
        onBlurToken={() => setTokenTouched(true)}
        onChangeToken={(value) => {
          setTokenMessage(null);
          pendingTokenPreparation.replaceInput(value);
          setTokenInput(value);
        }}
        status={tokenFieldError ? 'danger' : preview ? 'success' : 'idle'}
        tokenFieldError={tokenFieldError}
        tokenInput={tokenInput}
      />
      {tokenPrimaryAction}
    </View>
  );
  const isTokenSurface = entrySurface === 'token';
  const footerSurface =
    authSurfaceTransitioning && transitionTargetSurface ? transitionTargetSurface : entrySurface;
  const isTokenFooterSurface = footerSurface === 'token';
  const activeIdentity = isTokenSurface ? tokenIdentity : authIdentity;
  const activeIdentityPosition = isTokenSurface ? 'center' : authIdentityPosition;
  const shouldRevealAuthPrimaryAction = !isTokenSurface && showPasswordFields;
  const activeKeyboardActionClearance = isTokenFooterSurface
    ? AUTH_TOKEN_KEYBOARD_ACTION_CLEARANCE
    : showPasswordFields
      ? AUTH_PASSWORD_KEYBOARD_ACTION_CLEARANCE
      : undefined;
  const activeFooterAction = <>{isTokenFooterSurface ? tokenFooterAction : authFooterAction}</>;
  const activeContentTransitionKey = isTokenSurface
    ? 'invite-entry:token-form'
    : shouldRevealAuthPrimaryAction
      ? `${authContentTransitionKey}:credentials`
      : authContentTransitionKey;
  const activeMessage = isTokenSurface ? (
    <IdentityFlowLogoCopy subtitle={tokenLogoSubtitle} title="Tu invitación" />
  ) : showAuthOptions && message ? (
    <MessageBanner message={message} tone={authResultState === 'error' ? 'danger' : 'neutral'} />
  ) : canTapSavedAccountCopy ? (
    <Pressable
      disabled={authBusy}
      onPress={() => runAfterKeyboardDismiss(handleContinue)}
      style={({ pressed }) => [
        styles.logoCopyPressable,
        pressed && !authBusy ? styles.pressed : null,
        authBusy ? styles.actionDisabled : null,
      ]}
    >
      {authLogoCopy}
    </Pressable>
  ) : (
    authLogoCopy
  );

  return (
    <IdentityFlowScreen
      actions={activeFooterAction}
      bodyStyle={styles.rememberedBody}
      contentTransitionKey={activeContentTransitionKey}
      contentVisible={authContentVisible}
      fitContentToScreen={shouldRevealAuthPrimaryAction}
      identity={activeIdentity}
      identityCenterLayout="balanced"
      identityPosition={activeIdentityPosition}
      keyboardActionClearance={activeKeyboardActionClearance}
      message={activeMessage}
      preserveActionsDuringContentTransition
      scrollEnabled
      transitionScrollPolicy={shouldRevealAuthPrimaryAction ? 'preserve' : 'reset-top'}
    >
      {isTokenSurface ? (
        tokenContent
      ) : (
        <View style={styles.rememberedMain}>
          {authOptionsMounted ? (
            <AccountInviteEntryAuthForm
              accountEmail={account?.email}
              appleSignInAvailable={session.appleSignInAvailable}
              authBusy={authBusy}
              authErrors={authErrors}
              email={email}
              isRecovery={isRecovery}
              locksRememberedEmail={locksRememberedEmail}
              onEmailBlur={validateEmailField}
              onEmailChange={handleEmailChange}
              onForgotPasswordPress={showRecoverMode}
              onPasswordBlur={validatePasswordField}
              onPasswordChange={handlePasswordChange}
              onPasswordFallbackToggle={() => {
                triggerIdentitySelectionHaptic();
                togglePasswordFallback();
              }}
              onPasswordRecovery={() => void handlePasswordRecovery()}
              onRecoveryCodeChange={handleRecoveryCodeChange}
              onSocialPress={(provider) =>
                runAfterKeyboardDismiss(() => handleSocialSignIn(provider))
              }
              password={password}
              placeholderTextColor={activeTheme.colors.muted}
              primaryAction={authPrimaryAction}
              recoveryCode={recoveryCode}
              recoveryCodeValid={recoveryCodeValid}
              recoveryLinkSent={recoveryLinkSent}
              recoveryResendSeconds={recoveryResendSeconds}
              showAuthOptions={showAuthOptions}
              showPasswordFallback={showPasswordFallback}
              showPasswordFields={showPasswordFields}
              socialBusyProvider={socialBusyProvider}
              style={authOptionsAnimatedStyle}
            />
          ) : null}
        </View>
      )}
    </IdentityFlowScreen>
  );
}
