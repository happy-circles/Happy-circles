import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import type { TextInput } from 'react-native';

import { AvatarViewerModal } from '@/components/avatar-viewer-modal';
import { AppTextInput } from '@/components/app-text-input';
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
import { PrimaryAction } from '@/components/primary-action';
import { resolveAvatarUrl } from '@/lib/avatar';
import {
  triggerIdentityImpactHaptic as triggerImpactHaptic,
  triggerIdentitySelectionHaptic as triggerSelectionHaptic,
  triggerIdentitySuccessHaptic as triggerSuccessHaptic,
  triggerIdentityWarningHaptic as triggerWarningHaptic,
} from '@/lib/identity-flow-haptics';
import { hrefForPendingInviteIntent, readPendingInviteIntent } from '@/lib/invite-intent';
import { useUpdateProfileAvatarMutation } from '@/lib/live-data';
import { beginHomeEntryHandoff } from '@/lib/home-entry-handoff';
import { COUNTRY_OPTIONS, DEFAULT_COUNTRY } from '@/lib/phone';
import { returnToRoute } from '@/lib/navigation';
import { hasProfilePhoto } from '@/lib/setup-account';
import { theme } from '@/lib/theme';
import { useSession } from '@/providers/session-provider';

type SecurityTone = 'danger' | 'muted' | 'success';
type IoniconName = keyof typeof Ionicons.glyphMap;

function resolveTrustActionLabel(session: ReturnType<typeof useSession>) {
  if (session.linkedMethods.hasEmailPassword) {
    return 'Validar con clave';
  }

  if (session.linkedMethods.hasGoogle) {
    return 'Validar con Google';
  }

  if (session.linkedMethods.hasApple) {
    return 'Validar con Apple';
  }

  return 'Validar dispositivo';
}

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
        <Text style={styles.readOnlyTitle}>{title}</Text>
        {subtitle ? <Text style={styles.readOnlySubtitle}>{subtitle}</Text> : null}
      </View>
      {trailing ?? <Text style={[styles.securityStatus, { color: visual.color }]}>{status}</Text>}
    </View>
  );
}

