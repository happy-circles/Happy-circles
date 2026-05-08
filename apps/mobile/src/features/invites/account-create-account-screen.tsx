import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';

import {
  IdentityFlowForm,
  IdentityFlowIdentity,
  IdentityFlowLogoCopy,
  IdentityFlowScreen,
} from '@/components/identity-flow';
import { MessageBanner } from '@/components/message-banner';
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
import { accountCreateAccountStyles as styles } from './account-create-account-screen.styles';
import { useSession } from '@/providers/session-provider';
import {
  MIN_ACCOUNT_INVITE_TOKEN_LENGTH,
  accountInviteStatusMessage,
  extractAccountInviteToken,
} from './account-invite-utils';
import type { SocialProvider } from './account-invite-entry-helpers';
import {
  ACCOUNT_CREATED_EMAIL_CONFIRMATION_MESSAGE,
  ACCOUNT_CREATED_SETUP_MESSAGE,
  ACCOUNT_CREATE_GENERIC_ERROR_MESSAGE,
  formatCreateAccountValidationMessage,
  isValidEmail,
  isValidPassword,
  isValidPhoneNumber,
  resolveCreateAccountMessageTone,
  type FieldName,
  type FieldStatus,
} from './account-create-account-helpers';
import { AccountCreateAccountEmailForm } from './account-create-account-email-form';
import { AccountCreateAccountSocialOptions } from './account-create-account-social-options';
import { AccountCreateAccountVerificationForm } from './account-create-account-verification-form';

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
  const [socialBusyProvider, setSocialBusyProvider] = useState<SocialProvider | null>(null);
  const [showEmailPasswordFallback, setShowEmailPasswordFallback] = useState(false);
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationBusy, setVerificationBusy] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const setupNavigationStartedRef = useRef(false);

  const selectedCountry =
    COUNTRY_OPTIONS.find((country) => country.iso2 === countryIso) ?? DEFAULT_COUNTRY;
  const emailValid = isValidEmail(email);
  const phoneValid = isValidPhoneNumber(phoneNationalNumber);
  const passwordValid = isValidPassword(password);
  const verificationCodeValid = /^\d{8}$/.test(verificationCode);
  const emailChecked = validationAttempted || touchedFields.email;
  const phoneChecked = validationAttempted || touchedFields.phone;
  const passwordChecked = validationAttempted || touchedFields.password;
  const authBusy = busy || verificationBusy || resendBusy || socialBusyProvider !== null;
  const emailStatus: FieldStatus = !emailChecked ? 'idle' : emailValid ? 'valid' : 'invalid';
  const phoneStatus: FieldStatus = !phoneChecked ? 'idle' : phoneValid ? 'valid' : 'invalid';
  const passwordStatus: FieldStatus = !passwordChecked
    ? 'idle'
    : passwordValid
      ? 'valid'
      : 'invalid';
  const tokenState: BrandVerificationState = authBusy
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
    if (isPreviewMode || authBusy || setupNavigationStartedRef.current) {
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
  }, [authBusy, isPreviewMode, router, session.status, shouldPreview, token]);

  useEffect(() => {
    if (!canCreateAccount || isPreviewMode) {
      return;
    }

    void writePendingInviteIntent({
      type: 'account_invite',
      token,
      source: 'account_invite_link',
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

    setBusy(true);
    setMessage(null);

    try {
      await writePendingInviteIntent({
        type: 'account_invite',
        token,
        source: 'account_invite_signup',
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
        await beginSetupEntryHandoff();
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

  async function handleSocialCreate(provider: SocialProvider) {
    if (authBusy || !canCreateAccount) {
      return;
    }

    triggerIdentityImpactHaptic();

    if (isPreviewMode) {
      setMessage('Vista temporal de QA. Este boton no crea una cuenta desde preview.');
      return;
    }

    setSocialBusyProvider(provider);
    setMessage(null);

    try {
      await writePendingInviteIntent({
        type: 'account_invite',
        token,
        source: 'account_invite_signup',
      });

      const result =
        provider === 'google' ? await session.signInWithGoogle() : await session.signInWithApple();
      setMessage(result);

      if (result === 'Sesion iniciada.') {
        triggerIdentitySuccessHaptic();
        setupNavigationStartedRef.current = true;
        await beginSetupEntryHandoff();
        await session.refreshAccountState({
          preserveTrustedDeviceDuringLoad: true,
        });
        returnToRoute(router, buildSetupAccountHref('profile'));
        return;
      }

      triggerIdentityWarningHaptic();
    } catch (error) {
      triggerIdentityErrorHaptic();
      setMessage(error instanceof Error ? error.message : ACCOUNT_CREATE_GENERIC_ERROR_MESSAGE);
    } finally {
      setSocialBusyProvider(null);
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
        await beginSetupEntryHandoff();
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
        await beginSetupEntryHandoff();
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
      identityPosition={canCreateAccount && !pendingVerificationEmail && !showEmailPasswordFallback && !message ? 'center' : 'top'}
      message={
        message ? (
          <MessageBanner message={message} tone={resolveCreateAccountMessageTone(message)} />
        ) : (
          <IdentityFlowLogoCopy
            subtitle={
              preview?.inviterDisplayName
                ? `${preview.inviterDisplayName} te invito.`
                : 'Elige tu metodo para entrar.'
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
        <AccountCreateAccountVerificationForm
          onContinueAfterEmailLink={() => void handleContinueAfterEmailLink()}
          onEditEmail={() => {
            setPendingVerificationEmail(null);
            setVerificationCode('');
            setMessage(null);
          }}
          onResendEmailCode={() => void handleResendEmailCode()}
          onVerifyEmailCode={() => void handleVerifyEmailCode()}
          pendingVerificationEmail={pendingVerificationEmail}
          resendBusy={resendBusy}
          setVerificationCode={setVerificationCode}
          verificationBusy={verificationBusy}
          verificationCode={verificationCode}
          verificationCodeValid={verificationCodeValid}
        />
      ) : null}

      {canCreateAccount && !pendingVerificationEmail ? (
        <IdentityFlowForm>
          <AccountCreateAccountSocialOptions
            appleSignInAvailable={session.appleSignInAvailable}
            authBusy={authBusy}
            onSocialCreate={(provider) => void handleSocialCreate(provider)}
            onToggleEmailPassword={() => {
              triggerIdentitySelectionHaptic();
              setShowEmailPasswordFallback((open) => !open);
            }}
            showEmailPasswordFallback={showEmailPasswordFallback}
            socialBusyProvider={socialBusyProvider}
          />

          {showEmailPasswordFallback ? (
            <AccountCreateAccountEmailForm
              authBusy={authBusy}
              busy={busy}
              countryIso={countryIso}
              countryMenuOpen={countryMenuOpen}
              countryMenuScrollY={countryMenuScrollY}
              email={email}
              emailStatus={emailStatus}
              markFieldTouched={markFieldTouched}
              onSubmit={() => void handleSubmit()}
              password={password}
              passwordStatus={passwordStatus}
              phoneNationalNumber={phoneNationalNumber}
              phoneStatus={phoneStatus}
              setCountryIso={setCountryIso}
              setCountryMenuOpen={setCountryMenuOpen}
              setCountryMenuScrollY={setCountryMenuScrollY}
              setEmail={setEmail}
              setPassword={setPassword}
              setPhoneNationalNumber={setPhoneNationalNumber}
            />
          ) : null}
        </IdentityFlowForm>
      ) : null}
    </IdentityFlowScreen>
  );
}
