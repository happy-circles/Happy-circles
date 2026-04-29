import { useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  IdentityFlowActions,
  IdentityFlowField,
  IdentityFlowForm,
  IdentityFlowIdentity,
  IdentityFlowMessageSlot,
  IdentityFlowScreen,
  IdentityFlowTextInput,
} from '@/components/identity-flow';
import { MessageBanner } from '@/components/message-banner';
import { PrimaryAction } from '@/components/primary-action';
import type { BrandVerificationState } from '@/components/brand-verification-lockup';
import {
  triggerIdentityImpactHaptic,
  triggerIdentitySelectionHaptic,
  triggerIdentitySuccessHaptic,
  triggerIdentityWarningHaptic,
} from '@/lib/identity-flow-haptics';
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

function countryFlag(iso2: string) {
  return iso2
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));
}

type FieldStatus = 'idle' | 'valid' | 'invalid';
type FieldName = 'email' | 'phone' | 'password';

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
  const tokenState: BrandVerificationState =
    !shouldPreview || previewQuery.error || blockingMessage
      ? 'error'
      : previewQuery.isLoading
        ? 'loading'
        : canCreateAccount
          ? 'success'
          : 'idle';
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

    triggerIdentityImpactHaptic();
    setValidationAttempted(true);

    if (!emailValid || !phoneValid || !passwordValid) {
      triggerIdentityWarningHaptic();
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
        triggerIdentitySuccessHaptic();
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
    <IdentityFlowScreen
      actions={
        canCreateAccount ? (
          <IdentityFlowActions
            disabled={busy}
            loading={busy}
            onPrimaryPress={busy ? undefined : () => void handleSubmit()}
            primaryLabel={busy ? 'Creando...' : 'Crear cuenta'}
          />
        ) : undefined
      }
      identity={<IdentityFlowIdentity state={tokenState} variant="status" />}
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
        <IdentityFlowMessageSlot>
          <MessageBanner message="Validando invitacion." tone="neutral" />
        </IdentityFlowMessageSlot>
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
        <IdentityFlowForm>
          <IdentityFlowMessageSlot>
            {message ? (
              <MessageBanner
                message={message}
                tone={message === 'Cuenta creada. Ahora termina tu setup.' ? 'success' : 'neutral'}
              />
            ) : null}
          </IdentityFlowMessageSlot>

          <IdentityFlowField
            error={emailStatus === 'invalid' ? 'Escribe un correo valido.' : null}
            icon="mail"
            label="Correo"
            status={
              emailStatus === 'invalid' ? 'danger' : emailStatus === 'valid' ? 'success' : 'idle'
            }
          >
            <IdentityFlowTextInput
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              onBlur={() => markFieldTouched('email')}
              onChangeText={setEmail}
              placeholder="tu@correo.com"
              placeholderTextColor={theme.colors.muted}
              value={email}
            />
          </IdentityFlowField>

          <IdentityFlowField
            error={phoneStatus === 'invalid' ? 'Debe tener entre 6 y 20 digitos.' : null}
            icon="call"
            label="Celular"
            status={
              phoneStatus === 'invalid' ? 'danger' : phoneStatus === 'valid' ? 'success' : 'idle'
            }
          >
            <View style={styles.phoneField}>
              <View style={styles.phoneRow}>
                <Pressable
                  onPress={() => {
                    triggerIdentitySelectionHaptic();
                    setCountryMenuOpen((value) => !value);
                  }}
                  style={({ pressed }) => [styles.callingCodeBox, pressed ? styles.pressed : null]}
                >
                  <Text style={styles.countryFlag}>{countryFlag(selectedCountry.iso2)}</Text>
                  <Text style={styles.callingCodeText}>{selectedCountry.callingCode}</Text>
                  <Ionicons color={theme.colors.textMuted} name="chevron-down" size={14} />
                </Pressable>

                <IdentityFlowTextInput
                  keyboardType="phone-pad"
                  onBlur={() => markFieldTouched('phone')}
                  onChangeText={setPhoneNationalNumber}
                  onFocus={() => setCountryMenuOpen(false)}
                  placeholder="3001234567"
                  placeholderTextColor={theme.colors.muted}
                  style={styles.phoneInput}
                  value={phoneNationalNumber}
                />
              </View>

              {countryMenuOpen ? (
                <View style={styles.countryMenu}>
                  {COUNTRY_OPTIONS.map((country, index) => (
                    <Pressable
                      key={country.iso2}
                      onPress={() => {
                        triggerIdentitySelectionHaptic();
                        setCountryIso(country.iso2);
                        setCountryMenuOpen(false);
                      }}
                      style={[
                        styles.countryOption,
                        index === COUNTRY_OPTIONS.length - 1 ? styles.countryOptionLast : null,
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
          </IdentityFlowField>

          <IdentityFlowField
            error={passwordStatus === 'invalid' ? 'Debe tener al menos 8 caracteres.' : null}
            icon="lock-closed"
            label="Contrasena"
            status={
              passwordStatus === 'invalid'
                ? 'danger'
                : passwordStatus === 'valid'
                  ? 'success'
                  : 'idle'
            }
          >
            <IdentityFlowTextInput
              autoCapitalize="none"
              autoComplete="password"
              onBlur={() => markFieldTouched('password')}
              onChangeText={setPassword}
              placeholder="Tu contrasena"
              placeholderTextColor={theme.colors.muted}
              secureTextEntry
              value={password}
            />
          </IdentityFlowField>
        </IdentityFlowForm>
      ) : null}
    </IdentityFlowScreen>
  );
}

const styles = StyleSheet.create({
  messageBlock: {
    gap: theme.spacing.md,
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
  phoneInput: {
    flex: 1,
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
