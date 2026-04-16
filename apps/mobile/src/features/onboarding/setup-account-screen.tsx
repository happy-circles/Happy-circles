import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import type { TextInput } from 'react-native';

import { AppAvatar } from '@/components/app-avatar';
import { AppTextInput } from '@/components/app-text-input';
import { FieldBlock } from '@/components/field-block';
import { LoadingOverlay } from '@/components/loading-overlay';
import { MessageBanner } from '@/components/message-banner';
import { PrimaryAction } from '@/components/primary-action';
import { ScreenShell } from '@/components/screen-shell';
import { useUpdateProfileAvatarMutation } from '@/lib/live-data';
import { cancelScheduledReminders } from '@/lib/notifications';
import { COUNTRY_OPTIONS, DEFAULT_COUNTRY } from '@/lib/phone';
import { resolveAvatarUrl } from '@/lib/avatar';
import {
  buildSetupAccountHref,
  hasProfilePhoto,
  resolveSetupStep,
  type SetupStep,
} from '@/lib/setup-account';
import { theme } from '@/lib/theme';
import { hrefForPendingInviteIntent, readPendingInviteIntent } from '@/lib/invite-intent';
import { useSession } from '@/providers/session-provider';

const STEP_ORDER: readonly SetupStep[] = ['profile', 'photo', 'security'];

function formatPermissionLabel(status: string) {
  if (status === 'granted') {
    return 'Listo';
  }

  if (status === 'denied') {
    return 'Sin permiso';
  }

  if (status === 'unavailable') {
    return 'No disponible';
  }

  if (status === 'loading') {
    return 'Revisando...';
  }

  return 'Pendiente';
}

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

