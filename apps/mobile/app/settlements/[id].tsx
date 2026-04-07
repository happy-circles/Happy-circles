import { useLocalSearchParams } from 'expo-router';

import { SettlementDetailScreen } from '@/features/settlements/settlement-detail-screen';

export default function SettlementDetailRoute() {
  const params = useLocalSearchParams<{ id: string }>();
  return <SettlementDetailScreen proposalId={params.id ?? ''} />;
}