export function SetupAccountScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    editPhone?: string | string[];
    returnTo?: string | string[];
  }>();
  const session = useSession();
  const avatarMutation = useUpdateProfileAvatarMutation();
  const profile = session.profile;
  const editPhoneMode =
    (Array.isArray(params.editPhone) ? params.editPhone[0] : params.editPhone) === 'true';
  const returnTo = Array.isArray(params.returnTo) ? params.returnTo[0] : params.returnTo;

  const initialCountry = useMemo(
    () =>
      COUNTRY_OPTIONS.find((country) => country.iso2 === profile?.phone_country_iso2) ??
      COUNTRY_OPTIONS.find(
        (country) => country.callingCode === profile?.phone_country_calling_code,
      ) ??
      DEFAULT_COUNTRY,
    [profile?.phone_country_calling_code, profile?.phone_country_iso2],
  );

  const [fullName, setFullName] = useState(profile?.display_name ?? '');
  const [countryIso, setCountryIso] = useState(initialCountry.iso2);
  const [phoneNationalNumber, setPhoneNationalNumber] = useState(
    profile?.phone_national_number ?? '',
  );
  const [countryMenuOpen, setCountryMenuOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [profileBusy, setProfileBusy] = useState(false);
  const [trustPassword, setTrustPassword] = useState('');
  const [securityBusyKey, setSecurityBusyKey] = useState<string | null>(null);
  const [localAvatarReady, setLocalAvatarReady] = useState(false);
  const [avatarViewerVisible, setAvatarViewerVisible] = useState(false);
  const [profileErrors, setProfileErrors] = useState<{
    readonly fullName?: string;
    readonly phoneNationalNumber?: string;
    readonly photo?: string;
  }>({});
  const fullNameInputRef = useRef<TextInput | null>(null);
  const phoneInputRef = useRef<TextInput | null>(null);
  const trustPasswordInputRef = useRef<TextInput | null>(null);

  const selectedCountry =
    COUNTRY_OPTIONS.find((country) => country.iso2 === countryIso) ?? DEFAULT_COUNTRY;
  const avatarUrl = resolveAvatarUrl(profile?.avatar_path ?? null, profile?.updated_at ?? null);
  const avatarLabel = fullName || profile?.display_name || profile?.email || 'Tu perfil';
  const trustActionLabel = resolveTrustActionLabel(session);
  const hasSavedPhoto = hasProfilePhoto(profile) || localAvatarReady;
  const needsPhoneInput =
    editPhoneMode || !profile?.phone_e164 || phoneNationalNumber.trim().length === 0;
  const phoneLabel = profile?.phone_e164 ?? 'Pendiente';
  const isSaving = profileBusy || avatarMutation.isPending;

  useEffect(() => {
    setFullName(profile?.display_name ?? '');
    setCountryIso(initialCountry.iso2);
    setPhoneNationalNumber(profile?.phone_national_number ?? '');
    setLocalAvatarReady(false);
  }, [
    initialCountry.iso2,
    profile?.avatar_path,
    profile?.display_name,
    profile?.phone_national_number,
  ]);

  useEffect(() => {
    if (
      session.isTrustedDevice ||
      !session.linkedMethods.hasEmailPassword ||
      session.setupState.requiredComplete
    ) {
      return;
    }

    trustPasswordInputRef.current?.focus();
  }, [
    session.isTrustedDevice,
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

  async function finishSetup() {
    if (returnTo === 'profile') {
      returnToRoute(router, '/profile');
      return;
    }

    const pendingIntent = await readPendingInviteIntent();
    if (!pendingIntent) {
      beginHomeEntryHandoff();
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
    const nextErrors = {
      fullName: fullName.trim().length >= 3 ? undefined : 'Escribe un nombre usable.',
      phoneNationalNumber:
        !needsPhoneInput || phoneNationalNumber.trim().length >= 7
          ? undefined
          : 'Ingresa un celular valido.',
      photo: editPhoneMode || hasSavedPhoto ? undefined : 'Agrega una foto antes de seguir.',
    };

    setProfileErrors(nextErrors);

    if (nextErrors.fullName) {
      triggerWarningHaptic();
      setMessage('Te falta completar tu nombre.');
      fullNameInputRef.current?.focus();
      return false;
    }

    if (nextErrors.phoneNationalNumber) {
      triggerWarningHaptic();
      setMessage('Te falta completar tu celular.');
      phoneInputRef.current?.focus();
      return false;
    }

    if (nextErrors.photo) {
      triggerWarningHaptic();
      setMessage('Tu foto es obligatoria para terminar el setup.');
      return false;
    }

    return true;
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
      await avatarMutation.mutateAsync({
        uri: result.assets[0].uri,
        contentType: result.assets[0].mimeType,
      });
      setLocalAvatarReady(true);
      clearProfileError('photo');
      triggerSuccessHaptic();
      setMessage('Foto guardada.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo guardar la foto.');
    }
  }

  async function handlePickAvatar() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setMessage('Necesitas acceso a tus fotos para seguir.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [1, 1],
      mediaTypes: ['images'],
      quality: 0.7,
    });

    await uploadPickedAvatar(result);
  }

  async function handleTakeAvatarPhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setMessage('Necesitas acceso a la camara para seguir.');
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

  async function handleTrustDevice() {
    triggerImpactHaptic();

    const result = await runSecurityAction('trust-device', async () =>
      session.trustCurrentDevice({
        password: trustPassword,
      }),
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
            <Text style={[styles.helperText, styles.helperTextDanger]}>{profileErrors.photo}</Text>
          ) : null}
        </IdentityFlowMessageSlot>
      ) : null}

      <View style={styles.setupContent}>
        <IdentityFlowForm>
          <IdentityFlowField
            error={profileErrors.fullName ?? null}
            icon="person"
            label="Nombre"
            status={
              profileErrors.fullName ? 'danger' : fullName.trim().length >= 3 ? 'success' : 'idle'
            }
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
                    <Text style={styles.callingCodeText}>{selectedCountry.callingCode}</Text>
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
                        <Text style={styles.countryLabel}>{country.label}</Text>
                        <Text style={styles.countryCode}>{country.callingCode}</Text>
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
              <Text style={styles.sectionTitle}>Seguridad</Text>
            </View>
          </View>

          <View style={styles.securityList}>
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
                session.isTrustedDevice ? 'Acciones sensibles habilitadas' : 'Valida este telefono'
              }
              title="Dispositivo confiable"
              tone={session.isTrustedDevice ? 'success' : 'danger'}
            />
            {!session.isTrustedDevice ? (
              <View style={styles.securityAction}>
                {session.linkedMethods.hasEmailPassword ? (
                  <AppTextInput
                    autoCapitalize="none"
                    onChangeText={setTrustPassword}
                    placeholder="Tu clave actual"
                    placeholderTextColor={theme.colors.muted}
                    ref={trustPasswordInputRef}
                    secureTextEntry
                    style={styles.input}
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
                  ? 'Entrada rapida'
                  : session.biometricAvailable
                    ? 'Primero valida el telefono'
                    : 'No disponible'
              }
              title="Face ID / Touch ID"
              tone={session.biometricsEnabled ? 'success' : 'muted'}
              trailing={
                <Switch
                  disabled={!session.setupState.biometricsEligible}
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
  input: {},
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
