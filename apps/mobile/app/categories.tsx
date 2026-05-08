import { useLocalSearchParams } from 'expo-router';

import { CategoriesIndexScreen } from '@/features/categories/categories-index-screen';

export default function CategoriesRoute() {
  const { category, period } = useLocalSearchParams<{
    category?: string | string[];
    period?: string | string[];
  }>();
  const initialCategory = Array.isArray(category) ? category[0] : category;
  const initialPeriod = Array.isArray(period) ? period[0] : period;

  return <CategoriesIndexScreen initialCategory={initialCategory} initialPeriod={initialPeriod} />;
}
