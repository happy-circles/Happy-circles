import { Stack, useLocalSearchParams } from 'expo-router';

import { SettlementDetailScreen } from '@/features/settlements/settlement-detail-screen';
import { useAppTheme } from '@/providers/theme-provider';

export default function SettlementDetailRoute() {
  const activeTheme = useAppTheme();
  const params = useLocalSearchParams<{ id?: string }>();
  const proposalId = typeof params.id === 'string' ? params.id : '';

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Happy Circle',
          headerBackTitle: '',
          headerShadowVisible: false,
          headerStyle: { backgroundColor: activeTheme.colors.background },
          headerTintColor: activeTheme.colors.text,
          headerTitleStyle: { color: activeTheme.colors.text, fontWeight: '700' },
        }}
      />
      <SettlementDetailScreen proposalId={proposalId} />
    </>
  );
}
