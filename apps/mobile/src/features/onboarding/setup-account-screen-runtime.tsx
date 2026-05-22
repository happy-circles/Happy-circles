import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  ActionSheetIOS,
  Alert,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  View,
} from 'react-native';

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
import {
  clearPendingInviteIntent,
  hrefForPendingInviteIntent,
  readPendingInviteIntent,
  shouldActivateAccountInviteAfterSetup,
  type PendingInviteIntent,
} from '@/lib/invite-intent';
import {
  useActivateAccountFromInviteMutation,
  useUpdateProfileAvatarMutation,
} from '@/lib/live-data';
import { beginHomeEntryHandoffAfterScrollReset } from '@/lib/home-entry-handoff';
import { COUNTRY_OPTIONS, DEFAULT_COUNTRY } from '@/lib/phone';
import { returnToRoute } from '@/lib/navigation';
import {
  hasProfilePhoto,
  isLowQualityDisplayName,
  resolveInitialSetupFullName,
} from '@/lib/setup-account';
import { theme } from '@/lib/theme';
import { useSession } from '@/providers/session-provider';
import type { TrustedDeviceAuthMethod } from '@/providers/session/types';
import {
  resolveTrustedDeviceAuthMethods,
  resolveSetupAccountMode,
  resolveSetupAccountRouteParams,
  resolveTrustMethodLabel,
  validateSetupProfile,
} from './setup-account-helpers';
import { SetupProfilePhotoRequirement } from './setup-profile-photo-requirement';
import { SecurityStatusRow } from './setup-security-status-row';

