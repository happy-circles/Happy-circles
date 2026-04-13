import { Stack } from 'expo-router';

import { InviteLinkScreen } from '@/features/invites/invite-link-screen';
import { theme } from '@/lib/theme';

export default function InviteLinkRoute() {
  return (
    <>
      <Stack.Screen
        options={{
          title: 'Invitacion de amistad',
          presentation: 'modal',
          headerBackTitle: '',
          headerShadowVisible: false,
          headerStyle: { backgroundColor: theme.colors.background },
          headerTintColor: theme.colors.text,
          headerTitleStyle: { color: theme.colors.text, fontWeight: '700' },
        }}
      />
      <InviteLinkScreen />
    </>
  );
}
