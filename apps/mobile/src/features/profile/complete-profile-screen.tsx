import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ScrollView, TextInput } from 'react-native';

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
import { LoadingOverlay } from '@/components/loading-overlay';
import { MessageBanner } from '@/components/message-banner';
import { Snackbar } from '@/components/snackbar';
import { resolveAvatarUrl } from '@/lib/avatar';
import { showBlockedActionAlert, useDelayedBusy, useFeedbackSnackbar } from '@/lib/action-feedback';
import {
  triggerIdentityErrorHaptic,
  triggerIdentityImpactHaptic,
  triggerIdentitySelectionHaptic,
  triggerIdentitySuccessHaptic,
  triggerIdentityWarningHaptic,
} from '@/lib/identity-flow-haptics';
import { hrefForPendingInviteIntent, readPendingInviteIntent } from '@/lib/invite-intent';
import { useUpdateProfileAvatarMutation } from '@/lib/live-data';
import { beginHomeEntryHandoff } from '@/lib/home-entry-handoff';
import { returnToRoute } from '@/lib/navigation';
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
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<ProfileFormErrors>({});
  const scrollViewRef = useRef<ScrollView | null>(null);
  const fullNameInputRef = useRef<TextInput | null>(null);
  const phoneInputRef = useRef<TextInput | null>(null);
  const avatarOffsetRef = useRef(0);
  const fullNameOffsetRef = useRef(0);
  const phoneOffsetRef = useRef(0);
  const [highlightTarget, setHighlightTarget] = useState<'avatar' | 'fullName' | 'phone' | null>(
    null,
  );
  const { snackbar, showSnackbar } = useFeedbackSnackbar();
  const showBusyOverlay = useDelayedBusy(busy || avatarMutation.isPending);
  const logoName = fullName.trim() || profile?.display_name?.trim();

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

    return navigation.addListener(
      'beforeRemove',
      (event: { preventDefault(): void; data: { action: object } }) => {
        event.preventDefault();
        Alert.alert(
          'Tienes cambios sin guardar',
          'Si sales ahora, perderas los cambios del perfil.',
          [
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
          ],
        );
      },
    );
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
        phoneNationalNumber.trim().length >= 7
          ? undefined
          : 'Ingresa un celular valido para continuar.',
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
    triggerIdentityWarningHaptic();

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
      triggerIdentitySuccessHaptic();
      showSnackbar('Foto de perfil actualizada.', 'success');
    } catch (error) {
      triggerIdentityErrorHaptic();
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

  function openAvatarOptions() {
    if (avatarMutation.isPending) {
      return;
    }

    triggerIdentitySelectionHaptic();

    Alert.alert('Foto de perfil', undefined, [
      {
        text: 'Tomar foto',
        onPress: () => void handleTakeAvatarPhoto(),
      },
      {
        text: 'Elegir foto',
        onPress: () => void handlePickAvatar(),
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }

  async function handleSave() {
    if (busy) {
      return;
    }

    triggerIdentityImpactHaptic();

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
        triggerIdentitySuccessHaptic();
        showSnackbar('Perfil actualizado.', 'success');
        const pendingIntent = await readPendingInviteIntent();
        if (!pendingIntent) {
          beginHomeEntryHandoff();
        }
        returnToRoute(router, pendingIntent ? hrefForPendingInviteIntent(pendingIntent) : '/home');
        return;
      }

      if (
        showBlockedActionAlert(result, router, {
          hasEmailPassword: session.linkedMethods.hasEmailPassword,
          profile: {
            displayName: session.profile?.display_name ?? null,
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
      triggerIdentityErrorHaptic();
    } finally {
      setBusy(false);
    }
  }

  return (
    <IdentityFlowScreen
      identity={
        <View
          onLayout={(event) => {
            avatarOffsetRef.current = event.nativeEvent.layout.y;
          }}
        >
          <IdentityFlowIdentity
            avatarLabel={fullName || profile?.display_name || profile?.email || 'Tu perfil'}
            avatarUrl={avatarUrl}
            disabled={avatarMutation.isPending}
            editable
            onPress={openAvatarOptions}
            variant="avatar"
          />
        </View>
      }
      identityPosition="top"
      message={
        <IdentityFlowLogoCopy
          subtitle="Revisa tu nombre, celular y foto."
          title={logoName ? `Hola, ${logoName}` : 'Completa tu perfil'}
        />
      }
      overlay={
        <Snackbar message={snackbar.message} tone={snackbar.tone} visible={snackbar.visible} />
      }
      scrollEnabled
      scrollViewRef={scrollViewRef}
    >
      <IdentityFlowMessageSlot>
        {banner ? (
          <MessageBanner message={banner.message} tone={banner.tone} />
        ) : errors.avatar ? (
          <Text style={[styles.helperText, styles.helperTextDanger]}>{errors.avatar}</Text>
        ) : null}
      </IdentityFlowMessageSlot>

      <IdentityFlowForm>
        <View
          onLayout={(event) => {
            fullNameOffsetRef.current = event.nativeEvent.layout.y;
          }}
          style={highlightTarget === 'fullName' ? styles.focusBlock : null}
        >
          <IdentityFlowField
            error={errors.fullName ?? null}
            icon="person"
            label="Nombre"
            status={errors.fullName ? 'danger' : fullName.trim().length >= 3 ? 'success' : 'idle'}
          >
            <IdentityFlowTextInput
              autoCapitalize="words"
              onChangeText={(value) => {
                setFullName(value);
                clearFieldError('fullName');
              }}
              placeholder="Nombre y apellido"
              placeholderTextColor={theme.colors.muted}
              ref={fullNameInputRef}
              value={fullName}
            />
          </IdentityFlowField>
        </View>

        <View
          onLayout={(event) => {
            phoneOffsetRef.current = event.nativeEvent.layout.y;
          }}
          style={highlightTarget === 'phone' ? styles.focusBlock : null}
        >
          <IdentityFlowField
            error={errors.phoneNationalNumber ?? null}
            icon="call"
            label="Celular"
            status={
              errors.phoneNationalNumber
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
                    triggerIdentitySelectionHaptic();
                    setCountryMenuOpen((value) => !value);
                  }}
                  style={({ pressed }) => [styles.callingCodeBox, pressed ? styles.pressed : null]}
                >
                  <Text style={styles.callingCodeText}>{selectedCountry.callingCode}</Text>
                </Pressable>

                <IdentityFlowTextInput
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
                        triggerIdentitySelectionHaptic();
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
        </View>
      </IdentityFlowForm>

      <IdentityFlowPrimaryAction
        disabled={busy}
        label={busy ? 'Guardando...' : 'Guardar y continuar'}
        loading={busy}
        onPress={busy ? undefined : () => void handleSave()}
      />

      <LoadingOverlay
        message={
          busy
            ? 'No cierres esta pantalla mientras actualizamos tus datos.'
            : 'No cierres esta pantalla mientras actualizamos tu foto.'
        }
        title={busy ? 'Guardando perfil' : 'Actualizando foto'}
        visible={showBusyOverlay}
      />
    </IdentityFlowScreen>
  );
}

const styles = StyleSheet.create({
  centeredContent: {},
  contentWidth: {
    maxWidth: 460,
  },
  form: {
    gap: theme.spacing.xl,
    paddingTop: theme.spacing.md,
  },
  avatarStage: {
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
    paddingTop: theme.spacing.lg,
  },
  focusBlock: {
    borderRadius: theme.radius.large,
    backgroundColor: theme.colors.primaryGhost,
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
  avatarError: {
    color: theme.colors.danger,
    fontSize: theme.typography.caption,
    fontWeight: '700',
    lineHeight: 16,
    textAlign: 'center',
  },
  helperText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
    textAlign: 'center',
  },
  helperTextDanger: {
    color: theme.colors.danger,
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
