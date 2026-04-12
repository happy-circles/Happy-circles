import { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { FieldBlock } from '@/components/field-block';
import { MessageBanner } from '@/components/message-banner';
import { PrimaryAction } from '@/components/primary-action';
import { ScreenShell } from '@/components/screen-shell';
import { hrefForPendingInviteIntent, readPendingInviteIntent } from '@/lib/invite-intent';
import { COUNTRY_OPTIONS, DEFAULT_COUNTRY } from '@/lib/phone';
import { theme } from '@/lib/theme';
import { useSession } from '@/providers/session-provider';

export function CompleteProfileScreen() {
  const router = useRouter();
  const session = useSession();
  const profile = session.profile;

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

  async function handleSave() {
    if (busy) {
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
      subtitle="Antes de mover dinero necesitamos un nombre usable y un celular unico para esta cuenta."
    >
      {message ? <MessageBanner message={message} /> : null}

      <View style={styles.form}>
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
