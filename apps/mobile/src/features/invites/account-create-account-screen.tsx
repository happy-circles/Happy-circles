import { useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AppTextInput } from '@/components/app-text-input';
import { FieldBlock } from '@/components/field-block';
import { HeaderBrandTitle } from '@/components/header-brand-title';
import { MessageBanner } from '@/components/message-banner';
import { PrimaryAction } from '@/components/primary-action';
import { ScreenFinalAction } from '@/components/screen-final-action';
import { ScreenShell } from '@/components/screen-shell';
import { writePendingInviteIntent } from '@/lib/invite-intent';
import { useAccountInvitePreviewQuery } from '@/lib/live-data';
import { returnToRoute } from '@/lib/navigation';
import { COUNTRY_OPTIONS, DEFAULT_COUNTRY, normalizePhoneDigits } from '@/lib/phone';
import { buildSetupAccountHref } from '@/lib/setup-account';
import { theme } from '@/lib/theme';
import { useSession } from '@/providers/session-provider';
import {
  MIN_ACCOUNT_INVITE_TOKEN_LENGTH,
  accountInviteStatusMessage,
  extractAccountInviteToken,
} from './account-invite-utils';

function triggerSelectionHaptic() {
  void Haptics.selectionAsync().catch(() => undefined);
}

function triggerImpactHaptic() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
}

function triggerWarningHaptic() {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
}

function triggerSuccessHaptic() {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
}

function countryFlag(iso2: string) {
  return iso2
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));
}

type FieldStatus = 'idle' | 'valid' | 'invalid';
type FieldName = 'email' | 'phone' | 'password';

function resolveFieldStatusColor(status: FieldStatus) {
  if (status === 'valid') {
    return theme.colors.success;
  }

  if (status === 'invalid') {
    return theme.colors.danger;
  }

  return theme.colors.primary;
}

function resolveFieldStatusBackground(status: FieldStatus) {
  if (status === 'valid') {
    return theme.colors.successSoft;
  }

  if (status === 'invalid') {
    return theme.colors.dangerSoft;
  }

  return theme.colors.primarySoft;
}

