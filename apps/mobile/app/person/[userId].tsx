import { Stack, useLocalSearchParams } from 'expo-router';

import { PersonDetailScreen } from '@/features/people/person-detail-screen';
import { theme } from '@/lib/theme';

export default function PersonDetailRoute() {
  const params = useLocalSearchParams<{ userId?: string }>();
  const userId = typeof params.userId === 'string' ? params.userId : '';

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Persona',
          headerBackTitle: '',
          headerShadowVisible: false,
          headerStyle: { backgroundColor: theme.colors.background },
          headerTintColor: theme.colors.text,
          headerTitleStyle: { color: theme.colors.text, fontWeight: '700' },
        }}
      />
      <PersonDetailScreen userId={userId} />
    </>
  );
}
