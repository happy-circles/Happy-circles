import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ScrollView, TextInput } from 'react-native';

import { AppAvatar } from '@/components/app-avatar';
import { AppTextInput } from '@/components/app-text-input';
import { FieldBlock } from '@/components/field-block';
import { LoadingOverlay } from '@/components/loading-overlay';
import { MessageBanner } from '@/components/message-banner';
import { PrimaryAction } from '@/components/primary-action';
import { ScreenShell } from '@/components/screen-shell';
import { Snackbar } from '@/components/snackbar';
import { resolveAvatarUrl } from '@/lib/avatar';
import { showBlockedActionAlert, useDelayedBusy, useFeedbackSnackbar } from '@/lib/action-feedback';
import { hrefForPendingInviteIntent, readPendingInviteIntent } from '@/lib/invite-intent';
import { useUpdateProfileAvatarMutation } from '@/lib/live-data';
import { COUNTRY_OPTIONS, DEFAULT_COUNTRY } from '@/lib/phone';
import { theme } from '@/lib/theme';
import { useSession } from '@/providers/session-provider';

interface BannerState {
  readonly message: string;
  readonly tone: 'primary' | 'success' | 'warning' | 'danger' | 'neutral';
}

interface ProfileFormErrors {
  readonly avatar?: string;
  readonly fullName?: string;
  readonly phoneNationalNumber?: string;
}

