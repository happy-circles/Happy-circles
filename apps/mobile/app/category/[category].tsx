import { Stack, useLocalSearchParams } from 'expo-router';

import { CategoryDetailScreen } from '@/features/categories/category-detail-screen';
import { theme } from '@/lib/theme';
import { transactionCategoryLabel } from '@/lib/transaction-categories';

export default function CategoryDetailRoute() {
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
          headerStyle: { backgroundColor: theme.colors.background },
          headerTintColor: theme.colors.text,
          headerTitleStyle: { color: theme.colors.text, fontWeight: '700' },
        }}
      />
      <CategoryDetailScreen category={category} initialPeriod={rawPeriod} />
    </>
  );
}
