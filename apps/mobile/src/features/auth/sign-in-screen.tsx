import { useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import {
  Keyboard,
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
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppTextInput } from '@/components/app-text-input';
import { AppAvatar } from '@/components/app-avatar';
import { BrandMark } from '@/components/brand-mark';
import { FieldBlock } from '@/components/field-block';
import { MessageBanner } from '@/components/message-banner';
import { PrimaryAction } from '@/components/primary-action';
import { SurfaceCard } from '@/components/surface-card';
import { resolveAvatarUrl } from '@/lib/avatar';
import { theme } from '@/lib/theme';
import { useSession } from '@/providers/session-provider';

type SignInScreenMode = 'sign-in' | 'recover';

export interface SignInScreenProps {
  readonly initialMode?: SignInScreenMode | null;
}

function maskEmail(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const [localPart, domain] = value.trim().split('@');
  if (!localPart || !domain) {
    return value;
  }

  const visiblePrefix = localPart.slice(0, 2);
  return `${visiblePrefix}${localPart.length > 2 ? '***' : ''}@${domain}`;
}

function animateModeChange() {
  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
}

export function SignInScreen({ initialMode = 'sign-in' }: SignInScreenProps) {
  const session = useSession();
  const [activeMode, setActiveMode] = useState<SignInScreenMode | null>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [socialBusyProvider, setSocialBusyProvider] = useState<'google' | 'apple' | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);

  const isRecovery = activeMode === 'recover';
  const canShowSocialActions = activeMode === 'sign-in';
  const canShowPasswordForm = activeMode === 'sign-in' || isRecovery;
  const brandStateStyle = keyboardVisible
    ? styles.brandWrapKeyboard
    : activeMode
      ? styles.brandWrapExpanded
      : styles.brandWrapIdle;

  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  useEffect(() => {
    setActiveMode((currentMode) => (currentMode === initialMode ? currentMode : initialMode));
  }, [initialMode]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSubscription = Keyboard.addListener(showEvent, () => {
      animateModeChange();
      setKeyboardVisible(true);
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      animateModeChange();
      setKeyboardVisible(false);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  function switchMode(nextMode: SignInScreenMode) {
    if (nextMode === activeMode && activeMode !== null) {
      return;
    }

    animateModeChange();
    setMessage(null);
    setActiveMode(nextMode);

    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        y: 140,
        animated: true,
      });
    });
  }

  async function handleSubmit() {
    if (busy || !activeMode) {
      return;
    }

    setBusy(true);

    try {
      const result = isRecovery
        ? await session.requestPasswordReset(email)
        : await session.signInWithPassword({
            email,
            password,
          });

      setMessage(result);
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogleSignIn() {
    if (socialBusyProvider) {
      return;
    }

    setMessage(null);
    setSocialBusyProvider('google');

    try {
      const result = await session.signInWithGoogle();
      setMessage(result);
    } finally {
      setSocialBusyProvider(null);
    }
  }

  async function handleAppleButtonPress() {
    if (socialBusyProvider) {
      return;
    }

    setMessage(null);
    setSocialBusyProvider('apple');

    try {
      const result = await session.signInWithApple();
      setMessage(result);
    } finally {
      setSocialBusyProvider(null);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 24 : 0}
        style={styles.keyboardShell}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          scrollEnabled={false}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.contentWidth, activeMode ? null : styles.contentWidthIdle]}>
            <View style={activeMode ? null : styles.idleTopSpacer} />

            <View style={[styles.brandWrap, brandStateStyle]}>
              <BrandMark orientation="stacked" size="lg" />
            </View>

            <View style={activeMode ? null : styles.idleBottomSpacer} />

            {activeMode === 'sign-in' && session.rememberedAccount ? (
              <SurfaceCard padding="md" style={styles.rememberedCard} variant="elevated">
                <View style={styles.rememberedLeading}>
                  <AppAvatar
                    imageUrl={resolveAvatarUrl(session.rememberedAccount.avatarPath)}
                    label={session.rememberedAccount.displayName}
                    size={46}
                  />
                  <View style={styles.rememberedCopy}>
                    <Text style={styles.rememberedTitle}>
                      Continuar como {session.rememberedAccount.displayName}
                    </Text>
                    <Text style={styles.rememberedMeta}>
                      {maskEmail(session.rememberedAccount.email) ??
                        (session.rememberedAccount.accountAccessState === 'active'
                          ? 'Tu ultima cuenta usada en este telefono.'
                          : 'Tu acceso sigue pendiente de invitacion o activacion.')}
                    </Text>
                  </View>
                </View>
                <PrimaryAction
                  compact
                  label="Usar este correo"
                  onPress={() => setEmail(session.rememberedAccount?.email ?? '')}
                  subtitle="Completa tu contrasena para entrar con la ultima cuenta usada."
                  variant="secondary"
                />
              </SurfaceCard>
            ) : null}

            <View style={[styles.tabBar, activeMode ? null : styles.tabBarIdle]}>
              <Pressable
                onPress={() => switchMode('sign-in')}
                style={({ pressed }) => [
                  styles.tabButton,
                  activeMode === 'sign-in' ? styles.tabButtonActive : null,
                  pressed ? styles.tabButtonPressed : null,
                ]}
              >
                <Text
                  style={[styles.tabLabel, activeMode === 'sign-in' ? styles.tabLabelActive : null]}
                >
                  Ingresar
                </Text>
              </Pressable>
            </View>

            <Text style={styles.inviteOnlyHint}>
              Happy Circles abre cuentas nuevas solo con una invitacion valida.
            </Text>

            <View style={styles.inlineActions}>
              <Pressable
                onPress={() => switchMode('recover')}
                style={({ pressed }) => [
                  styles.inlineActionButton,
                  activeMode === 'recover' ? styles.inlineActionButtonActive : null,
                  pressed ? styles.inlineActionButtonPressed : null,
                ]}
              >
                <Text
                  style={[
                    styles.inlineActionLabel,
                    activeMode === 'recover' ? styles.inlineActionLabelActive : null,
                  ]}
                >
                  Olvide mi contrasena
                </Text>
              </Pressable>
            </View>

            <View style={activeMode ? null : styles.idleFootSpacer} />

            {canShowSocialActions ? (
              <View style={styles.socialActions}>
                {session.appleSignInAvailable ? (
                  <AppleAuthentication.AppleAuthenticationButton
                    buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                    buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                    cornerRadius={18}
                    onPress={() => void handleAppleButtonPress()}
                    style={styles.appleButton}
                  />
                ) : null}

                <Pressable
                  onPress={() => void handleGoogleSignIn()}
                  style={({ pressed }) => [
                    styles.googleButton,
                    pressed ? styles.googleButtonPressed : null,
                  ]}
                >
                  <Ionicons color={theme.colors.text} name="logo-google" size={18} />
                  <Text style={styles.googleButtonLabel}>
                    {socialBusyProvider === 'google'
                      ? 'Abriendo Google...'
                      : 'Continuar con Google'}
                  </Text>
                </Pressable>
              </View>
            ) : null}

            {message ? <MessageBanner message={message} tone="neutral" /> : null}

            {activeMode && canShowPasswordForm ? (
              <View style={styles.formArea}>
                {isRecovery ? (
                  <MessageBanner
                    message="Escribe tu correo y te enviaremos un enlace para definir una nueva clave."
                    tone="neutral"
                  />
                ) : null}

                <FieldBlock label="Correo">
                  <AppTextInput
                    autoCapitalize="none"
                    autoComplete="email"
                    chrome="glass"
                    keyboardType="email-address"
                    onChangeText={setEmail}
                    placeholder="tu@correo.com"
                    placeholderTextColor={theme.colors.muted}
                    style={styles.input}
                    value={email}
                  />
                </FieldBlock>

                {!isRecovery ? (
                  <FieldBlock label="Contrasena">
                    <AppTextInput
                      autoCapitalize="none"
                      autoComplete="password"
                      chrome="glass"
                      onChangeText={setPassword}
                      placeholder="Tu contrasena"
                      placeholderTextColor={theme.colors.muted}
                      secureTextEntry
                      style={styles.input}
                      value={password}
                    />
                  </FieldBlock>
                ) : null}

                <PrimaryAction
                  label={busy ? 'Procesando...' : isRecovery ? 'Enviar enlace' : 'Ingresar'}
                  onPress={busy ? undefined : () => void handleSubmit()}
                />

                {isRecovery ? (
                  <PrimaryAction
                    compact
                    href="/sign-in"
                    label="Volver a ingresar"
                    variant="ghost"
                  />
                ) : null}
              </View>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  keyboardShell: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingBottom: theme.spacing.xxl,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
  },
  contentWidth: {
    alignSelf: 'center',
    gap: theme.spacing.lg,
    maxWidth: 460,
    width: '100%',
  },
  contentWidthIdle: {
    flex: 1,
  },
  rememberedCard: {
    gap: theme.spacing.md,
  },
  rememberedLeading: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  rememberedCopy: {
    flex: 1,
    gap: 3,
  },
  rememberedTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '800',
  },
  rememberedMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
  },
  brandWrap: {
    alignItems: 'center',
    alignSelf: 'center',
    width: '100%',
  },
  brandWrapIdle: {
    paddingBottom: 0,
    paddingTop: 0,
    transform: [{ scale: 1.32 }],
  },
  brandWrapExpanded: {
    paddingBottom: theme.spacing.sm,
    paddingTop: theme.spacing.xs,
    transform: [{ translateY: -22 }, { scale: 0.98 }],
  },
  brandWrapKeyboard: {
    paddingBottom: 0,
    paddingTop: 0,
    transform: [{ translateY: -56 }, { scale: 0.78 }],
  },
  idleTopSpacer: {
    flex: 1,
    minHeight: 36,
  },
  idleBottomSpacer: {
    flex: 0.72,
    minHeight: 72,
  },
  idleFootSpacer: {
    flex: 0.22,
    minHeight: 20,
  },
  tabBar: {
    alignItems: 'stretch',
    borderBottomColor: theme.colors.hairline,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
  },
  tabBarIdle: {
    marginTop: theme.spacing.sm,
  },
  inviteOnlyHint: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
    marginTop: -6,
  },
  inlineActions: {
    alignItems: 'flex-end',
    marginTop: -4,
  },
  inlineActionButton: {
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  inlineActionButtonActive: {
    backgroundColor: theme.colors.primaryGhost,
  },
  inlineActionButtonPressed: {
    opacity: 0.84,
  },
  inlineActionLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    fontWeight: '700',
  },
  inlineActionLabelActive: {
    color: theme.colors.primary,
  },
  tabButton: {
    alignItems: 'center',
    flex: 1,
    minHeight: 54,
    paddingBottom: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
  },
  tabButtonActive: {
    borderBottomColor: theme.colors.primary,
    borderBottomWidth: 2,
  },
  tabButtonPressed: {
    opacity: 0.88,
  },
  tabLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.title3,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  tabLabelActive: {
    color: theme.colors.text,
    fontWeight: '800',
  },
  socialActions: {
    gap: theme.spacing.sm,
  },
  googleButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.82)',
    borderColor: 'rgba(15, 23, 40, 0.08)',
    borderRadius: theme.radius.medium,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  googleButtonPressed: {
    opacity: 0.9,
  },
  googleButtonLabel: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '700',
  },
  appleButton: {
    height: 54,
    width: '100%',
  },
  formArea: {
    gap: theme.spacing.md,
    paddingTop: theme.spacing.xs,
  },
  input: {},
});
