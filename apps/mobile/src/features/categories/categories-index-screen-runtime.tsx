import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ActivityItemDto, BalanceAnalyticsCategoryRowDto } from '@happy-circles/application';
import type { TransactionCategory } from '@happy-circles/shared';

import { AppText } from '@/components/app-text';
import { AppTextInput } from '@/components/app-text-input';
import { EmptyState } from '@/components/empty-state';
import { HappyCirclesMotion } from '@/components/happy-circles-motion';
import { ScreenShell } from '@/components/screen-shell';
import { SectionBlock } from '@/components/section-block';
import { triggerAppSelectionHaptic } from '@/lib/app-haptics';
import { formatCop } from '@/lib/data';
import { buildLatestHistoryCaseItems, isHistoryCaseItem } from '@/lib/history-cases';
import { useAppSnapshot } from '@/lib/live-data';
import { theme } from '@/lib/theme';
import {
  normalizeTransactionCategory,
  transactionCategoryLabel,
} from '@/lib/transaction-categories';
import {
  isConsolidatedTransactionItem,
  isCycleTransactionItem,
  isNoBalanceTransactionStatus,
  isPendingTransactionItem,
  transactionVisualCategory,
} from '@/lib/transaction-presentation';
import { useSnapshotRefresh } from '@/lib/use-snapshot-refresh';
import { categoriesIndexScreenStyles as styles } from './categories-index-screen-styles';
import {
  ActiveCategoryPill,
  CategoriesPodiumCard,
  CategoryRow,
  CategoryTransactionCard,
  type CategoryInsightRow,
  type CategoryInsightTone,
} from './categories-index-cards';

const CATEGORY_INSIGHT_OPTIONS = [
  { label: 'Balance', value: 'balance' },
  { label: 'Te deben', value: 'owed_to_me' },
  { label: 'Debes', value: 'i_owe' },
  { label: 'Pendientes', value: 'pending' },
  { label: 'Circles', value: 'circles' },
  { label: 'Movimientos', value: 'movements' },
] as const;

type CategoryInsightFilter = (typeof CATEGORY_INSIGHT_OPTIONS)[number]['value'];

const CATEGORY_INSIGHT_VALUES = CATEGORY_INSIGHT_OPTIONS.map((option) => option.value);

function normalizedText(value: string | number | null | undefined): string {
  return `${value ?? ''}`.trim().toLocaleLowerCase('es-CO');
}

function movementCountLabel(count: number): string {
  return `${count} movimiento${count === 1 ? '' : 's'}`;
}

function categoryInsightFilterLabel(filter: CategoryInsightFilter): string {
  return CATEGORY_INSIGHT_OPTIONS.find((option) => option.value === filter)?.label ?? 'Balance';
}

function compactCategoryInsightLabel(filter: CategoryInsightFilter): string {
  if (filter === 'pending') {
    return 'Pend.';
  }

  if (filter === 'movements') {
    return 'Movs.';
  }

  return categoryInsightFilterLabel(filter);
}

function categoryInsightIcon(filter: CategoryInsightFilter): keyof typeof Ionicons.glyphMap {
  if (filter === 'owed_to_me') {
    return 'arrow-down-outline';
  }

  if (filter === 'i_owe') {
    return 'arrow-up-outline';
  }

  if (filter === 'pending') {
    return 'time-outline';
  }

  if (filter === 'circles') {
    return 'sync-outline';
  }

  if (filter === 'movements') {
    return 'swap-horizontal-outline';
  }

  return 'wallet-outline';
}

function categoryInsightTone(filter: CategoryInsightFilter): CategoryInsightTone {
  if (filter === 'owed_to_me') {
    return 'positive';
  }

  if (filter === 'i_owe') {
    return 'negative';
  }

  if (filter === 'pending') {
    return 'pending';
  }

  if (filter === 'circles') {
    return 'cycle';
  }

  return 'neutral';
}

function emptyMetricForFilter(filter: CategoryInsightFilter): string {
  if (filter === 'pending') {
    return '0';
  }

  if (filter === 'circles') {
    return '0 Circles';
  }

  if (filter === 'movements') {
    return '0 mov.';
  }

  return formatCop(0);
}

