import { Ionicons } from '@expo/vector-icons';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { SectionList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ActivityItemDto, BalanceAnalyticsCategoryRowDto } from '@happy-circles/application';
import type { TransactionCategory } from '@happy-circles/shared';

import { AppText } from '@/components/app-text';
import { AppTextInput } from '@/components/app-text-input';
import { BrandedRefreshVirtualizedListContainer } from '@/components/branded-refresh-control';
import { EmptyState } from '@/components/empty-state';
import { HappyCirclesMotion } from '@/components/happy-circles-motion';
import { LoopingInsightSwitcher } from '@/components/looping-insight-switcher';
import { ScreenShell } from '@/components/screen-shell';
import { triggerAppSelectionHaptic } from '@/lib/app-haptics';
import { formatCop } from '@/lib/data';
import { buildLatestMovementHistoryCaseItems, isHistoryCaseItem } from '@/lib/history-cases';
import { useAppSnapshot } from '@/lib/live-data';
import { theme, type AppTheme } from '@/lib/theme';
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
import { useAppTheme } from '@/providers/theme-provider';
import {
  CATEGORY_METRIC_CAROUSEL_ITEM_GAP,
  CATEGORY_METRIC_CAROUSEL_ITEM_WIDTH,
  categoriesIndexScreenStyles as styles,
} from './categories-index-screen-styles';
import {
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
  { label: 'Rechazadas', value: 'rejected' },
  { label: 'Circles', value: 'circles' },
  { label: 'Movimientos', value: 'movements' },
] as const;

type CategoryInsightFilter = (typeof CATEGORY_INSIGHT_OPTIONS)[number]['value'];

const CATEGORY_INSIGHT_VALUES = CATEGORY_INSIGHT_OPTIONS.map((option) => option.value);
const METRIC_CAROUSEL_ITEM_GAP = CATEGORY_METRIC_CAROUSEL_ITEM_GAP;
const METRIC_CAROUSEL_ITEM_WIDTH = CATEGORY_METRIC_CAROUSEL_ITEM_WIDTH;
const CATEGORY_INSIGHT_FALLBACK_WIDTH = 344;

type CategoryListItem =
  | {
      readonly insight: CategoryInsightRow;
      readonly type: 'category';
    }
  | {
      readonly item: ActivityItemDto;
      readonly type: 'pending';
    }
  | {
      readonly item: ActivityItemDto;
      readonly type: 'history';
    };

type CategoryListSection = {
  readonly data: readonly CategoryListItem[];
  readonly key: string;
  readonly title?: string;
};

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

  if (filter === 'rejected') {
    return 'Rech.';
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

  if (filter === 'rejected') {
    return 'close-circle-outline';
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

  if (filter === 'rejected') {
    return 'danger';
  }

  if (filter === 'circles') {
    return 'cycle';
  }

  return 'neutral';
}

function categoryInsightToneColor(
  tone: CategoryInsightTone,
  activeTheme: AppTheme = theme,
): string {
  if (tone === 'positive') {
    return activeTheme.colors.success;
  }

  if (tone === 'negative') {
    return activeTheme.colors.warning;
  }

  if (tone === 'pending') {
    return activeTheme.colors.pending;
  }

  if (tone === 'danger') {
    return activeTheme.colors.danger;
  }

  if (tone === 'cycle') {
    return activeTheme.colors.cycle;
  }

  return activeTheme.colors.primary;
}

function emptyMetricForFilter(filter: CategoryInsightFilter): string {
  if (filter === 'pending') {
    return '0';
  }

  if (filter === 'rejected') {
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

  if (filter === 'rejected') {
    return 'Sin rechazadas';
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
  if (filter === 'rejected') {
    return 'Las categorías con movimientos rechazados aparecerán aquí.';
  }

  if (filter === 'owed_to_me') {
    return 'Cuando una categoría acumule saldo a tu favor, aparecerá aquí.';
  }

  if (filter === 'i_owe') {
    return 'Cuando una categoría acumule saldo que debes, aparecerá aquí.';
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

  if (filter === 'rejected') {
    return item.status === 'rejected';
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

function activityCategoryRow(
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
        row: activityCategoryRow(category, items),
        score: items.length * 100_000_000 + amountMinor,
        tone: 'pending',
      };
    }),
  );
}

function buildRejectedCategoryInsights(
  historyItems: readonly ActivityItemDto[],
): readonly CategoryInsightRow[] {
  const groupedItems = new Map<TransactionCategory, ActivityItemDto[]>();

  for (const item of historyItems) {
    if (item.status !== 'rejected') {
      continue;
    }

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
        row: activityCategoryRow(category, items),
        score: items.length * 100_000_000 + amountMinor,
        tone: 'danger',
      };
    }),
  );
}

