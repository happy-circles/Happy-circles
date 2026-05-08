import { useEffect, useState } from 'react';
import { View } from 'react-native';

import type {
  ActivityItemDto,
  BalanceAnalyticsCategoryRowDto,
  BalanceAnalyticsPeriod,
} from '@happy-circles/application';

import { EmptyState } from '@/components/empty-state';
import { HappyCirclesMotion } from '@/components/happy-circles-motion';
import { ScreenShell } from '@/components/screen-shell';
import { SegmentedControl, type SegmentedOption } from '@/components/segmented-control';
import { useSyncedBalanceAnalyticsPeriod } from '@/features/balance/balance-period-selection';
import { useAppSnapshot } from '@/lib/live-data';
import { categoriesIndexScreenStyles as styles } from './categories-index-screen-styles';
import {
  ActiveCategoryPill,
  CategoriesSummaryCard,
  CategoryRow,
  CategoryTransactionCard,
} from './categories-index-cards';
import { buildLatestHistoryCaseItems, isHistoryCaseItem } from '@/lib/history-cases';
import { normalizeTransactionCategory } from '@/lib/transaction-categories';
import {
  isConsolidatedTransactionItem,
  transactionVisualCategory,
} from '@/lib/transaction-presentation';
import { useSnapshotRefresh } from '@/lib/use-snapshot-refresh';
import { AppText } from '@/components/app-text';

const PERIOD_OPTIONS: readonly SegmentedOption<BalanceAnalyticsPeriod>[] = [
  { label: 'Semana', value: 'week' },
  { label: 'Mes', value: 'month' },
  { label: 'Ano', value: 'year' },
  { label: 'Todo', value: 'all' },
];

function matchesCategory(
  item: ActivityItemDto,
  category: BalanceAnalyticsCategoryRowDto['category'],
): boolean {
  return transactionVisualCategory(item) === category;
}

export function CategoriesIndexScreen({
  initialCategory,
  initialPeriod,
}: {
  readonly initialCategory?: string | null;
  readonly initialPeriod?: string | null;
}) {
  const snapshotQuery = useAppSnapshot();
  const refresh = useSnapshotRefresh(snapshotQuery);
  const analytics = snapshotQuery.data?.balanceAnalytics ?? null;
  const [period, setPeriod] = useSyncedBalanceAnalyticsPeriod({
    defaultPeriod: analytics?.defaultPeriod,
    initialPeriod,
  });
  const [selectedCategory, setSelectedCategory] = useState<
    BalanceAnalyticsCategoryRowDto['category'] | null
  >(() => (initialCategory ? normalizeTransactionCategory(initialCategory) : null));

  useEffect(() => {
    if (initialCategory) {
      setSelectedCategory(normalizeTransactionCategory(initialCategory));
    }
  }, [initialCategory]);

  if (snapshotQuery.error && !analytics) {
    return (
      <ScreenShell headerVariant="plain" largeTitle={false} refresh={refresh} title="Categorias">
        <AppText style={styles.supportText}>{snapshotQuery.error.message}</AppText>
      </ScreenShell>
    );
  }

  if (snapshotQuery.isLoading || !analytics) {
    return (
      <ScreenShell headerVariant="plain" largeTitle={false} title="Categorias">
        <View style={styles.loadingState}>
          <HappyCirclesMotion size={108} variant="loading" />
          <AppText style={styles.supportText}>Estamos organizando tus categorias.</AppText>
        </View>
      </ScreenShell>
    );
  }

  const currentPeriod = analytics.periods[period];
  const summary = currentPeriod.summaries.balance;
  const people = snapshotQuery.data?.dashboard.activePeople ?? snapshotQuery.data?.people ?? [];
  const categories = [...currentPeriod.categories].sort((left, right) => {
    const amountDiff = Math.abs(right.netMinor) - Math.abs(left.netMinor);
    if (amountDiff !== 0) {
      return amountDiff;
    }

    return right.movementCount - left.movementCount;
  });
  const selectedCategoryRow =
    selectedCategory === null
      ? null
      : (categories.find((row) => row.category === selectedCategory) ?? null);
  const historyItems =
    selectedCategory === null
      ? []
      : (
          snapshotQuery.data?.activitySections.find((section) => section.key === 'history')
            ?.items ?? []
        )
          .filter(isConsolidatedTransactionItem)
          .filter(isHistoryCaseItem)
          .filter((item) => matchesCategory(item, selectedCategory));
  const visibleHistoryItems = buildLatestHistoryCaseItems(historyItems);

  return (
    <ScreenShell headerVariant="plain" largeTitle={false} refresh={refresh} title="Categorias">
      <CategoriesSummaryCard
        categoryCount={categories.length}
        deltaMinor={summary.deltaMinor}
        label={currentPeriod.labels.current}
        movementCount={summary.movementCount}
        topCategories={categories}
        totalMinor={summary.finalMinor}
      />

      <SegmentedControl
        label="Periodo"
        onChange={setPeriod}
        options={PERIOD_OPTIONS}
        value={period}
      />

      {selectedCategory ? (
        <>
          <ActiveCategoryPill
            fallbackCategory={selectedCategory}
            onClear={() => setSelectedCategory(null)}
            row={selectedCategoryRow}
          />
          {selectedCategoryRow ? (
            <CategoryRow
              actionIcon="checkmark-circle-outline"
              onPress={() => setSelectedCategory(null)}
              row={selectedCategoryRow}
            />
          ) : null}

          {visibleHistoryItems.length === 0 ? (
            <EmptyState
              description="No hay transacciones cerradas para esta categoria."
              title="Sin historial"
            />
          ) : (
            <View style={styles.list}>
              {visibleHistoryItems.map((item) => (
                <CategoryTransactionCard item={item} key={item.id} people={people} />
              ))}
            </View>
          )}
        </>
      ) : categories.length === 0 ? (
        <EmptyState
          description="Cuando registres movimientos, podras ver el balance por categoria."
          title="Sin categorias todavia"
        />
      ) : (
        <View style={styles.list}>
          {categories.map((row) => (
            <CategoryRow
              key={row.key}
              onPress={() => setSelectedCategory(row.category)}
              row={row}
            />
          ))}
        </View>
      )}
    </ScreenShell>
  );
}
