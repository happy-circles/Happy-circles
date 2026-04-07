import { useLocalSearchParams } from 'expo-router';

import { RelationshipDetailScreen } from '@/features/relationships/relationship-detail-screen';

export default function RelationshipDetailRoute() {
  const params = useLocalSearchParams<{ userId: string }>();
  return <RelationshipDetailScreen userId={params.userId ?? ''} />;
}
