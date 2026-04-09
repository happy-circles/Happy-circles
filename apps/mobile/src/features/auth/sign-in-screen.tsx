import { useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandMark } from '@/components/brand-mark';
import { FieldBlock } from '@/components/field-block';
import { MessageBanner } from '@/components/message-banner';
import { PrimaryAction } from '@/components/primary-action';
import { ScreenShell } from '@/components/screen-shell';
import { SurfaceCard } from '@/components/surface-card';
import { COUNTRY_OPTIONS, DEFAULT_COUNTRY } from '@/lib/phone';
import { theme } from '@/lib/theme';
import { useSession } from '@/providers/session-provider';

type SignInScreenMode = 'landing' | 'sign-in' | 'register';

export interface SignInScreenProps {
  readonly mode?: SignInScreenMode;
}

function EntryAction({
  icon,
  label,
  onPress,
  tone,
}: {
  readonly icon: keyof typeof Ionicons.glyphMap;
  readonly label: string;
  readonly onPress: () => void;
  readonly tone: 'primary' | 'secondary';
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.entryAction,
        tone === 'primary' ? styles.entryActionPrimary : styles.entryActionSecondary,
        pressed ? styles.entryActionPressed : null,
      ]}
    >
      <Ionicons
        color={tone === 'primary' ? theme.colors.white : theme.colors.text}
        name={icon}
        size={20}
      />
      <Text
        style={[
          styles.entryActionLabel,
          tone === 'primary' ? styles.entryActionPrimaryText : styles.entryActionSecondaryText,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function SignInScreen({ mode = 'landing' }: SignInScreenProps) {
  const router = useRouter();
  const { registerAccount, signInWithPassword } = useSession();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phoneNationalNumber, setPhoneNationalNumber] = useState('');
  const [countryIso, setCountryIso] = useState(DEFAULT_COUNTRY.iso2);
  const [countryMenuOpen, setCountryMenuOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selectedCountry = useMemo(
    () => COUNTRY_OPTIONS.find((country) => country.iso2 === countryIso) ?? DEFAULT_COUNTRY,
    [countryIso],
  );

  async function handleSubmit() {
    if (mode === 'landing') {
      return;
    }

    setBusy(true);

    const result =
      mode === 'register'
        ? await registerAccount({
            fullName,
            email,
            password,
            confirmPassword: password,
            phoneCountryIso2: selectedCountry.iso2,
            phoneCountryCallingCode: selectedCountry.callingCode,
            phoneNationalNumber,
          })
        : await signInWithPassword({
            email,
            password,
          });

    setMessage(result);
    setBusy(false);
  }

  if (mode === 'landing') {
    return (
      <SafeAreaView style={styles.landingSafeArea}>
        <View style={styles.landingContent}>
          <View style={styles.brandWrap}>
            <BrandMark orientation="stacked" size="lg" tone="mono" />
          </View>

          {message ? <MessageBanner message={message} tone="neutral" /> : null}

          <View style={styles.entryActions}>
            <EntryAction
              icon="log-in-outline"
              label="Ingresar"
              onPress={() => router.push('/login')}
              tone="primary"
            />
            <EntryAction
              icon="person-add-outline"
              label="Registrar"
              onPress={() => router.push('/create-account')}
              tone="secondary"
            />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const isRegister = mode === 'register';

  return (
    <ScreenShell
      eyebrow="Acceso"
      headerSlot={
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons color={theme.colors.text} name="arrow-back" size={18} />
        </Pressable>
      }
      largeTitle={false}
      subtitle={isRegister ? 'Crea tu cuenta con lo esencial.' : 'Vuelve a tu resumen y tus pendientes.'}
      title={isRegister ? 'Registrar cuenta' : 'Ingresar'}
    >
      <SurfaceCard padding="lg" variant="accent">
        <Text style={styles.formHeroTitle}>
          {isRegister ? 'Tu circulo empieza claro desde el primer movimiento.' : 'Tu balance te esta esperando.'}
        </Text>
      </SurfaceCard>

      {message ? <MessageBanner message={message} tone="primary" /> : null}

      <SurfaceCard padding="lg" variant="elevated">
        {isRegister ? (
          <>
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

            <FieldBlock hint="Usamos este numero para enlazar invitaciones." label="Celular">
              <View style={styles.phoneField}>
                <View style={styles.phoneRow}>
                  <Pressable onPress={() => setCountryMenuOpen((value) => !value)} style={styles.callingCodeBox}>
                    <Text style={styles.callingCodeText}>{selectedCountry.callingCode}</Text>
                    <Ionicons
                      color={theme.colors.textMuted}
                      name={countryMenuOpen ? 'chevron-up' : 'chevron-down'}
                      size={16}
                    />
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
                        <Text style={styles.countryOptionLabel}>{country.label}</Text>
                        <Text style={styles.countryOptionCode}>{country.callingCode}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>
            </FieldBlock>
          </>
        ) : null}

        <FieldBlock label="Correo">
          <TextInput
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            onChangeText={setEmail}
            placeholder="tu@correo.com"
            placeholderTextColor={theme.colors.muted}
            style={styles.input}
            value={email}
          />
        </FieldBlock>

        <FieldBlock label="Clave">
          <TextInput
            autoCapitalize="none"
            autoComplete="password"
            onChangeText={setPassword}
            placeholder="Tu clave"
            placeholderTextColor={theme.colors.muted}
            secureTextEntry
            style={styles.input}
            value={password}
          />
        </FieldBlock>

        <PrimaryAction
          label={
            busy
              ? 'Procesando...'
              : isRegister
                ? 'Crear cuenta'
                : 'Ingresar'
          }
          onPress={busy ? undefined : () => void handleSubmit()}
          subtitle={isRegister ? 'Cuenta nueva en pocos datos' : 'Entrar a Happy Circles'}
        />
      </SurfaceCard>

      <SurfaceCard padding="md" style={styles.switchCard} variant="muted">
        <Text style={styles.switchText}>{isRegister ? 'Ya tienes cuenta?' : 'No tienes cuenta?'}</Text>
        <Pressable
          onPress={() => router.replace(isRegister ? '/login' : '/create-account')}
          style={styles.switchButton}
        >
          <Text style={styles.switchButtonText}>{isRegister ? 'Ingresar' : 'Registrar'}</Text>
        </Pressable>
      </SurfaceCard>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  landingSafeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  landingContent: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.xl,
  },
  brandWrap: {
    alignItems: 'center',
    marginBottom: 44,
  },
  entryActions: {
    gap: theme.spacing.md,
    marginTop: theme.spacing.lg,
    width: '100%',
  },
  entryAction: {
    alignItems: 'center',
    borderRadius: 18,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'center',
    minHeight: 56,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    width: '100%',
  },
  entryActionPrimary: {
    backgroundColor: theme.colors.primary,
    ...theme.shadow.floating,
  },
  entryActionSecondary: {
    backgroundColor: theme.colors.white,
    borderColor: theme.colors.border,
    borderWidth: 1,
    ...theme.shadow.card,
  },
  entryActionPressed: {
    opacity: 0.94,
    transform: [{ scale: 0.99 }],
  },
  entryActionLabel: {
    fontSize: theme.typography.body,
    fontWeight: '800',
  },
  entryActionPrimaryText: {
    color: theme.colors.white,
  },
  entryActionSecondaryText: {
    color: theme.colors.text,
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.small,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  formHeroTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '700',
    lineHeight: 22,
  },
  input: {
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.medium,
    borderWidth: 1,
    color: theme.colors.text,
    fontSize: theme.typography.body,
    minHeight: 52,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  phoneRow: {
    alignItems: 'stretch',
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  phoneField: {
    position: 'relative',
    zIndex: 20,
  },
  callingCodeBox: {
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.medium,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.xs,
    justifyContent: 'center',
    minWidth: 88,
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
  countryOptionLabel: {
    color: theme.colors.text,
    fontSize: theme.typography.footnote,
    fontWeight: '600',
  },
  countryOptionCode: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    fontWeight: '700',
  },
  switchCard: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  switchText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    fontWeight: '600',
  },
  switchButton: {
    paddingVertical: 4,
  },
  switchButtonText: {
    color: theme.colors.primary,
    fontSize: theme.typography.footnote,
    fontWeight: '800',
  },
});