function categoryInsightEmptyTitle(filter: CategoryInsightFilter): string {
  if (filter === 'pending') {
    return 'Sin pendientes';
  }

  if (filter === 'circles') {
    return 'Sin Circles';
  }

  if (filter === 'movements') {
    return 'Sin movimientos';
  }

  return 'Sin movimientos de balance';
}

function categoryInsightEmptyDescription(filter: CategoryInsightFilter): string {
  if (filter === 'owed_to_me') {
    return 'Cuando una categoría acumule dinero que te deben, aparecerá aquí.';
  }

  if (filter === 'i_owe') {
    return 'Cuando debas dentro de una categoría, aparecerá aquí.';
  }

  if (filter === 'pending') {
    return 'Las categorías con movimientos pendientes aparecerán aquí.';
  }

  if (filter === 'circles') {
    return 'Los Happy Circles aparecerán aquí cuando tengan actividad.';
  }

  if (filter === 'movements') {
    return 'Cuando registres movimientos, podrás verlos por categoría.';
  }

  return 'Las categorías que explican tu balance aparecerán aquí.';
}

function amountTone(amountMinor: number): CategoryInsightTone {
  if (amountMinor > 0) {
    return 'positive';
  }

  if (amountMinor < 0) {
    return 'negative';
  }

  return 'neutral';
}

