import { Stack } from 'expo-router';

import { InvitePersonScreen } from '@/features/invites/invite-person-screen';
import { theme } from '@/lib/theme';

export default function InviteRoute() {
  return (
    <>
      <Stack.Screen
        options={{
          title: 'Invitaciones',
          presentation: 'modal',
          headerBackTitle: '',
          headerShadowVisible: false,
          headerStyle: { backgroundColor: theme.colors.background },
          headerTintColor: theme.colors.text,
          headerTitleStyle: { color: theme.colors.text, fontWeight: '700' },
        }}
      />
      <InvitePersonScreen />
    </>
  );
}
