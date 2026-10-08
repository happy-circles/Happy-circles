import { Platform, Switch, View } from 'react-native';
import { AppText } from '@/components/app-text';
import { PasswordTextInput } from '@/components/password-text-input';
import { PrimaryAction } from '@/components/primary-action';
import type { SessionContextValue } from '@/providers/session/types';
import { useAppTheme } from '@/providers/theme-provider';
import { styles } from './setup-account-screen-runtime.styles';
import { SecurityStatusRow } from './setup-security-status-row';

export function SetupAccountSecurityOptions({
  session,
  identityRequired,
  identityConfirmed,
  securityBusyKey,
  identityPassword,
  identityPasswordOpen,
  setIdentityPassword,
  setIdentityPasswordOpen,
  socialTrustMethods,
  handleConfirmIdentity,
  handleBiometricToggle,
  handleCheckBiometrics,
}: {
  readonly session: SessionContextValue;
  readonly identityRequired: boolean;
  readonly identityConfirmed: boolean;
  readonly securityBusyKey: string | null;
  readonly identityPassword: string;
  readonly identityPasswordOpen: boolean;
  readonly setIdentityPassword: (value: string) => void;
  readonly setIdentityPasswordOpen: (updater: (open: boolean) => boolean) => void;
  readonly socialTrustMethods: readonly ('google' | 'apple')[];
  readonly handleConfirmIdentity: (
    method: 'biometric' | 'password' | 'google' | 'apple',
  ) => Promise<void>;
  readonly handleBiometricToggle: (enabled: boolean) => Promise<void>;
  readonly handleCheckBiometrics: () => Promise<void>;
}) {
  const activeTheme = useAppTheme();
  const theme = activeTheme;
  const dynamicStyles = {
    separator: { backgroundColor: activeTheme.colors.hairline },
    helperText: { color: activeTheme.colors.textMuted },
  };
  return (
    <>
      {session.isTrustedDevice && identityRequired ? (
        <View style={styles.securityAction}>
          <SecurityStatusRow
            icon="shield-checkmark"
            title="Confirmar identidad"
            status={identityConfirmed ? 'Listo' : 'Pendiente'}
            subtitle="Esta confirmación permite continuar con la acción pendiente."
            tone={identityConfirmed ? 'success' : 'muted'}
          />
          {!identityConfirmed ? (
            <>
              <View style={styles.inlineActionRow}>
                {session.biometricAvailable ? (
                  <PrimaryAction
                    compact
                    disabled={securityBusyKey !== null}
                    fullWidth={false}
                    icon="finger-print"
                    label={`Usar ${session.biometricLabel}`}
                    loading={securityBusyKey === 'identity-biometric'}
                    onPress={() => void handleConfirmIdentity('biometric')}
                  />
                ) : null}
                {socialTrustMethods.map((method) => (
                  <PrimaryAction
                    compact
                    disabled={securityBusyKey !== null}
                    fullWidth={false}
                    key={`identity-${method}`}
                    label={method === 'google' ? 'Confirmar con Google' : 'Confirmar con Apple'}
                    loading={securityBusyKey === `identity-${method}`}
                    onPress={() => void handleConfirmIdentity(method)}
                  />
                ))}
                {session.linkedMethods.hasEmailPassword ? (
                  <PrimaryAction
                    compact
                    disabled={securityBusyKey !== null}
                    fullWidth={false}
                    label="Usar contraseña"
                    onPress={() => setIdentityPasswordOpen((open) => !open)}
                  />
                ) : null}
              </View>
              {identityPasswordOpen ? (
                <>
                  <PasswordTextInput
                    autoCapitalize="none"
                    onChangeText={setIdentityPassword}
                    onSubmitEditing={() => void handleConfirmIdentity('password')}
                    placeholder="Tu contraseña actual"
                    placeholderTextColor={theme.colors.muted}
                    value={identityPassword}
                  />
                  <View style={styles.inlineActionRow}>
                    <PrimaryAction
                      compact
                      disabled={securityBusyKey !== null || !identityPassword.trim()}
                      fullWidth={false}
                      label="Confirmar contraseña"
                      loading={securityBusyKey === 'identity-password'}
                      onPress={() => void handleConfirmIdentity('password')}
                    />
                  </View>
                </>
              ) : null}
              {!session.biometricAvailable ? (
                <AppText style={[styles.helperText, dynamicStyles.helperText]}>
                  Puedes confirmar con un método de tu cuenta o comprobar la biometría abajo.
                </AppText>
              ) : null}
            </>
          ) : null}
        </View>
      ) : null}
      <>
        <View style={[styles.separator, dynamicStyles.separator]} />

        <SecurityStatusRow
          icon="finger-print"
          subtitle={
            session.setupState.biometricsEligible
              ? session.biometricLabel
              : session.biometricAvailable
                ? 'Primero confía este teléfono'
                : 'Comprueba la huella o rostro del teléfono'
          }
          title="Biometría"
          tone={session.biometricsEnabled ? 'success' : 'muted'}
          trailing={
            <Switch
              disabled={
                securityBusyKey !== null || (!session.isTrustedDevice && !session.biometricsEnabled)
              }
              onValueChange={(nextValue) => void handleBiometricToggle(nextValue)}
              trackColor={{
                false: activeTheme.colors.surfaceSoft,
                true: activeTheme.colors.primarySoft,
              }}
              value={session.biometricsEnabled}
            />
          }
        />
        {!session.biometricAvailable ? (
          <View style={styles.securityAction}>
            <AppText style={[styles.helperText, dynamicStyles.helperText]}>
              Configura una huella o rostro en Seguridad del teléfono. Happy Circles comprobará de
              nuevo al volver.
              {Platform.OS === 'android'
                ? ' En Android no hay un permiso de biometría que debas activar para la app.'
                : ''}
            </AppText>
            <View style={styles.inlineActionRow}>
              <PrimaryAction
                compact
                disabled={securityBusyKey !== null}
                fullWidth={false}
                label="Volver a comprobar"
                loading={securityBusyKey === 'check-biometrics'}
                onPress={() => void handleCheckBiometrics()}
              />
            </View>
          </View>
        ) : null}
      </>
    </>
  );
}
