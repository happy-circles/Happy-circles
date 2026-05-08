import { Ionicons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { IdentityFlowSecondaryAction } from '@/components/identity-flow';
import { theme } from '@/lib/theme';
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
              pressed && !authBusy ? styles.pressed : null,
              authBusy ? styles.disabledAction : null,
            ]}
          >
            <Ionicons color="#ffffff" name="logo-apple" size={18} />
            <AppText style={styles.socialProviderButtonTextApple}>
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
            pressed && !authBusy ? styles.pressed : null,
            authBusy ? styles.disabledAction : null,
          ]}
        >
          <Ionicons color={theme.colors.brandGreen} name="logo-google" size={18} />
          <AppText style={styles.socialProviderButtonTextGoogle}>
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
