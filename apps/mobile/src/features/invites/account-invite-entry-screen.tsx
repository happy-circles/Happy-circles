import { useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import {
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { Href } from 'expo-router';

import { AppAvatar } from '@/components/app-avatar';
import { AppTextInput } from '@/components/app-text-input';
import { BrandMark } from '@/components/brand-mark';
import { FieldBlock } from '@/components/field-block';
import { MessageBanner } from '@/components/message-banner';
import { PrimaryAction } from '@/components/primary-action';
import { SurfaceCard } from '@/components/surface-card';
import { resolveAvatarUrl } from '@/lib/avatar';
import { writePendingInviteIntent } from '@/lib/invite-intent';
import { useAccountInvitePreviewQuery } from '@/lib/live-data';
import { buildSetupAccountHref } from '@/lib/setup-account';
import { theme } from '@/lib/theme';
import { useSession } from '@/providers/session-provider';

const MIN_TOKEN_LENGTH = 12;

type SocialProvider = 'google' | 'apple';

function extractToken(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) {
    return '';
  }

  try {
    const url = new URL(trimmed);
    const tokenParam = url.searchParams.get('token') ?? url.searchParams.get('invite');
    if (tokenParam?.trim()) {
      return tokenParam.trim();
    }

    const pathParts = [url.host, ...url.pathname.split('/')].filter(Boolean);
    const joinIndex = pathParts.findIndex((part) => part.toLocaleLowerCase('en-US') === 'join');
    if (joinIndex >= 0 && pathParts[joinIndex + 1]) {
      return decodeURIComponent(pathParts[joinIndex + 1]);
    }
  } catch {
    // Not a URL. Fall through and treat it as a raw token or copied path.
  }

  const withoutQuery = trimmed.split(/[?#]/)[0] ?? trimmed;
  const pathParts = withoutQuery.split('/').filter(Boolean);
  const joinIndex = pathParts.findIndex((part) => part.toLocaleLowerCase('en-US') === 'join');
  if (joinIndex >= 0 && pathParts[joinIndex + 1]) {
    return decodeURIComponent(pathParts[joinIndex + 1]);
  }

  return trimmed;
}

function statusMessage(status: string, deliveryStatus: string): string | null {
  if (deliveryStatus === 'revoked') {
    return 'Este link fue reemplazado por una invitacion mas reciente.';
  }

  if (deliveryStatus === 'expired' || status === 'expired') {
    return 'Esta invitacion ya vencio. Pide una nueva para empezar.';
  }

  if (status === 'accepted') {
    return 'Esta invitacion ya fue usada.';
  }

  if (status === 'rejected' || status === 'canceled') {
    return 'Esta invitacion ya fue cerrada.';
  }

  if (status === 'pending_inviter_review') {
    return 'Esta invitacion ya fue reclamada y esta esperando revision.';
  }

  return null;
}

function animateAuthReveal() {
  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
}

function biometricMessage(error: string | null, label: string): string {
  if (error === 'user_cancel') {
    return `Cancelaste ${label}. Puedes entrar con correo y contrasena.`;
  }

  if (error === 'not_available') {
    return 'Este dispositivo no tiene biometria disponible. Entra con correo y contrasena.';
  }

  return `No pudimos validar ${label}. Entra con correo y contrasena.`;
}

function RememberedAccountEntry({ pendingToken }: { readonly pendingToken: string | null }) {
  const session = useSession();
  const router = useRouter();
  const account = session.rememberedAccount;
  const [showAuthOptions, setShowAuthOptions] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [biometricBusy, setBiometricBusy] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [socialBusyProvider, setSocialBusyProvider] = useState<SocialProvider | null>(null);

  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  if (!account) {
    return null;
  }

  const avatarUrl = resolveAvatarUrl(account.avatarPath);

  const authBusy = biometricBusy || passwordBusy || Boolean(socialBusyProvider);

  function revealAuthOptions(nextMessage: string | null = null) {
    animateAuthReveal();
    setMessage(nextMessage);
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

  function postPasswordSignInDestination(): Href {
    if (pendingToken) {
      return {
        pathname: '/join/[token]',
        params: { token: pendingToken },
      } as unknown as Href;
    }

    return '/' as Href;
  }

  async function handleContinue() {
    if (authBusy) {
      return;
    }

    if (session.status === 'signed_out') {
      revealAuthOptions('Tu sesion local vencio. Entra con correo y contrasena.');
      return;
    }

    setBiometricBusy(true);
    setMessage(null);

    try {
      const result = await session.unlock();
      if (!result.success) {
        revealAuthOptions(biometricMessage(result.error, session.biometricLabel));
        return;
      }

      await rememberPendingToken();
      router.replace(signedInDestination());
    } finally {
      setBiometricBusy(false);
    }
  }

  async function handleSocialSignIn(provider: SocialProvider) {
    if (authBusy) {
      return;
    }

    setMessage(null);
    setSocialBusyProvider(provider);

    try {
      await rememberPendingToken();
      const result =
        provider === 'google' ? await session.signInWithGoogle() : await session.signInWithApple();
      setMessage(result);
    } finally {
      setSocialBusyProvider(null);
    }
  }

  async function handlePasswordSignIn() {
    if (authBusy) {
      return;
    }

    setMessage(null);
    setPasswordBusy(true);

    try {
      await rememberPendingToken();
      const result = await session.signInWithPassword({
        email,
        password,
      });
      setMessage(result);

      if (result === 'Sesion iniciada.') {
        router.replace(postPasswordSignInDestination());
      }
    } finally {
      setPasswordBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.keyboardShell}
    >
      <ScrollView
        contentContainerStyle={styles.rememberedContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.rememberedWidth}>
          <BrandMark orientation="stacked" size="md" />

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
              size={78}
            />
            <Text style={styles.rememberedTitle}>Hola, {account.displayName}</Text>
            <Text style={styles.rememberedHint}>
              {biometricBusy ? `Validando ${session.biometricLabel}...` : 'Toca para continuar'}
            </Text>
          </Pressable>

          {message ? <MessageBanner message={message} tone="neutral" /> : null}

          {showAuthOptions ? (
            <View style={styles.socialActions}>
              <SurfaceCard padding="md" style={styles.inlineAuthCard} variant="elevated">
                <FieldBlock label="Correo">
                  <AppTextInput
                    autoCapitalize="none"
                    autoComplete="email"
                    chrome="glass"
                    keyboardType="email-address"
                    onChangeText={setEmail}
                    placeholder="tu@correo.com"
                    placeholderTextColor={theme.colors.muted}
                    value={email}
                  />
                </FieldBlock>

                <FieldBlock label="Contrasena">
                  <AppTextInput
                    autoCapitalize="none"
                    autoComplete="password"
                    chrome="glass"
                    onChangeText={setPassword}
                    placeholder="Tu contrasena"
                    placeholderTextColor={theme.colors.muted}
                    secureTextEntry
                    value={password}
                  />
                </FieldBlock>

                <PrimaryAction
                  label={passwordBusy ? 'Ingresando...' : 'Ingresar'}
                  loading={passwordBusy}
                  onPress={passwordBusy ? undefined : () => void handlePasswordSignIn()}
                />
              </SurfaceCard>

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
                style={({ pressed }) => [styles.googleButton, pressed ? styles.pressed : null]}
              >
                <Ionicons color={theme.colors.text} name="logo-google" size={18} />
                <Text style={styles.googleButtonLabel}>
                  {socialBusyProvider === 'google' ? 'Abriendo Google...' : 'Continuar con Google'}
                </Text>
              </Pressable>
            </View>
          ) : null}

          <Pressable
            disabled={authBusy}
            onPress={() => revealAuthOptions('Elige otro metodo para entrar.')}
            style={({ pressed }) => [styles.otherAccountButton, pressed ? styles.pressed : null]}
          >
            <Text style={styles.otherAccountText}>Usar otra cuenta</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function AccountInviteEntryScreen() {
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const session = useSession();
  const router = useRouter();
  const rawTokenParam = Array.isArray(params.token) ? params.token[0] : params.token;
  const initialToken = useMemo(() => extractToken(rawTokenParam), [rawTokenParam]);
  const [tokenInput, setTokenInput] = useState(initialToken);
  const [message, setMessage] = useState<string | null>(null);
  const normalizedToken = useMemo(() => extractToken(tokenInput), [tokenInput]);
  const shouldPreview = normalizedToken.length >= MIN_TOKEN_LENGTH;
  const previewQuery = useAccountInvitePreviewQuery(shouldPreview ? normalizedToken : null);
  const preview = previewQuery.data;
  const blockingMessage = preview ? statusMessage(preview.status, preview.deliveryStatus) : null;

  useEffect(() => {
    setTokenInput(initialToken);
  }, [initialToken]);

  if (session.rememberedAccount) {
    return <RememberedAccountEntry pendingToken={shouldPreview ? normalizedToken : null} />;
  }

  async function handleContinue() {
    const token = extractToken(tokenInput);
    if (token.length < MIN_TOKEN_LENGTH) {
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

    const nextBlockingMessage = statusMessage(nextPreview.status, nextPreview.deliveryStatus);
    if (nextBlockingMessage) {
      setMessage(nextBlockingMessage);
      return;
    }

    await writePendingInviteIntent({
      type: 'account_invite',
      token,
    });

    router.push('/sign-in?mode=register');
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
            href="/sign-in?mode=sign-in"
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
    justifyContent: 'center',
    paddingBottom: theme.spacing.xxl,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.xl,
  },
  rememberedWidth: {
    alignItems: 'center',
    alignSelf: 'center',
    gap: theme.spacing.xxl,
    maxWidth: 460,
    width: '100%',
  },
  rememberedProfile: {
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    width: '100%',
  },
  rememberedTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.title3,
    fontWeight: '800',
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  rememberedHint: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    fontWeight: '600',
    textAlign: 'center',
  },
  socialActions: {
    gap: theme.spacing.sm,
    width: '100%',
  },
  inlineAuthCard: {
    gap: theme.spacing.md,
    width: '100%',
  },
  appleButton: {
    height: 54,
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
    minHeight: 54,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    width: '100%',
  },
  googleButtonLabel: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '700',
  },
  otherAccountButton: {
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  otherAccountText: {
    color: theme.colors.text,
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
