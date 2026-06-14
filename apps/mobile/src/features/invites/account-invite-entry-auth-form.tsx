import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Animated, Pressable, View } from 'react-native';

import { AppText } from '@/components/app-text';
import {
  IdentityFlowField,
  IdentityFlowForm,
  IdentityFlowPasswordInput,
  IdentityFlowSecondaryAction,
  IdentityFlowTextInput,
} from '@/components/identity-flow';
import { OtpCodeInput } from '@/components/otp-code-input';
import type { SocialProvider } from './account-invite-entry-helpers';
import { accountInviteEntryStyles as styles } from './account-invite-entry-screen.styles';
import { AccountInviteSocialProviderRow } from './account-invite-social-provider-row';

interface AccountInviteEntryAuthFormProps {
  readonly accountEmail?: string | null;
  readonly appleSignInAvailable: boolean;
  readonly authBusy: boolean;
  readonly authErrors: {
    readonly email?: string;
    readonly password?: string;
  };
  readonly email: string;
  readonly isRecovery: boolean;
  readonly locksRememberedEmail: boolean;
  readonly onEmailBlur: () => boolean;
  readonly onEmailChange: (value: string) => void;
  readonly onForgotPasswordPress: () => void;
  readonly onPasswordBlur: () => boolean;
  readonly onPasswordChange: (value: string) => void;
  readonly onPasswordFallbackToggle: () => void;
  readonly onPasswordRecovery: () => void;
  readonly onRecoveryCodeChange: (value: string) => void;
  readonly onSocialPress: (provider: SocialProvider) => void;
  readonly password: string;
  readonly placeholderTextColor: string;
  readonly primaryAction: ReactNode;
  readonly recoveryCode: string;
  readonly recoveryCodeValid: boolean;
  readonly recoveryLinkSent: boolean;
  readonly recoveryResendSeconds: number;
  readonly showAuthOptions: boolean;
  readonly showPasswordFallback: boolean;
  readonly showPasswordFields: boolean;
  readonly socialBusyProvider: SocialProvider | null;
  readonly style: StyleProp<ViewStyle>;
}

export function AccountInviteEntryAuthForm({
  accountEmail,
  appleSignInAvailable,
  authBusy,
  authErrors,
  email,
  isRecovery,
  locksRememberedEmail,
  onEmailBlur,
  onEmailChange,
  onForgotPasswordPress,
  onPasswordBlur,
  onPasswordChange,
  onPasswordFallbackToggle,
  onPasswordRecovery,
  onRecoveryCodeChange,
  onSocialPress,
  password,
  placeholderTextColor,
  primaryAction,
  recoveryCode,
  recoveryCodeValid,
  recoveryLinkSent,
  recoveryResendSeconds,
  showAuthOptions,
  showPasswordFallback,
  showPasswordFields,
  socialBusyProvider,
  style,
}: AccountInviteEntryAuthFormProps) {
  const emailValue = locksRememberedEmail ? accountEmail : email;

  return (
    <Animated.View style={[styles.socialActions, style]}>
      <IdentityFlowForm style={showPasswordFields ? styles.emailAuthForm : undefined}>
        {!isRecovery ? (
          <View style={styles.authSecondaryBlock}>
            <AccountInviteSocialProviderRow
              appleSignInAvailable={appleSignInAvailable}
              authBusy={authBusy}
              onApplePress={() => onSocialPress('apple')}
              onGooglePress={() => onSocialPress('google')}
              socialBusyProvider={socialBusyProvider}
            />
          </View>
        ) : null}

        {!isRecovery ? (
          <IdentityFlowSecondaryAction
            disabled={authBusy}
            icon={showPasswordFallback ? 'chevron-up' : 'mail'}
            label={showPasswordFallback ? 'Correo y contraseña' : 'Usar correo y contraseña'}
            onPress={onPasswordFallbackToggle}
            style={styles.emailAccordionToggle}
          />
        ) : null}

        {showPasswordFields ? (
          <>
            <View style={styles.emailCredentialFields}>
              <IdentityFlowField
                error={authErrors.email ?? null}
                icon="mail"
                label="Correo"
                status={
                  authErrors.email ? 'danger' : (emailValue ?? '').trim() ? 'success' : 'idle'
                }
              >
                <IdentityFlowTextInput
                  autoCapitalize="none"
                  autoComplete="email"
                  editable={!locksRememberedEmail}
                  keyboardType="email-address"
                  onBlur={onEmailBlur}
                  onChangeText={onEmailChange}
                  placeholder="tu@correo.com"
                  placeholderTextColor={placeholderTextColor}
                  value={email}
                />
              </IdentityFlowField>

              {isRecovery && recoveryLinkSent ? (
                <View style={styles.recoveryCodeBlock}>
                  <AppText style={styles.recoveryCodeHelp}>
                    Abre el enlace o pega el código de 8 dígitos del correo.
                  </AppText>
                  <OtpCodeInput
                    disabled={authBusy}
                    hasError={recoveryCode.length > 0 && !recoveryCodeValid}
                    onChangeText={onRecoveryCodeChange}
                    value={recoveryCode}
                  />
                  <Pressable
                    accessibilityRole="button"
                    disabled={authBusy || recoveryResendSeconds > 0}
                    onPress={
                      authBusy || recoveryResendSeconds > 0 ? undefined : onPasswordRecovery
                    }
                    style={({ pressed }) => [
                      styles.recoveryResendButton,
                      pressed && !authBusy && recoveryResendSeconds === 0
                        ? styles.pressed
                        : null,
                      authBusy || recoveryResendSeconds > 0 ? styles.actionDisabled : null,
                    ]}
                  >
                    <AppText style={styles.recoveryResendText}>
                      {recoveryResendSeconds > 0
                        ? `Reenviar enlace en ${recoveryResendSeconds}s`
                        : 'Reenviar enlace'}
                    </AppText>
                  </Pressable>
                </View>
              ) : null}

              {!isRecovery ? (
                <View style={styles.passwordFieldGroup}>
                  <IdentityFlowField
                    error={authErrors.password ?? null}
                    icon="lock-closed"
                    label="Contraseña"
                    status={authErrors.password ? 'danger' : password ? 'success' : 'idle'}
                  >
                    <IdentityFlowPasswordInput
                      autoCapitalize="none"
                      autoComplete="password"
                      onBlur={onPasswordBlur}
                      onChangeText={onPasswordChange}
                      placeholder="Tu contraseña"
                      placeholderTextColor={placeholderTextColor}
                      value={password}
                    />
                  </IdentityFlowField>

                  {showAuthOptions ? (
                    <Pressable
                      disabled={authBusy}
                      onPress={authBusy ? undefined : onForgotPasswordPress}
                      style={({ pressed }) => [
                        styles.forgotPasswordInline,
                        !authErrors.password ? styles.forgotPasswordInlineLifted : null,
                        pressed && !authBusy ? styles.pressed : null,
                        authBusy ? styles.actionDisabled : null,
                      ]}
                    >
                      <AppText style={styles.forgotPasswordInlineText}>
                        Olvidé mi contraseña
                      </AppText>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </View>
            {primaryAction}
          </>
        ) : null}
      </IdentityFlowForm>
    </Animated.View>
  );
}
