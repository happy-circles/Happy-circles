import { Stack, useLocalSearchParams } from 'expo-router';

import { BalanceOverviewScreen } from '@/features/balance/balance-overview-screen';
import { theme } from '@/lib/theme';

export default function BalanceRoute() {
  const params = useLocalSearchParams<{ segment?: string | string[] }>();
  const rawSegment = Array.isArray(params.segment) ? params.segment[0] : params.segment;

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Balance',
          headerBackTitle: '',
          headerShadowVisible: false,
          headerStyle: { backgroundColor: theme.colors.background },
          headerTintColor: theme.colors.text,
          headerTitleStyle: { color: theme.colors.text, fontWeight: '700' },
        }}
      />
      <BalanceOverviewScreen initialFocus={rawSegment ?? null} />
    </>
  );
}
