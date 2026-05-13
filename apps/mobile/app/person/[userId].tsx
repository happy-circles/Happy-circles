import { Stack, useLocalSearchParams } from 'expo-router';

import { PersonDetailScreen } from '@/features/people/person-detail-screen';
import { useAppTheme } from '@/providers/theme-provider';

export default function PersonDetailRoute() {
  const activeTheme = useAppTheme();
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
          headerBackTitle: '',
          headerShadowVisible: false,
          headerStyle: { backgroundColor: activeTheme.colors.background },
          headerTintColor: activeTheme.colors.text,
          headerTitleStyle: { color: activeTheme.colors.text, fontWeight: '700' },
        }}
      />
      <PersonDetailScreen focusItemId={focusItemId} initialPanel={initialPanel} userId={userId} />
    </>
  );
}
