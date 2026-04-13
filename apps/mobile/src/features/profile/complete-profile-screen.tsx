import { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppAvatar } from '@/components/app-avatar';
import { FieldBlock } from '@/components/field-block';
import { MessageBanner } from '@/components/message-banner';
import { PrimaryAction } from '@/components/primary-action';
import { ScreenShell } from '@/components/screen-shell';
import { resolveAvatarUrl } from '@/lib/avatar';
import { hrefForPendingInviteIntent, readPendingInviteIntent } from '@/lib/invite-intent';
import { useUpdateProfileAvatarMutation } from '@/lib/live-data';
import { COUNTRY_OPTIONS, DEFAULT_COUNTRY } from '@/lib/phone';
import { theme } from '@/lib/theme';
import { useSession } from '@/providers/session-provider';

export function CompleteProfileScreen() {
  const router = useRouter();
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
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selectedCountry =
    COUNTRY_OPTIONS.find((country) => country.iso2 === countryIso) ?? DEFAULT_COUNTRY;
  const avatarUrl = resolveAvatarUrl(profile?.avatar_path ?? null, profile?.updated_at ?? null);

  async function uploadPickedAvatar(result: ImagePicker.ImagePickerResult) {
    if (result.canceled || !result.assets[0]) {
      return;
    }

    try {
      await avatarMutation.mutateAsync({
        uri: result.assets[0].uri,
        contentType: result.assets[0].mimeType,
      });
      setMessage('Foto de perfil actualizada.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo actualizar la foto.');
    }
  }

  async function handlePickAvatar() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setMessage('Necesitas permitir acceso a tus fotos para continuar.');
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
      setMessage('Necesitas permitir acceso a la camara para continuar.');
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

    if (!session.profile?.avatar_path) {
      setMessage('Agrega una foto antes de continuar.');
      return;
    }

    setBusy(true);
    setMessage(null);

    try {
      const result = await session.completeProfile({
        fullName,
        phoneCountryIso2: selectedCountry.iso2,
        phoneCountryCallingCode: selectedCountry.callingCode,
        phoneNationalNumber,
      });

      setMessage(result);
      if (result === 'Perfil actualizado.') {
        const pendingIntent = await readPendingInviteIntent();
        router.replace(pendingIntent ? hrefForPendingInviteIntent(pendingIntent) : '/home');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScreenShell
      footer={
        <PrimaryAction
          label={busy ? 'Guardando...' : 'Guardar y continuar'}
          onPress={busy ? undefined : () => void handleSave()}
        />
      }
      headerVariant="plain"
      largeTitle={false}
      title="Completa tu perfil"
      subtitle="Antes de aceptar o enviar invitaciones necesitamos nombre usable, foto y celular unico para esta cuenta."
    >
      {message ? <MessageBanner message={message} /> : null}

      <View style={styles.form}>
        <View style={styles.avatarBlock}>
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
          <Text style={styles.avatarHelper}>
            {profile?.avatar_path
              ? 'Tu foto actual ya cuenta para validar identidad.'
              : 'La foto es obligatoria para poder continuar con invitaciones de amistad.'}
          </Text>
        </View>

        <FieldBlock label="Nombre">
          <TextInput
            autoCapitalize="words"
            onChangeText={setFullName}
            placeholder="Nombre y apellido"
            placeholderTextColor={theme.colors.muted}
            style={styles.input}
            value={fullName}
          />
        </FieldBlock>

        <FieldBlock label="Celular">
          <View style={styles.phoneField}>
            <View style={styles.phoneRow}>
              <Pressable
                onPress={() => setCountryMenuOpen((value) => !value)}
                style={({ pressed }) => [styles.callingCodeBox, pressed ? styles.pressed : null]}
              >
                <Text style={styles.callingCodeText}>{selectedCountry.callingCode}</Text>
              </Pressable>

              <TextInput
                keyboardType="phone-pad"
                onChangeText={setPhoneNationalNumber}
                onFocus={() => setCountryMenuOpen(false)}
                placeholder="3001234567"
                placeholderTextColor={theme.colors.muted}
                style={[styles.input, styles.phoneInput]}
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
  input: {
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.medium,
    borderWidth: 1,
    color: theme.colors.text,
    fontSize: theme.typography.body,
    minHeight: 54,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
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
