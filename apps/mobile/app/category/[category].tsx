import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { AppHeaderBackButton } from '@/components/app-header-back-button';
import { CategoryDetailScreen } from '@/features/categories/category-detail-screen';
import { backOrReturnTo } from '@/lib/navigation';
import { transactionCategoryLabel } from '@/lib/transaction-categories';
import { useAppTheme } from '@/providers/theme-provider';

export default function CategoryDetailRoute() {
  const activeTheme = useAppTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{
    category?: string;
    period?: string | string[];
  }>();
  const category = typeof params.category === 'string' ? params.category : 'other';
  const rawPeriod = Array.isArray(params.period) ? params.period[0] : params.period;

  return (
    <>
      <Stack.Screen
        options={{
          title: transactionCategoryLabel(category),
          headerBackVisible: false,
          headerBackTitle: '',
          headerLeft: () => (
            <AppHeaderBackButton onPress={() => backOrReturnTo(router, '/categories')} />
          ),
          headerShown: true,
          headerShadowVisible: false,
          headerStyle: { backgroundColor: activeTheme.colors.background },
          headerTintColor: activeTheme.colors.text,
          headerTitleStyle: { color: activeTheme.colors.text, fontWeight: '700' },
        }}
      />
      <CategoryDetailScreen category={category} initialPeriod={rawPeriod} />
    </>
  );
}
