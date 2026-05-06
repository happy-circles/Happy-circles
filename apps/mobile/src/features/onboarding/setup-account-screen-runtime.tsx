import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
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

import { AvatarViewerModal } from '@/components/avatar-viewer-modal';
import { AppTextInput, type AppTextInputRef } from '@/components/app-text-input';
import {
  IdentityFlowField,
  IdentityFlowForm,
  IdentityFlowIdentity,
  IdentityFlowMessageSlot,
  IdentityFlowPrimaryAction,
  IdentityFlowScreen,
  IdentityFlowTextInput,
} from '@/components/identity-flow';
import { MessageBanner } from '@/components/message-banner';
import { OtpCodeInput } from '@/components/otp-code-input';
import { PrimaryAction } from '@/components/primary-action';
import { resolveAvatarUrl } from '@/lib/avatar';
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
} from '@/lib/invite-intent';
import {
  useActivateAccountFromInviteMutation,
  useUpdateProfileAvatarMutation,
} from '@/lib/live-data';
import { beginHomeEntryHandoffAfterScrollReset } from '@/lib/home-entry-handoff';
import { COUNTRY_OPTIONS, DEFAULT_COUNTRY } from '@/lib/phone';
import { returnToRoute } from '@/lib/navigation';
import { hasProfilePhoto, isLowQualityDisplayName } from '@/lib/setup-account';
import { theme } from '@/lib/theme';
import { useSession } from '@/providers/session-provider';
import {
  resolveSetupAccountRouteParams,
  resolveTrustActionLabel,
  validateSetupProfile,
  type SecurityTone,
} from './setup-account-helpers';
import { AppText } from '@/components/app-text';

type IoniconName = keyof typeof Ionicons.glyphMap;

function resolveSecurityTone(tone: SecurityTone) {
  if (tone === 'success') {
    return {
      backgroundColor: theme.colors.successSoft,
      color: theme.colors.success,
    };
  }

  if (tone === 'danger') {
    return {
      backgroundColor: theme.colors.dangerSoft,
      color: theme.colors.danger,
    };
  }

  return {
    backgroundColor: theme.colors.surfaceSoft,
    color: theme.colors.textMuted,
  };
}

