import { Stack } from 'expo-router';

import { RegisterFlowScreen } from '@/features/register/register-flow-screen';
import { theme } from '@/lib/theme';

export default function RegisterRoute() {
  return (
    <>
      <Stack.Screen
        options={{
          title: 'Registrar',
          presentation: 'modal',
          headerBackTitle: '',
          headerShadowVisible: false,
          headerStyle: { backgroundColor: theme.colors.background },
          headerTintColor: theme.colors.text,
          headerTitleStyle: { color: theme.colors.text, fontWeight: '700' },
        }}
      />
      <RegisterFlowScreen />
    </>
  );
}
