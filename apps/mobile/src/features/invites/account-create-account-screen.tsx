import { useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Platform, Pressable, ScrollView, View, type ViewStyle } from 'react-native';

import {
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
import { OtpCodeInput } from '@/components/otp-code-input';
import { PrimaryAction } from '@/components/primary-action';
import type { BrandVerificationState } from '@/components/brand-verification-lockup';
import {
  triggerIdentityErrorHaptic,
  triggerIdentityImpactHaptic,
  triggerIdentitySelectionHaptic,
  triggerIdentitySuccessHaptic,
  triggerIdentityWarningHaptic,
} from '@/lib/identity-flow-haptics';
import { writePendingInviteIntent } from '@/lib/invite-intent';
import { useAccountInvitePreviewQuery } from '@/lib/live-data';
import { returnToRoute } from '@/lib/navigation';
import { COUNTRY_OPTIONS, DEFAULT_COUNTRY } from '@/lib/phone';
import { buildSetupAccountHref } from '@/lib/setup-account';
import { beginSetupEntryHandoff } from '@/lib/setup-entry-handoff';
import { theme } from '@/lib/theme';
import { accountCreateAccountStyles as styles } from './account-create-account-screen.styles';
import { useSession } from '@/providers/session-provider';
import {
  MIN_ACCOUNT_INVITE_TOKEN_LENGTH,
  accountInviteStatusMessage,
  extractAccountInviteToken,
} from './account-invite-utils';
import {
  ACCOUNT_CREATED_EMAIL_CONFIRMATION_MESSAGE,
  ACCOUNT_CREATED_SETUP_MESSAGE,
  ACCOUNT_CREATE_GENERIC_ERROR_MESSAGE,
  countryFlag,
  formatCreateAccountValidationMessage,
  isValidEmail,
  isValidPassword,
  isValidPhoneNumber,
  resolveCreateAccountMessageTone,
  type FieldName,
  type FieldStatus,
} from './account-create-account-helpers';
import { AppText } from '@/components/app-text';

const COUNTRY_OPTION_HEIGHT = 42;
const COUNTRY_MENU_VISIBLE_OPTIONS = 4;
const COUNTRY_MENU_HEIGHT = COUNTRY_OPTION_HEIGHT * COUNTRY_MENU_VISIBLE_OPTIONS;
const COUNTRY_MENU_CONTENT_HEIGHT = COUNTRY_OPTION_HEIGHT * COUNTRY_OPTIONS.length;
const COUNTRY_MENU_MAX_SCROLL_Y = Math.max(COUNTRY_MENU_CONTENT_HEIGHT - COUNTRY_MENU_HEIGHT, 1);
const COUNTRY_MENU_SCROLLBAR_THUMB_HEIGHT = Math.min(
  COUNTRY_MENU_HEIGHT,
  Math.max(
    36,
    Math.round((COUNTRY_MENU_HEIGHT / COUNTRY_MENU_CONTENT_HEIGHT) * COUNTRY_MENU_HEIGHT),
  ),
);
const COUNTRY_MENU_SCROLLBAR_TRAVEL = COUNTRY_MENU_HEIGHT - COUNTRY_MENU_SCROLLBAR_THUMB_HEIGHT;
const countryMenuScrollWebStyle =
  Platform.OS === 'web' ? ({ overscrollBehavior: 'contain' } as unknown as ViewStyle) : null;

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
  const [countryMenuScrollY, setCountryMenuScrollY] = useState(0);
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [touchedFields, setTouchedFields] = useState<Record<FieldName, boolean>>({
    email: false,
    password: false,
    phone: false,
  });
  const [validationAttempted, setValidationAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationBusy, setVerificationBusy] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const setupNavigationStartedRef = useRef(false);

  const selectedCountry =
    COUNTRY_OPTIONS.find((country) => country.iso2 === countryIso) ?? DEFAULT_COUNTRY;
  const countryMenuScrollbarTop = Math.min(
    COUNTRY_MENU_SCROLLBAR_TRAVEL,
    (countryMenuScrollY / COUNTRY_MENU_MAX_SCROLL_Y) * COUNTRY_MENU_SCROLLBAR_TRAVEL,
  );
  const emailValid = isValidEmail(email);
  const phoneValid = isValidPhoneNumber(phoneNationalNumber);
  const passwordValid = isValidPassword(password);
  const verificationCodeValid = /^\d{8}$/.test(verificationCode);
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
    busy || verificationBusy || resendBusy
      ? 'loading'
      : pendingVerificationEmail
        ? verificationCodeValid
          ? 'success'
          : 'idle'
        : !shouldPreview || previewQuery.error || blockingMessage
          ? 'error'
          : previewQuery.isLoading
            ? 'loading'
            : canCreateAccount
              ? 'success'
              : 'idle';
  const contentTransitionKey = !shouldPreview
    ? 'create-account:no-token'
    : previewQuery.isLoading
      ? 'create-account:loading'
      : previewQuery.error || blockingMessage
        ? 'create-account:blocked'
        : pendingVerificationEmail
          ? 'create-account:verify-email'
          : canCreateAccount
            ? 'create-account:form'
            : 'create-account:empty';
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
    if (isPreviewMode || busy || verificationBusy || setupNavigationStartedRef.current) {
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
  }, [busy, isPreviewMode, router, session.status, shouldPreview, token, verificationBusy]);

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
      setMessage(
        formatCreateAccountValidationMessage({
          emailValid,
          passwordValid,
          phoneValid,
        }),
      );
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

      if (result === ACCOUNT_CREATED_SETUP_MESSAGE) {
        triggerIdentitySuccessHaptic();
        setupNavigationStartedRef.current = true;
        beginSetupEntryHandoff();
        returnToRoute(router, buildSetupAccountHref('profile'));
      }

      if (result === ACCOUNT_CREATED_EMAIL_CONFIRMATION_MESSAGE) {
        triggerIdentitySuccessHaptic();
        setPendingVerificationEmail(email.trim().toLocaleLowerCase('en-US'));
        setVerificationCode('');
      }
    } catch (error) {
      triggerIdentityErrorHaptic();
      setMessage(error instanceof Error ? error.message : ACCOUNT_CREATE_GENERIC_ERROR_MESSAGE);
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyEmailCode() {
    if (!pendingVerificationEmail || verificationBusy || resendBusy) {
      return;
    }

    if (!verificationCodeValid) {
      triggerIdentityWarningHaptic();
      setMessage('Ingresa el codigo de 8 digitos del correo.');
      return;
    }

    triggerIdentityImpactHaptic();
    setVerificationBusy(true);
    setMessage(null);

    try {
      const result = await session.verifyEmailOtp({
        code: verificationCode,
        email: pendingVerificationEmail,
      });
      setMessage(result);

      if (result === 'Correo confirmado.') {
        triggerIdentitySuccessHaptic();
        setupNavigationStartedRef.current = true;
        beginSetupEntryHandoff();
        returnToRoute(router, buildSetupAccountHref('profile'));
      } else {
        triggerIdentityWarningHaptic();
      }
    } catch (error) {
      triggerIdentityErrorHaptic();
      setMessage(error instanceof Error ? error.message : 'No se pudo confirmar el correo.');
    } finally {
      setVerificationBusy(false);
    }
  }

  async function handleResendEmailCode() {
    if (!pendingVerificationEmail || verificationBusy || resendBusy) {
      return;
    }

    triggerIdentityImpactHaptic();
    setResendBusy(true);
    setMessage(null);

    try {
      const result = await session.resendEmailConfirmation(pendingVerificationEmail);
      setMessage(result);

      if (result.includes('Enviamos')) {
        triggerIdentitySuccessHaptic();
      } else {
        triggerIdentityWarningHaptic();
      }
    } catch (error) {
      triggerIdentityErrorHaptic();
      setMessage(error instanceof Error ? error.message : 'No se pudo reenviar el correo.');
    } finally {
      setResendBusy(false);
    }
  }

  async function handleContinueAfterEmailLink() {
    if (!pendingVerificationEmail || verificationBusy || resendBusy) {
      return;
    }

    triggerIdentityImpactHaptic();
    setVerificationBusy(true);
    setMessage(null);

    try {
      const result = await session.signInWithPassword({
        email: pendingVerificationEmail,
        password,
      });
      setMessage(result);

      if (result === 'Sesion iniciada.') {
        triggerIdentitySuccessHaptic();
        setupNavigationStartedRef.current = true;
        beginSetupEntryHandoff();
        returnToRoute(router, buildSetupAccountHref('profile'));
      } else {
        triggerIdentityWarningHaptic();
      }
    } catch (error) {
      triggerIdentityErrorHaptic();
      setMessage(error instanceof Error ? error.message : 'No se pudo validar la confirmacion.');
    } finally {
      setVerificationBusy(false);
    }
  }

  if (session.status === 'loading') {
    return null;
  }

  return (
    <IdentityFlowScreen
      contentTransitionKey={contentTransitionKey}
      identity={<IdentityFlowIdentity centerFaceSize="small" state={tokenState} variant="status" />}
      identityPosition="top"
      message={
        message ? (
          <MessageBanner message={message} tone={resolveCreateAccountMessageTone(message)} />
        ) : (
          <IdentityFlowLogoCopy
            subtitle={
              preview?.inviterDisplayName
                ? `${preview.inviterDisplayName} te invito.`
                : 'Completa tus datos para entrar.'
            }
            title="Crea tu cuenta"
          />
        )
      }
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

      {pendingVerificationEmail ? (
        <IdentityFlowForm>
          <IdentityFlowLogoCopy
            subtitle={`Enviamos el enlace y el codigo a ${pendingVerificationEmail}.`}
            title="Confirma tu correo"
          />

          <IdentityFlowField
            error={
              verificationCode.length > 0 && !verificationCodeValid ? 'Debe tener 8 digitos.' : null
            }
            icon="keypad"
            label="Codigo"
            status={
              verificationCode.length === 0 ? 'idle' : verificationCodeValid ? 'success' : 'danger'
            }
          >
            <OtpCodeInput
              disabled={verificationBusy || resendBusy}
              hasError={verificationCode.length > 0 && !verificationCodeValid}
              onChangeText={setVerificationCode}
              value={verificationCode}
            />
          </IdentityFlowField>

          <IdentityFlowPrimaryAction
            disabled={verificationBusy || resendBusy}
            icon="checkmark"
            label={verificationBusy ? 'Confirmando...' : 'Confirmar correo'}
            loading={verificationBusy}
            onPress={
              verificationBusy || resendBusy ? undefined : () => void handleVerifyEmailCode()
            }
          />

          <View style={styles.verificationActions}>
            <IdentityFlowSecondaryAction
              disabled={verificationBusy || resendBusy}
              icon="mail"
              label={resendBusy ? 'Enviando...' : 'Reenviar codigo'}
              onPress={
                verificationBusy || resendBusy ? undefined : () => void handleResendEmailCode()
              }
            />
            <IdentityFlowSecondaryAction
              disabled={verificationBusy || resendBusy}
              icon="log-in-outline"
              label="Ya confirme el enlace"
              onPress={
                verificationBusy || resendBusy
                  ? undefined
                  : () => void handleContinueAfterEmailLink()
              }
            />
            <IdentityFlowSecondaryAction
              disabled={verificationBusy || resendBusy}
              icon="create-outline"
              label="Editar correo"
              onPress={() => {
                setPendingVerificationEmail(null);
                setVerificationCode('');
                setMessage(null);
              }}
            />
          </View>
        </IdentityFlowForm>
      ) : null}

      {canCreateAccount && !pendingVerificationEmail ? (
        <IdentityFlowForm>
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
                  <AppText style={styles.countryFlag}>{countryFlag(selectedCountry.iso2)}</AppText>
                  <AppText style={styles.callingCodeText}>{selectedCountry.callingCode}</AppText>
                  <Ionicons color={theme.colors.brandGreen} name="chevron-down" size={13} />
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
                  <ScrollView
                    bounces={false}
                    keyboardShouldPersistTaps="handled"
                    nestedScrollEnabled
                    onScroll={(event) => setCountryMenuScrollY(event.nativeEvent.contentOffset.y)}
                    onMoveShouldSetResponder={() => true}
                    onStartShouldSetResponder={() => true}
                    scrollEventThrottle={16}
                    showsVerticalScrollIndicator={false}
                    style={[styles.countryMenuScroll, countryMenuScrollWebStyle]}
                  >
                    {COUNTRY_OPTIONS.map((country, index) => {
                      const selected = country.iso2 === selectedCountry.iso2;

                      return (
                        <Pressable
                          key={country.iso2}
                          onPress={() => {
                            triggerIdentitySelectionHaptic();
                            setCountryIso(country.iso2);
                            setCountryMenuOpen(false);
                          }}
                          style={[
                            styles.countryOption,
                            selected ? styles.countryOptionSelected : null,
                            index === COUNTRY_OPTIONS.length - 1 ? styles.countryOptionLast : null,
                          ]}
                        >
                          <View style={styles.countryOptionLabel}>
                            <AppText style={styles.countryFlag}>
                              {countryFlag(country.iso2)}
                            </AppText>
                            <AppText style={styles.countryLabel}>{country.label}</AppText>
                          </View>
                          <AppText
                            style={[
                              styles.countryCode,
                              selected ? styles.countryCodeSelected : null,
                            ]}
                          >
                            {country.callingCode}
                          </AppText>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                  <View pointerEvents="none" style={styles.countryMenuScrollbarTrack}>
                    <View
                      style={[
                        styles.countryMenuScrollbarThumb,
                        {
                          height: COUNTRY_MENU_SCROLLBAR_THUMB_HEIGHT,
                          transform: [{ translateY: countryMenuScrollbarTop }],
                        },
                      ]}
                    />
                  </View>
                </View>
              ) : null}
            </View>
          </IdentityFlowField>

          <IdentityFlowPrimaryAction
            disabled={busy}
            label={busy ? 'Creando...' : 'Crear cuenta'}
            loading={busy}
            onPress={busy ? undefined : () => void handleSubmit()}
          />
        </IdentityFlowForm>
      ) : null}
    </IdentityFlowScreen>
  );
}
