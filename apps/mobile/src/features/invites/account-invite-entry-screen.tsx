import { useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { Href } from 'expo-router';

import {
  BRAND_VERIFICATION_EASING,
  BRAND_VERIFICATION_RESULT_MS,
  type BrandVerificationState,
} from '@/components/brand-verification-lockup';
import {
  IDENTITY_FLOW_STAGE_SIZE,
  IdentityFlowActions,
  IdentityFlowField,
  IdentityFlowForm,
  IdentityFlowIdentity,
  IdentityFlowMessageSlot,
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
import {
  triggerIdentityImpactHaptic,
  triggerIdentitySelectionHaptic,
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

const AUTH_STATE_TRANSITION_MS = 640;
const AUTH_STATE_EASING = BRAND_VERIFICATION_EASING;
const AUTH_SUCCESS_NAVIGATION_DELAY_MS = 120;
const AUTH_ROUTE_TRANSITION_HOLD_MS = 15000;

function biometricMessage(error: string | null, label: string): string {
  if (error === 'user_cancel') {
    return `Cancelaste ${label}. Puedes entrar con correo y contrasena.`;
  }

  if (error === 'not_available') {
    return 'Este dispositivo no tiene biometria disponible. Entra con correo y contrasena.';
  }

  return `No pudimos validar ${label}. Entra con correo y contrasena.`;
}

function buildJoinSignInHref(token: string | null): Href {
  return {
    pathname: '/join',
    params: token ? { mode: 'sign-in', token } : { mode: 'sign-in' },
  } as unknown as Href;
}

function AuthEntryIdentity({
  avatarLabel,
  avatarUrl,
  state,
  variant = 'brand',
}: {
  readonly avatarLabel?: string;
  readonly avatarUrl?: string | null;
  readonly state: BrandVerificationState;
  readonly variant?: 'brand' | 'remembered';
}) {
  return (
    <IdentityFlowIdentity
      avatarLabel={avatarLabel}
      avatarUrl={avatarUrl}
      state={state}
      variant={variant}
    />
  );
}

function AccountSignInEntry({
  initialMode = 'sign-in',
  pendingToken,
}: {
  readonly initialMode?: SignInEntryMode;
  readonly pendingToken: string | null;
}) {
  const session = useSession();
  const router = useRouter();
  const account = session.rememberedAccount;
  const [authMode, setAuthMode] = useState<SignInEntryMode>(initialMode);
  const [authEntryMode, setAuthEntryMode] = useState<AuthEntryMode>('remembered');
  const [showAuthOptions, setShowAuthOptions] = useState(!account || initialMode === 'recover');
  const [authOptionsMounted, setAuthOptionsMounted] = useState(showAuthOptions);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [biometricBusy, setBiometricBusy] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [socialBusyProvider, setSocialBusyProvider] = useState<SocialProvider | null>(null);
  const [authSuccess, setAuthSuccess] = useState(false);
  const [authResultState, setAuthResultState] = useState<BrandVerificationState | null>(null);

  const avatarUrl = account ? resolveAvatarUrl(account.avatarPath) : null;

  const authRequestBusy = biometricBusy || passwordBusy || Boolean(socialBusyProvider);
  const authBusy = authRequestBusy || authResultState === 'success' || authSuccess;
  const authVisualState: BrandVerificationState =
    authResultState ?? (authRequestBusy ? 'loading' : 'idle');
  const isRecovery = authMode === 'recover';
  const isOtherAccountMode = showAuthOptions && authEntryMode === 'other';
  const isRememberedReauthMode =
    showAuthOptions && authEntryMode === 'remembered' && Boolean(account) && !isRecovery;
  const locksRememberedEmail = isRememberedReauthMode && Boolean(account?.email);
  const authOptionsMotion = useRef(new Animated.Value(showAuthOptions ? 1 : 0)).current;
  const authEntryMotion = useRef(new Animated.Value(authEntryMode === 'other' ? 1 : 0)).current;
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
      duration: 620,
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
      clearAuthRouteTransitionHold();
    },
    [],
  );

  const authOptionsAnimatedStyle = {
    opacity: authOptionsMotion,
    transform: [
      {
        translateY: authOptionsMotion.interpolate({
          inputRange: [0, 1],
          outputRange: [12, 0],
        }),
      },
    ],
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

  function completeSuccessfulSignIn() {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    beginAuthRouteTransitionHold(
      BRAND_VERIFICATION_RESULT_MS + AUTH_SUCCESS_NAVIGATION_DELAY_MS + 1000,
    );
    setAuthResultState('success');
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
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
    clearAuthRouteTransitionHold();
    clearSuccessCompletionTimer();
    setAuthResultState('error');
    setMessage(nextMessage);
  }

  function showRememberedReauthMode(nextMessage: string | null = null) {
    if (nextMessage) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
    }
    authEntryMotion.stopAnimation();
    authEntryMotion.setValue(0);
    setAuthEntryMode('remembered');
    setAuthMode('sign-in');
    setEmail(account?.email ?? '');
    setPassword('');
    clearAuthRouteTransitionHold();
    clearSuccessCompletionTimer();
    setAuthSuccess(false);
    setAuthResultState(nextMessage ? 'error' : null);
    setMessage(nextMessage);
    setShowAuthOptions(true);
  }

  function showOtherAccountMode() {
    setAuthEntryMode('other');
    setAuthMode('sign-in');
    setEmail('');
    setPassword('');
    clearAuthRouteTransitionHold();
    clearSuccessCompletionTimer();
    setAuthSuccess(false);
    setAuthResultState(null);
    setMessage(null);
    setShowAuthOptions(true);
  }

  function showRecoverMode() {
    setAuthMode('recover');
    clearAuthRouteTransitionHold();
    clearSuccessCompletionTimer();
    setAuthSuccess(false);
    setAuthResultState(null);
    setMessage(null);
    setShowAuthOptions(true);
  }

  function showSignInMode() {
    setAuthMode('sign-in');
    clearAuthRouteTransitionHold();
    clearSuccessCompletionTimer();
    setAuthSuccess(false);
    setAuthResultState(null);
    setMessage(null);
    setShowAuthOptions(true);
  }

  function handleEmailChange(value: string) {
    setEmail(value);
    setAuthResultState(null);
    if (message && !isRecovery) {
      setMessage(null);
    }
  }

  function handlePasswordChange(value: string) {
    setPassword(value);
    setAuthResultState(null);
    if (message && !isRecovery) {
      setMessage(null);
    }
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

  function inviteEntryHref(): Href {
    if (pendingToken) {
      return {
        pathname: '/join',
        params: { mode: 'token', token: pendingToken },
      } as unknown as Href;
    }

    return {
      pathname: '/join',
      params: { mode: 'token' },
    } as unknown as Href;
  }

  async function handleContinue() {
    if (authBusy || !account) {
      return;
    }

    if (session.status === 'signed_out') {
      showRememberedReauthMode('Tu sesion vencio. Confirma tu acceso para continuar.');
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

    setMessage(null);
    clearSuccessCompletionTimer();
    setAuthResultState(null);
    setPasswordBusy(true);

    try {
      const result = await session.requestPasswordReset(email);
      setMessage(result);
    } finally {
      setPasswordBusy(false);
    }
  }

  const authFooterAction =
    account && !isRecovery ? (
      <IdentityFlowSecondaryAction
        disabled={authBusy}
        icon={isOtherAccountMode ? 'key-outline' : 'person-circle-outline'}
        label={isOtherAccountMode ? 'Crear cuenta' : 'Usar otra cuenta'}
        onPress={
          isOtherAccountMode ? () => returnToRoute(router, inviteEntryHref()) : showOtherAccountMode
        }
      />
    ) : isRecovery ? (
      <IdentityFlowSecondaryAction
        disabled={authBusy}
        icon="person-circle-outline"
        label="Iniciar sesion"
        onPress={showSignInMode}
      />
    ) : (
      <IdentityFlowSecondaryAction
        disabled={authBusy}
        icon="key-outline"
        label="Volver a invitacion"
        onPress={() => returnToRoute(router, inviteEntryHref())}
      />
    );

  return (
    <IdentityFlowScreen actions={authFooterAction} bodyStyle={styles.rememberedBody}>
      <View style={[styles.rememberedMain, !isRecovery ? styles.rememberedMainRemembered : null]}>
        {account && !isRecovery ? (
          <Animated.View style={styles.rememberedProfileMotion}>
            {showAuthOptions ? (
              <View style={styles.authIdentityStage}>
                <Animated.View
                  pointerEvents={isOtherAccountMode ? 'none' : 'auto'}
                  style={[
                    styles.rememberedProfile,
                    styles.authIdentityLayer,
                    rememberedIdentityStyle,
                  ]}
                >
                  <AuthEntryIdentity
                    avatarLabel={account.displayName}
                    avatarUrl={avatarUrl}
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
                  <AuthEntryIdentity state={authVisualState} />
                </Animated.View>
              </View>
            ) : (
              <Pressable
                disabled={authBusy}
                onPress={() => void handleContinue()}
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

            {showAuthOptions ? (
              <View style={styles.authMessageSlot}>
                {message ? (
                  <MessageBanner
                    message={message}
                    tone={authResultState === 'error' ? 'danger' : 'neutral'}
                  />
                ) : null}
              </View>
            ) : null}
          </Animated.View>
        ) : (
          <Animated.View style={styles.rememberedProfileMotion}>
            <View style={isRecovery ? undefined : styles.authIdentityStage}>
              <View
                style={[styles.rememberedProfile, isRecovery ? null : styles.authIdentityLayer]}
              >
                {!isRecovery ? <AuthEntryIdentity state={authVisualState} /> : null}
                {isRecovery ? <AuthEntryIdentity state={authVisualState} /> : null}
              </View>
            </View>

            {showAuthOptions ? (
              <View style={styles.authMessageSlot}>
                {message ? (
                  <MessageBanner
                    message={message}
                    tone={authResultState === 'error' ? 'danger' : 'neutral'}
                  />
                ) : null}
              </View>
            ) : null}
          </Animated.View>
        )}

        {authOptionsMounted ? (
          <Animated.View style={[styles.socialActions, authOptionsAnimatedStyle]}>
            <IdentityFlowForm>
              <IdentityFlowField icon="mail" label="Correo">
                <IdentityFlowTextInput
                  autoCapitalize="none"
                  autoComplete="email"
                  editable={!locksRememberedEmail}
                  keyboardType="email-address"
                  onChangeText={handleEmailChange}
                  placeholder="tu@correo.com"
                  placeholderTextColor={theme.colors.muted}
                  value={email}
                />
              </IdentityFlowField>

              {!isRecovery ? (
                <IdentityFlowField icon="lock-closed" label="Contrasena">
                  <IdentityFlowTextInput
                    autoCapitalize="none"
                    autoComplete="password"
                    onChangeText={handlePasswordChange}
                    placeholder="Tu contrasena"
                    placeholderTextColor={theme.colors.muted}
                    secureTextEntry
                    value={password}
                  />
                </IdentityFlowField>
              ) : null}

              <IdentityFlowActions
                anchored={false}
                disabled={authBusy}
                loading={passwordBusy}
                onPrimaryPress={
                  authBusy
                    ? undefined
                    : () => void (isRecovery ? handlePasswordRecovery() : handlePasswordSignIn())
                }
                primaryLabel={
                  passwordBusy ? 'Procesando...' : isRecovery ? 'Enviar enlace' : 'Ingresar'
                }
              />
            </IdentityFlowForm>

            {!isRecovery ? (
              <View style={styles.authSecondaryBlock}>
                <View style={styles.socialProviderRow}>
                  {session.appleSignInAvailable ? (
                    <Pressable
                      disabled={authBusy}
                      onPress={() => void handleSocialSignIn('apple')}
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
                    onPress={() => void handleSocialSignIn('google')}
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

                <Pressable
                  disabled={authBusy}
                  onPress={showRecoverMode}
                  style={({ pressed }) => [
                    styles.forgotPasswordButton,
                    pressed ? styles.pressed : null,
                  ]}
                >
                  <Text style={styles.inlineLinkText}>Olvide contrasena</Text>
                </Pressable>
              </View>
            ) : null}
          </Animated.View>
        ) : null}
      </View>
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
  const router = useRouter();
  const rawModeParam = Array.isArray(params.mode) ? params.mode[0] : params.mode;
  const rawPreviewParam = Array.isArray(params.preview) ? params.preview[0] : params.preview;
  const rawTokenParam = Array.isArray(params.token) ? params.token[0] : params.token;
  const initialToken = useMemo(() => extractAccountInviteToken(rawTokenParam), [rawTokenParam]);
  const [tokenInput, setTokenInput] = useState(initialToken);
  const [message, setMessage] = useState<string | null>(null);
  const normalizedToken = useMemo(() => extractAccountInviteToken(tokenInput), [tokenInput]);
  const shouldPreview = normalizedToken.length >= MIN_ACCOUNT_INVITE_TOKEN_LENGTH;
  const previewQuery = useAccountInvitePreviewQuery(shouldPreview ? normalizedToken : null);
  const preview = previewQuery.data;
  const blockingMessage = preview
    ? accountInviteStatusMessage(preview.status, preview.deliveryStatus)
    : null;
  const pendingToken = shouldPreview ? normalizedToken : null;
  const isPreviewMode = __DEV__ && rawPreviewParam === 'true';
  const isRecoverMode = rawModeParam === 'recover' || rawModeParam === 'forgot-password';
  const isTokenEntryMode = rawModeParam === 'token' || rawModeParam === 'invite';
  const isSignInMode = rawModeParam === 'sign-in' || rawModeParam === 'login' || isRecoverMode;

  useEffect(() => {
    setTokenInput(initialToken);
  }, [initialToken]);

  if (((session.rememberedAccount && !isPreviewMode) || isSignInMode) && !isTokenEntryMode) {
    return (
      <AccountSignInEntry
        initialMode={isRecoverMode ? 'recover' : 'sign-in'}
        pendingToken={pendingToken}
      />
    );
  }

  async function handleContinue() {
    const token = extractAccountInviteToken(tokenInput);
    if (token.length < MIN_ACCOUNT_INVITE_TOKEN_LENGTH) {
      triggerIdentityWarningHaptic();
      setMessage('Abre tu link de invitacion o pega el token completo para continuar.');
      return;
    }

    triggerIdentityImpactHaptic();
    setMessage(null);

    const previewResult = await previewQuery.refetch();
    if (previewResult.error) {
      setMessage(previewResult.error.message);
      return;
    }

    const nextPreview = previewResult.data;
    if (!nextPreview) {
      setMessage('No pudimos validar esta invitacion. Intenta otra vez.');
      return;
    }

    const nextBlockingMessage = accountInviteStatusMessage(
      nextPreview.status,
      nextPreview.deliveryStatus,
    );
    if (nextBlockingMessage) {
      setMessage(nextBlockingMessage);
      return;
    }

    await writePendingInviteIntent({
      type: 'account_invite',
      token,
    });

    pushRoute(router, {
      pathname: '/join/[token]/create-account',
      params: { token },
    } as unknown as Href);
  }

  return (
    <IdentityFlowScreen
      actions={
        <IdentityFlowSecondaryAction
          icon="person-circle-outline"
          label="Ya tengo cuenta"
          onPress={() => {
            triggerIdentitySelectionHaptic();
            returnToRoute(router, buildJoinSignInHref(pendingToken));
          }}
        />
      }
      bodyStyle={styles.rememberedBody}
    >
      <View
        style={[styles.rememberedMain, styles.rememberedMainRemembered, styles.inviteEntryMain]}
      >
        <View style={styles.inviteEntryLogoCenter}>
          <IdentityFlowIdentity
            state={previewQuery.isFetching ? 'loading' : 'idle'}
            variant="brand"
          />
        </View>

        <View style={styles.inviteEntryFormAnchor}>
          <IdentityFlowForm>
            <IdentityFlowField
              icon="key"
              label="Codigo de invitacion"
              reserveError={false}
              status={blockingMessage || message ? 'danger' : preview ? 'success' : 'idle'}
            >
              <IdentityFlowTextInput
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={(value) => {
                  setMessage(null);
                  setTokenInput(value);
                }}
                placeholder="Se llena al abrir tu link"
                placeholderTextColor={theme.colors.muted}
                value={tokenInput}
              />
            </IdentityFlowField>

            <IdentityFlowMessageSlot minHeight={72}>
              {preview && !blockingMessage ? (
                <View style={styles.inviteSummary}>
                  <Text style={styles.inviteLabel}>Invitacion de</Text>
                  <Text style={styles.inviteName}>{preview.inviterDisplayName}</Text>
                </View>
              ) : blockingMessage ? (
                <MessageBanner message={blockingMessage} tone="warning" />
              ) : message ? (
                <MessageBanner message={message} tone="neutral" />
              ) : null}
            </IdentityFlowMessageSlot>

            <IdentityFlowActions
              anchored={false}
              disabled={!shouldPreview || Boolean(blockingMessage)}
              loading={previewQuery.isFetching}
              onPrimaryPress={previewQuery.isFetching ? undefined : () => void handleContinue()}
              primaryLabel={previewQuery.isFetching ? 'Validando...' : 'Continuar'}
            />
          </IdentityFlowForm>
        </View>
      </View>
    </IdentityFlowScreen>
  );
}

const styles = StyleSheet.create({
  keyboardShell: {
    backgroundColor: theme.colors.background,
    flex: 1,
  },
  inviteEntryContent: {
    flexGrow: 1,
    justifyContent: 'flex-start',
    paddingBottom: theme.spacing.xl,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
  },
  inviteEntryWidth: {
    alignSelf: 'center',
    flexGrow: 1,
    justifyContent: 'flex-start',
    maxWidth: 460,
    width: '100%',
  },
  inviteEntryBody: {
    flex: 1,
    gap: 0,
    paddingBottom: theme.spacing.sm,
  },
  inviteEntryMain: {
    flex: 1,
    justifyContent: 'center',
    position: 'relative',
    width: '100%',
  },
  inviteEntryLogoCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteEntryFormAnchor: {
    left: 0,
    marginTop: IDENTITY_FLOW_STAGE_SIZE / 2 + theme.spacing.xl,
    position: 'absolute',
    right: 0,
    top: '50%',
  },
  inviteEntryBrandWrap: {
    alignItems: 'center',
    alignSelf: 'center',
    gap: theme.spacing.sm,
    width: '100%',
  },
  inviteEntryLogoTarget: {
    alignSelf: 'center',
  },
  inviteEntryLogoCopy: {
    alignItems: 'center',
    gap: theme.spacing.xs,
    minHeight: 58,
    width: '100%',
  },
  inviteEntryLogoTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.title2,
    fontWeight: '800',
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  inviteEntryLogoSubtitle: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.callout,
    fontWeight: '600',
    lineHeight: 21,
    textAlign: 'center',
  },
  inviteEntryFormArea: {
    gap: theme.spacing.md,
    paddingTop: theme.spacing.xs,
  },
  inviteTokenInput: {
    minHeight: 54,
  },
  rememberedContent: {
    flexGrow: 1,
    justifyContent: 'flex-start',
    paddingBottom: theme.spacing.xl,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
  },
  rememberedWidth: {
    alignSelf: 'center',
    flexGrow: 1,
    justifyContent: 'flex-start',
    maxWidth: 460,
    width: '100%',
  },
  rememberedBody: {
    flex: 1,
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    paddingTop: theme.spacing.xl,
  },
  rememberedMain: {
    gap: theme.spacing.md,
    paddingTop: theme.spacing.lg,
    position: 'relative',
    width: '100%',
  },
  rememberedMainRemembered: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: theme.spacing.xxl,
    paddingTop: 0,
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
  authIdentityLockup: {
    alignItems: 'center',
    gap: theme.spacing.sm,
    width: '100%',
  },
  authIdentityCopy: {
    alignItems: 'center',
    gap: theme.spacing.xs,
    minHeight: 54,
    width: '100%',
  },
  authMessageSlot: {
    justifyContent: 'flex-start',
    minHeight: 42,
    width: '100%',
  },
  rememberedTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.title2,
    fontWeight: '800',
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  rememberedHint: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.callout,
    fontWeight: '600',
    textAlign: 'center',
  },
  socialActions: {
    gap: theme.spacing.sm,
    width: '100%',
  },
  authFormBlock: {
    gap: theme.spacing.md,
    width: '100%',
  },
  authActionRow: {
    paddingTop: theme.spacing.xs,
  },
  recoveryHelper: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    fontWeight: '600',
    lineHeight: 18,
    paddingHorizontal: theme.spacing.xs,
  },
  authSecondaryBlock: {
    alignItems: 'center',
    gap: theme.spacing.xs,
    width: '100%',
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
  iconFieldRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  authFieldIcon: {
    alignItems: 'center',
    backgroundColor: theme.colors.primarySoft,
    borderRadius: theme.radius.pill,
    height: 40,
    justifyContent: 'center',
    marginTop: 6,
    width: 40,
  },
  fieldControl: {
    flex: 1,
  },
  authInputPanel: {
    backgroundColor: theme.colors.primaryGhost,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.medium,
    borderWidth: 1,
    overflow: 'hidden',
  },
  authInputPanelLocked: {
    backgroundColor: theme.colors.surfaceMuted,
  },
  authInput: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    height: 52,
    minHeight: 52,
    paddingBottom: 0,
    paddingTop: 0,
    textAlignVertical: 'center',
  },
  authInputLocked: {
    color: theme.colors.textMuted,
  },
  forgotPasswordButton: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    minHeight: 34,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  inlineLinkText: {
    color: theme.colors.primary,
    fontSize: theme.typography.footnote,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.84,
  },
  actionDisabled: {
    opacity: 0.58,
  },
  inviteSummary: {
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.medium,
    borderWidth: 1,
    gap: theme.spacing.xxs,
    padding: theme.spacing.md,
  },
  inviteLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    fontWeight: '700',
  },
  inviteName: {
    color: theme.colors.text,
    fontSize: theme.typography.body,
    fontWeight: '800',
  },
});
