import { Ionicons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { IdentityFlowSecondaryAction } from '@/components/identity-flow';
import { useAppTheme } from '@/providers/theme-provider';
import { accountCreateAccountStyles as styles } from './account-create-account-screen.styles';
import type { SocialProvider } from './account-invite-entry-helpers';

interface AccountCreateAccountSocialOptionsProps {
  readonly appleSignInAvailable: boolean;
  readonly authBusy: boolean;
  readonly onSocialCreate: (provider: SocialProvider) => void;
  readonly onToggleEmailPassword: () => void;
  readonly showEmailPasswordFallback: boolean;
  readonly socialBusyProvider: SocialProvider | null;
}

export function AccountCreateAccountSocialOptions({
  appleSignInAvailable,
  authBusy,
  onSocialCreate,
  onToggleEmailPassword,
  showEmailPasswordFallback,
  socialBusyProvider,
}: AccountCreateAccountSocialOptionsProps) {
  const activeTheme = useAppTheme();

  return (
    <>
      <View style={styles.socialProviderStack}>
        {appleSignInAvailable ? (
          <Pressable
            disabled={authBusy}
            onPress={authBusy ? undefined : () => onSocialCreate('apple')}
            style={({ pressed }) => [
              styles.socialProviderButton,
              styles.socialProviderButtonApple,
              {
                backgroundColor: activeTheme.colors.appleButton,
                borderColor:
                  activeTheme.scheme === 'dark'
                    ? activeTheme.colors.border
                    : activeTheme.colors.appleButton,
              },
              pressed && !authBusy ? styles.pressed : null,
              authBusy ? styles.disabledAction : null,
            ]}
          >
            <Ionicons color={activeTheme.colors.white} name="logo-apple" size={18} />
            <AppText
              color={activeTheme.colors.white}
              style={styles.socialProviderButtonTextApple}
            >
              {socialBusyProvider === 'apple' ? 'Abriendo Apple...' : 'Continuar con Apple'}
            </AppText>
          </Pressable>
        ) : null}

        <Pressable
          disabled={authBusy}
          onPress={authBusy ? undefined : () => onSocialCreate('google')}
          style={({ pressed }) => [
            styles.socialProviderButton,
            styles.socialProviderButtonGoogle,
            {
              backgroundColor:
                activeTheme.scheme === 'dark'
                  ? activeTheme.colors.surfaceSoft
                  : activeTheme.colors.surface,
              borderColor: activeTheme.colors.border,
            },
            pressed && !authBusy ? styles.pressed : null,
            authBusy ? styles.disabledAction : null,
          ]}
        >
          <Ionicons color={activeTheme.colors.brandGreen} name="logo-google" size={18} />
          <AppText
            style={[styles.socialProviderButtonTextGoogle, { color: activeTheme.colors.text }]}
          >
            {socialBusyProvider === 'google' ? 'Abriendo Google...' : 'Continuar con Google'}
          </AppText>
        </Pressable>
      </View>

      <IdentityFlowSecondaryAction
        disabled={authBusy}
        icon={showEmailPasswordFallback ? 'chevron-up' : 'mail'}
        label={
          showEmailPasswordFallback ? 'Ocultar correo y contrasena' : 'Usar correo y contrasena'
        }
        onPress={onToggleEmailPassword}
      />
    </>
  );
}