export function CompleteProfileScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ focus?: string }>();
  const session = useSession();
  const profile = session.profile;
  const avatarMutation = useUpdateProfileAvatarMutation();

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
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<ProfileFormErrors>({});
  const scrollViewRef = useRef<ScrollView | null>(null);
  const fullNameInputRef = useRef<TextInput | null>(null);
  const phoneInputRef = useRef<TextInput | null>(null);
  const avatarOffsetRef = useRef(0);
  const fullNameOffsetRef = useRef(0);
  const phoneOffsetRef = useRef(0);
  const [highlightTarget, setHighlightTarget] = useState<'avatar' | 'fullName' | 'phone' | null>(null);
  const { snackbar, showSnackbar } = useFeedbackSnackbar();
  const showBusyOverlay = useDelayedBusy(busy || avatarMutation.isPending);

  const selectedCountry =
    COUNTRY_OPTIONS.find((country) => country.iso2 === countryIso) ?? DEFAULT_COUNTRY;
  const avatarUrl = resolveAvatarUrl(profile?.avatar_path ?? null, profile?.updated_at ?? null);
  const focusTarget = typeof params.focus === 'string' ? params.focus : null;
  const isDirty =
    fullName.trim() !== (profile?.display_name ?? '').trim() ||
    countryIso !== initialCountry.iso2 ||
    phoneNationalNumber.trim() !== (profile?.phone_national_number ?? '').trim();

  useEffect(() => {
    if (!isDirty || busy || avatarMutation.isPending) {
      return;
    }

    return navigation.addListener('beforeRemove', (event: { preventDefault(): void; data: { action: object } }) => {
      event.preventDefault();
      Alert.alert('Tienes cambios sin guardar', 'Si sales ahora, perderas los cambios del perfil.', [
        {
          text: 'Seguir editando',
          style: 'cancel',
        },
        {
          text: 'Descartar',
          style: 'destructive',
          onPress: () =>
            navigation.dispatch(event.data.action as Parameters<typeof navigation.dispatch>[0]),
        },
      ]);
    });
  }, [avatarMutation.isPending, busy, isDirty, navigation]);

  useEffect(() => {
    if (!focusTarget) {
      return;
    }

    const clearHighlight = setTimeout(() => {
      setHighlightTarget(null);
    }, 2600);

    const timeout = setTimeout(() => focusProfileTarget(focusTarget), 180);

    return () => {
      clearTimeout(timeout);
      clearTimeout(clearHighlight);
    };
  }, [focusTarget]);

  function focusProfileTarget(target: string) {
    if (target === 'avatar') {
      scrollViewRef.current?.scrollTo({
        y: Math.max(0, avatarOffsetRef.current - 24),
        animated: true,
      });
      setHighlightTarget('avatar');
      Alert.alert('Agregar foto', 'Necesitamos una foto para continuar.', [
        {
          text: 'Ahora no',
          style: 'cancel',
        },
        {
          text: 'Tomar foto',
          onPress: () => void handleTakeAvatarPhoto(),
        },
        {
          text: 'Elegir foto',
          onPress: () => void handlePickAvatar(),
        },
      ]);
      return;
    }

    if (target === 'phone') {
      scrollViewRef.current?.scrollTo({
        y: Math.max(0, phoneOffsetRef.current - 24),
        animated: true,
      });
      setHighlightTarget('phone');
      phoneInputRef.current?.focus();
      return;
    }

    scrollViewRef.current?.scrollTo({
      y: Math.max(0, fullNameOffsetRef.current - 24),
      animated: true,
    });
    setHighlightTarget('fullName');
    fullNameInputRef.current?.focus();
  }

  function clearFieldError(field: keyof ProfileFormErrors) {
    setErrors((current) => {
      if (!current[field]) {
        return current;
      }

      return {
        ...current,
        [field]: undefined,
      };
    });
  }

  function validateForm(): ProfileFormErrors {
    return {
      avatar: session.profile?.avatar_path ? undefined : 'Agrega una foto antes de continuar.',
      fullName: fullName.trim().length >= 3 ? undefined : 'Escribe un nombre usable.',
      phoneNationalNumber:
        phoneNationalNumber.trim().length >= 7 ? undefined : 'Ingresa un celular valido para continuar.',
    };
  }

  function showValidationFeedback(nextErrors: ProfileFormErrors) {
    const errorCount = Object.values(nextErrors).filter(Boolean).length;
    if (errorCount === 0) {
      return;
    }

    setErrors(nextErrors);
    setBanner({
      message:
        errorCount === 1
          ? 'Te falta 1 dato para completar tu perfil.'
          : `Te faltan ${errorCount} datos para completar tu perfil.`,
      tone: 'danger',
    });

    if (nextErrors.fullName) {
      fullNameInputRef.current?.focus();
      return;
    }

    if (nextErrors.phoneNationalNumber) {
      phoneInputRef.current?.focus();
    }
  }

  async function uploadPickedAvatar(result: ImagePicker.ImagePickerResult) {
    if (result.canceled || !result.assets[0]) {
      return;
    }

    try {
      await avatarMutation.mutateAsync({
        uri: result.assets[0].uri,
        contentType: result.assets[0].mimeType,
      });
      clearFieldError('avatar');
      setBanner(null);
      showSnackbar('Foto de perfil actualizada.', 'success');
    } catch (error) {
      setBanner({
        message: error instanceof Error ? error.message : 'No se pudo actualizar la foto.',
        tone: 'danger',
      });
    }
  }

  async function handlePickAvatar() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setBanner({
        message: 'Necesitas permitir acceso a tus fotos para continuar.',
        tone: 'danger',
      });
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
      setBanner({
        message: 'Necesitas permitir acceso a la camara para continuar.',
        tone: 'danger',
      });
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

  async function handleSave() {
    if (busy) {
      return;
    }

    const nextErrors = validateForm();
    if (Object.values(nextErrors).some(Boolean)) {
      showValidationFeedback(nextErrors);
      return;
    }

    setBusy(true);
    setBanner(null);

    try {
      const result = await session.completeProfile({
        fullName,
        phoneCountryIso2: selectedCountry.iso2,
        phoneCountryCallingCode: selectedCountry.callingCode,
        phoneNationalNumber,
      });

      if (result === 'Perfil actualizado.') {
        showSnackbar('Perfil actualizado.', 'success');
        const pendingIntent = await readPendingInviteIntent();
        router.replace(pendingIntent ? hrefForPendingInviteIntent(pendingIntent) : '/home');
        return;
      }

      if (
        showBlockedActionAlert(result, router, {
          hasEmailPassword: session.linkedMethods.hasEmailPassword,
          profile: {
            avatarPath: session.profile?.avatar_path ?? null,
            phoneE164: session.profile?.phone_e164 ?? null,
          },
        })
      ) {
        return;
      }

      const normalizedResult = result.toLocaleLowerCase('es-CO');
      if (normalizedResult.includes('celular')) {
        setErrors((current) => ({
          ...current,
          phoneNationalNumber: result,
        }));
        focusProfileTarget('phone');
      } else if (normalizedResult.includes('foto')) {
        setErrors((current) => ({
          ...current,
          avatar: result,
        }));
        focusProfileTarget('avatar');
      } else if (normalizedResult.includes('nombre')) {
        setErrors((current) => ({
          ...current,
          fullName: result,
        }));
        focusProfileTarget('fullName');
      }

      setBanner({
        message: result,
        tone: 'danger',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScreenShell
      footer={
        <PrimaryAction
          disabled={busy}
          label={busy ? 'Guardando...' : 'Guardar y continuar'}
          loading={busy}
          onPress={busy ? undefined : () => void handleSave()}
        />
      }
      headerVariant="plain"
      largeTitle={false}
      overlay={<Snackbar message={snackbar.message} tone={snackbar.tone} visible={snackbar.visible} />}
      scrollViewRef={scrollViewRef}
      title="Completa tu perfil"
      subtitle="Antes de aceptar o enviar invitaciones necesitamos nombre usable, foto y celular unico para esta cuenta."
    >
      {banner ? <MessageBanner message={banner.message} tone={banner.tone} /> : null}

      <View style={styles.form}>
        <View
          onLayout={(event) => {
            avatarOffsetRef.current = event.nativeEvent.layout.y;
          }}
          style={[styles.avatarBlock, highlightTarget === 'avatar' ? styles.focusBlock : null]}
        >
          <AppAvatar
            imageUrl={avatarUrl}
            label={fullName || profile?.display_name || profile?.email || 'Tu perfil'}
            size={88}
          />
          <View style={styles.avatarActionRow}>
            <Pressable
              disabled={avatarMutation.isPending}
              onPress={() => void handleTakeAvatarPhoto()}
              style={({ pressed }) => [styles.avatarActionChip, pressed ? styles.pressed : null]}
            >
              <Text style={styles.avatarActionText}>
                {avatarMutation.isPending ? 'Subiendo...' : 'Tomar foto'}
              </Text>
            </Pressable>
            <Pressable
              disabled={avatarMutation.isPending}
              onPress={() => void handlePickAvatar()}
              style={({ pressed }) => [styles.avatarActionChip, pressed ? styles.pressed : null]}
            >
              <Text style={styles.avatarActionText}>Elegir foto</Text>
            </Pressable>
          </View>
          <Text style={[styles.avatarHelper, errors.avatar ? styles.avatarHelperError : null]}>
            {profile?.avatar_path
              ? 'Tu foto actual ya cuenta para validar identidad.'
              : 'La foto es obligatoria para poder continuar con invitaciones de amistad.'}
          </Text>
          {errors.avatar ? <Text style={styles.avatarError}>{errors.avatar}</Text> : null}
        </View>

        <View
          onLayout={(event) => {
            fullNameOffsetRef.current = event.nativeEvent.layout.y;
          }}
          style={highlightTarget === 'fullName' ? styles.focusBlock : null}
        >
          <FieldBlock error={errors.fullName ?? null} label="Nombre">
            <AppTextInput
              autoCapitalize="words"
              hasError={Boolean(errors.fullName)}
              onChangeText={(value) => {
                setFullName(value);
                clearFieldError('fullName');
              }}
              placeholder="Nombre y apellido"
              placeholderTextColor={theme.colors.muted}
              ref={fullNameInputRef}
              style={styles.input}
              value={fullName}
            />
          </FieldBlock>
        </View>

        <View
          onLayout={(event) => {
            phoneOffsetRef.current = event.nativeEvent.layout.y;
          }}
          style={highlightTarget === 'phone' ? styles.focusBlock : null}
        >
          <FieldBlock error={errors.phoneNationalNumber ?? null} label="Celular">
            <View style={styles.phoneField}>
              <View style={styles.phoneRow}>
                <Pressable
                  onPress={() => setCountryMenuOpen((value) => !value)}
                  style={({ pressed }) => [styles.callingCodeBox, pressed ? styles.pressed : null]}
                >
                  <Text style={styles.callingCodeText}>{selectedCountry.callingCode}</Text>
                </Pressable>

                <AppTextInput
                  hasError={Boolean(errors.phoneNationalNumber)}
                  keyboardType="phone-pad"
                  onChangeText={(value) => {
                    setPhoneNationalNumber(value);
                    clearFieldError('phoneNationalNumber');
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
      </View>
      <LoadingOverlay
        message={
          busy
            ? 'No cierres esta pantalla mientras actualizamos tus datos.'
            : 'No cierres esta pantalla mientras actualizamos tu foto.'
        }
        title={busy ? 'Guardando perfil' : 'Actualizando foto'}
        visible={showBusyOverlay}
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: theme.spacing.md,
  },
  avatarBlock: {
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  focusBlock: {
    borderRadius: theme.radius.large,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    padding: theme.spacing.xs,
  },
  avatarActionRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  avatarActionChip: {
    backgroundColor: theme.colors.surfaceSoft,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  avatarActionText: {
    color: theme.colors.primary,
    fontSize: theme.typography.footnote,
    fontWeight: '700',
  },
  avatarHelper: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
    textAlign: 'center',
  },
  avatarHelperError: {
    color: theme.colors.danger,
  },
  avatarError: {
    color: theme.colors.danger,
    fontSize: theme.typography.caption,
    fontWeight: '700',
    lineHeight: 16,
    textAlign: 'center',
  },
  input: {},
  phoneField: {
    position: 'relative',
    zIndex: 10,
  },
  phoneRow: {
    alignItems: 'stretch',
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  callingCodeBox: {
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceMuted,
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
  pressed: {
    opacity: 0.82,
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
    zIndex: 20,
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
