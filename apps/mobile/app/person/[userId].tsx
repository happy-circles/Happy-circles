import { Stack, useLocalSearchParams } from 'expo-router';

import { PersonDetailScreen } from '@/features/people/person-detail-screen';

export default function PersonDetailRoute() {
  const params = useLocalSearchParams<{
    focus?: string | string[];
    panel?: string | string[];
    userId?: string;
  }>();
  const userId = typeof params.userId === 'string' ? params.userId : '';
  const rawPanel = Array.isArray(params.panel) ? params.panel[0] : params.panel;
  const initialPanel = rawPanel === 'pending' || rawPanel === 'history' ? rawPanel : undefined;
  const rawFocus = Array.isArray(params.focus) ? params.focus[0] : params.focus;
  const focusItemId = rawFocus && rawFocus.length > 0 ? rawFocus : undefined;

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Persona',
          headerShown: false,
        }}
      />
      <PersonDetailScreen focusItemId={focusItemId} initialPanel={initialPanel} userId={userId} />
    </>
  );
}
