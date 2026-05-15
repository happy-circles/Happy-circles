import type { Dispatch, SetStateAction } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Platform, Pressable, ScrollView, View, type ViewStyle } from 'react-native';

import { AppText } from '@/components/app-text';
import {
  IdentityFlowField,
  IdentityFlowPasswordInput,
  IdentityFlowPrimaryAction,
  IdentityFlowTextInput,
} from '@/components/identity-flow';
import { triggerIdentitySelectionHaptic } from '@/lib/identity-flow-haptics';
import { COUNTRY_OPTIONS, DEFAULT_COUNTRY } from '@/lib/phone';
import { theme } from '@/lib/theme';
import {
  countryFlag,
  type FieldName,
  type FieldStatus,
} from './account-create-account-helpers';
import { accountCreateAccountStyles as styles } from './account-create-account-screen.styles';

const COUNTRY_OPTION_HEIGHT = 42;
const COUNTRY_MENU_VISIBLE_OPTIONS = 4;
const COUNTRY_MENU_HEIGHT = COUNTRY_OPTION_HEIGHT * COUNTRY_MENU_VISIBLE_OPTIONS;
const COUNTRY_MENU_CONTENT_HEIGHT = COUNTRY_OPTION_HEIGHT * COUNTRY_OPTIONS.length;
const COUNTRY_MENU_MAX_SCROLL_Y = Math.max(COUNTRY_MENU_CONTENT_HEIGHT - COUNTRY_MENU_HEIGHT, 1);
const COUNTRY_MENU_SCROLLBAR_THUMB_HEIGHT = Math.min(
  COUNTRY_MENU_HEIGHT,
  Math.max(
    36,
    Math.round((COUNTRY_MENU_HEIGHT / COUNTRY_MENU_CONTENT_HEIGHT) * COUNTRY_MENU_HEIGHT),
  ),
);
const COUNTRY_MENU_SCROLLBAR_TRAVEL = COUNTRY_MENU_HEIGHT - COUNTRY_MENU_SCROLLBAR_THUMB_HEIGHT;
const countryMenuScrollWebStyle =
  Platform.OS === 'web' ? ({ overscrollBehavior: 'contain' } as unknown as ViewStyle) : null;

interface AccountCreateAccountEmailFormProps {
  readonly authBusy: boolean;
  readonly busy: boolean;
  readonly countryIso: string;
  readonly countryMenuOpen: boolean;
  readonly countryMenuScrollY: number;
  readonly email: string;
  readonly emailStatus: FieldStatus;
  readonly markFieldTouched: (field: FieldName) => void;
  readonly onSubmit: () => void;
  readonly password: string;
  readonly passwordStatus: FieldStatus;
  readonly phoneNationalNumber: string;
  readonly phoneStatus: FieldStatus;
  readonly setCountryIso: (value: string) => void;
  readonly setCountryMenuOpen: Dispatch<SetStateAction<boolean>>;
  readonly setCountryMenuScrollY: (value: number) => void;
  readonly setEmail: (value: string) => void;
  readonly setPassword: (value: string) => void;
  readonly setPhoneNationalNumber: (value: string) => void;
}