function buildCategoryInsightRows({
  categories,
  filter,
  historyItems,
  pendingItems,
}: {
  readonly categories: readonly BalanceAnalyticsCategoryRowDto[];
  readonly filter: CategoryInsightFilter;
  readonly historyItems: readonly ActivityItemDto[];
  readonly pendingItems: readonly ActivityItemDto[];
}): readonly CategoryInsightRow[] {
  if (filter === 'pending') {
    return buildPendingCategoryInsights(pendingItems);
  }

  if (filter === 'rejected') {
    return buildRejectedCategoryInsights(historyItems);
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

function CategoryInsightSwitcher({
  activeFilter,
  onChange,
  renderPage,
}: {
  readonly activeFilter: CategoryInsightFilter;
  readonly onChange: (filter: CategoryInsightFilter) => void;
  readonly renderPage: (filter: CategoryInsightFilter) => ReactNode;
}) {
  const activeTheme = useAppTheme();
  return (
    <LoopingInsightSwitcher
      activeValue={activeFilter}
      colorForValue={(value) => categoryInsightToneColor(categoryInsightTone(value), activeTheme)}
      compactLabelForValue={compactCategoryInsightLabel}
      fallbackWidth={CATEGORY_INSIGHT_FALLBACK_WIDTH}
      iconForValue={categoryInsightIcon}
      itemGap={METRIC_CAROUSEL_ITEM_GAP}
      itemWidth={METRIC_CAROUSEL_ITEM_WIDTH}
      onChange={onChange}
      options={CATEGORY_INSIGHT_OPTIONS}
      renderPage={renderPage}
      styles={styles}
      values={CATEGORY_INSIGHT_VALUES}
    />
  );
}

function CategoryListSeparator() {
  return <View style={styles.categoriesListSeparator} />;
}

function selectedCategorySectionTitles(filter: CategoryInsightFilter): {
  readonly history: string;
  readonly pending: string;
} {
  if (filter === 'rejected') {
    return {
      history: 'Rechazadas',
      pending: 'Pendientes',
    };
  }

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
  if (!hasQuery && filter === 'rejected') {
    return 'No hay movimientos rechazados para esta categoría.';
  }

  if (hasQuery) {
    return 'Prueba con otro texto o borra la búsqueda para ver el historial.';
  }

  if (filter === 'pending') {
    return 'No hay movimientos pendientes para esta categoría.';
  }

  if (filter === 'circles') {
    return 'No hay Happy Circles para esta categoría.';
  }

  return 'No hay movimientos cerrados para esta categoría.';
}

function selectedCategoryEmptyTitle(filter: CategoryInsightFilter, hasQuery: boolean): string {
  if (hasQuery) {
    return 'No encontramos movimientos';
  }

  if (filter === 'pending') {
    return 'Sin pendientes';
  }

  if (filter === 'rejected') {
    return 'Sin rechazadas';
  }

  if (filter === 'circles') {
    return 'Sin Circles';
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
  const activeTheme = useAppTheme();
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

  const analyticsAllPeriod = analytics?.periods.all ?? null;
  const activitySections = snapshotQuery.data?.activitySections;
  const people = snapshotQuery.data?.dashboard.activePeople ?? snapshotQuery.data?.people ?? [];
  const pendingItems = useMemo(
    () =>
      (activitySections?.find((section) => section.key === 'pending')?.items ?? []).filter(
        isPendingTransactionItem,
      ),
    [activitySections],
  );
  const historyItems = useMemo(
    () =>
      (activitySections?.find((section) => section.key === 'history')?.items ?? []).filter(
        isConsolidatedTransactionItem,
      ),
    [activitySections],
  );
  const categories = useMemo(
    () =>
      [...(analyticsAllPeriod?.categories ?? [])].sort((left, right) => {
        const amountDiff = Math.abs(right.netMinor) - Math.abs(left.netMinor);
        if (amountDiff !== 0) {
          return amountDiff;
        }

        return right.movementCount - left.movementCount;
      }),
    [analyticsAllPeriod?.categories],
  );
  const categoryRowsByFilter = useMemo(() => {
    const nextRows = {} as Record<CategoryInsightFilter, readonly CategoryInsightRow[]>;

    for (const filter of CATEGORY_INSIGHT_VALUES) {
      nextRows[filter] = buildCategoryInsightRows({
        categories,
        filter,
        historyItems,
        pendingItems,
      });
    }

    return nextRows;
  }, [categories, historyItems, pendingItems]);
  const categoryRows = categoryRowsByFilter[activeFilter] ?? [];
  const rankingsByFilter = useMemo(() => {
    const nextRankings = {} as Record<CategoryInsightFilter, readonly CategoryInsightRow[]>;

    for (const filter of CATEGORY_INSIGHT_VALUES) {
      nextRankings[filter] = (categoryRowsByFilter[filter] ?? []).slice(0, 3);
    }

    return nextRankings;
  }, [categoryRowsByFilter]);
  const selectedCategoryRow = selectedCategory
    ? rowForCategory(categories, selectedCategory)
    : null;
  const selectedInsightByFilter = useMemo(() => {
    const nextSelected = {} as Record<CategoryInsightFilter, CategoryInsightRow | null>;

    for (const filter of CATEGORY_INSIGHT_VALUES) {
      nextSelected[filter] =
        selectedCategory && selectedCategoryRow
          ? ((categoryRowsByFilter[filter] ?? []).find(
              (insight) => insight.row.category === selectedCategory,
            ) ?? emptyCategoryInsight(selectedCategoryRow, filter))
          : null;
    }

    return nextSelected;
  }, [categoryRowsByFilter, selectedCategory, selectedCategoryRow]);
  const insightSections = useMemo(
    () =>
      buildCategoryInsightActivitySections({
        filter: activeFilter,
        historyItems,
        pendingItems,
      }),
    [activeFilter, historyItems, pendingItems],
  );
  const visibleCategoryRows = useMemo(
    () => categoryRows.filter((insight) => categoryInsightMatchesQuery(insight, query)),
    [categoryRows, query],
  );
  const selectedPendingItems = useMemo(
    () =>
      selectedCategory
        ? insightSections.pending
            .filter((item) => matchesCategory(item, selectedCategory))
            .filter((item) => activityMatchesQuery(item, query))
        : [],
    [insightSections.pending, query, selectedCategory],
  );
  const selectedHistoryItems = useMemo(
    () =>
      selectedCategory
        ? insightSections.history
            .filter((item) => matchesCategory(item, selectedCategory))
            .filter((item) => activityMatchesQuery(item, query))
        : [],
    [insightSections.history, query, selectedCategory],
  );
  const visibleHistoryCaseItems = useMemo(
    () => buildLatestMovementHistoryCaseItems(selectedHistoryItems.filter(isHistoryCaseItem)),
    [selectedHistoryItems],
  );
  const hasSelectedCategoryActivity =
    selectedPendingItems.length > 0 || visibleHistoryCaseItems.length > 0;
  const selectedSectionTitles = selectedCategorySectionTitles(activeFilter);
  const hasQuery = query.trim().length > 0;
  const categoryListSections = useMemo<readonly CategoryListSection[]>(() => {
    if (selectedCategory) {
      if (!hasSelectedCategoryActivity) {
        return [];
      }

      const sections: CategoryListSection[] = [];

      if (selectedPendingItems.length > 0) {
        sections.push({
          data: selectedPendingItems.map((item) => ({ item, type: 'pending' as const })),
          key: 'selected-pending',
          title: selectedSectionTitles.pending,
        });
      }

      if (visibleHistoryCaseItems.length > 0) {
        sections.push({
          data: visibleHistoryCaseItems.map((item) => ({ item, type: 'history' as const })),
          key: 'selected-history',
          title: selectedSectionTitles.history,
        });
      }

      return sections;
    }

    if (categoryRows.length === 0 || visibleCategoryRows.length === 0) {
      return [];
    }

    return [
      {
        data: visibleCategoryRows.map((insight) => ({ insight, type: 'category' as const })),
        key: `categories:${activeFilter}`,
      },
    ];
  }, [
    activeFilter,
    categoryRows.length,
    hasSelectedCategoryActivity,
    selectedCategory,
    selectedPendingItems,
    selectedSectionTitles.history,
    selectedSectionTitles.pending,
    visibleCategoryRows,
    visibleHistoryCaseItems,
  ]);
  const hasCategoryListRows = categoryListSections.some((section) => section.data.length > 0);

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

  function changeCategoryFilter(nextFilter: CategoryInsightFilter) {
    triggerAppSelectionHaptic();
    setActiveFilter(nextFilter);
  }

  function renderCategoryListItem({ item }: { readonly item: CategoryListItem }) {
    if (item.type === 'category') {
      return (
        <View style={styles.containedListItem}>
          <CategoryRow
            metricLabel={item.insight.metricLabel}
            metricTone={item.insight.tone}
            onPress={() => {
              triggerAppSelectionHaptic();
              setSelectedCategory(item.insight.row.category);
            }}
            row={item.insight.row}
          />
        </View>
      );
    }

    return (
      <View style={styles.containedListItem}>
        <CategoryTransactionCard item={item.item} people={people} />
      </View>
    );
  }

  function renderCategorySectionHeader({ section }: { readonly section: CategoryListSection }) {
    if (!section.title) {
      return null;
    }

    return (
      <View style={[styles.containedListItem, styles.categoryActivitySectionHeader]}>
        <AppText style={styles.categoryActivitySectionTitle}>{section.title}</AppText>
      </View>
    );
  }

  return (
    <ScreenShell
      contentContainerStyle={styles.categoriesScreenContent}
      contentMode="full"
      headerVisible={false}
      safeAreaEdges={['left', 'right']}
      scrollEnabled={false}
      title="Categorías"
    >
      <BrandedRefreshVirtualizedListContainer refresh={refresh}>
        {({
          onScroll,
          onTouchCancel,
          onTouchEnd,
          onTouchMove,
          onTouchStart,
          refreshControl,
          scrollEventThrottle,
        }) => (
          <SectionList
            ItemSeparatorComponent={CategoryListSeparator}
            ListFooterComponent={<View style={styles.categoriesListFooter} />}
            ListHeaderComponent={
              <>
                <View
                  style={[styles.categoriesTopChrome, { paddingTop: topInset + theme.spacing.md }]}
                >
                  <View style={styles.containedContent}>
                    <View style={styles.categoriesHeader}>
                      <AppText style={styles.categoriesHeaderTitle}>Categorías</AppText>
                    </View>
                  </View>

                  <View style={styles.topVisualBand}>
                    <CategoryInsightSwitcher
                      activeFilter={activeFilter}
                      onChange={changeCategoryFilter}
                      renderPage={(pageFilter) => (
                        <CategoriesPodiumCard
                          activeFilter={pageFilter}
                          onSelectCategory={(category) => {
                            triggerAppSelectionHaptic();
                            setSelectedCategory((currentCategory) =>
                              currentCategory === category ? null : category,
                            );
                          }}
                          ranking={rankingsByFilter[pageFilter]}
                          selectedCategory={selectedCategory}
                          selectedInsight={selectedInsightByFilter[pageFilter]}
                        />
                      )}
                    />
                  </View>
                </View>

                <View style={[styles.containedContent, styles.categoriesControlsSection]}>
                  <View
                    style={[
                      styles.searchWrap,
                      {
                        backgroundColor: activeTheme.colors.surfaceMuted,
                        borderColor: activeTheme.colors.border,
                      },
                    ]}
                  >
                    <Ionicons
                      color={activeTheme.colors.textMuted}
                      name="search-outline"
                      size={18}
                    />
                    <AppTextInput
                      autoCapitalize="sentences"
                      clearButtonMode="while-editing"
                      chrome="plain"
                      density="compact"
                      onChangeText={setQuery}
                      placeholder={selectedCategory ? 'Buscar movimiento' : 'Buscar categoría'}
                      placeholderTextColor={activeTheme.colors.muted}
                      style={styles.searchInput}
                      value={query}
                    />
                  </View>

                  {selectedCategory && !hasSelectedCategoryActivity ? (
                    <EmptyState
                      description={selectedCategoryEmptyDescription(activeFilter, hasQuery)}
                      title={selectedCategoryEmptyTitle(activeFilter, hasQuery)}
                    />
                  ) : !selectedCategory && categoryRows.length === 0 ? (
                    <EmptyState
                      description={categoryInsightEmptyDescription(activeFilter)}
                      title={categoryInsightEmptyTitle(activeFilter)}
                    />
                  ) : !selectedCategory && visibleCategoryRows.length === 0 ? (
                    <EmptyState
                      description="Prueba con otro texto o borra la búsqueda para ver tus categorías."
                      title="No encontramos categorías"
                    />
                  ) : null}
                </View>

                {hasCategoryListRows ? <View style={styles.categoriesListHeaderGap} /> : null}
              </>
            }
            contentContainerStyle={styles.categoriesListContent}
            keyExtractor={(item) =>
              item.type === 'category'
                ? `category:${item.insight.row.key}`
                : `${item.type}:${item.item.id}`
            }
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            onScroll={onScroll}
            onTouchCancel={onTouchCancel}
            onTouchEnd={onTouchEnd}
            onTouchMove={onTouchMove}
            onTouchStart={onTouchStart}
            refreshControl={refreshControl}
            renderItem={renderCategoryListItem}
            renderSectionHeader={renderCategorySectionHeader}
            scrollEventThrottle={scrollEventThrottle}
            sections={categoryListSections}
            showsVerticalScrollIndicator={false}
            stickySectionHeadersEnabled={false}
            style={[
              styles.virtualizedCategoriesList,
              { backgroundColor: activeTheme.colors.background },
            ]}
          />
        )}
      </BrandedRefreshVirtualizedListContainer>
    </ScreenShell>
  );
}