function matchesCategory(
  item: ActivityItemDto,
  category: BalanceAnalyticsCategoryRowDto['category'],
): boolean {
  return transactionVisualCategory(item) === category;
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

function categoryInsightMatchesQuery(insight: CategoryInsightRow, query: string): boolean {
  const normalizedQuery = normalizedText(query);

  if (!normalizedQuery) {
    return true;
  }

  return [
    insight.row.category,
    insight.row.label,
    insight.metricLabel,
    movementCountLabel(insight.row.movementCount),
    ...insight.row.personLabels,
  ].some((value) => normalizedText(value).includes(normalizedQuery));
}

function isBalanceRootItem(item: ActivityItemDto): boolean {
  return (
    item.status !== 'amended' &&
    !isNoBalanceTransactionStatus(item.status) &&
    (item.tone === 'positive' || item.tone === 'negative')
  );
}

function matchesCategoryPendingFilter(
  item: ActivityItemDto,
  filter: CategoryInsightFilter,
): boolean {
  if (filter === 'pending' || filter === 'movements') {
    return true;
  }

  if (filter === 'circles') {
    return isCycleTransactionItem(item) || transactionVisualCategory(item) === 'cycle';
  }

  return false;
}

function matchesCategoryHistoryFilter(
  item: ActivityItemDto,
  filter: CategoryInsightFilter,
): boolean {
  if (filter === 'movements') {
    return true;
  }

  if (filter === 'balance') {
    return isBalanceRootItem(item);
  }

  if (filter === 'owed_to_me') {
    return isBalanceRootItem(item) && item.tone === 'positive';
  }

  if (filter === 'i_owe') {
    return isBalanceRootItem(item) && item.tone === 'negative';
  }

  if (filter === 'circles') {
    return isCycleTransactionItem(item) || transactionVisualCategory(item) === 'cycle';
  }

  return false;
}

function buildCategoryInsightActivitySections({
  filter,
  historyItems,
  pendingItems,
}: {
  readonly filter: CategoryInsightFilter;
  readonly historyItems: readonly ActivityItemDto[];
  readonly pendingItems: readonly ActivityItemDto[];
}): {
  readonly history: readonly ActivityItemDto[];
  readonly pending: readonly ActivityItemDto[];
} {
  return {
    history: historyItems.filter((item) => matchesCategoryHistoryFilter(item, filter)),
    pending: pendingItems.filter((item) => matchesCategoryPendingFilter(item, filter)),
  };
}

function sortInsights(rows: readonly CategoryInsightRow[]): readonly CategoryInsightRow[] {
  return [...rows].sort((left, right) => {
    const scoreDiff = right.score - left.score;
    if (scoreDiff !== 0) {
      return scoreDiff;
    }

    return left.row.label.localeCompare(right.row.label, 'es-CO');
  });
}

function emptyCategoryRow(category: TransactionCategory): BalanceAnalyticsCategoryRowDto {
  return {
    category,
    iOweMinor: 0,
    key: category,
    label: transactionCategoryLabel(category),
    movementCount: 0,
    netMinor: 0,
    owedToMeMinor: 0,
    personLabels: [],
    previousNetMinor: 0,
    userIds: [],
  };
}

function emptyCategoryInsight(
  row: BalanceAnalyticsCategoryRowDto,
  filter: CategoryInsightFilter,
): CategoryInsightRow {
  return {
    metricLabel: emptyMetricForFilter(filter),
    row,
    score: 0,
    tone: categoryInsightTone(filter),
  };
}

function pendingCategoryRow(
  category: TransactionCategory,
  items: readonly ActivityItemDto[],
): BalanceAnalyticsCategoryRowDto {
  const personLabels = Array.from(
    new Set(items.map((item) => item.counterpartyLabel ?? 'Persona')),
  ).slice(0, 4);
  const userIds = Array.from(new Set(items.flatMap((item) => item.participantUserIds ?? [])));

  return {
    category,
    iOweMinor: 0,
    key: category,
    label: transactionCategoryLabel(category),
    movementCount: items.length,
    netMinor: 0,
    owedToMeMinor: 0,
    personLabels,
    previousNetMinor: 0,
    userIds,
  };
}

function buildPendingCategoryInsights(
  pendingItems: readonly ActivityItemDto[],
): readonly CategoryInsightRow[] {
  const groupedItems = new Map<TransactionCategory, ActivityItemDto[]>();

  for (const item of pendingItems) {
    const category = transactionVisualCategory(item);
    const existingItems = groupedItems.get(category) ?? [];
    existingItems.push(item);
    groupedItems.set(category, existingItems);
  }

  return sortInsights(
    Array.from(groupedItems.entries()).map(([category, items]) => {
      const amountMinor = items.reduce((total, item) => total + Math.abs(item.amountMinor ?? 0), 0);
      return {
        metricLabel:
          amountMinor > 0 ? `${items.length} · ${formatCop(amountMinor)}` : String(items.length),
        row: pendingCategoryRow(category, items),
        score: items.length * 100_000_000 + amountMinor,
        tone: 'pending',
      };
    }),
  );
}

function buildCategoryInsightRows({
  categories,
  filter,
  pendingItems,
}: {
  readonly categories: readonly BalanceAnalyticsCategoryRowDto[];
  readonly filter: CategoryInsightFilter;
  readonly pendingItems: readonly ActivityItemDto[];
}): readonly CategoryInsightRow[] {
  if (filter === 'pending') {
    return buildPendingCategoryInsights(pendingItems);
  }

  if (filter === 'owed_to_me') {
    return sortInsights(
      categories
        .filter((row) => row.owedToMeMinor > 0)
        .map((row) => ({
          metricLabel: formatCop(row.owedToMeMinor),
          row,
          score: row.owedToMeMinor,
          tone: 'positive',
        })),
    );
  }

  if (filter === 'i_owe') {
    return sortInsights(
      categories
        .filter((row) => row.iOweMinor > 0)
        .map((row) => ({
          metricLabel: formatCop(row.iOweMinor),
          row,
          score: row.iOweMinor,
          tone: 'negative',
        })),
    );
  }

  if (filter === 'circles') {
    return sortInsights(
      categories
        .filter((row) => row.category === 'cycle')
        .map((row) => ({
          metricLabel: `${row.movementCount} ${row.movementCount === 1 ? 'Circle' : 'Circles'}`,
          row,
          score: row.movementCount,
          tone: 'cycle',
        })),
    );
  }

  if (filter === 'movements') {
    return sortInsights(
      categories.map((row) => ({
        metricLabel: `${row.movementCount} mov.`,
        row,
        score: row.movementCount,
        tone: 'neutral',
      })),
    );
  }

  return sortInsights(
    categories.map((row) => ({
      metricLabel: formatCop(row.netMinor),
      row,
      score: Math.abs(row.netMinor) || row.movementCount,
      tone: amountTone(row.netMinor),
    })),
  );
}

function CategoryInsightFilterRail({
  activeFilter,
  onChange,
}: {
  readonly activeFilter: CategoryInsightFilter;
  readonly onChange: (filter: CategoryInsightFilter) => void;
}) {
  return (
    <View style={styles.filterStack}>
      <ScrollView
        horizontal
        contentContainerStyle={styles.filterRail}
        keyboardShouldPersistTaps="handled"
        showsHorizontalScrollIndicator={false}
      >
        {CATEGORY_INSIGHT_OPTIONS.map((option) => {
          const selected = option.value === activeFilter;
          return (
            <View key={option.value} style={styles.metricCarouselItem}>
              {selected ? <View style={styles.metricCarouselShadow} /> : null}
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => onChange(option.value)}
                style={({ pressed }) => [
                  styles.metricCarouselButton,
                  selected ? styles.metricCarouselButtonSelected : null,
                  pressed ? styles.metricCarouselItemPressed : null,
                ]}
              >
                <Ionicons
                  color={selected ? theme.colors.text : theme.colors.textMuted}
                  name={categoryInsightIcon(option.value)}
                  size={17}
                />
                <AppText
                  numberOfLines={1}
                  style={[
                    styles.metricCarouselText,
                    selected ? styles.metricCarouselTextSelected : null,
                  ]}
                >
                  {compactCategoryInsightLabel(option.value)}
                </AppText>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

function selectedCategorySectionTitles(filter: CategoryInsightFilter): {
  readonly history: string;
  readonly pending: string;
} {
  if (filter === 'circles') {
    return {
      history: 'Historial de Circles',
      pending: 'Circles activos',
    };
  }

  return {
    history: 'Historial',
    pending: 'Pendientes',
  };
}

function selectedCategoryEmptyDescription(
  filter: CategoryInsightFilter,
  hasQuery: boolean,
): string {
  if (hasQuery) {
    return 'Prueba con otro texto o borra la búsqueda para ver el historial.';
  }

  if (filter === 'pending') {
    return 'No hay movimientos pendientes para esta categoría.';
  }

  if (filter === 'circles') {
    return 'No hay Happy Circles visibles para esta categoría.';
  }

  return 'No hay transacciones cerradas para esta categoría.';
}

function selectedCategoryEmptyTitle(filter: CategoryInsightFilter, hasQuery: boolean): string {
  if (hasQuery) {
    return 'No encontramos movimientos';
  }

  if (filter === 'pending') {
    return 'Sin pendientes';
  }

  return 'Sin historial';
}

function rowForCategory(
  rows: readonly BalanceAnalyticsCategoryRowDto[],
  category: TransactionCategory,
): BalanceAnalyticsCategoryRowDto {
  return rows.find((row) => row.category === category) ?? emptyCategoryRow(category);
}

function normalizeInitialCategory(value: string | null | undefined): TransactionCategory | null {
  return value ? normalizeTransactionCategory(value) : null;
}

export function CategoriesIndexScreen({
  initialCategory,
}: {
  readonly initialCategory?: string | null;
  readonly initialPeriod?: string | null;
}) {
  const { top: topInset } = useSafeAreaInsets();
  const snapshotQuery = useAppSnapshot();
  const refresh = useSnapshotRefresh(snapshotQuery);
  const analytics = snapshotQuery.data?.balanceAnalytics ?? null;
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<CategoryInsightFilter>('balance');
  const [selectedCategory, setSelectedCategory] = useState<TransactionCategory | null>(() =>
    normalizeInitialCategory(initialCategory),
  );

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

  const analyticsAllPeriod = analytics.periods.all;
  const people = snapshotQuery.data?.dashboard.activePeople ?? snapshotQuery.data?.people ?? [];
  const pendingItems = (
    snapshotQuery.data?.activitySections.find((section) => section.key === 'pending')?.items ?? []
  ).filter(isPendingTransactionItem);
  const historyItems = (
    snapshotQuery.data?.activitySections.find((section) => section.key === 'history')?.items ?? []
  ).filter(isConsolidatedTransactionItem);
  const categories = [...analyticsAllPeriod.categories].sort((left, right) => {
    const amountDiff = Math.abs(right.netMinor) - Math.abs(left.netMinor);
    if (amountDiff !== 0) {
      return amountDiff;
    }

    return right.movementCount - left.movementCount;
  });
  const categoryRowsByFilter = {} as Record<CategoryInsightFilter, readonly CategoryInsightRow[]>;

  for (const filter of CATEGORY_INSIGHT_VALUES) {
    categoryRowsByFilter[filter] = buildCategoryInsightRows({
      categories,
      filter,
      pendingItems,
    });
  }

  const categoryRows = categoryRowsByFilter[activeFilter];
  const rankingsByFilter = {} as Record<CategoryInsightFilter, readonly CategoryInsightRow[]>;

  for (const filter of CATEGORY_INSIGHT_VALUES) {
    rankingsByFilter[filter] = categoryRowsByFilter[filter].slice(0, 3);
  }

  const selectedCategoryRow = selectedCategory
    ? rowForCategory(categories, selectedCategory)
    : null;
  const selectedInsight =
    selectedCategory && selectedCategoryRow
      ? (categoryRows.find((insight) => insight.row.category === selectedCategory) ??
        emptyCategoryInsight(selectedCategoryRow, activeFilter))
      : null;
  const insightSections = buildCategoryInsightActivitySections({
    filter: activeFilter,
    historyItems,
    pendingItems,
  });
  const visibleCategoryRows = categoryRows.filter((insight) =>
    categoryInsightMatchesQuery(insight, query),
  );
  const selectedPendingItems = selectedCategory
    ? insightSections.pending
        .filter((item) => matchesCategory(item, selectedCategory))
        .filter((item) => activityMatchesQuery(item, query))
    : [];
  const selectedHistoryItems = selectedCategory
    ? insightSections.history
        .filter((item) => matchesCategory(item, selectedCategory))
        .filter((item) => activityMatchesQuery(item, query))
    : [];
  const visibleHistoryCaseItems = buildLatestHistoryCaseItems(
    selectedHistoryItems.filter(isHistoryCaseItem),
  );
  const hasSelectedCategoryActivity =
    selectedPendingItems.length > 0 || visibleHistoryCaseItems.length > 0;
  const selectedSectionTitles = selectedCategorySectionTitles(activeFilter);
  const hasQuery = query.trim().length > 0;

  function changeCategoryFilter(nextFilter: CategoryInsightFilter) {
    triggerAppSelectionHaptic();
    setActiveFilter(nextFilter);
  }

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
          <CategoriesPodiumCard
            onSelectCategory={(category) => {
              triggerAppSelectionHaptic();
              setSelectedCategory((currentCategory) =>
                currentCategory === category ? null : category,
              );
            }}
            ranking={rankingsByFilter[activeFilter]}
            selectedCategory={selectedCategory}
            selectedInsight={selectedInsight}
          />
          <CategoryInsightFilterRail activeFilter={activeFilter} onChange={changeCategoryFilter} />
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

            {!hasSelectedCategoryActivity ? (
              <EmptyState
                description={selectedCategoryEmptyDescription(activeFilter, hasQuery)}
                title={selectedCategoryEmptyTitle(activeFilter, hasQuery)}
              />
            ) : null}

            {selectedPendingItems.length > 0 ? (
              <SectionBlock title={selectedSectionTitles.pending}>
                <View style={styles.list}>
                  {selectedPendingItems.map((item) => (
                    <CategoryTransactionCard item={item} key={item.id} people={people} />
                  ))}
                </View>
              </SectionBlock>
            ) : null}

            {visibleHistoryCaseItems.length > 0 ? (
              <SectionBlock title={selectedSectionTitles.history}>
                <View style={styles.list}>
                  {visibleHistoryCaseItems.map((item) => (
                    <CategoryTransactionCard item={item} key={item.id} people={people} />
                  ))}
                </View>
              </SectionBlock>
            ) : null}
          </>
        ) : categoryRows.length === 0 ? (
          <EmptyState
            description={categoryInsightEmptyDescription(activeFilter)}
            title={categoryInsightEmptyTitle(activeFilter)}
          />
        ) : visibleCategoryRows.length === 0 ? (
          <EmptyState
            description="Prueba con otro texto o borra la búsqueda para ver tus categorías."
            title="No encontramos categorías"
          />
        ) : (
          <View style={styles.list}>
            {visibleCategoryRows.map((insight) => (
              <CategoryRow
                key={`${activeFilter}-${insight.row.key}`}
                metricLabel={insight.metricLabel}
                metricTone={insight.tone}
                onPress={() => {
                  triggerAppSelectionHaptic();
                  setSelectedCategory(insight.row.category);
                }}
                row={insight.row}
              />
            ))}
          </View>
        )}
      </View>
    </ScreenShell>
  );
}
