import { Stack } from 'expo-router';

import { ProfileConnectionScreen } from '@/features/invites/profile-connection-screen';
import { theme } from '@/lib/theme';

export default function ProfileConnectionRoute() {
  return (
    <>
      <Stack.Screen
        options={{
          title: 'Conectar por QR',
          presentation: 'modal',
          headerBackTitle: '',
          headerShadowVisible: false,
          headerStyle: { backgroundColor: theme.colors.background },
          headerTintColor: theme.colors.text,
          headerTitleStyle: { color: theme.colors.text, fontWeight: '700' },
        }}
      />
      <ProfileConnectionScreen />
    </>
  );
}
