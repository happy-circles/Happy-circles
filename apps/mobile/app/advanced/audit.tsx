import { Stack } from 'expo-router';

import { ProfileAuditScreen } from '@/features/profile/audit-screen';
import { theme } from '@/lib/theme';

export default function AuditRoute() {
  return (
    <>
      <Stack.Screen
        options={{
          title: 'Auditoria',
          headerBackTitle: '',
          headerShadowVisible: false,
          headerStyle: { backgroundColor: theme.colors.background },
          headerTintColor: theme.colors.text,
          headerTitleStyle: { color: theme.colors.text, fontWeight: '700' },
        }}
      />
      <ProfileAuditScreen />
    </>
  );
}
