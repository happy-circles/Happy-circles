import { Stack, useLocalSearchParams } from 'expo-router';

import { BalanceAnalyticsScreen } from '@/features/balance/balance-analytics-screen';
import { theme } from '@/lib/theme';

export default function BalanceAnalyticsRoute() {
  const params = useLocalSearchParams<{ segment?: string }>();
  const initialSegment = typeof params.segment === 'string' ? params.segment : null;

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Analitica',
          headerBackTitle: '',
          headerShadowVisible: false,
          headerStyle: { backgroundColor: theme.colors.background },
          headerTintColor: theme.colors.text,
          headerTitleStyle: { color: theme.colors.text, fontWeight: '700' },
        }}
      />
      <BalanceAnalyticsScreen initialSegment={initialSegment} />
    </>
  );
}
