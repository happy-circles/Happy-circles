import { useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Animated, Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { Href } from 'expo-router';

import {
  BRAND_VERIFICATION_EASING,
  BRAND_VERIFICATION_RESULT_MS,
  type BrandVerificationState,
} from '@/components/brand-verification-lockup';
import {
  IDENTITY_FLOW_STAGE_SIZE,
  IdentityFlowField,
  IdentityFlowForm,
  IdentityFlowIdentity,
  IdentityFlowLogoCopy,
  IdentityFlowPrimaryAction,
  IdentityFlowScreen,
  IdentityFlowSecondaryAction,
  IdentityFlowTextInput,
} from '@/components/identity-flow';
import { MessageBanner } from '@/components/message-banner';
import {
  beginAuthRouteTransitionHold,
  clearAuthRouteTransitionHold,
} from '@/lib/auth-route-transition-hold';
import { resolveAvatarUrl } from '@/lib/avatar';
import { beginHomeEntryHandoff } from '@/lib/home-entry-handoff';
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
import { theme } from '@/lib/theme';
import { useSession } from '@/providers/session-provider';
import {
  MIN_ACCOUNT_INVITE_TOKEN_LENGTH,
  accountInviteStatusMessage,
  extractAccountInviteToken,
} from './account-invite-utils';

type SocialProvider = 'google' | 'apple';
type SignInEntryMode = 'sign-in' | 'recover';
type AuthEntryMode = 'remembered' | 'other';
type JoinEntrySurface = 'auth' | 'token';
type RememberedReauthReason = 'biometric-failed' | 'session-expired';

const AUTH_STATE_TRANSITION_MS = 380;
const AUTH_STATE_EASING = BRAND_VERIFICATION_EASING;
const AUTH_SUCCESS_NAVIGATION_DELAY_MS = 120;
const AUTH_ROUTE_TRANSITION_HOLD_MS = 15000;
const AUTH_ACTION_AFTER_KEYBOARD_DISMISS_MS = 90;
const AUTH_CONTENT_EXIT_MS = 190;
const AUTH_MODE_ROUTE_DELAY_MS = 520;
const AUTH_SAME_POSITION_REVEAL_DELAY_MS = 180;
const PASSWORD_RESET_SENT_MESSAGE =
  'Si el correo existe, enviamos un enlace para restablecer la clave.';
const PASSWORD_RESET_RESEND_SECONDS = 60;

function biometricMessage(error: string | null, label: string): string {
  if (error === 'user_cancel') {
    return `Cancelaste ${label}. Puedes entrar con correo y contrasena.`;
  }

  if (error === 'not_available') {
    return 'Este dispositivo no tiene biometria disponible. Entra con correo y contrasena.';
  }

  return `No pudimos validar ${label}. Entra con correo y contrasena.`;
}

function AuthEntryIdentity({
  avatarLabel,
  avatarUrl,
  centerFaceSize = 'small',
  disabled,
  state,
  variant = 'brand',
}: {
  readonly avatarLabel?: string;
  readonly avatarUrl?: string | null;
  readonly centerFaceSize?: 'large' | 'small';
  readonly disabled?: boolean;
  readonly state: BrandVerificationState;
  readonly variant?: 'brand' | 'remembered';
}) {
  return (
    <IdentityFlowIdentity
      avatarLabel={avatarLabel}
      avatarUrl={avatarUrl}
      centerFaceSize={variant === 'brand' ? centerFaceSize : undefined}
      disabled={disabled}
      state={state}
      variant={variant}
    />
  );
}

function AccountSignInEntry({
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
  const [authOptionsMounted, setAuthOptionsMounted] = useState(showAuthOptions);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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

  const authRequestBusy = biometricBusy || passwordBusy || Boolean(socialBusyProvider);
  const authBusy =
    authRequestBusy ||
    authSurfaceTransitioning ||
    authResultState === 'success' ||
    authSuccess;
  const authVisualState: BrandVerificationState =
    authSurfaceTransitioning
      ? 'loading'
      : (authResultState ?? (authRequestBusy ? 'loading' : 'idle'));
  const isRecovery = authMode === 'recover';
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
        setRecoveryLinkSent(false);
        setRecoveryResendSeconds(0);
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

    if (!pendingToken && session.accountAccessState === 'loading') {
      return undefined;
    }

    if (!pendingToken && session.profileCompletionState === 'loading') {
      return undefined;
    }

    const destination = pendingToken
      ? ({
          pathname: '/join/[token]',
          params: { token: pendingToken },
        } as unknown as Href)
      : !session.setupState.requiredComplete
        ? buildSetupAccountHref(session.setupState.pendingRequiredSteps[0] ?? 'profile')
        : session.accountAccessState === 'active'
          ? ('/home' as Href)
          : ('/join' as Href);

    successNavigationTimerRef.current = setTimeout(() => {
      clearAuthRouteTransitionHold();
      if (destination === '/home') {
        beginHomeEntryHandoff();
      }
      returnToRoute(router, destination);
    }, AUTH_SUCCESS_NAVIGATION_DELAY_MS);

    return () => {
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
    setAuthContentVisible(false);

    surfaceSwapTimerRef.current = setTimeout(() => {
      surfaceSwapTimerRef.current = null;
      applyNextSurface();

      surfaceRevealTimerRef.current = setTimeout(
        () => {
          surfaceRevealTimerRef.current = null;
          setAuthContentVisible(true);
          setAuthSurfaceTransitioning(false);
          setTransitionTargetSurface(null);
        },
        waitForStageTravel ? AUTH_MODE_ROUTE_DELAY_MS : AUTH_SAME_POSITION_REVEAL_DELAY_MS,
      );
    }, AUTH_CONTENT_EXIT_MS);
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

  function showAuthFailure(nextMessage: string) {
    triggerIdentityErrorHaptic();
    clearAuthRouteTransitionHold();
    clearSuccessCompletionTimer();
    setAuthResultState('error');
    setMessage(nextMessage);
  }

  function showRememberedReauthMode(
    nextMessage: string | null = null,
    reason: RememberedReauthReason = 'biometric-failed',
  ) {
    if (nextMessage) {
      triggerIdentityErrorHaptic();
    }
    clearAuthRouteTransitionHold();
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
        setRecoveryLinkSent(false);
        setRecoveryResendSeconds(0);
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
        setEmail('');
        setPassword('');
        setAuthErrors({});
        setAuthSuccess(false);
        setAuthResultState(null);
        setRememberedReauthReason(null);
        setRecoveryLinkSent(false);
        setRecoveryResendSeconds(0);
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
    transitionAuthSurface(() => {
      setAuthMode('recover');
      setAuthErrors({});
      setAuthSuccess(false);
      setAuthResultState(null);
      setRememberedReauthReason(null);
      setRecoveryLinkSent(false);
      setRecoveryResendSeconds(0);
      setMessage(null);
      setAuthOptionsMounted(true);
      setShowAuthOptions(true);
    }, false, 'auth');
  }

  function showSignInMode() {
    if (authBusy) {
      return;
    }

    triggerIdentitySelectionHaptic();
    clearAuthRouteTransitionHold();
    clearSuccessCompletionTimer();
    transitionAuthSurface(() => {
      setAuthMode('sign-in');
      setAuthErrors({});
      setAuthSuccess(false);
      setAuthResultState(null);
      setRememberedReauthReason(null);
      setRecoveryLinkSent(false);
      setRecoveryResendSeconds(0);
      setMessage(null);
      setAuthOptionsMounted(true);
      setShowAuthOptions(true);
    }, false, 'auth');
  }

  function handleEmailChange(value: string) {
    setEmail(value);
    setAuthErrors((current) => ({ ...current, email: undefined }));
    setAuthResultState(null);
    if (recoveryLinkSent) {
      setRecoveryLinkSent(false);
      setRecoveryResendSeconds(0);
      setMessage(null);
      return;
    }
    if (message && !isRecovery) {
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
    const trimmedEmail = resolvedEmail.trim();
    const nextEmailError =
      trimmedEmail.length === 0
        ? 'Escribe tu correo.'
        : !trimmedEmail.includes('@')
          ? 'Escribe un correo valido.'
          : undefined;

    setAuthErrors((current) => ({ ...current, email: nextEmailError }));
    return !nextEmailError;
  }

  function validatePasswordField() {
    const nextPasswordError =
      !isRecovery && password.length === 0 ? 'Escribe tu contrasena.' : undefined;

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

  async function rememberPendingToken() {
    if (!pendingToken) {
      return;
    }

    await writePendingInviteIntent({
      type: 'account_invite',
      token: pendingToken,
    });
  }

  async function handleContinue() {
    if (authBusy || !account) {
      return;
    }

    triggerIdentityImpactHaptic();

    if (session.status === 'signed_out') {
      showRememberedReauthMode(
        'Tu sesion vencio. Confirma tu acceso para continuar.',
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
      const result = await session.unlock();
      if (!result.success) {
        showRememberedReauthMode(biometricMessage(result.error, session.biometricLabel));
        return;
      }

      await rememberPendingToken();
      completeSuccessfulSignIn();
    } finally {
      setBiometricBusy(false);
    }
  }

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

    try {
      await rememberPendingToken();
      const result =
        provider === 'google' ? await session.signInWithGoogle() : await session.signInWithApple();

      if (result === 'Sesion iniciada.') {
        completeSuccessfulSignIn();
        await session.refreshAccountState({ preserveLocked: false });
        return;
      }

      showAuthFailure(result);
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

    try {
      await rememberPendingToken();
      const result = await session.signInWithPassword({
        email: locksRememberedEmail ? (account?.email ?? email) : email,
        password,
      });
      if (result === 'Sesion iniciada.') {
        completeSuccessfulSignIn();
        await session.refreshAccountState({ preserveLocked: false });
        return;
      }

      showAuthFailure(result);
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
        setAuthResultState(null);
        setMessage(null);
      } else {
        triggerIdentityErrorHaptic();
        setRecoveryLinkSent(false);
        setRecoveryResendSeconds(0);
        setAuthResultState('error');
        setMessage(result);
      }
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
      setTokenMessage('Abre tu link de invitacion o pega el token completo para continuar.');
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
      setTokenMessage('No pudimos validar esta invitacion. Intenta otra vez.');
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

  const secondaryAuthAction =
    account && !isRecovery
      ? {
          icon: isOtherAccountMode ? 'key-outline' : 'person-circle-outline',
          label: isOtherAccountMode ? 'Crear cuenta' : 'Usar otra cuenta',
          onPress: isOtherAccountMode ? exitToInviteEntry : showOtherAccountMode,
        }
      : isRecovery
        ? {
            icon: 'person-circle-outline',
            label: 'Iniciar sesion',
            onPress: showSignInMode,
          }
        : {
          icon: 'key-outline',
          label: 'Volver a invitacion',
          onPress: exitToInviteEntry,
        };

  const authPrimaryAction = (
    <IdentityFlowPrimaryAction
      disabled={authBusy || (isRecovery && recoveryResendSeconds > 0)}
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
                ? recoveryResendSeconds > 0
                  ? `Reenviar enlace en ${recoveryResendSeconds}s`
                  : 'Reenviar enlace'
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
                  ? recoveryResendSeconds > 0
                    ? undefined
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
      onPress={authBusy ? undefined : secondaryAuthAction.onPress}
    />
  );
  const authLogoTitle = isRecovery
    ? recoveryLinkSent
      ? 'Revisa tu correo'
      : 'Recupera tu contrasena'
    : !showAuthOptions && account
      ? `Hola, ${account.displayName}`
      : 'Ingresa a Happy Circles';
  const authLogoSubtitle = isRecovery
    ? recoveryLinkSent
      ? 'Si existe la cuenta, el enlace va en camino.'
      : 'Te enviaremos un enlace a tu correo.'
    : !showAuthOptions && account
      ? 'Toca para continuar.'
      : isOtherAccountMode
        ? 'Usa otra cuenta para continuar.'
        : 'Usa tu correo y contrasena.';
  const canTapSavedAccountCopy = Boolean(!showAuthOptions && account && !isRecovery);
  const authLogoCopy = <IdentityFlowLogoCopy subtitle={authLogoSubtitle} title={authLogoTitle} />;
  const authIdentityPosition = showAuthOptions ? 'top' : 'center';
  const authContentTransitionKey =
    !showAuthOptions && account && !isRecovery
      ? 'auth:saved-account'
      : isRecovery
        ? 'auth:recover-form'
        : 'auth:sign-in-form';
  const tokenFieldError =
    tokenTouched || tokenMessage || blockingMessage
      ? (blockingMessage ??
        tokenMessage ??
        (normalizedToken.length > 0 && normalizedToken.length < MIN_ACCOUNT_INVITE_TOKEN_LENGTH
          ? 'Pega el token completo para continuar.'
          : null))
      : null;
  const tokenLogoSubtitle =
    preview && !blockingMessage
      ? `${preview.inviterDisplayName} te invito.`
      : previewQuery.isFetching
        ? 'Validando tu invitacion.'
        : 'Pega tu codigo de invitacion para continuar.';
  const tokenFooterAction = (
    <IdentityFlowSecondaryAction
      disabled={authBusy}
      icon="person-circle-outline"
      label="Ya tengo cuenta"
      onPress={authBusy ? undefined : showSignInEntry}
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
      <IdentityFlowIdentity
        centerFaceSize="small"
        state={authSurfaceTransitioning || previewQuery.isFetching ? 'loading' : 'idle'}
        variant="brand"
      />
    );
  const tokenContent = (
    <View style={styles.rememberedMain}>
      <IdentityFlowForm>
        <IdentityFlowField
          error={tokenFieldError}
          icon="key"
          label="Codigo de invitacion"
          status={tokenFieldError ? 'danger' : preview ? 'success' : 'idle'}
        >
          <IdentityFlowTextInput
            autoCapitalize="none"
            autoCorrect={false}
            onBlur={() => setTokenTouched(true)}
            onChangeText={(value) => {
              setTokenMessage(null);
              setTokenInput(value);
            }}
            placeholder="Se llena al abrir tu link"
            placeholderTextColor={theme.colors.muted}
            value={tokenInput}
          />
        </IdentityFlowField>

        <IdentityFlowPrimaryAction
          disabled={authBusy || !shouldPreview || Boolean(blockingMessage)}
          label={previewQuery.isFetching ? 'Validando...' : 'Continuar'}
          loading={previewQuery.isFetching}
          onPress={previewQuery.isFetching ? undefined : () => void handleTokenContinue()}
        />
      </IdentityFlowForm>
    </View>
  );
  const isTokenSurface = entrySurface === 'token';
  const activeIdentity = isTokenSurface ? tokenIdentity : authIdentity;
  const activeIdentityPosition = isTokenSurface ? 'center' : authIdentityPosition;
  const activeFooterAction = isTokenSurface ? tokenFooterAction : authFooterAction;
  const activeContentTransitionKey = isTokenSurface
    ? 'invite-entry:token-form'
    : authContentTransitionKey;
  const activeMessage = isTokenSurface ? (
    <IdentityFlowLogoCopy subtitle={tokenLogoSubtitle} title="Bienvenido a Happy Circles" />
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
      identity={activeIdentity}
      identityCenterLayout="balanced"
      identityPosition={activeIdentityPosition}
      message={activeMessage}
      scrollEnabled
    >
      {isTokenSurface ? (
        tokenContent
      ) : (
        <View style={styles.rememberedMain}>
        {authOptionsMounted ? (
          <Animated.View style={[styles.socialActions, authOptionsAnimatedStyle]}>
            <IdentityFlowForm>
              <IdentityFlowField
                error={authErrors.email ?? null}
                icon="mail"
                label="Correo"
                status={
                  authErrors.email
                    ? 'danger'
                    : ((locksRememberedEmail ? account?.email : email) ?? '').trim().length > 0
                      ? 'success'
                      : 'idle'
                }
              >
                <IdentityFlowTextInput
                  autoCapitalize="none"
                  autoComplete="email"
                  editable={!locksRememberedEmail}
                  keyboardType="email-address"
                  onBlur={validateEmailField}
                  onChangeText={handleEmailChange}
                  placeholder="tu@correo.com"
                  placeholderTextColor={theme.colors.muted}
                  value={email}
                />
              </IdentityFlowField>

              {!isRecovery ? (
                <View style={styles.passwordFieldGroup}>
                  <IdentityFlowField
                    error={authErrors.password ?? null}
                    icon="lock-closed"
                    label="Contrasena"
                    status={
                      authErrors.password ? 'danger' : password.length > 0 ? 'success' : 'idle'
                    }
                  >
                    <IdentityFlowTextInput
                      autoCapitalize="none"
                      autoComplete="password"
                      onBlur={validatePasswordField}
                      onChangeText={handlePasswordChange}
                      placeholder="Tu contrasena"
                      placeholderTextColor={theme.colors.muted}
                      secureTextEntry
                      value={password}
                    />
                  </IdentityFlowField>

                  {showAuthOptions ? (
                    <Pressable
                      disabled={authBusy}
                      onPress={authBusy ? undefined : showRecoverMode}
                      style={({ pressed }) => [
                        styles.forgotPasswordInline,
                        !authErrors.password ? styles.forgotPasswordInlineLifted : null,
                        pressed && !authBusy ? styles.pressed : null,
                        authBusy ? styles.actionDisabled : null,
                      ]}
                    >
                      <Text style={styles.forgotPasswordInlineText}>Olvide contrasena</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}

              {authPrimaryAction}
            </IdentityFlowForm>

            {!isRecovery ? (
              <View style={styles.authSecondaryBlock}>
                <View style={styles.socialProviderRow}>
                  {session.appleSignInAvailable ? (
                    <Pressable
                      disabled={authBusy}
                      onPress={() => runAfterKeyboardDismiss(() => handleSocialSignIn('apple'))}
                      style={({ pressed }) => [
                        styles.socialProviderButton,
                        styles.appleProviderButton,
                        pressed && !authBusy ? styles.pressed : null,
                        authBusy ? styles.actionDisabled : null,
                      ]}
                    >
                      <Ionicons color={theme.colors.white} name="logo-apple" size={18} />
                      <Text style={[styles.socialProviderText, styles.appleProviderText]}>
                        {socialBusyProvider === 'apple' ? 'Apple...' : 'Apple'}
                      </Text>
                    </Pressable>
                  ) : null}

                  <Pressable
                    disabled={authBusy}
                    onPress={() => runAfterKeyboardDismiss(() => handleSocialSignIn('google'))}
                    style={({ pressed }) => [
                      styles.socialProviderButton,
                      styles.googleProviderButton,
                      !session.appleSignInAvailable ? styles.socialProviderButtonFull : null,
                      pressed && !authBusy ? styles.pressed : null,
                      authBusy ? styles.actionDisabled : null,
                    ]}
                  >
                    <Ionicons color={theme.colors.text} name="logo-google" size={18} />
                    <Text style={styles.socialProviderText}>
                      {socialBusyProvider === 'google' ? 'Google...' : 'Google'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </Animated.View>
        ) : null}
        </View>
      )}
    </IdentityFlowScreen>
  );
}

export function AccountInviteEntryScreen() {
  const params = useLocalSearchParams<{
    mode?: string | string[];
    preview?: string | string[];
    token?: string | string[];
  }>();
  const session = useSession();
  const rawModeParam = Array.isArray(params.mode) ? params.mode[0] : params.mode;
  const rawPreviewParam = Array.isArray(params.preview) ? params.preview[0] : params.preview;
  const rawTokenParam = Array.isArray(params.token) ? params.token[0] : params.token;
  const initialToken = useMemo(() => extractAccountInviteToken(rawTokenParam), [rawTokenParam]);
  const isPreviewMode = __DEV__ && rawPreviewParam === 'true';
  const isRecoverMode = rawModeParam === 'recover' || rawModeParam === 'forgot-password';
  const isTokenEntryMode = rawModeParam === 'token' || rawModeParam === 'invite';
  const isSignInMode = rawModeParam === 'sign-in' || rawModeParam === 'login' || isRecoverMode;
  const initialSurface: JoinEntrySurface =
    !isTokenEntryMode && (isSignInMode || (session.rememberedAccount && !isPreviewMode))
      ? 'auth'
      : 'token';

  return (
    <AccountSignInEntry
      autoUseRememberedAccount={!isTokenEntryMode && !isSignInMode}
      initialMode={isRecoverMode ? 'recover' : 'sign-in'}
      initialSurface={initialSurface}
      initialToken={initialToken}
      isPreviewMode={isPreviewMode}
    />
  );
}

const styles = StyleSheet.create({
  rememberedBody: {
    flex: 1,
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
  },
  rememberedMain: {
    gap: theme.spacing.sm,
    position: 'relative',
    width: '100%',
  },
  rememberedProfile: {
    alignItems: 'center',
    width: '100%',
  },
  rememberedProfileMotion: {
    gap: theme.spacing.xs,
    width: '100%',
  },
  authIdentityStage: {
    height: IDENTITY_FLOW_STAGE_SIZE,
    position: 'relative',
    width: '100%',
  },
  authIdentityLayer: {
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  socialActions: {
    gap: theme.spacing.sm,
    width: '100%',
  },
  authSecondaryBlock: {
    alignItems: 'center',
    gap: theme.spacing.xs,
    marginTop: theme.spacing.xl,
    width: '100%',
  },
  passwordFieldGroup: {
    gap: theme.spacing.xxs,
    width: '100%',
  },
  forgotPasswordInline: {
    alignSelf: 'flex-end',
    borderRadius: theme.radius.pill,
    justifyContent: 'center',
    marginBottom: theme.spacing.xs,
    minHeight: 24,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 0,
  },
  forgotPasswordInlineLifted: {
    transform: [{ translateY: -4 }],
  },
  forgotPasswordInlineText: {
    color: theme.colors.primary,
    fontSize: theme.typography.footnote,
    fontWeight: '800',
  },
  logoCopyPressable: {
    borderRadius: theme.radius.medium,
  },
  socialProviderRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    width: '100%',
  },
  socialProviderButton: {
    alignItems: 'center',
    borderRadius: theme.radius.medium,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: theme.spacing.xs,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  socialProviderButtonFull: {
    flexGrow: 1,
  },
  appleProviderButton: {
    backgroundColor: '#000000',
    borderColor: '#000000',
  },
  googleProviderButton: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
  },
  socialProviderText: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '800',
  },
  appleProviderText: {
    color: theme.colors.white,
  },
  pressed: {
    opacity: 0.84,
  },
  actionDisabled: {
    opacity: 0.58,
  },
});
