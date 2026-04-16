import { useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import type { LayoutChangeEvent } from 'react-native';
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
import { BrandMark } from '@/components/brand-mark';
import { FieldBlock } from '@/components/field-block';
import { MessageBanner } from '@/components/message-banner';
import { PrimaryAction } from '@/components/primary-action';
import { COUNTRY_OPTIONS, DEFAULT_COUNTRY } from '@/lib/phone';
import { theme } from '@/lib/theme';
import { useSession } from '@/providers/session-provider';

type SignInScreenMode = 'sign-in' | 'register' | 'recover';

export interface SignInScreenProps {
  readonly initialMode?: SignInScreenMode | null;
}

function animateModeChange() {
  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
}

export function SignInScreen({ initialMode = null }: SignInScreenProps) {
  const session = useSession();
  const [activeMode, setActiveMode] = useState<SignInScreenMode | null>(initialMode);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phoneNationalNumber, setPhoneNationalNumber] = useState('');
  const [countryIso, setCountryIso] = useState(DEFAULT_COUNTRY.iso2);
  const [countryMenuOpen, setCountryMenuOpen] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [socialBusyProvider, setSocialBusyProvider] = useState<'google' | 'apple' | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);
  const fieldOffsetsRef = useRef<Record<string, number>>({});

  const selectedCountry =
    COUNTRY_OPTIONS.find((country) => country.iso2 === countryIso) ?? DEFAULT_COUNTRY;
  const isRegister = activeMode === 'register';
  const isRecovery = activeMode === 'recover';
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

  function handleFieldLayout(fieldKey: string) {
    return (event: LayoutChangeEvent) => {
      fieldOffsetsRef.current[fieldKey] = event.nativeEvent.layout.y;
    };
  }

  function focusField(fieldKey: string) {
    requestAnimationFrame(() => {
      const targetY = fieldOffsetsRef.current[fieldKey];
      if (typeof targetY !== 'number') {
        return;
      }

      scrollRef.current?.scrollTo({
        y: Math.max(0, targetY - 110),
        animated: true,
      });
    });
  }

  function switchMode(nextMode: SignInScreenMode) {
    if (nextMode === activeMode && activeMode !== null) {
      return;
    }

    animateModeChange();
    setCountryMenuOpen(false);
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
      const result = isRegister
        ? await session.registerAccount({
            fullName,
            email,
            password,
            confirmPassword: password,
            phoneCountryIso2: selectedCountry.iso2,
            phoneCountryCallingCode: selectedCountry.callingCode,
            phoneNationalNumber,
          })
        : isRecovery
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

    setCountryMenuOpen(false);
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

    setCountryMenuOpen(false);
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
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.contentWidth, activeMode ? null : styles.contentWidthIdle]}>
            <View style={activeMode ? null : styles.idleTopSpacer} />

            <View style={[styles.brandWrap, brandStateStyle]}>
              <BrandMark orientation="stacked" size="lg" />
            </View>

            <View style={activeMode ? null : styles.idleBottomSpacer} />

            <View style={[styles.tabBar, activeMode ? null : styles.tabBarIdle]}>
              <Pressable
                onPress={() => switchMode('sign-in')}
                style={({ pressed }) => [
                  styles.tabButton,
                  activeMode === 'sign-in' ? styles.tabButtonActive : null,
                  pressed ? styles.tabButtonPressed : null,
                ]}
              >
                <Text style={[styles.tabLabel, activeMode === 'sign-in' ? styles.tabLabelActive : null]}>
                  Ingresar
                </Text>
              </Pressable>
              <View style={styles.tabDivider} />
              <Pressable
                onPress={() => switchMode('register')}
                style={({ pressed }) => [
                  styles.tabButton,
                  activeMode === 'register' ? styles.tabButtonActive : null,
                  pressed ? styles.tabButtonPressed : null,
                ]}
              >
                <Text style={[styles.tabLabel, activeMode === 'register' ? styles.tabLabelActive : null]}>
                  Crear cuenta
                </Text>
              </Pressable>
            </View>

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

            {!isRecovery ? (
              <View style={styles.socialActions}>
                <Pressable
                  onPress={() => void handleGoogleSignIn()}
                  style={({ pressed }) => [
                    styles.googleButton,
                    pressed ? styles.googleButtonPressed : null,
                  ]}
                >
                  <Ionicons color={theme.colors.text} name="logo-google" size={18} />
                  <Text style={styles.googleButtonLabel}>
                    {socialBusyProvider === 'google' ? 'Abriendo Google...' : 'Continuar con Google'}
                  </Text>
                </Pressable>

                {session.appleSignInAvailable ? (
                  <AppleAuthentication.AppleAuthenticationButton
                    buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                    buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                    cornerRadius={18}
                    onPress={() => void handleAppleButtonPress()}
                    style={styles.appleButton}
                  />
                ) : null}
              </View>
            ) : null}

            {message ? <MessageBanner message={message} tone="neutral" /> : null}

            {activeMode ? (
              <View style={styles.formArea}>
                {isRecovery ? (
                  <MessageBanner
                    message="Escribe tu correo y te enviaremos un enlace para definir una nueva clave."
                    tone="neutral"
                  />
                ) : null}

                <View onLayout={handleFieldLayout('email')}>
                  <FieldBlock label="Correo">
                    <AppTextInput
                      autoCapitalize="none"
                      autoComplete="email"
                      chrome="glass"
                      keyboardType="email-address"
                      onChangeText={setEmail}
                      onFocus={() => focusField('email')}
                      placeholder="tu@correo.com"
                      placeholderTextColor={theme.colors.muted}
                      style={styles.input}
                      value={email}
                    />
                  </FieldBlock>
                </View>

                {!isRecovery ? (
                  <View onLayout={handleFieldLayout('password')}>
                    <FieldBlock label="Contrasena">
                      <AppTextInput
                        autoCapitalize="none"
                        autoComplete="password"
                        chrome="glass"
                        onChangeText={setPassword}
                        onFocus={() => focusField('password')}
                        placeholder="Tu contrasena"
                        placeholderTextColor={theme.colors.muted}
                        secureTextEntry
                        style={styles.input}
                        value={password}
                      />
                    </FieldBlock>
                  </View>
                ) : null}

                {isRegister ? (
                  <View style={styles.extraGlass}>
                    <View style={styles.extraGlassHeader}>
                      <View style={styles.extraGlassDot} />
                      <Text style={styles.extraGlassLabel}>Solo al crear cuenta</Text>
                    </View>

                    <View onLayout={handleFieldLayout('fullName')}>
                      <FieldBlock label="Nombre">
                        <AppTextInput
                          autoCapitalize="words"
                          chrome="glass"
                          onChangeText={setFullName}
                          onFocus={() => focusField('fullName')}
                          placeholder="Nombre y apellido"
                          placeholderTextColor={theme.colors.muted}
                          style={styles.input}
                          value={fullName}
                        />
                      </FieldBlock>
                    </View>

                    <View onLayout={handleFieldLayout('phone')}>
                      <FieldBlock label="Celular">
                        <View style={styles.phoneField}>
                          <View style={styles.phoneRow}>
                            <Pressable
                              onPress={() => setCountryMenuOpen((value) => !value)}
                              style={styles.callingCodeBox}
                            >
                              <Text style={styles.callingCodeText}>{selectedCountry.callingCode}</Text>
                            </Pressable>

                            <AppTextInput
                              chrome="glass"
                              keyboardType="phone-pad"
                              onChangeText={setPhoneNationalNumber}
                              onFocus={() => {
                                setCountryMenuOpen(false);
                                focusField('phone');
                              }}
                              placeholder="3001234567"
                              placeholderTextColor={theme.colors.muted}
                              style={[styles.input, styles.phoneInput]}
                              value={phoneNationalNumber}
                            />
                          </View>

                          {countryMenuOpen ? (
                            <View style={styles.countryMenu}>
                              {COUNTRY_OPTIONS.map((country, index) => (
                                <Pressable
                                  key={country.iso2}
                                  onPress={() => {
                                    setCountryIso(country.iso2);
                                    setCountryMenuOpen(false);
                                  }}
                                  style={[
                                    styles.countryOption,
                                    index === COUNTRY_OPTIONS.length - 1 ? styles.countryOptionLast : null,
                                  ]}
                                >
                                  <Text style={styles.countryLabel}>{country.label}</Text>
                                  <Text style={styles.countryCode}>{country.callingCode}</Text>
                                </Pressable>
                              ))}
                            </View>
                          ) : null}
                        </View>
                      </FieldBlock>
                    </View>
                  </View>
                ) : null}

                <PrimaryAction
                  label={
                    busy
                      ? 'Procesando...'
                      : isRegister
                        ? 'Crear cuenta'
                        : isRecovery
                          ? 'Enviar enlace'
                          : 'Ingresar'
                  }
                  onPress={busy ? undefined : () => void handleSubmit()}
                />

                {isRecovery ? (
                  <PrimaryAction
                    compact
                    href="/sign-in?mode=sign-in"
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
  tabDivider: {
    backgroundColor: theme.colors.hairline,
    marginBottom: theme.spacing.sm,
    width: StyleSheet.hairlineWidth,
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
  extraGlass: {
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    borderColor: 'rgba(255, 255, 255, 0.84)',
    borderRadius: 26,
    borderWidth: 1,
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    ...theme.shadow.card,
  },
  extraGlassHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  extraGlassDot: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.pill,
    height: 8,
    width: 8,
  },
  extraGlassLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  phoneField: {
    position: 'relative',
    zIndex: 20,
  },
  phoneRow: {
    alignItems: 'stretch',
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  callingCodeBox: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
    borderColor: 'rgba(15, 23, 40, 0.08)',
    borderRadius: theme.radius.medium,
    borderWidth: 1,
    justifyContent: 'center',
    minWidth: 92,
    paddingHorizontal: theme.spacing.md,
  },
  callingCodeText: {
    color: theme.colors.text,
    fontSize: theme.typography.body,
    fontWeight: '700',
  },
  phoneInput: {
    flex: 1,
  },
  countryMenu: {
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    borderColor: 'rgba(15, 23, 40, 0.08)',
    borderRadius: theme.radius.medium,
    borderWidth: 1,
    left: 0,
    marginTop: theme.spacing.xs,
    overflow: 'hidden',
    paddingVertical: 4,
    position: 'absolute',
    right: 0,
    top: '100%',
    zIndex: 30,
    ...theme.shadow.floating,
  },
  countryOption: {
    alignItems: 'center',
    borderBottomColor: theme.colors.hairline,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  countryOptionLast: {
    borderBottomWidth: 0,
  },
  countryLabel: {
    color: theme.colors.text,
    fontSize: theme.typography.footnote,
    fontWeight: '600',
  },
  countryCode: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    fontWeight: '700',
  },
});
