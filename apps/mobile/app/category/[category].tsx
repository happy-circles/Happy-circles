import { Stack, useLocalSearchParams } from 'expo-router';

import { CategoryDetailScreen } from '@/features/categories/category-detail-screen';
import { transactionCategoryLabel } from '@/lib/transaction-categories';
import { useAppTheme } from '@/providers/theme-provider';

export default function CategoryDetailRoute() {
  const activeTheme = useAppTheme();
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
          headerBackTitle: '',
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
