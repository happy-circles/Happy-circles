import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { ActionSheetIOS, Alert, Linking, Platform, Pressable, View } from 'react-native';

import { AvatarOptionsSheet } from '@/components/avatar-options-sheet';
import { AvatarViewerModal } from '@/components/avatar-viewer-modal';
import { AppText } from '@/components/app-text';
import type { AppTextInputRef } from '@/components/app-text-input';
import {
  IdentityFlowField,
  IdentityFlowForm,
  IdentityFlowIdentity,
  IdentityFlowLogoCopy,
  IdentityFlowMessageSlot,
  IdentityFlowPrimaryAction,
  IdentityFlowScreen,
  IdentityFlowTextInput,
} from '@/components/identity-flow';
import { MessageBanner } from '@/components/message-banner';
import { OtpCodeInput } from '@/components/otp-code-input';
import { PasswordTextInput } from '@/components/password-text-input';
import { PrimaryAction } from '@/components/primary-action';
import { resolveAvatarUrl } from '@/lib/avatar';
import { prepareAvatarImageForUpload } from '@/lib/avatar-image';
import {
  triggerIdentityImpactHaptic as triggerImpactHaptic,
  triggerIdentitySelectionHaptic as triggerSelectionHaptic,
  triggerIdentitySuccessHaptic as triggerSuccessHaptic,
  triggerIdentityWarningHaptic as triggerWarningHaptic,
} from '@/lib/identity-flow-haptics';
import { useUpdateProfileAvatarMutation } from '@/lib/live-data';
import { COUNTRY_OPTIONS, DEFAULT_COUNTRY } from '@/lib/phone';
import {
  hasProfilePhoto,
  isLowQualityDisplayName,
  resolveInitialSetupFullName,
} from '@/lib/setup-account';
import { theme } from '@/lib/theme';
import { resolveHydratedDraftValue } from '@/lib/setup-draft';
import { formatStepUpErrorMessage } from '@/providers/session/step-up';
import { useSession } from '@/providers/session-provider';
import { useIdentityConfirmation } from '@/providers/identity-confirmation-provider';
import { useAppTheme } from '@/providers/theme-provider';
import type { TrustedDeviceAuthMethod } from '@/providers/session/types';
import {
  resolveTrustedDeviceAuthMethods,
  resolveSetupAccountMode,
  resolveSetupAccountPreviewParams,
  resolveSetupAccountRouteParams,
  resolveTrustMethodLabel,
  validateSetupProfile,
} from './setup-account-helpers';
import { useSetupAccountPreviewSession } from './setup-account-preview';
import { useSetupAccountCompletionController } from './setup-account-completion-controller';
import { SetupAccountSecurityOptions } from './setup-account-security-options';
import { SetupAccountPermissionsSection } from './setup-account-permissions-section';
import { SetupProfilePhotoRequirement } from './setup-profile-photo-requirement';
import { prepareSetupProfileSave } from './setup-profile-save';
import { styles } from './setup-account-screen-runtime.styles';
import { SecurityStatusRow } from './setup-security-status-row';

