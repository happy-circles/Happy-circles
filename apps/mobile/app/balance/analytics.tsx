import { Stack, useLocalSearchParams } from 'expo-router';

import {
  BalanceOverviewScreen,
  type BalanceFocus,
} from '@/features/balance/balance-overview-screen';
import { theme } from '@/lib/theme';

function segmentToFocus(segment: string | null): BalanceFocus {
  if (segment === 'people') {
    return 'people';
  }

  if (segment === 'categories') {
    return 'categories';
  }

  if (segment === 'settlements') {
    return 'settlements';
  }

  if (segment === 'projection') {
    return 'projection';
  }

  return 'balance';
}

export default function BalanceAnalyticsRoute() {
  const params = useLocalSearchParams<{ segment?: string }>();
  const initialSegment = typeof params.segment === 'string' ? params.segment : null;

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
      <BalanceOverviewScreen initialFocus={segmentToFocus(initialSegment)} />
    </>
  );
}