function SecurityStatusRow({
  icon,
  status,
  subtitle,
  title,
  tone,
  trailing,
}: {
  readonly icon: IoniconName;
  readonly status?: string;
  readonly subtitle?: string;
  readonly title: string;
  readonly tone: SecurityTone;
  readonly trailing?: ReactNode;
}) {
  const visual = resolveSecurityTone(tone);

  return (
    <View style={styles.securityRow}>
      <View style={[styles.securityIcon, { backgroundColor: visual.backgroundColor }]}>
        <Ionicons color={visual.color} name={icon} size={20} />
      </View>
      <View style={styles.sectionCopy}>
        <AppText style={styles.readOnlyTitle}>{title}</AppText>
        {subtitle ? <AppText style={styles.readOnlySubtitle}>{subtitle}</AppText> : null}
      </View>
      {trailing ?? (
        <AppText style={[styles.securityStatus, { color: visual.color }]}>{status}</AppText>
      )}
    </View>
  );
}

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
    () => (isLowQualityDisplayName(profile?.display_name) ? '' : (profile?.display_name ?? '')),
    [profile?.display_name],
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
  const [securityBusyKey, setSecurityBusyKey] = useState<string | null>(null);
  const [localAvatarPath, setLocalAvatarPath] = useState<string | null>(null);
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
  const avatarLabel = fullName || profile?.display_name || profile?.email || 'Tu perfil';
  const accountEmail = session.email ?? profile?.email ?? '';
  const accountEmailLabel = accountEmail || 'Sin correo';
  const emailConfirmationCodeValid = /^\d{8}$/.test(emailConfirmationCode);
  const trustActionLabel = resolveTrustActionLabel({
    canTrustCurrentDeviceWithoutPassword: session.canTrustCurrentDeviceWithoutPassword,
    hasApple: session.linkedMethods.hasApple,
    hasEmailPassword: session.linkedMethods.hasEmailPassword,
    hasGoogle: session.linkedMethods.hasGoogle,
  });
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
      session.isTrustedDevice ||
      !session.linkedMethods.hasEmailPassword ||
      session.canTrustCurrentDeviceWithoutPassword ||
      session.setupState.requiredComplete
    ) {
      return;
    }

    trustPasswordInputRef.current?.focus();
  }, [
    session.isTrustedDevice,
    session.canTrustCurrentDeviceWithoutPassword,
    session.linkedMethods.hasEmailPassword,
    session.setupState.requiredComplete,
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

  async function finishSetup() {
    if (returnTo === 'profile') {
      returnToRoute(router, '/profile');
      return;
    }

    const pendingIntent = await readPendingInviteIntent();

    if (pendingIntent?.type === 'account_invite') {
      if (!session.currentDeviceId) {
        setMessage('Perfil guardado. No pudimos identificar este telefono para activar la cuenta.');
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

        setMessage('Perfil guardado, pero todavia no pudimos cerrar la invitacion.');
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : 'Perfil guardado, pero no pudimos activar la cuenta.',
        );
      }
      return;
    }

    if (!pendingIntent) {
      await beginHomeEntryHandoffAfterScrollReset();
    }
    returnToRoute(router, pendingIntent ? hrefForPendingInviteIntent(pendingIntent) : '/home');
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
      ? 'Necesitas permitir acceso a la camara para tomar tu foto.'
      : 'Necesitas permitir acceso a tus fotos para elegir tu foto de perfil.';

    triggerWarningHaptic();
    setMessage(permissionMessage);

    if (canAskAgain) {
      return;
    }

    Alert.alert(
      isCamera ? 'Permiso de camara bloqueado' : 'Permiso de fotos bloqueado',
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
        setMessage('Perfil guardado. Confirma tu correo o reenvia el enlace de confirmacion.');
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

    try {
      setMessage(null);
      const nextAvatarPath = await avatarMutation.mutateAsync({
        uri: result.assets[0].uri,
        contentType: result.assets[0].mimeType,
      });
      setLocalAvatarPath(nextAvatarPath);
      clearProfileError('photo');
      triggerSuccessHaptic();
      setMessage('Foto guardada.');
    } catch (error) {
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

  function openAvatarOptions() {
    if (avatarMutation.isPending) {
      return;
    }

    triggerSelectionHaptic();

    if (Platform.OS === 'ios') {
      const options = avatarUrl
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

    Alert.alert('Foto de perfil', undefined, [
      ...(avatarUrl ? [{ text: 'Ver foto', onPress: () => setAvatarViewerVisible(true) }] : []),
      { text: 'Tomar foto', onPress: () => void handleTakeAvatarPhoto() },
      { text: 'Elegir foto', onPress: () => void handlePickAvatar() },
      { style: 'cancel', text: 'Cancelar' },
    ]);
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

    if (result.includes('Enviamos') || result.includes('ya esta confirmado')) {
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
      setMessage('Ingresa el codigo de 8 digitos del correo.');
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

  async function handleTrustDevice() {
    triggerImpactHaptic();

    const result = await runSecurityAction('trust-device', async () =>
      session.trustCurrentDevice(
        session.canTrustCurrentDeviceWithoutPassword ? undefined : { password: trustPassword },
      ),
    );

    if (result === 'Este dispositivo ahora es confiable.') {
      triggerSuccessHaptic();
      setTrustPassword('');
    }
  }

  async function handleBiometricToggle(nextValue: boolean) {
    triggerSelectionHaptic();

    const result = await session.setBiometricsEnabled(nextValue);
    setMessage(result.message);
  }

  return (
    <IdentityFlowScreen
      identity={
        <IdentityFlowIdentity
          avatarLabel={avatarLabel}
          avatarUrl={avatarUrl}
          disabled={avatarMutation.isPending}
          editable
          onPress={openAvatarOptions}
          state={isSaving ? 'loading' : 'idle'}
          variant="avatar"
        />
      }
      identityPosition="top"
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
        {!editPhoneMode ? (
          <View
            style={[
              styles.photoRequirement,
              hasSavedPhoto ? styles.photoRequirementReady : styles.photoRequirementMissing,
            ]}
          >
            <View
              style={[
                styles.photoRequirementIcon,
                hasSavedPhoto
                  ? styles.photoRequirementIconReady
                  : styles.photoRequirementIconMissing,
              ]}
            >
              <Ionicons
                color={hasSavedPhoto ? theme.colors.success : theme.colors.textMuted}
                name={hasSavedPhoto ? 'checkmark' : 'camera'}
                size={18}
              />
            </View>
            <View style={styles.photoRequirementCopy}>
              <AppText style={styles.photoRequirementTitle}>Foto de perfil</AppText>
              <AppText style={styles.photoRequirementSubtitle}>
                {hasSavedPhoto
                  ? 'Lista para que tus circulos te reconozcan.'
                  : 'Opcional; puedes agregarla ahora o despues.'}
              </AppText>
            </View>
            <Pressable
              accessibilityRole="button"
              disabled={avatarMutation.isPending}
              onPress={openAvatarOptions}
              style={({ pressed }) => [
                styles.photoRequirementAction,
                pressed && !avatarMutation.isPending ? styles.pressed : null,
                avatarMutation.isPending ? styles.disabledAction : null,
              ]}
            >
              <AppText style={styles.photoRequirementActionText}>
                {hasSavedPhoto ? 'Cambiar' : 'Agregar'}
              </AppText>
            </Pressable>
          </View>
        ) : null}

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
                    <AppText style={styles.callingCodeText}>{selectedCountry.callingCode}</AppText>
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

        <View style={styles.sectionBlock}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionCopy}>
              <AppText style={styles.sectionTitle}>Seguridad</AppText>
            </View>
          </View>

          <View style={styles.securityList}>
            <SecurityStatusRow
              icon="mail"
              status={session.isEmailConfirmed ? 'Listo' : 'Pendiente'}
              subtitle={
                session.isEmailConfirmed
                  ? accountEmailLabel
                  : 'Abre el enlace o pega el codigo de 8 digitos'
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
                      {securityBusyKey === 'resend-email-confirmation' ? 'Enviando...' : 'Reenviar'}
                    </AppText>
                  </Pressable>
                )
              }
            />
            {!session.isEmailConfirmed ? (
              <View style={styles.securityAction}>
                <AppText style={styles.helperText}>
                  Usa el codigo de 8 digitos si el enlace no abre la app.
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
                        : 'Confirmar codigo'
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

            <SecurityStatusRow
              icon="phone-portrait"
              status={session.isTrustedDevice ? 'Listo' : 'Pendiente'}
              subtitle={
                session.isTrustedDevice
                  ? 'Acciones sensibles habilitadas'
                  : session.canTrustCurrentDeviceWithoutPassword
                    ? 'Confirma con un toque'
                    : 'Valida este telefono'
              }
              title="Dispositivo confiable"
              tone={session.isTrustedDevice ? 'success' : 'danger'}
            />
            {!session.isTrustedDevice ? (
              <View style={styles.securityAction}>
                {session.canTrustCurrentDeviceWithoutPassword ? (
                  <AppText style={styles.helperText}>
                    Confirmaste tu clave hace poco. Puedes confiar este telefono sin escribirla otra
                    vez.
                  </AppText>
                ) : null}
                {session.linkedMethods.hasEmailPassword &&
                !session.canTrustCurrentDeviceWithoutPassword ? (
                  <AppTextInput
                    autoCapitalize="none"
                    onChangeText={setTrustPassword}
                    placeholder="Tu clave actual"
                    placeholderTextColor={theme.colors.muted}
                    ref={trustPasswordInputRef}
                    secureTextEntry
                    value={trustPassword}
                  />
                ) : null}
                <View style={styles.inlineActionRow}>
                  <PrimaryAction
                    compact
                    fullWidth={false}
                    label={securityBusyKey === 'trust-device' ? 'Validando...' : trustActionLabel}
                    onPress={securityBusyKey ? undefined : () => void handleTrustDevice()}
                  />
                </View>
              </View>
            ) : null}

            <View style={styles.separator} />

            <SecurityStatusRow
              icon="finger-print"
              subtitle={
                session.setupState.biometricsEligible
                  ? session.biometricLabel
                  : session.biometricAvailable
                    ? 'Primero valida este dispositivo'
                    : 'No disponible'
              }
              title="Biometria"
              tone={session.biometricsEnabled ? 'success' : 'muted'}
              trailing={
                <Switch
                  disabled={!session.setupState.biometricsEligible && !session.biometricsEnabled}
                  onValueChange={(nextValue) => void handleBiometricToggle(nextValue)}
                  trackColor={{ false: theme.colors.surfaceSoft, true: theme.colors.primarySoft }}
                  value={session.biometricsEnabled}
                />
              }
            />
          </View>
        </View>

        <IdentityFlowPrimaryAction
          disabled={isSaving}
          icon="checkmark"
          label={isSaving ? 'Guardando...' : editPhoneMode ? 'Guardar celular' : 'Guardar y entrar'}
          loading={isSaving}
          onPress={isSaving ? undefined : () => void handleSaveAndFinish()}
        />
      </View>
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
  photoRequirement: {
    alignItems: 'center',
    borderRadius: theme.radius.medium,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  photoRequirementMissing: {
    backgroundColor: theme.colors.surfaceSoft,
    borderColor: theme.colors.border,
  },
  photoRequirementReady: {
    backgroundColor: theme.colors.successSoft,
    borderColor: 'rgba(61, 186, 110, 0.2)',
  },
  photoRequirementIcon: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  photoRequirementIconMissing: {
    backgroundColor: theme.colors.surface,
  },
  photoRequirementIconReady: {
    backgroundColor: theme.colors.surface,
  },
  photoRequirementCopy: {
    flex: 1,
    gap: 2,
  },
  photoRequirementTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.footnote,
    fontWeight: '800',
  },
  photoRequirementSubtitle: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    fontWeight: '600',
    lineHeight: 16,
  },
  photoRequirementAction: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.small,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 36,
    minWidth: 76,
    paddingHorizontal: theme.spacing.sm,
  },
  photoRequirementActionText: {
    color: theme.colors.text,
    fontSize: theme.typography.caption,
    fontWeight: '800',
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
  securityRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.md,
    justifyContent: 'space-between',
    minHeight: 56,
  },
  securityIcon: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  securityStatus: {
    fontSize: theme.typography.caption,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  securityList: {
    gap: theme.spacing.md,
  },
  securityAction: {
    gap: theme.spacing.sm,
    paddingLeft: 52,
  },
  inlineActionRow: {
    alignItems: 'flex-end',
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
  readOnlyTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.body,
    fontWeight: '700',
  },
  readOnlySubtitle: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
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