function resolveFieldPanelBackground(status: FieldStatus) {
  if (status === 'valid') {
    return 'rgba(61, 186, 110, 0.08)';
  }

  if (status === 'invalid') {
    return 'rgba(232, 96, 74, 0.08)';
  }

  return theme.colors.primaryGhost;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isValidPhoneNumber(value: string) {
  const digits = normalizePhoneDigits(value);
  return digits.length >= 6 && digits.length <= 20;
}

function isValidPassword(value: string) {
  return value.length >= 8 && value.length <= 72;
}

export function AccountCreateAccountScreen() {
  const params = useLocalSearchParams<{ preview?: string | string[]; token?: string | string[] }>();
  const router = useRouter();
  const session = useSession();
  const rawPreviewParam = Array.isArray(params.preview) ? params.preview[0] : params.preview;
  const rawTokenParam = Array.isArray(params.token) ? params.token[0] : params.token;
  const token = useMemo(() => extractAccountInviteToken(rawTokenParam), [rawTokenParam]);
  const isPreviewMode = __DEV__ && rawPreviewParam === 'true';
  const shouldPreview = token.length >= MIN_ACCOUNT_INVITE_TOKEN_LENGTH;
  const previewQuery = useAccountInvitePreviewQuery(shouldPreview && !isPreviewMode ? token : null);
  const preview = previewQuery.data;
  const blockingMessage =
    !isPreviewMode && preview
      ? accountInviteStatusMessage(preview.status, preview.deliveryStatus)
      : null;
  const canCreateAccount = isPreviewMode || Boolean(preview && !blockingMessage);
  const inviterDisplayName = isPreviewMode ? 'Invitacion QA' : preview?.inviterDisplayName;
  const [email, setEmail] = useState('');
  const [countryIso, setCountryIso] = useState(DEFAULT_COUNTRY.iso2);
  const [phoneNationalNumber, setPhoneNationalNumber] = useState('');
  const [countryMenuOpen, setCountryMenuOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [touchedFields, setTouchedFields] = useState<Record<FieldName, boolean>>({
    email: false,
    password: false,
    phone: false,
  });
  const [validationAttempted, setValidationAttempted] = useState(false);
  const [busy, setBusy] = useState(false);

  const selectedCountry =
    COUNTRY_OPTIONS.find((country) => country.iso2 === countryIso) ?? DEFAULT_COUNTRY;
  const emailValid = isValidEmail(email);
  const phoneValid = isValidPhoneNumber(phoneNationalNumber);
  const passwordValid = isValidPassword(password);
  const emailChecked = validationAttempted || touchedFields.email;
  const phoneChecked = validationAttempted || touchedFields.phone;
  const passwordChecked = validationAttempted || touchedFields.password;
  const emailStatus: FieldStatus = !emailChecked ? 'idle' : emailValid ? 'valid' : 'invalid';
  const phoneStatus: FieldStatus = !phoneChecked ? 'idle' : phoneValid ? 'valid' : 'invalid';
  const passwordStatus: FieldStatus = !passwordChecked
    ? 'idle'
    : passwordValid
      ? 'valid'
      : 'invalid';
  const emailStatusColor = resolveFieldStatusColor(emailStatus);
  const phoneStatusColor = resolveFieldStatusColor(phoneStatus);
  const passwordStatusColor = resolveFieldStatusColor(passwordStatus);
  const emailStatusBackground = resolveFieldStatusBackground(emailStatus);
  const phoneStatusBackground = resolveFieldStatusBackground(phoneStatus);
  const passwordStatusBackground = resolveFieldStatusBackground(passwordStatus);
  const emailPanelBackground = resolveFieldPanelBackground(emailStatus);
  const phonePanelBackground = resolveFieldPanelBackground(phoneStatus);
  const passwordPanelBackground = resolveFieldPanelBackground(passwordStatus);

  function markFieldTouched(field: FieldName) {
    setTouchedFields((current) => {
      if (current[field]) {
        return current;
      }

      return {
        ...current,
        [field]: true,
      };
    });
  }

  useEffect(() => {
    if (isPreviewMode) {
      return;
    }

    if (session.status === 'loading' || session.status === 'signed_out') {
      return;
    }

    if (shouldPreview) {
      returnToRoute(router, {
        pathname: '/join/[token]',
        params: { token },
      });
      return;
    }

    returnToRoute(router, '/join');
  }, [isPreviewMode, router, session.status, shouldPreview, token]);

  useEffect(() => {
    if (!canCreateAccount || isPreviewMode) {
      return;
    }

    void writePendingInviteIntent({
      type: 'account_invite',
      token,
    });
  }, [canCreateAccount, isPreviewMode, token]);

  async function handleSubmit() {
    if (busy || !canCreateAccount) {
      return;
    }

    triggerImpactHaptic();
    setValidationAttempted(true);

    if (!emailValid || !phoneValid || !passwordValid) {
      triggerWarningHaptic();
      setMessage(null);
      return;
    }

    if (isPreviewMode) {
      setMessage('Vista temporal de QA. Este boton no crea una cuenta desde preview.');
      return;
    }

    setBusy(true);
    setMessage(null);

    try {
      await writePendingInviteIntent({
        type: 'account_invite',
        token,
      });

      const result = await session.registerAccount({
        email,
        password,
        confirmPassword: password,
        phoneCountryIso2: selectedCountry.iso2,
        phoneCountryCallingCode: selectedCountry.callingCode,
        phoneNationalNumber,
      });

      setMessage(result);

      if (result === 'Cuenta creada. Ahora termina tu setup.') {
        triggerSuccessHaptic();
        returnToRoute(router, buildSetupAccountHref('profile'));
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo crear la cuenta.');
    } finally {
      setBusy(false);
    }
  }

  if (session.status === 'loading') {
    return null;
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.keyboardShell}
    >
      <ScreenShell
        contentMode="full"
        headerTitle={<HeaderBrandTitle logoSize={68} titleSize={30} />}
        headerVariant="plain"
        title="Happy Circles"
      >
        {!shouldPreview ? (
          <View style={styles.messageBlock}>
            <MessageBanner
              message="Abre tu link de invitacion o pega el codigo completo desde la entrada."
              tone="neutral"
            />
            <PrimaryAction href="/join" label="Volver a invitacion" variant="secondary" />
          </View>
        ) : null}

        {shouldPreview && previewQuery.isLoading ? (
          <MessageBanner message="Validando invitacion." tone="neutral" />
        ) : null}

        {shouldPreview && previewQuery.error ? (
          <View style={styles.messageBlock}>
            <MessageBanner message={previewQuery.error.message} tone="warning" />
            <PrimaryAction href="/join" label="Probar otro codigo" variant="secondary" />
          </View>
        ) : null}

        {blockingMessage ? (
          <View style={styles.messageBlock}>
            <MessageBanner message={blockingMessage} tone="warning" />
            <PrimaryAction href="/join" label="Probar otro codigo" variant="secondary" />
          </View>
        ) : null}

        {canCreateAccount ? (
          <>
            <View style={styles.accountContent}>
              <View style={styles.inviteSummary}>
                <View style={styles.inviteIcon}>
                  <Ionicons color={theme.colors.success} name="checkmark" size={18} />
                </View>
                <View style={styles.inviteCopy}>
                  <Text style={styles.inviteTitle}>Invitacion confirmada</Text>
                  {inviterDisplayName ? (
                    <Text numberOfLines={1} style={styles.inviteName}>
                      {inviterDisplayName}
                    </Text>
                  ) : null}
                </View>
              </View>

              {message ? <MessageBanner message={message} tone="neutral" /> : null}

              <View style={styles.formBlock}>
                <FieldBlock label="Correo">
                  <View style={styles.iconFieldRow}>
                    <View style={[styles.fieldIcon, { backgroundColor: emailStatusBackground }]}>
                      <Ionicons color={emailStatusColor} name="mail" size={18} />
                    </View>
                    <View style={styles.fieldControl}>
                      <View
                        style={[
                          styles.inputValidationBox,
                          { backgroundColor: emailPanelBackground },
                        ]}
                      >
                        <AppTextInput
                          autoCapitalize="none"
                          autoComplete="email"
                          keyboardType="email-address"
                          onBlur={() => markFieldTouched('email')}
                          onChangeText={setEmail}
                          placeholder="tu@correo.com"
                          placeholderTextColor={theme.colors.muted}
                          style={styles.validationInput}
                          value={email}
                        />
                      </View>
                      <Text
                        style={[
                          styles.inlineFieldError,
                          emailStatus !== 'invalid' ? styles.inlineFieldErrorHidden : null,
                        ]}
                      >
                        {emailStatus === 'invalid' ? 'Escribe un correo valido.' : ' '}
                      </Text>
                    </View>
                  </View>
                </FieldBlock>

                <FieldBlock label="Celular">
                  <View style={styles.phoneField}>
                    <View style={styles.phoneRow}>
                      <View style={[styles.fieldIcon, { backgroundColor: phoneStatusBackground }]}>
                        <Ionicons color={phoneStatusColor} name="call" size={18} />
                      </View>
                      <Pressable
                        onPress={() => {
                          triggerSelectionHaptic();
                          setCountryMenuOpen((value) => !value);
                        }}
                        style={({ pressed }) => [
                          styles.callingCodeBox,
                          pressed ? styles.pressed : null,
                        ]}
                      >
                        <Text style={styles.countryFlag}>{countryFlag(selectedCountry.iso2)}</Text>
                        <Text style={styles.callingCodeText}>{selectedCountry.callingCode}</Text>
                        <Ionicons color={theme.colors.textMuted} name="chevron-down" size={14} />
                      </Pressable>

                      <View style={styles.fieldControl}>
                        <View
                          style={[
                            styles.inputValidationBox,
                            { backgroundColor: phonePanelBackground },
                          ]}
                        >
                          <AppTextInput
                            keyboardType="phone-pad"
                            onBlur={() => markFieldTouched('phone')}
                            onChangeText={setPhoneNationalNumber}
                            onFocus={() => setCountryMenuOpen(false)}
                            placeholder="3001234567"
                            placeholderTextColor={theme.colors.muted}
                            style={styles.validationInput}
                            value={phoneNationalNumber}
                          />
                        </View>
                        <Text
                          style={[
                            styles.inlineFieldError,
                            phoneStatus !== 'invalid' ? styles.inlineFieldErrorHidden : null,
                          ]}
                        >
                          {phoneStatus === 'invalid' ? 'Debe tener entre 6 y 20 digitos.' : ' '}
                        </Text>
                      </View>
                    </View>

                    {countryMenuOpen ? (
                      <View style={styles.countryMenu}>
                        {COUNTRY_OPTIONS.map((country, index) => (
                          <Pressable
                            key={country.iso2}
                            onPress={() => {
                              triggerSelectionHaptic();
                              setCountryIso(country.iso2);
                              setCountryMenuOpen(false);
                            }}
                            style={[
                              styles.countryOption,
                              index === COUNTRY_OPTIONS.length - 1
                                ? styles.countryOptionLast
                                : null,
                            ]}
                          >
                            <View style={styles.countryOptionLabel}>
                              <Text style={styles.countryFlag}>{countryFlag(country.iso2)}</Text>
                              <Text style={styles.countryLabel}>{country.label}</Text>
                            </View>
                            <Text style={styles.countryCode}>{country.callingCode}</Text>
                          </Pressable>
                        ))}
                      </View>
                    ) : null}
                  </View>
                </FieldBlock>

                <FieldBlock label="Contrasena">
                  <View style={styles.iconFieldRow}>
                    <View
                      style={[styles.fieldIcon, { backgroundColor: passwordStatusBackground }]}
                    >
                      <Ionicons color={passwordStatusColor} name="lock-closed" size={18} />
                    </View>
                    <View style={styles.fieldControl}>
                      <View
                        style={[
                          styles.inputValidationBox,
                          { backgroundColor: passwordPanelBackground },
                        ]}
                      >
                        <AppTextInput
                          autoCapitalize="none"
                          autoComplete="password"
                          onBlur={() => markFieldTouched('password')}
                          onChangeText={setPassword}
                          placeholder="Tu contrasena"
                          placeholderTextColor={theme.colors.muted}
                          secureTextEntry
                          style={styles.validationInput}
                          value={password}
                        />
                      </View>
                      <Text
                        style={[
                          styles.inlineFieldError,
                          passwordStatus !== 'invalid' ? styles.inlineFieldErrorHidden : null,
                        ]}
                      >
                        {passwordStatus === 'invalid' ? 'Debe tener al menos 8 caracteres.' : ' '}
                      </Text>
                    </View>
                  </View>
                </FieldBlock>
              </View>
            </View>

            <ScreenFinalAction
              disabled={busy}
              label={busy ? 'Creando...' : 'Crear cuenta'}
              loading={busy}
              onPress={busy ? undefined : () => void handleSubmit()}
            />
          </>
        ) : null}
      </ScreenShell>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardShell: {
    backgroundColor: theme.colors.background,
    flex: 1,
  },
  accountContent: {
    flex: 1,
    gap: theme.spacing.xl,
    justifyContent: 'flex-start',
    paddingTop: 108,
  },
  messageBlock: {
    gap: theme.spacing.md,
  },
  inviteSummary: {
    alignItems: 'center',
    backgroundColor: theme.colors.successSoft,
    borderColor: 'rgba(61, 186, 110, 0.18)',
    borderRadius: theme.radius.large,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.md,
    minHeight: 64,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  inviteIcon: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.pill,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  inviteCopy: {
    flex: 1,
    gap: 2,
  },
  inviteTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.body,
    fontWeight: '800',
  },
  inviteName: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    fontWeight: '700',
    lineHeight: 18,
  },
  formBlock: {
    gap: 28,
    marginTop: -4,
  },
  inputValidationBox: {
    borderColor: theme.colors.border,
    borderRadius: theme.radius.medium,
    borderWidth: 1,
    flex: 1,
    overflow: 'hidden',
  },
  inlineFieldError: {
    color: theme.colors.danger,
    fontSize: theme.typography.caption,
    fontWeight: '700',
    lineHeight: 16,
    minHeight: 16,
    paddingHorizontal: theme.spacing.xs,
  },
  inlineFieldErrorHidden: {
    opacity: 0,
  },
  iconFieldRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  fieldControl: {
    flex: 1,
    gap: theme.spacing.xxs,
  },
  fieldIcon: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    height: 40,
    justifyContent: 'center',
    marginTop: 6,
    width: 40,
  },
  validationInput: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    height: 56,
    minHeight: 56,
    paddingBottom: 0,
    paddingTop: 0,
    textAlignVertical: 'center',
  },
  phoneField: {
    position: 'relative',
    zIndex: 20,
  },
  phoneRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  callingCodeBox: {
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceSoft,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.medium,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    height: 56,
    justifyContent: 'center',
    minWidth: 104,
    paddingHorizontal: theme.spacing.sm,
  },
  countryFlag: {
    fontSize: theme.typography.body,
    lineHeight: 20,
  },
  callingCodeText: {
    color: theme.colors.text,
    fontSize: theme.typography.body,
    fontWeight: '700',
  },
  countryMenu: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.medium,
    borderWidth: 1,
    left: 0,
    marginTop: theme.spacing.xs,
    overflow: 'hidden',
    paddingVertical: 2,
    position: 'absolute',
    top: '100%',
    width: 236,
    zIndex: 30,
    ...theme.shadow.floating,
  },
  countryOption: {
    alignItems: 'center',
    borderBottomColor: theme.colors.hairline,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 40,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  countryOptionLabel: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
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
  pressed: {
    opacity: 0.9,
  },
});
