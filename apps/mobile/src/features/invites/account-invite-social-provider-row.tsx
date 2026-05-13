import { Ionicons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { useAppTheme } from '@/providers/theme-provider';
import type { SocialProvider } from './account-invite-entry-helpers';
import { accountInviteEntryStyles as styles } from './account-invite-entry-screen.styles';

interface AccountInviteSocialProviderRowProps {
  readonly appleSignInAvailable: boolean;
  readonly authBusy: boolean;
  readonly onApplePress: () => void;
  readonly onGooglePress: () => void;
  readonly socialBusyProvider: SocialProvider | null;
}

export function AccountInviteSocialProviderRow({
  appleSignInAvailable,
  authBusy,
  onApplePress,
  onGooglePress,
  socialBusyProvider,
}: AccountInviteSocialProviderRowProps) {
  const activeTheme = useAppTheme();

  return (
    <View style={styles.socialProviderRow}>
      {appleSignInAvailable ? (
        <Pressable
          disabled={authBusy}
          onPress={onApplePress}
          style={({ pressed }) => [
            styles.socialProviderButton,
            styles.appleProviderButton,
            {
              backgroundColor: activeTheme.colors.appleButton,
              borderColor:
                activeTheme.scheme === 'dark'
                  ? activeTheme.colors.border
                  : activeTheme.colors.appleButton,
            },
            pressed && !authBusy ? styles.pressed : null,
            authBusy ? styles.actionDisabled : null,
          ]}
        >
          <Ionicons color={activeTheme.colors.white} name="logo-apple" size={18} />
          <AppText
            color={activeTheme.colors.white}
            style={[
              styles.socialProviderText,
              styles.appleProviderText,
            ]}
          >
            {socialBusyProvider === 'apple' ? 'Apple...' : 'Apple'}
          </AppText>
        </Pressable>
      ) : null}

      <Pressable
        disabled={authBusy}
        onPress={onGooglePress}
        style={({ pressed }) => [
          styles.socialProviderButton,
          styles.googleProviderButton,
          {
            backgroundColor:
              activeTheme.scheme === 'dark'
                ? activeTheme.colors.surfaceSoft
                : activeTheme.colors.surface,
            borderColor: activeTheme.colors.border,
          },
          !appleSignInAvailable ? styles.socialProviderButtonFull : null,
          pressed && !authBusy ? styles.pressed : null,
          authBusy ? styles.actionDisabled : null,
        ]}
      >
        <Ionicons color={activeTheme.colors.text} name="logo-google" size={18} />
        <AppText style={[styles.socialProviderText, { color: activeTheme.colors.text }]}>
          {socialBusyProvider === 'google' ? 'Google...' : 'Google'}
        </AppText>
      </Pressable>
    </View>
  );
}
