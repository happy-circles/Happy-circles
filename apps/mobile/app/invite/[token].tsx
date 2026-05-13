import { Stack } from 'expo-router';

import { InviteLinkScreen } from '@/features/invites/invite-link-screen';
import { useAppTheme } from '@/providers/theme-provider';

export default function InviteLinkRoute() {
  const activeTheme = useAppTheme();

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Invitacion de amistad',
          presentation: 'modal',
          headerBackTitle: '',
          headerShadowVisible: false,
          headerStyle: { backgroundColor: activeTheme.colors.background },
          headerTintColor: activeTheme.colors.text,
          headerTitleStyle: { color: activeTheme.colors.text, fontWeight: '700' },
        }}
      />
      <InviteLinkScreen />
    </>
  );
}