export function SetupAccountScreen() {
  const activeTheme = useAppTheme();
  const params = useLocalSearchParams<{
    case?: string | string[];
    editPhone?: string | string[];
    preview?: string | string[];
    returnTo?: string | string[];
    reason?: string | string[];
    step?: string | string[];
    token?: string | string[];
  }>();
  const liveSession = useSession();
  const { confirmIdentity } = useIdentityConfirmation();
  const previewParams = resolveSetupAccountPreviewParams(params, __DEV__);
  const previewSession = useSetupAccountPreviewSession(liveSession, previewParams);
  const session = previewSession ?? liveSession;
  const avatarMutation = useUpdateProfileAvatarMutation();
  const profile = session.profile;
  const { editPhoneMode, requestedStep, returnTo } = resolveSetupAccountRouteParams(params);
  const isSetupPreviewMode = previewParams.enabled;
  const effectiveRequestedStep =
    isSetupPreviewMode && previewParams.case === 'security' ? 'security' : requestedStep;
  const setupMode = resolveSetupAccountMode({
    editPhoneMode,
    requestedStep: effectiveRequestedStep,
    requiredComplete: session.setupState.requiredComplete,
  });
  const securityOnlyMode = setupMode === 'security_only';
  const [profileIdentityRequired, setProfileIdentityRequired] = useState(false);
  const identityRequired =
    profileIdentityRequired ||
    (Array.isArray(params.reason) ? params.reason[0] : params.reason) === 'identity';
  const identityConfirmed = Boolean(
    session.stepUpFreshUntil && session.stepUpFreshUntil > Date.now(),
  );
  const dynamicStyles = useMemo(
    () => ({
      callingCodeBox: {
        backgroundColor: activeTheme.colors.surfaceSoft,
        borderColor: activeTheme.colors.border,
      },
      callingCodeText: {
        color: activeTheme.colors.text,
      },
      countryCode: {
        color: activeTheme.colors.textMuted,
      },
      countryLabel: {
        color: activeTheme.colors.text,
      },
      countryMenu: {
        backgroundColor: activeTheme.colors.elevated,
        borderColor: activeTheme.colors.border,
      },
      countryOption: {
        borderBottomColor: activeTheme.colors.hairline,
      },
      helperText: {
        color: activeTheme.colors.textMuted,
      },
      helperTextDanger: {
        color: activeTheme.colors.danger,
      },
      inlineButton: {
        backgroundColor: activeTheme.colors.elevated,
        borderColor: activeTheme.colors.border,
      },
      inlineButtonText: {
        color: activeTheme.colors.primaryStrong,
      },
      sectionBlock: {
        borderTopColor: activeTheme.colors.hairline,
      },
      sectionTitle: {
        color: activeTheme.colors.text,
      },
      separator: {
        backgroundColor: activeTheme.colors.hairline,
      },
    }),
    [activeTheme],
  );

  const initialCountry = useMemo(
    () =>
      COUNTRY_OPTIONS.find((country) => country.iso2 === profile?.phone_country_iso2) ??
      COUNTRY_OPTIONS.find(
        (country) => country.callingCode === profile?.phone_country_calling_code,
      ) ??
      DEFAULT_COUNTRY,
    [profile?.phone_country_calling_code, profile?.phone_country_iso2],
  );
  const initialFullName = useMemo(
    () =>
      resolveInitialSetupFullName({
        displayName: profile?.display_name,
        email: session.email ?? profile?.email,
      }),
    [profile?.display_name, profile?.email, session.email],
  );

  const [fullName, setFullName] = useState(initialFullName);
  const [countryIso, setCountryIso] = useState(initialCountry.iso2);
  const [phoneNationalNumber, setPhoneNationalNumber] = useState(
    profile?.phone_national_number ?? '',
  );
  const [countryMenuOpen, setCountryMenuOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [profileBusy, setProfileBusy] = useState(false);
  const [emailConfirmationCode, setEmailConfirmationCode] = useState('');
  const [trustPassword, setTrustPassword] = useState('');
  const [identityPassword, setIdentityPassword] = useState('');
  const [identityPasswordOpen, setIdentityPasswordOpen] = useState(false);
  const [trustMethodPickerOpen, setTrustMethodPickerOpen] = useState(false);
  const [trustPasswordFallbackOpen, setTrustPasswordFallbackOpen] = useState(false);
  const [securityBusyKey, setSecurityBusyKey] = useState<string | null>(null);
  const [localAvatarPath, setLocalAvatarPath] = useState<string | null>(null);
  const [avatarOptionsVisible, setAvatarOptionsVisible] = useState(false);
  const [avatarViewerVisible, setAvatarViewerVisible] = useState(false);
  const [profileErrors, setProfileErrors] = useState<{
    readonly fullName?: string;
    readonly phoneNationalNumber?: string;
    readonly photo?: string;
  }>({});
  const fullNameInputRef = useRef<AppTextInputRef | null>(null);
  const phoneInputRef = useRef<AppTextInputRef | null>(null);
  const trustPasswordInputRef = useRef<AppTextInputRef | null>(null);
  const securityActionBusyRef = useRef(false);
  const hydratedUserIdRef = useRef<string | null>(session.userId);
  const fullNameDirtyRef = useRef(false);
  const countryDirtyRef = useRef(false);
  const phoneDirtyRef = useRef(false);
  const {
    finishSecurityOnly,
    finishSetup,
    isPending: completionPending,
    resetCompletionState,
  } = useSetupAccountCompletionController({
    isSetupPreviewMode,
    returnToProfile: returnTo === 'profile',
    returnToPrevious: returnTo === 'previous',
    session,
    setMessage,
  });

  const selectedCountry =
    COUNTRY_OPTIONS.find((country) => country.iso2 === countryIso) ?? DEFAULT_COUNTRY;
  const avatarUrl = resolveAvatarUrl(
    localAvatarPath ?? profile?.avatar_path ?? null,
    profile?.updated_at ?? null,
  );
  const canViewProfileAvatar = Boolean(avatarUrl);
  const avatarLabel = fullName || profile?.display_name || profile?.email || 'Tu perfil';
  const accountEmail = session.email ?? profile?.email ?? '';
  const accountEmailLabel = accountEmail || 'Sin correo';
  const emailConfirmationCodeValid = /^\d{8}$/.test(emailConfirmationCode);
  const trustMethods = resolveTrustedDeviceAuthMethods({
    canTrustCurrentDeviceWithoutPassword: session.canTrustCurrentDeviceWithoutPassword,
    hasApple: session.linkedMethods.hasApple && session.appleSignInAvailable,
    hasEmailPassword: session.linkedMethods.hasEmailPassword,
    hasGoogle: session.linkedMethods.hasGoogle,
  });
  const socialTrustMethods = trustMethods.filter(
    (method) => method === 'google' || method === 'apple',
  );
  const hasRecentTrustMethod = trustMethods.includes('recent_auth');
  const hasPasswordTrustMethod = trustMethods.includes('password');
  const trustFallbackOpen = trustMethodPickerOpen;
  const hasTrustFallbackMethods = trustMethods.length > 0;
  const showTrustPasswordFallback =
    trustFallbackOpen &&
    hasPasswordTrustMethod &&
    (trustPasswordFallbackOpen || socialTrustMethods.length === 0);
  const trustFallbackIntro = 'Confirma tu cuenta para guardar este teléfono.';
  const hasSavedPhoto = hasProfilePhoto(profile) || Boolean(localAvatarPath);
  const needsPhoneInput =
    editPhoneMode || !profile?.phone_e164 || phoneNationalNumber.trim().length === 0;
  const fullNameIsUsable = !isLowQualityDisplayName(fullName);
  const phoneLabel = profile?.phone_e164 ?? 'Pendiente';
  const isSaving =
    profileBusy || avatarMutation.isPending || completionPending || securityBusyKey !== null;
  const initialStepWarningShownRef = useRef(false);

  useEffect(() => {
    void session.refreshBiometricSupport();
  }, [session.refreshBiometricSupport]);

  useEffect(() => {
    setIdentityPassword('');
    setProfileIdentityRequired(false);
    setIdentityPasswordOpen(false);
  }, [session.userId]);

  useEffect(() => {
    const identityChanged = hydratedUserIdRef.current !== session.userId;
    setFullName((current) =>
      resolveHydratedDraftValue({
        current,
        incoming: initialFullName,
        isDirty: fullNameDirtyRef.current,
        identityChanged,
      }),
    );
    setCountryIso((current) =>
      resolveHydratedDraftValue({
        current,
        incoming: initialCountry.iso2,
        isDirty: countryDirtyRef.current,
        identityChanged,
      }),
    );
    setPhoneNationalNumber((current) =>
      resolveHydratedDraftValue({
        current,
        incoming: profile?.phone_national_number ?? '',
        isDirty: phoneDirtyRef.current,
        identityChanged,
      }),
    );

    if (identityChanged) {
      fullNameDirtyRef.current = false;
      countryDirtyRef.current = false;
      phoneDirtyRef.current = false;
      setLocalAvatarPath(null);
      resetCompletionState();
      hydratedUserIdRef.current = session.userId;
    }
  }, [
    initialFullName,
    initialCountry.iso2,
    profile?.phone_national_number,
    resetCompletionState,
    session.userId,
  ]);

  useEffect(() => {
    if (
      !showTrustPasswordFallback ||
      session.isTrustedDevice ||
      (session.setupState.requiredComplete && !securityOnlyMode)
    ) {
      return;
    }

    trustPasswordInputRef.current?.focus();
  }, [
    securityOnlyMode,
    session.isTrustedDevice,
    session.setupState.requiredComplete,
    showTrustPasswordFallback,
  ]);

  useEffect(() => {
    if (!editPhoneMode) {
      return;
    }

    const focusTimer = setTimeout(() => {
      phoneInputRef.current?.focus();
    }, 220);

    return () => clearTimeout(focusTimer);
  }, [editPhoneMode]);

  useEffect(() => {
    if (
      initialStepWarningShownRef.current ||
      effectiveRequestedStep !== 'email' ||
      session.isEmailConfirmed
    ) {
      return;
    }

    initialStepWarningShownRef.current = true;
    triggerWarningHaptic();
    setMessage('Confirma tu correo para poder enviar solicitudes e invitaciones.');
  }, [effectiveRequestedStep, session.isEmailConfirmed]);

  function clearProfileError(field: 'fullName' | 'phoneNationalNumber' | 'photo') {
    setProfileErrors((current) => {
      if (!current[field]) {
        return current;
      }

      return {
        ...current,
        [field]: undefined,
      };
    });
  }

  function validateSetup() {
    const validation = validateSetupProfile({
      fullNameIsUsable,
      needsPhoneInput,
      phoneNationalNumber,
    });
    const nextErrors = validation.errors;

    setProfileErrors(nextErrors);

    if (validation.firstInvalidField === 'fullName') {
      triggerWarningHaptic();
      setMessage('Te falta completar tu nombre.');
      fullNameInputRef.current?.focus();
      return false;
    }

    if (validation.firstInvalidField === 'phoneNationalNumber') {
      triggerWarningHaptic();
      setMessage('Te falta completar tu celular.');
      phoneInputRef.current?.focus();
      return false;
    }

    return true;
  }

  function handleAvatarPermissionDenied(source: 'camera' | 'library', canAskAgain: boolean) {
    const isCamera = source === 'camera';
    const permissionMessage = isCamera
      ? 'Necesitas permitir acceso a la cámara para tomar tu foto.'
      : 'Necesitas permitir acceso a tus fotos para elegir tu foto de perfil.';

    triggerWarningHaptic();
    setMessage(permissionMessage);

    if (canAskAgain) {
      return;
    }

    Alert.alert(
      isCamera ? 'Permiso de cámara bloqueado' : 'Permiso de fotos bloqueado',
      `${permissionMessage} Abre Ajustes y habilita el permiso para Happy Circles.`,
      [
        { style: 'cancel', text: 'Ahora no' },
        { text: 'Abrir ajustes', onPress: () => void Linking.openSettings() },
      ],
    );
  }

  async function handleSaveAndFinish() {
    if (isSaving) {
      return;
    }

    triggerImpactHaptic();

    if (!validateSetup()) {
      return;
    }

    setProfileBusy(true);
    setMessage(null);

    try {
      const input = await prepareSetupProfileSave({
        draft: {
          fullName,
          phoneCountryIso2: selectedCountry.iso2,
          phoneCountryCallingCode: selectedCountry.callingCode,
          phoneNationalNumber,
        },
        currentPhone: profile?.phone_e164,
        profileComplete: session.profileCompletionState === 'complete',
        preview: isSetupPreviewMode,
        confirmIdentity,
        onValidationError: setMessage,
      });
      if (!input) return;
      const result = await session.completeProfile(input);

      if (result !== 'Perfil actualizado.') {
        setMessage(result);
        return;
      }

      if (!session.isEmailConfirmed) {
        triggerWarningHaptic();
        setMessage('Perfil guardado. Confirma tu correo o reenvía el enlace de confirmación.');
        return;
      }

      await finishSetup();
    } finally {
      setProfileBusy(false);
    }
  }

  async function uploadPickedAvatar(result: ImagePicker.ImagePickerResult) {
    if (result.canceled || !result.assets[0]) {
      return;
    }

    const asset = result.assets[0];
    const previousLocalAvatarPath = localAvatarPath;
    setLocalAvatarPath(asset.uri);

    try {
      setMessage(null);
      const preparedAvatar = await prepareAvatarImageForUpload(asset);
      const nextAvatarPath = await avatarMutation.mutateAsync(preparedAvatar);
      setLocalAvatarPath(nextAvatarPath);
      clearProfileError('photo');
      triggerSuccessHaptic();
      setMessage('Foto guardada.');
    } catch (error) {
      setLocalAvatarPath(previousLocalAvatarPath);
      setMessage(error instanceof Error ? error.message : 'No se pudo guardar la foto.');
    }
  }

  async function handlePickAvatar() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        aspect: [1, 1],
        mediaTypes: ['images'],
        quality: 0.7,
      });

      await uploadPickedAvatar(result);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo abrir tus fotos.');
    }
  }

  async function handleTakeAvatarPhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      handleAvatarPermissionDenied('camera', permission.canAskAgain);
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      cameraType: ImagePicker.CameraType.front,
      mediaTypes: ['images'],
      quality: 0.7,
    });

    await uploadPickedAvatar(result);
  }

  function closeAvatarOptionsAndRun(action: () => void) {
    setAvatarOptionsVisible(false);
    requestAnimationFrame(action);
  }

  function openAvatarOptions() {
    if (avatarMutation.isPending) {
      return;
    }

    triggerSelectionHaptic();

    if (isSetupPreviewMode) {
      setMessage('Preview QA: la foto no se sube en este modo.');
      return;
    }

    if (Platform.OS === 'ios') {
      const options = canViewProfileAvatar
        ? ['Ver foto', 'Tomar foto', 'Elegir foto', 'Cancelar']
        : ['Tomar foto', 'Elegir foto', 'Cancelar'];
      const cancelButtonIndex = options.length - 1;

      ActionSheetIOS.showActionSheetWithOptions(
        {
          cancelButtonIndex,
          options,
          title: 'Foto de perfil',
        },
        (selectedIndex) => {
          const selectedOption = options[selectedIndex];

          if (selectedOption === 'Ver foto') {
            setAvatarViewerVisible(true);
            return;
          }

          if (selectedOption === 'Tomar foto') {
            void handleTakeAvatarPhoto();
            return;
          }

          if (selectedOption === 'Elegir foto') {
            void handlePickAvatar();
          }
        },
      );
      return;
    }

    setAvatarOptionsVisible(true);
  }

  async function runSecurityAction(actionKey: string, action: () => Promise<string>) {
    if (securityActionBusyRef.current || profileBusy || avatarMutation.isPending) {
      return 'Espera a que termine la validación actual.';
    }
    securityActionBusyRef.current = true;
    setSecurityBusyKey(actionKey);
    setMessage(null);

    try {
      const result = await action();
      setMessage(result);
      return result;
    } catch (error) {
      const result = error instanceof Error ? error.message : 'No pudimos completar la validación.';
      setMessage(result);
      return result;
    } finally {
      securityActionBusyRef.current = false;
      setSecurityBusyKey(null);
    }
  }

  async function handleResendEmailConfirmation() {
    if (securityBusyKey) {
      return;
    }

    if (!accountEmail) {
      triggerWarningHaptic();
      setMessage('Esta cuenta no tiene un correo disponible para reenviar.');
      return;
    }

    triggerImpactHaptic();
    const result = await runSecurityAction('resend-email-confirmation', () =>
      session.resendEmailConfirmation(accountEmail),
    );

    if (result.includes('Enviamos') || result.includes('ya está confirmado')) {
      triggerSuccessHaptic();
    } else {
      triggerWarningHaptic();
    }
  }

  async function handleVerifyEmailCode() {
    if (securityBusyKey) {
      return;
    }

    if (!accountEmail) {
      triggerWarningHaptic();
      setMessage('Esta cuenta no tiene un correo disponible para confirmar.');
      return;
    }

    if (!emailConfirmationCodeValid) {
      triggerWarningHaptic();
      setMessage('Ingresa el código de 8 dígitos del correo.');
      return;
    }

    triggerImpactHaptic();
    const result = await runSecurityAction('verify-email-code', () =>
      session.verifyEmailOtp({
        code: emailConfirmationCode,
        email: accountEmail,
      }),
    );

    if (result === 'Correo confirmado.') {
      triggerSuccessHaptic();
      setEmailConfirmationCode('');
    } else {
      triggerWarningHaptic();
    }
  }

  async function handleTrustDevice(method?: TrustedDeviceAuthMethod) {
    triggerImpactHaptic();

    const actionMethod = method ?? 'auto';
    const result = await runSecurityAction(`trust-device-${actionMethod}`, async () =>
      session.trustCurrentDevice(
        method === undefined
          ? undefined
          : method === 'password'
            ? { method, password: trustPassword }
            : { method },
      ),
    );

    if (result === 'Este teléfono ahora es confiable.') {
      triggerSuccessHaptic();
      setTrustPassword('');
      setTrustMethodPickerOpen(false);
      setTrustPasswordFallbackOpen(false);
    }

    if (result.startsWith('Escribe tu contrase') || result.startsWith('Confirma tu cuenta')) {
      triggerWarningHaptic();
      setTrustMethodPickerOpen(true);
      setTrustPasswordFallbackOpen(result.startsWith('Escribe tu contrase'));
    }

    if (
      hasTrustFallbackMethods &&
      (result.startsWith('Este dispositivo no puede usar ') ||
        result.startsWith(`${session.biometricLabel} está bloqueado`) ||
        result.startsWith(`Cancelaste ${session.biometricLabel}`) ||
        result.startsWith(`No se pudo validar ${session.biometricLabel}`))
    ) {
      triggerWarningHaptic();
      setTrustMethodPickerOpen(true);
    }
  }

  function handleTrustEntryPress() {
    triggerSelectionHaptic();
    void handleTrustDevice();
  }

  async function handleBiometricToggle(nextValue: boolean) {
    triggerSelectionHaptic();

    await runSecurityAction('biometrics', async () => {
      const result = await session.setBiometricsEnabled(nextValue);
      if (!result.ok && !nextValue && session.isTrustedDevice) {
        setProfileIdentityRequired(true);
      }
      return result.message;
    });
  }

  async function handleConfirmIdentity(method: 'biometric' | 'password' | 'google' | 'apple') {
    triggerImpactHaptic();
    await runSecurityAction(`identity-${method}`, async () => {
      const result = await session.stepUpAuth(
        method === 'password'
          ? { force: true, method, password: identityPassword }
          : { force: method !== 'biometric', method },
      );
      if (!result.success) {
        triggerWarningHaptic();
        return (
          result.message ??
          formatStepUpErrorMessage('continuar', session.biometricLabel, result.error)
        );
      }
      setIdentityPassword('');
      triggerSuccessHaptic();
      return editPhoneMode
        ? 'Identidad confirmada. Puedes guardar tu celular.'
        : 'Identidad confirmada. Puedes volver y continuar.';
    });
  }

  async function handleCheckBiometrics() {
    await runSecurityAction('check-biometrics', async () => {
      const result = await session.refreshBiometricSupport();
      if (result.error) return result.error;
      return result.available
        ? `${result.label} está disponible.`
        : 'No pudimos usar biometría ahora. Comprueba que tengas una huella o rostro configurado en Seguridad del teléfono. También puedes confirmar tu cuenta con otro método.';
    });
  }

  const securityOnlyActionDisabled =
    securityOnlyMode &&
    (securityBusyKey !== null ||
      isSaving ||
      !session.isTrustedDevice ||
      (identityRequired && !identityConfirmed));
  const primaryActionDisabled = securityOnlyMode ? securityOnlyActionDisabled : isSaving;
  const primaryActionLoading = securityOnlyMode ? securityBusyKey !== null || isSaving : isSaving;
  const primaryActionLabel = securityOnlyMode
    ? securityBusyKey !== null
      ? 'Confirmando...'
      : session.isTrustedDevice
        ? identityRequired && !identityConfirmed
          ? 'Confirmación pendiente'
          : returnTo === 'previous'
            ? 'Volver y continuar'
            : 'Listo'
        : 'Confianza pendiente'
    : isSaving
      ? 'Guardando...'
      : editPhoneMode
        ? 'Guardar celular'
        : 'Guardar y entrar';
  const setupPrimaryAction =
    !securityOnlyMode || session.isTrustedDevice ? (
      <IdentityFlowPrimaryAction
        disabled={primaryActionDisabled}
        icon="checkmark"
        label={primaryActionLabel}
        loading={primaryActionLoading}
        onPress={
          primaryActionDisabled
            ? undefined
            : securityOnlyMode
              ? () => void finishSecurityOnly()
              : () => void handleSaveAndFinish()
        }
      />
    ) : undefined;

  return (
    <IdentityFlowScreen
      actions={setupPrimaryAction}
      identity={
        securityOnlyMode ? (
          <IdentityFlowIdentity
            state={
              securityBusyKey !== null ? 'loading' : session.isTrustedDevice ? 'success' : 'idle'
            }
            variant="status"
          />
        ) : (
          <IdentityFlowIdentity
            avatarLabel={avatarLabel}
            avatarUrl={avatarUrl}
            disabled={avatarMutation.isPending}
            editable
            onPress={openAvatarOptions}
            state={isSaving ? 'loading' : 'idle'}
            variant="avatar"
          />
        )
      }
      identityPosition="top"
      message={
        securityOnlyMode ? (
          <IdentityFlowLogoCopy
            subtitle={
              session.isTrustedDevice
                ? identityRequired && !identityConfirmed
                  ? 'Elige cómo confirmar tu identidad para continuar.'
                  : 'Ya puedes volver al flujo que estabas completando.'
                : 'Guarda este teléfono usando el acceso de tu cuenta.'
            }
            title={
              identityRequired
                ? 'Confirma tu identidad'
                : session.isTrustedDevice
                  ? 'Celular confiable'
                  : 'Confiar este celular'
            }
          />
        ) : undefined
      }
    >
      {message || profileErrors.photo ? (
        <IdentityFlowMessageSlot>
          {message ? (
            <MessageBanner message={message} tone="neutral" />
          ) : profileErrors.photo ? (
            <AppText
              style={[styles.helperText, dynamicStyles.helperText, dynamicStyles.helperTextDanger]}
            >
              {profileErrors.photo}
            </AppText>
          ) : null}
        </IdentityFlowMessageSlot>
      ) : null}

      <View style={styles.setupContent}>
        {!securityOnlyMode && !editPhoneMode ? (
          <SetupProfilePhotoRequirement
            disabled={avatarMutation.isPending}
            hasSavedPhoto={hasSavedPhoto}
            onPress={openAvatarOptions}
          />
        ) : null}

        {!securityOnlyMode ? (
          <IdentityFlowForm>
            <IdentityFlowField
              error={profileErrors.fullName ?? null}
              icon="person"
              label="Nombre"
              status={profileErrors.fullName ? 'danger' : fullNameIsUsable ? 'success' : 'idle'}
            >
              <IdentityFlowTextInput
                autoCapitalize="words"
                onChangeText={(value) => {
                  fullNameDirtyRef.current = true;
                  setFullName(value);
                  clearProfileError('fullName');
                }}
                placeholder="Nombre y apellido"
                placeholderTextColor={theme.colors.muted}
                ref={fullNameInputRef}
                value={fullName}
              />
            </IdentityFlowField>

            {needsPhoneInput ? (
              <IdentityFlowField
                error={profileErrors.phoneNationalNumber ?? null}
                icon="call"
                label="Celular"
                status={
                  profileErrors.phoneNationalNumber
                    ? 'danger'
                    : phoneNationalNumber.trim().length >= 7
                      ? 'success'
                      : 'idle'
                }
              >
                <View style={styles.phoneField}>
                  <View style={styles.phoneRow}>
                    <Pressable
                      onPress={() => {
                        triggerSelectionHaptic();
                        setCountryMenuOpen((value) => !value);
                      }}
                      style={({ pressed }) => [
                        styles.callingCodeBox,
                        dynamicStyles.callingCodeBox,
                        pressed ? styles.pressed : null,
                      ]}
                    >
                      <AppText style={[styles.callingCodeText, dynamicStyles.callingCodeText]}>
                        {selectedCountry.callingCode}
                      </AppText>
                    </Pressable>

                    <IdentityFlowTextInput
                      keyboardType="phone-pad"
                      onChangeText={(value) => {
                        phoneDirtyRef.current = true;
                        setPhoneNationalNumber(value);
                        clearProfileError('phoneNationalNumber');
                      }}
                      onFocus={() => setCountryMenuOpen(false)}
                      placeholder="3001234567"
                      placeholderTextColor={theme.colors.muted}
                      ref={phoneInputRef}
                      style={styles.phoneInput}
                      value={phoneNationalNumber}
                    />
                  </View>

                  {countryMenuOpen ? (
                    <View style={[styles.countryMenu, dynamicStyles.countryMenu]}>
                      {COUNTRY_OPTIONS.map((country, index) => (
                        <Pressable
                          key={country.iso2}
                          onPress={() => {
                            triggerSelectionHaptic();
                            countryDirtyRef.current = true;
                            setCountryIso(country.iso2);
                            setCountryMenuOpen(false);
                          }}
                          style={[
                            styles.countryOption,
                            dynamicStyles.countryOption,
                            index === COUNTRY_OPTIONS.length - 1 ? styles.countryOptionLast : null,
                          ]}
                        >
                          <AppText style={[styles.countryLabel, dynamicStyles.countryLabel]}>
                            {country.label}
                          </AppText>
                          <AppText style={[styles.countryCode, dynamicStyles.countryCode]}>
                            {country.callingCode}
                          </AppText>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </View>
              </IdentityFlowField>
            ) : null}
          </IdentityFlowForm>
        ) : null}

        <View style={[styles.sectionBlock, dynamicStyles.sectionBlock]}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionCopy}>
              <AppText style={[styles.sectionTitle, dynamicStyles.sectionTitle]}>Seguridad</AppText>
            </View>
          </View>

          <View style={styles.securityList}>
            {!securityOnlyMode ? (
              <>
                <SecurityStatusRow
                  icon="mail"
                  status={session.isEmailConfirmed ? 'Listo' : 'Pendiente'}
                  subtitle={
                    session.isEmailConfirmed
                      ? accountEmailLabel
                      : 'Abre el enlace o pega el código de 8 dígitos'
                  }
                  title="Correo confirmado"
                  tone={session.isEmailConfirmed ? 'success' : 'danger'}
                  trailing={
                    session.isEmailConfirmed ? undefined : (
                      <Pressable
                        disabled={securityBusyKey !== null}
                        onPress={() => void handleResendEmailConfirmation()}
                        style={({ pressed }) => [
                          styles.inlineButton,
                          dynamicStyles.inlineButton,
                          pressed && securityBusyKey === null ? styles.pressed : null,
                          securityBusyKey !== null ? styles.disabledAction : null,
                        ]}
                      >
                        <AppText style={[styles.inlineButtonText, dynamicStyles.inlineButtonText]}>
                          {securityBusyKey === 'resend-email-confirmation'
                            ? 'Enviando...'
                            : 'Reenviar'}
                        </AppText>
                      </Pressable>
                    )
                  }
                />
                {!session.isEmailConfirmed ? (
                  <View style={styles.securityAction}>
                    <AppText style={[styles.helperText, dynamicStyles.helperText]}>
                      Usa el código de 8 dígitos si el enlace no abre la app.
                    </AppText>
                    <OtpCodeInput
                      disabled={securityBusyKey !== null}
                      hasError={emailConfirmationCode.length > 0 && !emailConfirmationCodeValid}
                      onChangeText={setEmailConfirmationCode}
                      value={emailConfirmationCode}
                    />
                    <View style={styles.inlineActionRow}>
                      <PrimaryAction
                        compact
                        disabled={securityBusyKey !== null}
                        fullWidth={false}
                        icon="checkmark"
                        label={
                          securityBusyKey === 'verify-email-code'
                            ? 'Confirmando...'
                            : 'Confirmar código'
                        }
                        loading={securityBusyKey === 'verify-email-code'}
                        onPress={securityBusyKey ? undefined : () => void handleVerifyEmailCode()}
                      />
                    </View>
                  </View>
                ) : null}

                <View style={[styles.separator, dynamicStyles.separator]} />

                <SecurityStatusRow
                  icon="call"
                  status={editPhoneMode ? 'Editando' : profile?.phone_e164 ? 'Listo' : 'Pendiente'}
                  subtitle={
                    editPhoneMode
                      ? `${selectedCountry.callingCode} ${phoneNationalNumber || 'Nuevo numero'}`
                      : profile?.phone_e164
                        ? phoneLabel
                        : 'Completa el celular arriba'
                  }
                  title="Celular confirmado"
                  tone={editPhoneMode ? 'muted' : profile?.phone_e164 ? 'success' : 'danger'}
                />

                <View style={[styles.separator, dynamicStyles.separator]} />
              </>
            ) : null}

            <SecurityStatusRow
              icon="phone-portrait"
              status={session.isTrustedDevice ? 'Listo' : 'Pendiente'}
              subtitle={session.isTrustedDevice ? 'Acciones sensibles habilitadas' : 'Pendiente'}
              title="Celular confiable"
              tone={session.isTrustedDevice ? 'success' : 'danger'}
            />
            {!session.isTrustedDevice ? (
              <View style={styles.securityAction}>
                {!trustFallbackOpen ? (
                  <>
                    <View style={styles.inlineActionRow}>
                      <PrimaryAction
                        compact
                        disabled={securityBusyKey !== null}
                        fullWidth={false}
                        icon="lock-closed"
                        label={
                          securityBusyKey === 'trust-device-auto'
                            ? 'Validando...'
                            : 'Confiar este teléfono'
                        }
                        loading={securityBusyKey === 'trust-device-auto'}
                        onPress={securityBusyKey ? undefined : handleTrustEntryPress}
                      />
                    </View>
                    {hasTrustFallbackMethods ? (
                      <Pressable
                        disabled={securityBusyKey !== null}
                        onPress={() => {
                          triggerSelectionHaptic();
                          setTrustMethodPickerOpen(true);
                        }}
                        style={({ pressed }) => [
                          styles.inlineButton,
                          dynamicStyles.inlineButton,
                          pressed && securityBusyKey === null ? styles.pressed : null,
                          securityBusyKey !== null ? styles.disabledAction : null,
                        ]}
                      >
                        <AppText style={[styles.inlineButtonText, dynamicStyles.inlineButtonText]}>
                          Usar otro método
                        </AppText>
                      </Pressable>
                    ) : null}
                  </>
                ) : (
                  <>
                    <AppText style={[styles.helperText, dynamicStyles.helperText]}>
                      {trustFallbackIntro}
                    </AppText>
                    <View style={styles.inlineActionRow}>
                      {socialTrustMethods.map((method) => (
                        <PrimaryAction
                          compact
                          disabled={securityBusyKey !== null}
                          fullWidth={false}
                          key={method}
                          label={
                            securityBusyKey === `trust-device-${method}`
                              ? 'Confirmando...'
                              : resolveTrustMethodLabel({
                                  canTrustCurrentDeviceWithoutPassword:
                                    session.canTrustCurrentDeviceWithoutPassword,
                                  method,
                                })
                          }
                          onPress={
                            securityBusyKey ? undefined : () => void handleTrustDevice(method)
                          }
                        />
                      ))}
                      {hasRecentTrustMethod ? (
                        <PrimaryAction
                          compact
                          disabled={securityBusyKey !== null}
                          fullWidth={false}
                          label={
                            securityBusyKey === 'trust-device-recent_auth'
                              ? 'Confirmando...'
                              : resolveTrustMethodLabel({
                                  canTrustCurrentDeviceWithoutPassword:
                                    session.canTrustCurrentDeviceWithoutPassword,
                                  method: 'recent_auth',
                                })
                          }
                          onPress={
                            securityBusyKey
                              ? undefined
                              : () => void handleTrustDevice('recent_auth')
                          }
                        />
                      ) : null}
                    </View>
                    {hasPasswordTrustMethod ? (
                      <Pressable
                        disabled={securityBusyKey !== null}
                        onPress={() => {
                          triggerSelectionHaptic();
                          setTrustPasswordFallbackOpen((open) => !open);
                        }}
                        style={({ pressed }) => [
                          styles.inlineButton,
                          dynamicStyles.inlineButton,
                          pressed && securityBusyKey === null ? styles.pressed : null,
                          securityBusyKey !== null ? styles.disabledAction : null,
                        ]}
                      >
                        <AppText style={[styles.inlineButtonText, dynamicStyles.inlineButtonText]}>
                          {showTrustPasswordFallback ? 'Ocultar contraseña' : 'Usar contraseña'}
                        </AppText>
                      </Pressable>
                    ) : null}
                    {showTrustPasswordFallback ? (
                      <>
                        <PasswordTextInput
                          autoCapitalize="none"
                          onChangeText={setTrustPassword}
                          placeholder="Tu contraseña actual"
                          placeholderTextColor={theme.colors.muted}
                          ref={trustPasswordInputRef}
                          value={trustPassword}
                        />
                        <View style={styles.inlineActionRow}>
                          <PrimaryAction
                            compact
                            disabled={securityBusyKey !== null}
                            fullWidth={false}
                            label={
                              securityBusyKey === 'trust-device-password'
                                ? 'Confirmando...'
                                : resolveTrustMethodLabel({
                                    canTrustCurrentDeviceWithoutPassword:
                                      session.canTrustCurrentDeviceWithoutPassword,
                                    method: 'password',
                                  })
                            }
                            onPress={
                              securityBusyKey ? undefined : () => void handleTrustDevice('password')
                            }
                          />
                        </View>
                      </>
                    ) : null}
                  </>
                )}
                {trustFallbackOpen && trustMethods.length === 0 ? (
                  <AppText style={[styles.helperText, dynamicStyles.helperText]}>
                    Agrega Google, Apple o una contraseña para poder confiar este teléfono.
                  </AppText>
                ) : null}
              </View>
            ) : null}
            <SetupAccountSecurityOptions
              session={session}
              identityRequired={identityRequired}
              identityConfirmed={identityConfirmed}
              securityBusyKey={securityBusyKey ?? (isSaving ? 'save-profile' : null)}
              identityPassword={identityPassword}
              identityPasswordOpen={identityPasswordOpen}
              setIdentityPassword={setIdentityPassword}
              setIdentityPasswordOpen={setIdentityPasswordOpen}
              socialTrustMethods={socialTrustMethods}
              handleConfirmIdentity={handleConfirmIdentity}
              handleBiometricToggle={handleBiometricToggle}
              handleCheckBiometrics={handleCheckBiometrics}
            />
          </View>
        </View>
        {!securityOnlyMode && !editPhoneMode ? (
          <SetupAccountPermissionsSection
            contactsPermissionStatus={session.setupState.contactsPermissionStatus}
            notificationsPermissionStatus={session.setupState.notificationsPermissionStatus}
            notificationsEnabled={session.notificationsEnabled}
            onOpenNotificationSettings={() => session.beginNotificationEnableFromSettings()}
            onMessage={setMessage}
            requestContactsPermission={() => session.requestContactsPermission()}
            requestNotificationsPermission={() => session.requestNotificationsPermission()}
          />
        ) : null}
      </View>
      <AvatarOptionsSheet
        canViewPhoto={canViewProfileAvatar}
        onChoosePhoto={() => closeAvatarOptionsAndRun(() => void handlePickAvatar())}
        onClose={() => setAvatarOptionsVisible(false)}
        onTakePhoto={() => closeAvatarOptionsAndRun(() => void handleTakeAvatarPhoto())}
        onViewPhoto={() => closeAvatarOptionsAndRun(() => setAvatarViewerVisible(true))}
        visible={avatarOptionsVisible}
      />
      <AvatarViewerModal
        imageUrl={avatarUrl}
        label={avatarLabel}
        onClose={() => setAvatarViewerVisible(false)}
        visible={avatarViewerVisible}
      />
    </IdentityFlowScreen>
  );
}
