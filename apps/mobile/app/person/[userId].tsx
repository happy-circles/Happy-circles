import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { AppHeaderBackButton } from '@/components/app-header-back-button';
import { PersonDetailScreen } from '@/features/people/person-detail-screen';
import { backOrReturnTo } from '@/lib/navigation';
import { useAppTheme } from '@/providers/theme-provider';

export default function PersonDetailRoute() {
  const activeTheme = useAppTheme();
  const router = useRouter();
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
          headerBackVisible: false,
          headerBackTitle: '',
          headerLeft: () => (
            <AppHeaderBackButton onPress={() => backOrReturnTo(router, '/people')} />
          ),
          headerShown: true,
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
