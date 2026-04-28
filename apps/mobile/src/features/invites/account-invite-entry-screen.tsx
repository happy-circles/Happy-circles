import { useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import {
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { Href } from 'expo-router';

import { AppAvatar } from '@/components/app-avatar';
import { AppTextInput } from '@/components/app-text-input';
import { BrandMark } from '@/components/brand-mark';
import { FieldBlock } from '@/components/field-block';
import { HeaderBrandTitle } from '@/components/header-brand-title';
import {
  HappyCirclesCenterSvg,
  resolveHappyCirclesPalette,
} from '@/components/happy-circles-glyph';
import { MessageBanner } from '@/components/message-banner';
import { PrimaryAction } from '@/components/primary-action';
import { ScreenShell } from '@/components/screen-shell';
import { SurfaceCard } from '@/components/surface-card';
import { resolveAvatarUrl } from '@/lib/avatar';
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

const AUTH_STATE_TRANSITION_MS = 860;
const AUTH_STATE_EASING = Easing.bezier(0.22, 1, 0.36, 1);
const AUTH_SUCCESS_TRANSITION_MS = 520;
const AUTH_SUCCESS_NAVIGATION_DELAY_MS = 650;
const OTHER_ACCOUNT_FACE_AVATAR_VIEW_BOX = '290 290 100 100';
const OTHER_ACCOUNT_FACE_COLOR = '#f6c653';

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

  const avatarUrl = account ? resolveAvatarUrl(account.avatarPath) : null;

  const authBusy = biometricBusy || passwordBusy || Boolean(socialBusyProvider);
  const isRecovery = authMode === 'recover';
  const isOtherAccountMode = showAuthOptions && authEntryMode === 'other';
  const isRememberedReauthMode =
    showAuthOptions && authEntryMode === 'remembered' && Boolean(account) && !isRecovery;
  const locksRememberedEmail = isRememberedReauthMode && Boolean(account?.email);
  const authOptionsMotion = useRef(new Animated.Value(showAuthOptions ? 1 : 0)).current;
  const authEntryMotion = useRef(new Animated.Value(authEntryMode === 'other' ? 1 : 0)).current;
  const successMotion = useRef(new Animated.Value(0)).current;
  const successNavigationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const otherAccountFaceIdlePalette = useMemo(
    () => ({
      ...resolveHappyCirclesPalette('brand'),
      face: OTHER_ACCOUNT_FACE_COLOR,
      faceDetail: theme.colors.white,
    }),
    [],
  );
  const otherAccountFaceSuccessPalette = useMemo(
    () => ({
      ...resolveHappyCirclesPalette('brand'),
      face: theme.colors.success,
      faceDetail: theme.colors.white,
    }),
    [],
  );

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

  useEffect(() => {
    Animated.timing(successMotion, {
      duration: AUTH_SUCCESS_TRANSITION_MS,
      easing: AUTH_STATE_EASING,
      toValue: authSuccess ? 1 : 0,
      useNativeDriver: true,
    }).start();
  }, [authSuccess, successMotion]);

  useEffect(
    () => () => {
      if (successNavigationTimerRef.current) {
        clearTimeout(successNavigationTimerRef.current);
      }
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
  const rememberedProfileAnimatedStyle =
    account && !isRecovery
      ? {
          transform: [
            {
              translateY: authOptionsMotion.interpolate({
                inputRange: [0, 1],
                outputRange: [0, -224],
              }),
            },
          ],
        }
      : null;
  const otherAccountFaceAnimatedStyle = {
    transform: [
      {
        scale: successMotion.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 1.025],
        }),
      },
    ],
  };
  const otherAccountFaceIdleStyle = {
    opacity: successMotion.interpolate({
      inputRange: [0, 1],
      outputRange: [1, 0],
    }),
  };
  const otherAccountFaceSuccessStyle = {
    opacity: successMotion,
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

  function completeSuccessfulSignIn() {
    setAuthSuccess(true);
    setMessage(null);

    if (successNavigationTimerRef.current) {
      clearTimeout(successNavigationTimerRef.current);
      successNavigationTimerRef.current = null;
    }
  }

  function showRememberedReauthMode(nextMessage: string | null = null) {
    authEntryMotion.stopAnimation();
    authEntryMotion.setValue(0);
    setAuthEntryMode('remembered');
    setAuthMode('sign-in');
    setEmail(account?.email ?? '');
    setPassword('');
    setAuthSuccess(false);
    setMessage(nextMessage);
    setShowAuthOptions(true);
  }

  function showRememberedAccountMode() {
    setAuthEntryMode('remembered');
    setMessage(null);
    setAuthMode('sign-in');
    setEmail(account?.email ?? '');
    setPassword('');
    setAuthSuccess(false);
    setShowAuthOptions(true);
  }

  function showOtherAccountMode() {
    setAuthEntryMode('other');
    setAuthMode('sign-in');
    setEmail('');
    setPassword('');
    setAuthSuccess(false);
    setMessage(null);
    setShowAuthOptions(true);
  }

  function showRecoverMode() {
    setAuthMode('recover');
    setAuthSuccess(false);
    setMessage(null);
    setShowAuthOptions(true);
  }

  function showSignInMode() {
    setAuthMode('sign-in');
    setAuthSuccess(false);
    setMessage(null);
    setShowAuthOptions(true);
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

  function signedInDestination(): Href {
    if (pendingToken) {
      return {
        pathname: '/join/[token]',
        params: { token: pendingToken },
      } as unknown as Href;
    }

    if (!session.setupState.requiredComplete) {
      return buildSetupAccountHref(session.setupState.pendingRequiredSteps[0] ?? 'profile');
    }

    if (session.accountAccessState === 'active') {
      return '/home' as Href;
    }

    return '/join' as Href;
  }

  function inviteEntryHref(): Href {
    if (pendingToken) {
      return {
        pathname: '/join',
        params: { token: pendingToken },
      } as unknown as Href;
    }

    return '/join' as Href;
  }

  function createAccountHref(): Href {
    if (pendingToken) {
      return {
        pathname: '/join/[token]/create-account',
        params: { token: pendingToken },
      } as unknown as Href;
    }

    return '/join' as Href;
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
    setMessage(null);

    try {
      const result = await session.unlock();
      if (!result.success) {
        showRememberedReauthMode(biometricMessage(result.error, session.biometricLabel));
        return;
      }

      await rememberPendingToken();
      returnToRoute(router, signedInDestination());
    } finally {
      setBiometricBusy(false);
    }
  }

  async function handleSocialSignIn(provider: SocialProvider) {
    if (authBusy) {
      return;
    }

    setAuthSuccess(false);
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

      setMessage(result);
    } finally {
      setSocialBusyProvider(null);
    }
  }

  async function handlePasswordSignIn() {
    if (authBusy) {
      return;
    }

    setAuthSuccess(false);
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

      setMessage(result);
    } finally {
      setPasswordBusy(false);
    }
  }

  async function handlePasswordRecovery() {
    if (authBusy) {
      return;
    }

    setMessage(null);
    setPasswordBusy(true);

    try {
      const result = await session.requestPasswordReset(email);
      setMessage(result);
    } finally {
      setPasswordBusy(false);
    }
  }

  if (authSuccess) {
    return (
      <KeyboardAvoidingView style={styles.keyboardShell}>
        <ScreenShell
          contentContainerStyle={styles.rememberedContent}
          contentWidthStyle={styles.rememberedWidth}
          headerTitle={<HeaderBrandTitle logoSize={68} titleSize={30} />}
          headerVariant="plain"
          title="Happy Circles"
        >
          <View style={[styles.rememberedBody, styles.authCompletionBody]}>
            <View style={styles.authCompletionContent}>
              <Animated.View
                style={[
                  styles.loginLogoMark,
                  styles.authCompletionMark,
                  otherAccountFaceAnimatedStyle,
                ]}
              >
                <HappyCirclesCenterSvg
                  palette={otherAccountFaceSuccessPalette}
                  size={88}
                  viewBox={OTHER_ACCOUNT_FACE_AVATAR_VIEW_BOX}
                  wink
                />
              </Animated.View>
              <Text style={styles.rememberedTitle}>Entrando...</Text>
              <Text style={styles.rememberedHint}>Preparando tu cuenta</Text>
              <ActivityIndicator color={theme.colors.primary} size="small" />
            </View>
          </View>
        </ScreenShell>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.keyboardShell}>
      <ScreenShell
        contentContainerStyle={styles.rememberedContent}
        contentWidthStyle={styles.rememberedWidth}
        headerTitle={<HeaderBrandTitle logoSize={68} titleSize={30} />}
        headerVariant="plain"
        title="Happy Circles"
      >
        <View style={styles.rememberedBody}>
          <View
            style={[
              styles.rememberedMain,
              account && !isRecovery ? styles.rememberedMainRemembered : null,
            ]}
          >
            {account && !isRecovery ? (
              <Animated.View
                style={[styles.rememberedProfileMotion, rememberedProfileAnimatedStyle]}
              >
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
                      <AppAvatar
                        fallbackBackgroundColor="#ff5b0a"
                        fallbackTextColor={theme.colors.white}
                        imageUrl={avatarUrl}
                        label={account.displayName}
                        size={88}
                      />
                      <Text style={styles.rememberedTitle}>Entrar como {account.displayName}</Text>
                      <Text style={styles.rememberedHint}>
                        {account.email ?? 'Confirma tu acceso para continuar.'}
                      </Text>
                    </Animated.View>

                    <Animated.View
                      pointerEvents={isOtherAccountMode ? 'auto' : 'none'}
                      style={[
                        styles.rememberedProfile,
                        styles.authIdentityLayer,
                        otherAccountIdentityStyle,
                      ]}
                    >
                      <Animated.View style={[styles.loginLogoMark, otherAccountFaceAnimatedStyle]}>
                        <Animated.View
                          style={[styles.otherAccountFaceLayer, otherAccountFaceIdleStyle]}
                        >
                          <HappyCirclesCenterSvg
                            palette={otherAccountFaceIdlePalette}
                            size={88}
                            viewBox={OTHER_ACCOUNT_FACE_AVATAR_VIEW_BOX}
                            wink={Boolean(socialBusyProvider)}
                          />
                        </Animated.View>
                        <Animated.View
                          style={[styles.otherAccountFaceLayer, otherAccountFaceSuccessStyle]}
                        >
                          <HappyCirclesCenterSvg
                            palette={otherAccountFaceSuccessPalette}
                            size={88}
                            viewBox={OTHER_ACCOUNT_FACE_AVATAR_VIEW_BOX}
                            wink
                          />
                        </Animated.View>
                      </Animated.View>
                      <Text style={styles.rememberedTitle}>Entrar con otra cuenta</Text>
                      <Text style={styles.rememberedHint}>Usa correo, Google o Apple.</Text>
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
                    <AppAvatar
                      fallbackBackgroundColor="#ff5b0a"
                      fallbackTextColor={theme.colors.white}
                      imageUrl={avatarUrl}
                      label={account.displayName}
                      size={88}
                    />
                    <Text style={styles.rememberedTitle}>Hola, {account.displayName}</Text>
                    {biometricBusy ? (
                      <Text style={styles.rememberedHint}>
                        Validando {session.biometricLabel}...
                      </Text>
                    ) : (
                      <Text style={styles.rememberedHint}>Toca para continuar</Text>
                    )}
                  </Pressable>
                )}
                {showAuthOptions ? (
                  <View style={styles.authMessageSlot}>
                    {message ? <MessageBanner message={message} tone="neutral" /> : null}
                  </View>
                ) : null}
              </Animated.View>
            ) : (
              <View style={styles.rememberedProfile}>
                <Text style={styles.rememberedTitle}>
                  {isRecovery ? 'Recupera tu contrasena' : 'Hola, inicia sesion!'}
                </Text>
                <Text style={styles.rememberedHint}>
                  {isRecovery
                    ? 'Te enviaremos un enlace para definir una nueva clave.'
                    : 'Entra con correo, Google o Apple.'}
                </Text>
                <View style={styles.authMessageSlot}>
                  {message ? <MessageBanner message={message} tone="neutral" /> : null}
                </View>
              </View>
            )}

            {authOptionsMounted ? (
              <Animated.View
                style={[
                  styles.socialActions,
                  account && !isRecovery ? styles.authOptionsFloating : null,
                  authOptionsAnimatedStyle,
                ]}
              >
                <View style={styles.authFormBlock}>
                  <View style={styles.iconFieldRow}>
                    <View style={styles.authFieldIcon}>
                      <Ionicons color={theme.colors.primary} name="mail" size={18} />
                    </View>
                    <View style={styles.fieldControl}>
                      <View
                        style={[
                          styles.authInputPanel,
                          locksRememberedEmail ? styles.authInputPanelLocked : null,
                        ]}
                      >
                        <AppTextInput
                          autoCapitalize="none"
                          autoComplete="email"
                          editable={!locksRememberedEmail}
                          keyboardType="email-address"
                          onChangeText={setEmail}
                          placeholder="tu@correo.com"
                          placeholderTextColor={theme.colors.muted}
                          style={[
                            styles.authInput,
                            locksRememberedEmail ? styles.authInputLocked : null,
                          ]}
                          value={email}
                        />
                      </View>
                    </View>
                  </View>

                  {!isRecovery ? (
                    <View style={styles.iconFieldRow}>
                      <View style={styles.authFieldIcon}>
                        <Ionicons color={theme.colors.primary} name="lock-closed" size={18} />
                      </View>
                      <View style={styles.fieldControl}>
                        <View style={styles.authInputPanel}>
                          <AppTextInput
                            autoCapitalize="none"
                            autoComplete="password"
                            onChangeText={setPassword}
                            placeholder="Tu contrasena"
                            placeholderTextColor={theme.colors.muted}
                            secureTextEntry
                            style={styles.authInput}
                            value={password}
                          />
                        </View>
                      </View>
                    </View>
                  ) : null}

                  <View style={styles.authActionRow}>
                    <PrimaryAction
                      fullWidth
                      label={
                        passwordBusy ? 'Procesando...' : isRecovery ? 'Enviar enlace' : 'Ingresar'
                      }
                      loading={passwordBusy}
                      onPress={
                        passwordBusy
                          ? undefined
                          : () =>
                              void (isRecovery ? handlePasswordRecovery() : handlePasswordSignIn())
                      }
                    />
                  </View>

                  {isRecovery ? (
                    <PrimaryAction
                      compact
                      label="Volver a iniciar sesion"
                      onPress={showSignInMode}
                      variant="ghost"
                    />
                  ) : (
                    <View style={styles.formLinkRow}>
                      <Pressable
                        disabled={authBusy}
                        onPress={showRecoverMode}
                        style={({ pressed }) => [
                          styles.inlineLinkButton,
                          pressed ? styles.pressed : null,
                        ]}
                      >
                        <Text style={styles.inlineLinkText}>Olvide contrasena</Text>
                      </Pressable>
                      <Pressable
                        disabled={authBusy}
                        onPress={() => returnToRoute(router, createAccountHref())}
                        style={({ pressed }) => [
                          styles.inlineLinkButton,
                          pressed ? styles.pressed : null,
                        ]}
                      >
                        <Text style={styles.inlineLinkText}>Crear cuenta</Text>
                      </Pressable>
                    </View>
                  )}
                </View>

                {!isRecovery ? (
                  <>
                    {session.appleSignInAvailable ? (
                      <AppleAuthentication.AppleAuthenticationButton
                        buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                        buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                        cornerRadius={18}
                        onPress={() => void handleSocialSignIn('apple')}
                        style={styles.appleButton}
                      />
                    ) : null}

                    <Pressable
                      onPress={() => void handleSocialSignIn('google')}
                      style={({ pressed }) => [
                        styles.googleButton,
                        pressed ? styles.pressed : null,
                      ]}
                    >
                      <Ionicons color={theme.colors.text} name="logo-google" size={20} />
                      <Text style={styles.googleButtonLabel}>
                        {socialBusyProvider === 'google'
                          ? 'Abriendo Google...'
                          : 'Continuar con Google'}
                      </Text>
                    </Pressable>
                  </>
                ) : null}
              </Animated.View>
            ) : null}
          </View>

          {account && !isRecovery ? (
            <Pressable
              disabled={authBusy}
              onPress={isOtherAccountMode ? showRememberedAccountMode : showOtherAccountMode}
              style={({ pressed }) => [styles.otherAccountButton, pressed ? styles.pressed : null]}
            >
              <Ionicons
                color={theme.colors.textMuted}
                name={isOtherAccountMode ? 'person-circle' : 'person-circle-outline'}
                size={18}
              />
              <Text style={styles.otherAccountText}>
                {isOtherAccountMode ? `Volver a ${account.displayName}` : 'Usar otra cuenta'}
              </Text>
            </Pressable>
          ) : (
            <PrimaryAction
              compact
              label="Volver a invitacion"
              onPress={() => returnToRoute(router, inviteEntryHref())}
              variant="ghost"
            />
          )}
        </View>
      </ScreenShell>
    </KeyboardAvoidingView>
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
  const isSignInMode = rawModeParam === 'sign-in' || rawModeParam === 'login' || isRecoverMode;

  useEffect(() => {
    setTokenInput(initialToken);
  }, [initialToken]);

  if ((session.rememberedAccount && !isPreviewMode) || isSignInMode) {
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
      setMessage('Abre tu link de invitacion o pega el token completo para continuar.');
      return;
    }

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
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.keyboardShell}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.contentWidth}>
          <View style={styles.logoWrap}>
            <BrandMark orientation="stacked" size="lg" />
          </View>

          <View style={styles.copyBlock}>
            <Text style={styles.title}>Bienvenido a Happy Circles</Text>
            <Text style={styles.subtitle}>Necesitas una invitacion para empezar.</Text>
          </View>

          <SurfaceCard padding="lg" style={styles.card} variant="elevated">
            <FieldBlock label="Codigo de invitacion">
              <AppTextInput
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
            </FieldBlock>

            {preview && !blockingMessage ? (
              <View style={styles.inviteSummary}>
                <Text style={styles.inviteLabel}>Invitacion de</Text>
                <Text style={styles.inviteName}>{preview.inviterDisplayName}</Text>
              </View>
            ) : null}

            {blockingMessage ? <MessageBanner message={blockingMessage} tone="warning" /> : null}
            {message ? <MessageBanner message={message} tone="neutral" /> : null}

            <PrimaryAction
              disabled={!shouldPreview || Boolean(blockingMessage)}
              label={previewQuery.isFetching ? 'Validando...' : 'Continuar'}
              loading={previewQuery.isFetching}
              onPress={previewQuery.isFetching ? undefined : () => void handleContinue()}
              subtitle="Luego creas tu acceso con correo, celular y contrasena."
            />
          </SurfaceCard>

          <PrimaryAction
            href={buildJoinSignInHref(pendingToken)}
            label="Ya tengo cuenta"
            subtitle="Ingresa con correo, Google o Apple."
            variant="secondary"
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardShell: {
    backgroundColor: theme.colors.background,
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingBottom: theme.spacing.xxl,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.xl,
  },
  contentWidth: {
    alignSelf: 'center',
    gap: theme.spacing.lg,
    maxWidth: 460,
    width: '100%',
  },
  logoWrap: {
    alignItems: 'center',
  },
  copyBlock: {
    gap: theme.spacing.xs,
  },
  title: {
    color: theme.colors.text,
    fontSize: theme.typography.title1,
    fontWeight: '800',
    letterSpacing: -0.6,
    lineHeight: 34,
    textAlign: 'center',
  },
  subtitle: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.callout,
    lineHeight: 22,
    textAlign: 'center',
  },
  card: {
    gap: theme.spacing.md,
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
  authCompletionBody: {
    justifyContent: 'center',
    paddingBottom: theme.spacing.xxl,
  },
  authCompletionContent: {
    alignItems: 'center',
    gap: theme.spacing.md,
    width: '100%',
  },
  authCompletionMark: {
    marginBottom: theme.spacing.xs,
  },
  rememberedMain: {
    gap: theme.spacing.xl,
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
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    width: '100%',
  },
  rememberedProfileMotion: {
    gap: theme.spacing.md,
    width: '100%',
  },
  authIdentityStage: {
    minHeight: 172,
    position: 'relative',
    width: '100%',
  },
  authIdentityLayer: {
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  authMessageSlot: {
    minHeight: 64,
    width: '100%',
  },
  loginLogoMark: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    height: 88,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 88,
  },
  otherAccountFaceLayer: {
    height: 88,
    left: 0,
    position: 'absolute',
    top: 0,
    width: 88,
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
  authOptionsFloating: {
    left: 0,
    position: 'absolute',
    right: 0,
    top: '34%',
  },
  authFormBlock: {
    gap: theme.spacing.lg,
    width: '100%',
  },
  authActionRow: {
    paddingTop: theme.spacing.xs,
  },
  appleButton: {
    height: 52,
    width: '100%',
  },
  googleButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.medium,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    width: '100%',
  },
  googleButtonLabel: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '700',
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
  formLinkRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 0,
  },
  inlineLinkButton: {
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  inlineLinkText: {
    color: theme.colors.primary,
    fontSize: theme.typography.footnote,
    fontWeight: '800',
  },
  otherAccountButton: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.xs,
    marginTop: 'auto',
    minHeight: 44,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  otherAccountText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.84,
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