export function AccountCreateAccountEmailForm({
  authBusy,
  busy,
  countryIso,
  countryMenuOpen,
  countryMenuScrollY,
  email,
  emailStatus,
  markFieldTouched,
  onSubmit,
  password,
  passwordStatus,
  phoneNationalNumber,
  phoneStatus,
  setCountryIso,
  setCountryMenuOpen,
  setCountryMenuScrollY,
  setEmail,
  setPassword,
  setPhoneNationalNumber,
}: AccountCreateAccountEmailFormProps) {
  const selectedCountry =
    COUNTRY_OPTIONS.find((country) => country.iso2 === countryIso) ?? DEFAULT_COUNTRY;
  const countryMenuScrollbarTop = Math.min(
    COUNTRY_MENU_SCROLLBAR_TRAVEL,
    (countryMenuScrollY / COUNTRY_MENU_MAX_SCROLL_Y) * COUNTRY_MENU_SCROLLBAR_TRAVEL,
  );

  return (
    <View style={styles.emailPasswordFallback}>
      <IdentityFlowField
        error={emailStatus === 'invalid' ? 'Escribe un correo válido.' : null}
        icon="mail"
        label="Correo"
        status={emailStatus === 'invalid' ? 'danger' : emailStatus === 'valid' ? 'success' : 'idle'}
      >
        <IdentityFlowTextInput
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          onBlur={() => markFieldTouched('email')}
          onChangeText={setEmail}
          placeholder="tu@correo.com"
          placeholderTextColor={theme.colors.muted}
          value={email}
        />
      </IdentityFlowField>

      <IdentityFlowField
        error={passwordStatus === 'invalid' ? 'Debe tener al menos 8 caracteres.' : null}
        icon="lock-closed"
        label="Contraseña"
        status={
          passwordStatus === 'invalid'
            ? 'danger'
            : passwordStatus === 'valid'
              ? 'success'
              : 'idle'
        }
      >
        <IdentityFlowPasswordInput
          autoCapitalize="none"
          autoComplete="password"
          onBlur={() => markFieldTouched('password')}
          onChangeText={setPassword}
          placeholder="Tu contraseña"
          placeholderTextColor={theme.colors.muted}
          value={password}
        />
      </IdentityFlowField>

      <IdentityFlowField
        error={phoneStatus === 'invalid' ? 'Debe tener entre 6 y 20 dígitos.' : null}
        icon="call"
        label="Celular"
        status={
          phoneStatus === 'invalid' ? 'danger' : phoneStatus === 'valid' ? 'success' : 'idle'
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
              <AppText style={styles.countryFlag}>{countryFlag(selectedCountry.iso2)}</AppText>
              <AppText style={styles.callingCodeText}>{selectedCountry.callingCode}</AppText>
              <Ionicons color={theme.colors.brandGreen} name="chevron-down" size={13} />
            </Pressable>

            <IdentityFlowTextInput
              keyboardType="phone-pad"
              onBlur={() => markFieldTouched('phone')}
              onChangeText={setPhoneNationalNumber}
              onFocus={() => setCountryMenuOpen(false)}
              placeholder="3001234567"
              placeholderTextColor={theme.colors.muted}
              style={styles.phoneInput}
              value={phoneNationalNumber}
            />
          </View>

          {countryMenuOpen ? (
            <View style={styles.countryMenu}>
              <ScrollView
                bounces={false}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
                onMoveShouldSetResponder={() => true}
                onScroll={(event) => setCountryMenuScrollY(event.nativeEvent.contentOffset.y)}
                onStartShouldSetResponder={() => true}
                scrollEventThrottle={16}
                showsVerticalScrollIndicator={false}
                style={[styles.countryMenuScroll, countryMenuScrollWebStyle]}
              >
                {COUNTRY_OPTIONS.map((country, index) => {
                  const selected = country.iso2 === selectedCountry.iso2;

                  return (
                    <Pressable
                      key={country.iso2}
                      onPress={() => {
                        triggerIdentitySelectionHaptic();
                        setCountryIso(country.iso2);
                        setCountryMenuOpen(false);
                      }}
                      style={[
                        styles.countryOption,
                        selected ? styles.countryOptionSelected : null,
                        index === COUNTRY_OPTIONS.length - 1 ? styles.countryOptionLast : null,
                      ]}
                    >
                      <View style={styles.countryOptionLabel}>
                        <AppText style={styles.countryFlag}>{countryFlag(country.iso2)}</AppText>
                        <AppText style={styles.countryLabel}>{country.label}</AppText>
                      </View>
                      <AppText
                        style={[styles.countryCode, selected ? styles.countryCodeSelected : null]}
                      >
                        {country.callingCode}
                      </AppText>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <View pointerEvents="none" style={styles.countryMenuScrollbarTrack}>
                <View
                  style={[
                    styles.countryMenuScrollbarThumb,
                    {
                      height: COUNTRY_MENU_SCROLLBAR_THUMB_HEIGHT,
                      transform: [{ translateY: countryMenuScrollbarTop }],
                    },
                  ]}
                />
              </View>
            </View>
          ) : null}
          {countryMenuOpen ? <View style={styles.countryMenuSpacer} /> : null}
        </View>
      </IdentityFlowField>

      <IdentityFlowPrimaryAction
        disabled={authBusy}
        label={busy ? 'Creando...' : 'Crear con correo'}
        loading={busy}
        onPress={authBusy ? undefined : onSubmit}
      />
    </View>
  );
}
