import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type {
  ActivityItemDto,
  BalanceAnalyticsCategoryRowDto,
  BalanceAnalyticsPeriod,
} from '@happy-circles/application';

import { EmptyState } from '@/components/empty-state';
import { HappyCirclesMotion } from '@/components/happy-circles-motion';
import { ScreenShell } from '@/components/screen-shell';
import { SegmentedControl, type SegmentedOption } from '@/components/segmented-control';
import { AppTextInput } from '@/components/app-text-input';
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
import { theme } from '@/lib/theme';
import { useSnapshotRefresh } from '@/lib/use-snapshot-refresh';
import { AppText } from '@/components/app-text';

const PERIOD_OPTIONS: readonly SegmentedOption<BalanceAnalyticsPeriod>[] = [
  { label: 'Semana', value: 'week' },
  { label: 'Mes', value: 'month' },
  { label: 'Año', value: 'year' },
  { label: 'Todo', value: 'all' },
];

function normalizedText(value: string | number | null | undefined): string {
  return `${value ?? ''}`.trim().toLocaleLowerCase('es-CO');
}

function matchesCategory(
  item: ActivityItemDto,
  category: BalanceAnalyticsCategoryRowDto['category'],
): boolean {
  return transactionVisualCategory(item) === category;
}

function movementCountLabel(count: number): string {
  return `${count} movimiento${count === 1 ? '' : 's'}`;
}

function categoryMatchesQuery(row: BalanceAnalyticsCategoryRowDto, query: string): boolean {
  const normalizedQuery = normalizedText(query);

  if (!normalizedQuery) {
    return true;
  }

  return [row.category, row.label, movementCountLabel(row.movementCount), ...row.personLabels].some(
    (value) => normalizedText(value).includes(normalizedQuery),
  );
}

function activityMatchesQuery(item: ActivityItemDto, query: string): boolean {
  const normalizedQuery = normalizedText(query);

  if (!normalizedQuery) {
    return true;
  }

  return [
    item.title,
    item.subtitle,
    item.detail,
    item.counterpartyLabel,
    item.flowLabel,
    item.category,
    item.status,
  ].some((value) => normalizedText(value).includes(normalizedQuery));
}

export function CategoriesIndexScreen({
  initialCategory,
  initialPeriod,
}: {
  readonly initialCategory?: string | null;
  readonly initialPeriod?: string | null;
}) {
  const { top: topInset } = useSafeAreaInsets();
  const snapshotQuery = useAppSnapshot();
  const refresh = useSnapshotRefresh(snapshotQuery);
  const analytics = snapshotQuery.data?.balanceAnalytics ?? null;
  const [query, setQuery] = useState('');
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
      <ScreenShell headerVariant="plain" largeTitle={false} refresh={refresh} title="Categorías">
        <AppText style={styles.supportText}>{snapshotQuery.error.message}</AppText>
      </ScreenShell>
    );
  }

  if (snapshotQuery.isLoading || !analytics) {
    return (
      <ScreenShell headerVariant="plain" largeTitle={false} title="Categorías">
        <View style={styles.loadingState}>
          <HappyCirclesMotion size={108} variant="loading" />
          <AppText style={styles.supportText}>Estamos organizando tus categorías.</AppText>
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
  const visibleCategoryRows = categories.filter((row) => categoryMatchesQuery(row, query));
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
  const visibleHistoryItems = buildLatestHistoryCaseItems(historyItems).filter((item) =>
    activityMatchesQuery(item, query),
  );

  return (
    <ScreenShell
      contentContainerStyle={styles.categoriesScreenContent}
      contentMode="full"
      headerVisible={false}
      refresh={refresh}
      safeAreaEdges={['left', 'right']}
      title="Categorías"
    >
      <View style={[styles.categoriesTopChrome, { paddingTop: topInset + theme.spacing.md }]}>
        <View style={styles.containedContent}>
          <View style={styles.categoriesHeader}>
            <AppText style={styles.categoriesHeaderTitle}>Categorías</AppText>
          </View>
        </View>

        <View style={styles.topVisualBand}>
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
        </View>
      </View>

      <View style={styles.containedContent}>
        <View style={styles.searchWrap}>
          <Ionicons color={theme.colors.textMuted} name="search-outline" size={18} />
          <AppTextInput
            autoCapitalize="sentences"
            clearButtonMode="while-editing"
            chrome="plain"
            density="compact"
            onChangeText={setQuery}
            placeholder={selectedCategory ? 'Buscar movimiento' : 'Buscar categoría'}
            placeholderTextColor={theme.colors.muted}
            style={styles.searchInput}
            value={query}
          />
        </View>

        {selectedCategory ? (
          <>
            <ActiveCategoryPill
              fallbackCategory={selectedCategory}
              onClear={() => setSelectedCategory(null)}
              row={selectedCategoryRow}
            />

            {visibleHistoryItems.length === 0 ? (
              <EmptyState
                description={
                  query.trim().length > 0
                    ? 'Prueba con otro texto o borra la búsqueda para ver el historial.'
                    : 'No hay transacciones cerradas para esta categoría.'
                }
                title={query.trim().length > 0 ? 'No encontramos movimientos' : 'Sin historial'}
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
            description="Cuando registres movimientos, podrás ver el balance por categoría."
            title="Sin categorías todavía"
          />
        ) : visibleCategoryRows.length === 0 ? (
          <EmptyState
            description="Prueba con otro texto o borra la búsqueda para ver tus categorías."
            title="No encontramos categorías"
          />
        ) : (
          <View style={styles.list}>
            {visibleCategoryRows.map((row) => (
              <CategoryRow
                key={row.key}
                onPress={() => setSelectedCategory(row.category)}
                row={row}
              />
            ))}
          </View>
        )}
      </View>
    </ScreenShell>
  );
}