export function SetupAccountScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ step?: string | string[] }>();
  const session = useSession();
  const avatarMutation = useUpdateProfileAvatarMutation();
  const profile = session.profile;
  const rawStep = Array.isArray(params.step) ? params.step[0] : params.step;

  const initialCountry = useMemo(
    () =>
      COUNTRY_OPTIONS.find((country) => country.iso2 === profile?.phone_country_iso2) ??
      COUNTRY_OPTIONS.find((country) => country.callingCode === profile?.phone_country_calling_code) ??
      DEFAULT_COUNTRY,
    [profile?.phone_country_calling_code, profile?.phone_country_iso2],
  );

  const [fullName, setFullName] = useState(profile?.display_name ?? '');
  const [countryIso, setCountryIso] = useState(initialCountry.iso2);
  const [phoneNationalNumber, setPhoneNationalNumber] = useState(profile?.phone_national_number ?? '');
  const [countryMenuOpen, setCountryMenuOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [profileBusy, setProfileBusy] = useState(false);
  const [trustPassword, setTrustPassword] = useState('');
  const [securityBusyKey, setSecurityBusyKey] = useState<string | null>(null);
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
  const currentStep = resolveSetupStep({
    requestedStep: rawStep,
    pendingRequiredSteps: session.setupState.pendingRequiredSteps,
    securityPending: session.setupState.securityPending,
  });
  const currentStepIndex = STEP_ORDER.indexOf(currentStep) + 1;
  const trustActionLabel = resolveTrustActionLabel(session);

  useEffect(() => {
    setFullName(profile?.display_name ?? '');
    setCountryIso(initialCountry.iso2);
    setPhoneNationalNumber(profile?.phone_national_number ?? '');
  }, [initialCountry.iso2, profile?.display_name, profile?.phone_national_number]);

  useEffect(() => {
    if (rawStep === currentStep) {
      return;
    }

    router.replace(buildSetupAccountHref(currentStep));
  }, [currentStep, rawStep, router]);

  useEffect(() => {
    if (currentStep !== 'security' || !session.linkedMethods.hasEmailPassword || session.isTrustedDevice) {
      return;
    }

    trustPasswordInputRef.current?.focus();
  }, [currentStep, session.isTrustedDevice, session.linkedMethods.hasEmailPassword]);

  async function finishSetup() {
    const pendingIntent = await readPendingInviteIntent();
    router.replace(pendingIntent ? hrefForPendingInviteIntent(pendingIntent) : '/home');
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

  async function handleSaveProfile() {
    if (profileBusy) {
      return;
    }

    const nextErrors = {
      fullName: fullName.trim().length >= 3 ? undefined : 'Escribe un nombre usable.',
      phoneNationalNumber:
        phoneNationalNumber.trim().length >= 7 ? undefined : 'Ingresa un celular valido.',
    };

    if (nextErrors.fullName || nextErrors.phoneNationalNumber) {
      setProfileErrors((current) => ({
        ...current,
        ...nextErrors,
      }));
      setMessage('Te faltan datos para seguir.');

      if (nextErrors.fullName) {
        fullNameInputRef.current?.focus();
        return;
      }

      phoneInputRef.current?.focus();
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

      setProfileErrors((current) => ({
        ...current,
        fullName: undefined,
        phoneNationalNumber: undefined,
      }));

      if (hasProfilePhoto(profile)) {
        if (session.setupState.securityPending) {
          router.replace(buildSetupAccountHref('security'));
          return;
        }

        await finishSetup();
        return;
      }

      router.replace(buildSetupAccountHref('photo'));
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
      clearProfileError('photo');
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

  async function handlePhotoContinue() {
    if (!hasProfilePhoto(session.profile)) {
      setProfileErrors((current) => ({
        ...current,
        photo: 'Agrega una foto antes de seguir.',
      }));
      setMessage('Tu foto es obligatoria para terminar el setup.');
      return;
    }

    if (session.setupState.securityPending) {
      router.replace(buildSetupAccountHref('security'));
      return;
    }

    await finishSetup();
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
    const result = await runSecurityAction('trust-device', async () =>
      session.trustCurrentDevice({
        password: trustPassword,
      }),
    );

    if (result === 'Este dispositivo ahora es confiable.') {
      setTrustPassword('');
    }
  }

  async function handleBiometricToggle(nextValue: boolean) {
    const result = await session.setBiometricsEnabled(nextValue);
    setMessage(result.message);
  }

  async function handleContactsPermission() {
    const result = await runSecurityAction('contacts', async () => session.requestContactsPermission());
    setMessage(result);
  }

  async function handleNotificationsToggle(nextValue: boolean) {
    if (!nextValue) {
      await session.setNotificationsEnabled(false);
      await cancelScheduledReminders();
      setMessage('Recordatorios desactivados.');
      return;
    }

    const result = await runSecurityAction('notifications', async () =>
      session.requestNotificationsPermission(),
    );
    setMessage(result);
  }

  function renderProfileStep() {
    return (
      <View style={styles.stepBody}>
        <View>
          <Text style={styles.stepTitle}>Perfil base</Text>
          <Text style={styles.stepSubtitle}>Nombre usable y celular. Nada mas por ahora.</Text>
        </View>

        <FieldBlock error={profileErrors.fullName ?? null} label="Nombre">
          <AppTextInput
            autoCapitalize="words"
            hasError={Boolean(profileErrors.fullName)}
            onChangeText={(value) => {
              setFullName(value);
              clearProfileError('fullName');
            }}
            placeholder="Nombre y apellido"
            placeholderTextColor={theme.colors.muted}
            ref={fullNameInputRef}
            style={styles.input}
            value={fullName}
          />
        </FieldBlock>

        <FieldBlock error={profileErrors.phoneNationalNumber ?? null} label="Celular">
          <View style={styles.phoneField}>
            <View style={styles.phoneRow}>
              <Pressable
                onPress={() => setCountryMenuOpen((value) => !value)}
                style={({ pressed }) => [styles.callingCodeBox, pressed ? styles.pressed : null]}
              >
                <Text style={styles.callingCodeText}>{selectedCountry.callingCode}</Text>
              </Pressable>

              <AppTextInput
                hasError={Boolean(profileErrors.phoneNationalNumber)}
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
    );
  }

  function renderPhotoStep() {
    return (
      <View style={styles.stepBody}>
        <View>
          <Text style={styles.stepTitle}>Tu foto</Text>
          <Text style={styles.stepSubtitle}>Una foto clara hace la app mas personal y confiable.</Text>
        </View>

        <View style={styles.photoCard}>
          <AppAvatar
            imageUrl={avatarUrl}
            label={fullName || profile?.display_name || profile?.email || 'Tu perfil'}
            size={96}
          />
          <View style={styles.photoActions}>
            <Pressable
              disabled={avatarMutation.isPending}
              onPress={() => void handleTakeAvatarPhoto()}
              style={({ pressed }) => [styles.photoAction, pressed ? styles.pressed : null]}
            >
              <Text style={styles.photoActionText}>
                {avatarMutation.isPending ? 'Subiendo...' : 'Tomar foto'}
              </Text>
            </Pressable>
            <Pressable
              disabled={avatarMutation.isPending}
              onPress={() => void handlePickAvatar()}
              style={({ pressed }) => [styles.photoAction, pressed ? styles.pressed : null]}
            >
              <Text style={styles.photoActionText}>Elegir foto</Text>
            </Pressable>
          </View>
          <Text style={[styles.helperText, profileErrors.photo ? styles.helperTextDanger : null]}>
            {hasProfilePhoto(profile)
              ? 'Tu foto ya quedo lista.'
              : 'La foto es obligatoria para cerrar el setup.'}
          </Text>
        </View>
      </View>
    );
  }

  function renderSecurityStep() {
    return (
      <View style={styles.stepBody}>
        <View>
          <Text style={styles.stepTitle}>Seguridad y app nativa</Text>
          <Text style={styles.stepSubtitle}>Asegura este telefono y activa accesos rapidos si quieres.</Text>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionCopy}>
              <Text style={styles.sectionTitle}>Asegura este telefono</Text>
              <Text style={styles.sectionSubtitle}>
                {session.isTrustedDevice ? 'Este telefono ya es confiable.' : 'Valida este telefono para acciones sensibles.'}
              </Text>
            </View>
            <Text style={styles.sectionStatus}>
              {session.isTrustedDevice ? 'Listo' : 'Pendiente'}
            </Text>
          </View>

          {!session.isTrustedDevice ? (
            <View style={styles.stack}>
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
              <PrimaryAction
                compact
                label={securityBusyKey === 'trust-device' ? 'Validando...' : trustActionLabel}
                onPress={
                  securityBusyKey ? undefined : () => void handleTrustDevice()
                }
              />
            </View>
          ) : null}
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionCopy}>
              <Text style={styles.sectionTitle}>Face ID / Touch ID</Text>
              <Text style={styles.sectionSubtitle}>
                {session.setupState.biometricsEligible
                  ? 'Entrar rapido al abrir la app.'
                  : session.biometricAvailable
                    ? 'Primero asegura este telefono.'
                    : 'No disponible en este dispositivo.'}
              </Text>
            </View>
            <Switch
              disabled={!session.setupState.biometricsEligible}
              onValueChange={(nextValue) => void handleBiometricToggle(nextValue)}
              trackColor={{ false: theme.colors.surfaceSoft, true: theme.colors.primarySoft }}
              value={session.biometricsEnabled}
            />
          </View>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionCopy}>
              <Text style={styles.sectionTitle}>Contactos</Text>
              <Text style={styles.sectionSubtitle}>Para encontrar amigos mas facil despues.</Text>
            </View>
            <Text style={styles.sectionStatus}>
              {formatPermissionLabel(session.setupState.contactsPermissionStatus)}
            </Text>
          </View>
          {session.setupState.contactsPermissionStatus !== 'granted' ? (
            <PrimaryAction
              compact
              label={securityBusyKey === 'contacts' ? 'Pidiendo permiso...' : 'Permitir contactos'}
              onPress={securityBusyKey ? undefined : () => void handleContactsPermission()}
              variant="secondary"
            />
          ) : null}
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionCopy}>
              <Text style={styles.sectionTitle}>Notificaciones</Text>
              <Text style={styles.sectionSubtitle}>Para recordatorios y movimientos pendientes.</Text>
            </View>
            <Switch
              onValueChange={(nextValue) => void handleNotificationsToggle(nextValue)}
              trackColor={{ false: theme.colors.surfaceSoft, true: theme.colors.primarySoft }}
              value={session.notificationsEnabled}
            />
          </View>
          <Text style={styles.helperText}>
            Estado del sistema: {formatPermissionLabel(session.setupState.notificationsPermissionStatus)}.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <ScreenShell
      footer={
        currentStep === 'profile' ? (
          <PrimaryAction
            disabled={profileBusy}
            label={profileBusy ? 'Guardando...' : 'Guardar y seguir'}
            loading={profileBusy}
            onPress={profileBusy ? undefined : () => void handleSaveProfile()}
          />
        ) : currentStep === 'photo' ? (
          <PrimaryAction
            disabled={avatarMutation.isPending}
            label={avatarMutation.isPending ? 'Subiendo...' : 'Continuar'}
            loading={avatarMutation.isPending}
            onPress={avatarMutation.isPending ? undefined : () => void handlePhotoContinue()}
          />
        ) : (
          <View style={styles.footerStack}>
            <PrimaryAction label="Entrar a la app" onPress={() => void finishSetup()} />
            {!session.isTrustedDevice ? (
              <PrimaryAction
                compact
                label="Seguir por ahora"
                onPress={() => void finishSetup()}
                variant="ghost"
              />
            ) : null}
          </View>
        )
      }
      headerSlot={
        <View style={styles.progressChip}>
          <Text style={styles.progressChipText}>{currentStepIndex} de 3</Text>
        </View>
      }
      headerVariant="plain"
      largeTitle={false}
      subtitle="Compacto, simple y sin pasos escondidos."
      title="Deja tu cuenta lista"
    >
      {message ? <MessageBanner message={message} tone="neutral" /> : null}
      {currentStep === 'profile'
        ? renderProfileStep()
        : currentStep === 'photo'
          ? renderPhotoStep()
          : renderSecurityStep()}
      <LoadingOverlay
        message="No cierres esta pantalla mientras terminamos este paso."
        title={profileBusy ? 'Guardando perfil' : 'Actualizando foto'}
        visible={profileBusy || avatarMutation.isPending}
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  progressChip: {
    backgroundColor: theme.colors.surfaceSoft,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
  },
  progressChipText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    fontWeight: '800',
  },
  stepBody: {
    gap: theme.spacing.lg,
  },
  stepTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.title2,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  stepSubtitle: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.callout,
    lineHeight: 22,
    marginTop: theme.spacing.xs,
  },
  sectionCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.large,
    borderWidth: 1,
    gap: theme.spacing.md,
    padding: theme.spacing.md,
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
    fontWeight: '700',
  },
  sectionSubtitle: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
  },
  sectionStatus: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    fontWeight: '800',
    textTransform: 'uppercase',
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
  photoCard: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.large,
    borderWidth: 1,
    gap: theme.spacing.md,
    padding: theme.spacing.lg,
  },
  photoActions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  photoAction: {
    backgroundColor: theme.colors.surfaceSoft,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  photoActionText: {
    color: theme.colors.primary,
    fontSize: theme.typography.footnote,
    fontWeight: '700',
  },
  footerStack: {
    gap: theme.spacing.sm,
  },
  pressed: {
    opacity: 0.9,
  },
});