export function SetupAccountScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    editPhone?: string | string[];
    returnTo?: string | string[];
    step?: string | string[];
  }>();
  const session = useSession();
  const avatarMutation = useUpdateProfileAvatarMutation();
  const activateInvite = useActivateAccountFromInviteMutation();
  const profile = session.profile;
  const { editPhoneMode, requestedStep, returnTo } = resolveSetupAccountRouteParams(params);
  const setupMode = resolveSetupAccountMode({
    editPhoneMode,
    requestedStep,
    requiredComplete: session.setupState.requiredComplete,
  });
  const securityOnlyMode = setupMode === 'security_only';

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
    hasApple: session.linkedMethods.hasApple,
    hasEmailPassword: session.linkedMethods.hasEmailPassword,
    hasGoogle: session.linkedMethods.hasGoogle,
  });
  const socialTrustMethods = trustMethods.filter((method) => method !== 'password');
  const hasPasswordTrustMethod = trustMethods.includes('password');
  const showTrustPasswordFallback =
    trustMethodPickerOpen &&
    hasPasswordTrustMethod &&
    !session.canTrustCurrentDeviceWithoutPassword &&
    (trustPasswordFallbackOpen || socialTrustMethods.length === 0);
  const hasSavedPhoto = hasProfilePhoto(profile) || Boolean(localAvatarPath);
  const needsPhoneInput =
    editPhoneMode || !profile?.phone_e164 || phoneNationalNumber.trim().length === 0;
  const fullNameIsUsable = !isLowQualityDisplayName(fullName);
  const phoneLabel = profile?.phone_e164 ?? 'Pendiente';
  const isSaving = profileBusy || avatarMutation.isPending || activateInvite.isPending;
  const initialStepWarningShownRef = useRef(false);

  useEffect(() => {
    setFullName(initialFullName);
    setCountryIso(initialCountry.iso2);
    setPhoneNationalNumber(profile?.phone_national_number ?? '');
    setLocalAvatarPath(null);
  }, [initialFullName, initialCountry.iso2, profile?.avatar_path, profile?.phone_national_number]);

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
      requestedStep !== 'email' ||
      session.isEmailConfirmed
    ) {
      return;
    }

    initialStepWarningShownRef.current = true;
    triggerWarningHaptic();
    setMessage('Confirma tu correo para poder enviar solicitudes e invitaciones.');
  }, [requestedStep, session.isEmailConfirmed]);

  async function activatePendingAccountInvite(
    pendingIntent: Extract<PendingInviteIntent, { readonly type: 'account_invite' }>,
  ) {
    if (!session.currentDeviceId) {
      setMessage('No pudimos identificar este telefono para activar la cuenta.');
      return;
    }

    try {
      const response = await activateInvite.mutateAsync({
        deliveryToken: pendingIntent.token,
        currentDeviceId: session.currentDeviceId,
      });

      await session.refreshAccountState({ preserveTrustedDeviceDuringLoad: true });

      if (response.status === 'accepted' || response.status === 'pending_inviter_review') {
        await clearPendingInviteIntent();
        await beginHomeEntryHandoffAfterScrollReset();
        returnToRoute(router, '/home');
        return;
      }

      setMessage('Todavia no pudimos cerrar la invitacion.');
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'No pudimos activar la cuenta con esta invitacion.',
      );
    }
  }

  async function finishSetup() {
    if (returnTo === 'profile') {
      returnToRoute(router, '/profile');
      return;
    }

    const pendingIntent = await readPendingInviteIntent();

    if (shouldActivateAccountInviteAfterSetup(pendingIntent)) {
      if (!session.isTrustedDevice) {
        setMessage('Perfil guardado. Vuelve a la invitación para continuar.');
        returnToRoute(router, hrefForPendingInviteIntent(pendingIntent));
        return;
      }

      await activatePendingAccountInvite(pendingIntent);
      return;
    }

    if (session.accountAccessState !== 'active') {
      setMessage('Perfil guardado. Abre tu enlace de invitacion para activar la cuenta.');
      returnToRoute(router, '/join?mode=token');
      return;
    }

    if (!pendingIntent) {
      await beginHomeEntryHandoffAfterScrollReset();
    }
    returnToRoute(router, pendingIntent ? hrefForPendingInviteIntent(pendingIntent) : '/home');
  }

  async function finishSecurityOnly() {
    if (!session.isTrustedDevice) {
      triggerWarningHaptic();
      setMessage('Confía este teléfono para continuar.');
      return;
    }

    if (returnTo === 'profile') {
      returnToRoute(router, '/profile');
      return;
    }

    const pendingIntent = await readPendingInviteIntent();
    if (shouldActivateAccountInviteAfterSetup(pendingIntent)) {
      await activatePendingAccountInvite(pendingIntent);
      return;
    }

    if (pendingIntent) {
      returnToRoute(router, hrefForPendingInviteIntent(pendingIntent));
      return;
    }

    if (session.accountAccessState !== 'active') {
      setMessage('Abre tu enlace de invitacion para activar la cuenta.');
      returnToRoute(router, '/join?mode=token');
      return;
    }

    await beginHomeEntryHandoffAfterScrollReset();
    returnToRoute(router, '/home');
  }

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
      const result = await session.completeProfile({
        fullName,
        phoneCountryIso2: selectedCountry.iso2,
        phoneCountryCallingCode: selectedCountry.callingCode,
        phoneNationalNumber,
      });

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
    setSecurityBusyKey(actionKey);
    setMessage(null);

    try {
      const result = await action();
      setMessage(result);
      return result;
    } finally {
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

  async function handleTrustDevice(method: TrustedDeviceAuthMethod) {
    triggerImpactHaptic();

    const result = await runSecurityAction(`trust-device-${method}`, async () =>
      session.trustCurrentDevice(
        method === 'password' && !session.canTrustCurrentDeviceWithoutPassword
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
  }

  function handleTrustEntryPress() {
    triggerSelectionHaptic();

    if (session.canTrustCurrentDeviceWithoutPassword && hasPasswordTrustMethod) {
      void handleTrustDevice('password');
      return;
    }

    if (trustMethods.length === 0) {
      setMessage('Agrega Google, Apple o una contraseña para poder confiar este teléfono.');
      return;
    }

    setTrustMethodPickerOpen(true);
  }

  async function handleBiometricToggle(nextValue: boolean) {
    triggerSelectionHaptic();

    const result = await session.setBiometricsEnabled(nextValue);
    setMessage(result.message);
  }

  const securityOnlyActionDisabled =
    securityOnlyMode && (securityBusyKey !== null || !session.isTrustedDevice);
  const primaryActionDisabled = securityOnlyMode ? securityOnlyActionDisabled : isSaving;
  const primaryActionLoading = securityOnlyMode ? securityBusyKey !== null : isSaving;
  const primaryActionLabel = securityOnlyMode
    ? securityBusyKey !== null
      ? 'Confirmando...'
      : session.isTrustedDevice
        ? 'Listo'
        : 'Confianza pendiente'
    : isSaving
      ? 'Guardando...'
      : editPhoneMode
        ? 'Guardar celular'
        : 'Guardar y entrar';

  return (
    <IdentityFlowScreen
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
                ? 'Ya puedes volver al flujo que estabas completando.'
                : 'Para marcarlo como confiable, confirma que eres tú con un método de respaldo.'
            }
            title={session.isTrustedDevice ? 'Teléfono confiable' : 'Confiar este teléfono'}
          />
        ) : undefined
      }
    >
      {message || profileErrors.photo ? (
        <IdentityFlowMessageSlot>
          {message ? (
            <MessageBanner message={message} tone="neutral" />
          ) : profileErrors.photo ? (
            <AppText style={[styles.helperText, styles.helperTextDanger]}>
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
                        pressed ? styles.pressed : null,
                      ]}
                    >
                      <AppText style={styles.callingCodeText}>
                        {selectedCountry.callingCode}
                      </AppText>
                    </Pressable>

                    <IdentityFlowTextInput
                      keyboardType="phone-pad"
                      onChangeText={(value) => {
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
                            index === COUNTRY_OPTIONS.length - 1 ? styles.countryOptionLast : null,
                          ]}
                        >
                          <AppText style={styles.countryLabel}>{country.label}</AppText>
                          <AppText style={styles.countryCode}>{country.callingCode}</AppText>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </View>
              </IdentityFlowField>
            ) : null}
          </IdentityFlowForm>
        ) : null}

        <View style={styles.sectionBlock}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionCopy}>
              <AppText style={styles.sectionTitle}>Seguridad</AppText>
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
                          pressed && securityBusyKey === null ? styles.pressed : null,
                          securityBusyKey !== null ? styles.disabledAction : null,
                        ]}
                      >
                        <AppText style={styles.inlineButtonText}>
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
                    <AppText style={styles.helperText}>
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

                <View style={styles.separator} />

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

                <View style={styles.separator} />
              </>
            ) : null}

            <SecurityStatusRow
              icon="phone-portrait"
              status={session.isTrustedDevice ? 'Listo' : 'Pendiente'}
              subtitle={
                session.isTrustedDevice
                  ? 'Acciones sensibles habilitadas'
                  : session.canTrustCurrentDeviceWithoutPassword
                    ? 'Confirma con un toque'
                    : 'Confirma con un método de respaldo'
              }
              title="Teléfono confiable"
              tone={session.isTrustedDevice ? 'success' : 'danger'}
            />
            {!session.isTrustedDevice ? (
              <View style={styles.securityAction}>
                <AppText style={styles.helperText}>
                  Para marcarlo como confiable, confirma que eres tú con un método de respaldo.
                </AppText>

                {!trustMethodPickerOpen ? (
                  <View style={styles.inlineActionRow}>
                    <PrimaryAction
                      compact
                      disabled={securityBusyKey !== null}
                      fullWidth={false}
                      label={
                        securityBusyKey?.startsWith('trust-device-')
                          ? 'Confirmando...'
                          : 'Confiar este teléfono'
                      }
                      onPress={securityBusyKey ? undefined : handleTrustEntryPress}
                    />
                  </View>
                ) : (
                  <>
                    <AppText style={styles.helperText}>
                      Elige cómo confirmar tu identidad para confiar este teléfono.
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
                      {hasPasswordTrustMethod && session.canTrustCurrentDeviceWithoutPassword ? (
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
                      ) : null}
                    </View>
                    {hasPasswordTrustMethod && !session.canTrustCurrentDeviceWithoutPassword ? (
                      <Pressable
                        disabled={securityBusyKey !== null}
                        onPress={() => {
                          triggerSelectionHaptic();
                          setTrustPasswordFallbackOpen((open) => !open);
                        }}
                        style={({ pressed }) => [
                          styles.inlineButton,
                          pressed && securityBusyKey === null ? styles.pressed : null,
                          securityBusyKey !== null ? styles.disabledAction : null,
                        ]}
                      >
                        <AppText style={styles.inlineButtonText}>
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
                {trustMethodPickerOpen && trustMethods.length === 0 ? (
                  <AppText style={styles.helperText}>
                    Agrega Google, Apple o una contraseña para poder confiar este teléfono.
                  </AppText>
                ) : null}
              </View>
            ) : null}
            {!securityOnlyMode ? (
              <>
                <View style={styles.separator} />

                <SecurityStatusRow
                  icon="finger-print"
                  subtitle={
                    session.setupState.biometricsEligible
                      ? session.biometricLabel
                      : session.biometricAvailable
                        ? 'Primero confía este teléfono'
                        : 'No disponible'
                  }
                  title="Biometría"
                  tone={session.biometricsEnabled ? 'success' : 'muted'}
                  trailing={
                    <Switch
                      disabled={
                        !session.setupState.biometricsEligible && !session.biometricsEnabled
                      }
                      onValueChange={(nextValue) => void handleBiometricToggle(nextValue)}
                      trackColor={{
                        false: theme.colors.surfaceSoft,
                        true: theme.colors.primarySoft,
                      }}
                      value={session.biometricsEnabled}
                    />
                  }
                />
              </>
            ) : null}
          </View>
        </View>

        {!securityOnlyMode || session.isTrustedDevice ? (
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

const styles = StyleSheet.create({
  centeredContent: {},
  contentWidth: {
    maxWidth: 460,
  },
  setupContent: {
    gap: theme.spacing.md,
    paddingTop: theme.spacing.md,
  },
  disabledAction: {
    opacity: 0.58,
  },
  avatarStage: {
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
    paddingTop: theme.spacing.lg,
  },
  avatarButton: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  avatarEditBadge: {
    alignItems: 'center',
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.surface,
    borderRadius: theme.radius.pill,
    borderWidth: 3,
    bottom: 2,
    height: 38,
    justifyContent: 'center',
    position: 'absolute',
    right: 2,
    width: 38,
  },
  identityCopy: {
    alignItems: 'center',
    gap: theme.spacing.xs,
    maxWidth: 340,
    width: '100%',
  },
  identityTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.title2,
    fontWeight: '800',
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  identityHint: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.callout,
    fontWeight: '600',
    lineHeight: 21,
    textAlign: 'center',
  },
  formBlock: {
    gap: theme.spacing.xl,
  },
  sectionBlock: {
    borderTopColor: theme.colors.hairline,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.md,
    justifyContent: 'space-between',
  },
  sectionCopy: {
    flex: 1,
    gap: 4,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.body,
    fontWeight: '800',
  },
  securityList: {
    gap: theme.spacing.md,
  },
  securityAction: {
    gap: theme.spacing.sm,
    paddingLeft: 52,
  },
  inlineActionRow: {
    alignItems: 'flex-start',
    gap: theme.spacing.xs,
  },
  inlineButton: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.small,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 9,
  },
  inlineButtonText: {
    color: theme.colors.text,
    fontSize: theme.typography.caption,
    fontWeight: '800',
  },
  helperText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
  },
  helperTextDanger: {
    color: theme.colors.danger,
  },
  separator: {
    backgroundColor: theme.colors.hairline,
    height: StyleSheet.hairlineWidth,
    width: '100%',
  },
  stack: {
    gap: theme.spacing.sm,
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
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
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
  pressed: {
    opacity: 0.9,
  },
});
