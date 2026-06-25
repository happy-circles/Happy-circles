import { Stack, useLocalSearchParams } from 'expo-router';

import { SettlementDetailScreen } from '@/features/settlements/settlement-detail-screen';

export default function SettlementDetailRoute() {
  const params = useLocalSearchParams<{ id?: string }>();
  const proposalId = typeof params.id === 'string' ? params.id : '';

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Detalle',
          headerShown: false,
        }}
      />
      <SettlementDetailScreen proposalId={proposalId} />
    </>
  );
}
