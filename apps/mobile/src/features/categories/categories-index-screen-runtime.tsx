import { Ionicons } from '@expo/vector-icons';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  type LayoutChangeEvent,
  PanResponder,
  type PanResponderGestureState,
  Pressable,
  useWindowDimensions,
  View,
} from 'react-native';
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
const METRIC_CAROUSEL_STEP = METRIC_CAROUSEL_ITEM_WIDTH + METRIC_CAROUSEL_ITEM_GAP;
const CATEGORY_INSIGHT_FALLBACK_WIDTH = 344;
const CATEGORY_INSIGHT_LOOP_REPETITIONS = 9;
const CATEGORY_INSIGHT_LOOP_MIDDLE_REPEAT = Math.floor(CATEGORY_INSIGHT_LOOP_REPETITIONS / 2);
const CATEGORY_INSIGHT_HORIZONTAL_GESTURE_MIN_DX = 10;
const CATEGORY_INSIGHT_HORIZONTAL_GESTURE_LOCK_RATIO = 1.5;
const CATEGORY_INSIGHT_VERTICAL_TAKEOVER_RATIO = 1.25;
const CATEGORY_INSIGHT_PODIUM_SNAP_COMMIT_RATIO = 0.22;
const CATEGORY_INSIGHT_FILTER_SNAP_COMMIT_RATIO = 0.34;
const CATEGORY_INSIGHT_PODIUM_SNAP_VELOCITY_THRESHOLD = 0.24;
const CATEGORY_INSIGHT_FILTER_SNAP_VELOCITY_THRESHOLD = 0.36;
const CATEGORY_INSIGHT_VELOCITY_PROJECTION_MS = 180;

type CategoryInsightSwipeSource = 'filter' | 'podium';

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

function shouldClaimHorizontalCategoryGesture(gestureState: PanResponderGestureState): boolean {
  const absDx = Math.abs(gestureState.dx);
  const absDy = Math.abs(gestureState.dy);

  return (
    absDx >= CATEGORY_INSIGHT_HORIZONTAL_GESTURE_MIN_DX &&
    absDx > absDy * CATEGORY_INSIGHT_HORIZONTAL_GESTURE_LOCK_RATIO
  );
}

function shouldReleaseCategoryGestureToVerticalScroll(
  gestureState: PanResponderGestureState,
): boolean {
  const absDx = Math.abs(gestureState.dx);
  const absDy = Math.abs(gestureState.dy);

  return (
    absDy > CATEGORY_INSIGHT_HORIZONTAL_GESTURE_MIN_DX &&
    absDy > absDx * CATEGORY_INSIGHT_VERTICAL_TAKEOVER_RATIO
  );
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

function categoryInsightToneColor(tone: CategoryInsightTone): string {
  if (tone === 'positive') {
    return theme.colors.success;
  }

  if (tone === 'negative') {
    return theme.colors.warning;
  }

  if (tone === 'pending') {
    return '#ca8a04';
  }

  if (tone === 'danger') {
    return theme.colors.danger;
  }

  if (tone === 'cycle') {
    return '#2563eb';
  }

  return theme.colors.primary;
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
  const { width: windowWidth } = useWindowDimensions();
  const [podiumWidth, setPodiumWidth] = useState(0);
  const [filterWidth, setFilterWidth] = useState(0);
  const [visualFilter, setVisualFilter] = useState<CategoryInsightFilter>(activeFilter);
  const activeFilterRef = useRef(activeFilter);
  const onChangeRef = useRef(onChange);
  const hasAlignedRef = useRef(false);
  const hasMeasuredWidthsRef = useRef(false);
  const visualFilterRef = useRef(activeFilter);
  const activeIndex = Math.max(0, CATEGORY_INSIGHT_VALUES.indexOf(activeFilter));
  const centerLoopBaseIndex = CATEGORY_INSIGHT_LOOP_MIDDLE_REPEAT * CATEGORY_INSIGHT_VALUES.length;
  const activeLoopIndex = centerLoopBaseIndex + activeIndex;
  const currentLoopPositionRef = useRef(activeLoopIndex);
  const gestureStartLoopPositionRef = useRef(activeLoopIndex);
  const podiumPanResponderRef = useRef<ReturnType<typeof PanResponder.create> | null>(null);
  const filterPanResponderRef = useRef<ReturnType<typeof PanResponder.create> | null>(null);
  const skipNextActiveScrollRef = useRef(false);
  const positionProgress = useRef(new Animated.Value(activeLoopIndex)).current;
  const measuredWindowWidth = windowWidth > 0 ? windowWidth : CATEGORY_INSIGHT_FALLBACK_WIDTH;
  const fallbackPodiumWidth =
    windowWidth > 0 ? Math.max(0, measuredWindowWidth - theme.spacing.sm * 2) : measuredWindowWidth;
  const fallbackFilterWidth = measuredWindowWidth;
  const resolvedPodiumWidth = podiumWidth > 0 ? podiumWidth : fallbackPodiumWidth;
  const resolvedFilterWidth = filterWidth > 0 ? filterWidth : fallbackFilterWidth;
  const resolvedPodiumWidthRef = useRef(resolvedPodiumWidth);
  const hasMeasuredWidths = podiumWidth > 0 && filterWidth > 0;
  const filterSidePadding = Math.max(0, (resolvedFilterWidth - METRIC_CAROUSEL_ITEM_WIDTH) / 2);
  const filterOptions = useMemo(() => {
    return Array.from({ length: CATEGORY_INSIGHT_LOOP_REPETITIONS }, (_, repeatIndex) =>
      CATEGORY_INSIGHT_OPTIONS.map((option, optionIndex) => ({
        ...option,
        carouselKey: `category-metric-${repeatIndex}-${option.value}`,
        loopIndex: repeatIndex * CATEGORY_INSIGHT_VALUES.length + optionIndex,
      })),
    ).flat();
  }, []);
  const podiumFilters = useMemo(() => {
    return Array.from({ length: CATEGORY_INSIGHT_LOOP_REPETITIONS }, () => [
      ...CATEGORY_INSIGHT_VALUES,
    ]).flat();
  }, []);
  const podiumTrackStyle = {
    transform: [{ translateX: Animated.multiply(positionProgress, -resolvedPodiumWidth) }],
  };
  const filterTrackWidth =
    filterSidePadding * 2 +
    filterOptions.length * METRIC_CAROUSEL_ITEM_WIDTH +
    Math.max(0, filterOptions.length - 1) * METRIC_CAROUSEL_ITEM_GAP;
  const filterTrackStyle = {
    paddingLeft: filterSidePadding,
    paddingRight: filterSidePadding,
    transform: [{ translateX: Animated.multiply(positionProgress, -METRIC_CAROUSEL_STEP) }],
    width: filterTrackWidth,
  };

  onChangeRef.current = onChange;
  resolvedPodiumWidthRef.current = resolvedPodiumWidth;

  useEffect(() => {
    if (resolvedPodiumWidth <= 0 || resolvedFilterWidth <= 0) {
      return undefined;
    }

    if (skipNextActiveScrollRef.current) {
      skipNextActiveScrollRef.current = false;
      activeFilterRef.current = activeFilter;
      updateVisualFilter(activeFilter);
      return undefined;
    }

    const targetLoopIndex = loopIndexForFilter(activeFilter);
    activeFilterRef.current = activeFilter;
    updateVisualFilter(activeFilter);

    const frame = requestAnimationFrame(() => {
      const shouldAnimate = hasAlignedRef.current && hasMeasuredWidthsRef.current;

      snapToLoopIndex(targetLoopIndex, shouldAnimate, false);
      hasAlignedRef.current = true;
      hasMeasuredWidthsRef.current = hasMeasuredWidthsRef.current || hasMeasuredWidths;
    });

    return () => cancelAnimationFrame(frame);
  }, [
    activeFilter,
    activeIndex,
    activeLoopIndex,
    hasMeasuredWidths,
    resolvedFilterWidth,
    resolvedPodiumWidth,
  ]);

  useEffect(() => {
    const listenerId = positionProgress.addListener(({ value }) => {
      currentLoopPositionRef.current = value;
    });

    return () => {
      positionProgress.removeListener(listenerId);
    };
  }, [positionProgress]);

  function valueIndexForLoopIndex(loopIndex: number): number {
    const valueCount = CATEGORY_INSIGHT_VALUES.length;

    if (valueCount === 0) {
      return 0;
    }

    return ((loopIndex % valueCount) + valueCount) % valueCount;
  }

  function loopIndexForFilter(filter: CategoryInsightFilter): number {
    const valueCount = CATEGORY_INSIGHT_VALUES.length;
    const valueIndex = CATEGORY_INSIGHT_VALUES.indexOf(filter);

    if (valueCount === 0 || valueIndex < 0) {
      return Math.round(currentLoopPositionRef.current);
    }

    const preferredRepeat = Math.round((currentLoopPositionRef.current - valueIndex) / valueCount);
    const clampedRepeat = Math.min(
      Math.max(preferredRepeat, 0),
      CATEGORY_INSIGHT_LOOP_REPETITIONS - 1,
    );
    const candidateRepeats = Array.from(
      new Set([
        CATEGORY_INSIGHT_LOOP_MIDDLE_REPEAT,
        clampedRepeat - 1,
        clampedRepeat,
        clampedRepeat + 1,
      ]),
    ).filter((repeat) => repeat >= 0 && repeat < CATEGORY_INSIGHT_LOOP_REPETITIONS);

    return candidateRepeats
      .map((repeat) => repeat * valueCount + valueIndex)
      .reduce((closestIndex, candidateIndex) =>
        Math.abs(candidateIndex - currentLoopPositionRef.current) <
        Math.abs(closestIndex - currentLoopPositionRef.current)
          ? candidateIndex
          : closestIndex,
      );
  }

  function resolveLoopIndex(rawLoopIndex: number) {
    const valueCount = CATEGORY_INSIGHT_VALUES.length;
    const maxLoopIndex = valueCount * CATEGORY_INSIGHT_LOOP_REPETITIONS - 1;
    const loopIndex = Math.min(Math.max(rawLoopIndex, 0), Math.max(maxLoopIndex, 0));
    const valueIndex = valueIndexForLoopIndex(loopIndex);

    return { loopIndex, valueIndex };
  }

  function centerLoopPosition(loopPosition: number): number {
    const valueCount = CATEGORY_INSIGHT_VALUES.length;

    if (valueCount === 0) {
      return centerLoopBaseIndex;
    }

    const valueProgress = ((loopPosition % valueCount) + valueCount) % valueCount;

    return centerLoopBaseIndex + valueProgress;
  }

  function updateVisualFilter(nextFilter: CategoryInsightFilter) {
    if (visualFilterRef.current === nextFilter) {
      return;
    }

    visualFilterRef.current = nextFilter;
    setVisualFilter(nextFilter);
  }

  function commitLoopIndex(loopIndex: number) {
    const { valueIndex } = resolveLoopIndex(Math.round(loopIndex));
    const nextFilter = CATEGORY_INSIGHT_VALUES[valueIndex];

    if (!nextFilter) {
      return;
    }

    updateVisualFilter(nextFilter);

    if (nextFilter === activeFilterRef.current) {
      return;
    }

    skipNextActiveScrollRef.current = true;
    activeFilterRef.current = nextFilter;
    onChangeRef.current(nextFilter);
  }

  function normalizePosition(loopIndex: number) {
    const centeredLoopIndex = centerLoopBaseIndex + valueIndexForLoopIndex(Math.round(loopIndex));

    if (Math.abs(centeredLoopIndex - currentLoopPositionRef.current) <= 0.001) {
      return;
    }

    currentLoopPositionRef.current = centeredLoopIndex;
    positionProgress.setValue(centeredLoopIndex);
  }

  function snapToLoopIndex(
    loopIndex: number,
    animated: boolean,
    shouldCommit: boolean,
    velocity = 0,
  ) {
    const targetLoopIndex = resolveLoopIndex(loopIndex).loopIndex;

    positionProgress.stopAnimation();

    if (!animated) {
      currentLoopPositionRef.current = targetLoopIndex;
      positionProgress.setValue(targetLoopIndex);
      normalizePosition(targetLoopIndex);

      if (shouldCommit) {
        commitLoopIndex(targetLoopIndex);
      }

      return;
    }

    Animated.spring(positionProgress, {
      damping: 23,
      mass: 0.9,
      stiffness: 230,
      toValue: targetLoopIndex,
      useNativeDriver: true,
      velocity,
    }).start(({ finished }) => {
      if (finished) {
        normalizePosition(targetLoopIndex);

        if (shouldCommit) {
          commitLoopIndex(targetLoopIndex);
        }
      }
    });
  }

  function handlePodiumLayout(event: LayoutChangeEvent) {
    const nextWidth = event.nativeEvent.layout.width;

    if (nextWidth > 0 && Math.abs(nextWidth - podiumWidth) > 0.5) {
      setPodiumWidth(nextWidth);
    }
  }

  function handleFilterLayout(event: LayoutChangeEvent) {
    const nextWidth = event.nativeEvent.layout.width;

    if (nextWidth > 0 && Math.abs(nextWidth - filterWidth) > 0.5) {
      setFilterWidth(nextWidth);
    }
  }

  function stepForSource(source: CategoryInsightSwipeSource) {
    return source === 'filter' ? METRIC_CAROUSEL_STEP : resolvedPodiumWidthRef.current;
  }

  function snapCommitRatioForSource(source: CategoryInsightSwipeSource) {
    return source === 'filter'
      ? CATEGORY_INSIGHT_FILTER_SNAP_COMMIT_RATIO
      : CATEGORY_INSIGHT_PODIUM_SNAP_COMMIT_RATIO;
  }

  function snapVelocityThresholdForSource(source: CategoryInsightSwipeSource) {
    return source === 'filter'
      ? CATEGORY_INSIGHT_FILTER_SNAP_VELOCITY_THRESHOLD
      : CATEGORY_INSIGHT_PODIUM_SNAP_VELOCITY_THRESHOLD;
  }

  function handleGestureGrant() {
    const fallbackCenteredPosition = centerLoopPosition(currentLoopPositionRef.current);

    currentLoopPositionRef.current = fallbackCenteredPosition;
    gestureStartLoopPositionRef.current = fallbackCenteredPosition;
    positionProgress.setValue(fallbackCenteredPosition);

    positionProgress.stopAnimation((value) => {
      const centeredPosition = centerLoopPosition(value);

      currentLoopPositionRef.current = centeredPosition;
      gestureStartLoopPositionRef.current = centeredPosition;
      positionProgress.setValue(centeredPosition);
    });
  }

  function handleGestureMove(
    source: CategoryInsightSwipeSource,
    gestureState: PanResponderGestureState,
  ) {
    const step = stepForSource(source);

    if (step <= 0) {
      return;
    }

    const nextPosition = gestureStartLoopPositionRef.current - gestureState.dx / step;
    const clampedPosition = resolveLoopIndex(nextPosition).loopIndex;

    currentLoopPositionRef.current = clampedPosition;
    positionProgress.setValue(clampedPosition);
  }

  function handleGestureEnd(
    source: CategoryInsightSwipeSource,
    gestureState: PanResponderGestureState,
  ) {
    const step = stepForSource(source);

    if (step <= 0) {
      return;
    }

    const dragDeltaItems = -gestureState.dx / step;
    const velocityDeltaItems = (-gestureState.vx * CATEGORY_INSIGHT_VELOCITY_PROJECTION_MS) / step;
    const projectedDeltaItems = dragDeltaItems + velocityDeltaItems;
    const shouldAdvance =
      Math.abs(dragDeltaItems) >= snapCommitRatioForSource(source) ||
      Math.abs(gestureState.vx) >= snapVelocityThresholdForSource(source);
    const direction =
      projectedDeltaItems === 0 ? Math.sign(dragDeltaItems) : Math.sign(projectedDeltaItems);
    const targetLoopIndex = shouldAdvance
      ? Math.round(gestureStartLoopPositionRef.current) +
        direction * Math.max(1, Math.round(Math.abs(projectedDeltaItems)))
      : Math.round(gestureStartLoopPositionRef.current);
    const velocityInItems = Math.max(-8, Math.min(8, (-gestureState.vx * 1000) / step));

    snapToLoopIndex(targetLoopIndex, true, true, velocityInItems);
  }

  function handleGestureCancel() {
    snapToLoopIndex(Math.round(gestureStartLoopPositionRef.current), true, false);
  }

  function createPanResponder(source: CategoryInsightSwipeSource) {
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) =>
        shouldClaimHorizontalCategoryGesture(gestureState),
      onPanResponderGrant: handleGestureGrant,
      onPanResponderMove: (_, gestureState) => handleGestureMove(source, gestureState),
      onPanResponderRelease: (_, gestureState) => handleGestureEnd(source, gestureState),
      onPanResponderTerminate: handleGestureCancel,
      onPanResponderTerminationRequest: (_, gestureState) =>
        shouldReleaseCategoryGestureToVerticalScroll(gestureState),
      onShouldBlockNativeResponder: () => false,
    });
  }

  function handleFilterPress(filter: CategoryInsightFilter, loopIndex: number) {
    if (filter === activeFilterRef.current) {
      snapToLoopIndex(loopIndex, true, false);
      return;
    }

    snapToLoopIndex(loopIndex, true, true);
  }

  if (!podiumPanResponderRef.current) {
    podiumPanResponderRef.current = createPanResponder('podium');
  }

  if (!filterPanResponderRef.current) {
    filterPanResponderRef.current = createPanResponder('filter');
  }

  const podiumPanResponder = podiumPanResponderRef.current;
  const filterPanResponder = filterPanResponderRef.current;

  return (
    <>
      <View
        onLayout={handlePodiumLayout}
        style={styles.podiumPager}
        {...podiumPanResponder.panHandlers}
      >
        <Animated.View
          style={[
            styles.syncedPodiumTrack,
            { width: resolvedPodiumWidth * podiumFilters.length },
            podiumTrackStyle,
          ]}
        >
          {podiumFilters.map((pageFilter, pageIndex) => (
            <View
              key={`${pageIndex}:${pageFilter}`}
              style={[
                styles.syncedPodiumPage,
                styles.podiumPagerPage,
                { width: resolvedPodiumWidth },
              ]}
            >
              {renderPage(pageFilter)}
            </View>
          ))}
        </Animated.View>
      </View>

      <View onLayout={handleFilterLayout} style={styles.filterStack}>
        <View style={styles.filterViewport} {...filterPanResponder.panHandlers}>
          <Animated.View style={[styles.filterRail, filterTrackStyle]}>
            {filterOptions.map((option) => {
              const selected = option.value === visualFilter;
              const color = categoryInsightToneColor(categoryInsightTone(option.value));
              const focusStyle = {
                opacity: positionProgress.interpolate({
                  extrapolate: 'clamp',
                  inputRange: [option.loopIndex - 1, option.loopIndex, option.loopIndex + 1],
                  outputRange: [0.44, 1, 0.44],
                }),
                transform: [
                  {
                    scale: positionProgress.interpolate({
                      extrapolate: 'clamp',
                      inputRange: [option.loopIndex - 1, option.loopIndex, option.loopIndex + 1],
                      outputRange: [0.96, 1.04, 0.96],
                    }),
                  },
                ],
              };
              const shadowStyle = {
                opacity: positionProgress.interpolate({
                  extrapolate: 'clamp',
                  inputRange: [option.loopIndex - 1, option.loopIndex, option.loopIndex + 1],
                  outputRange: [0, 0.48, 0],
                }),
              };

              return (
                <Animated.View
                  key={option.carouselKey}
                  style={[styles.metricCarouselItem, focusStyle]}
                >
                  <Pressable
                    accessibilityLabel={`Ver podio por ${option.label}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => handleFilterPress(option.value, option.loopIndex)}
                    style={({ pressed }) => [
                      styles.metricCarouselButton,
                      pressed ? styles.metricCarouselItemPressed : null,
                    ]}
                  >
                    <Ionicons color={color} name={categoryInsightIcon(option.value)} size={18} />
                    <AppText
                      adjustsFontSizeToFit
                      minimumFontScale={0.78}
                      numberOfLines={1}
                      style={[styles.metricCarouselText, { color }]}
                    >
                      {compactCategoryInsightLabel(option.value)}
                    </AppText>
                    <Animated.View
                      style={[styles.metricCarouselShadow, { backgroundColor: color }, shadowStyle]}
                    />
                  </Pressable>
                </Animated.View>
              );
            })}
          </Animated.View>
        </View>
      </View>
    </>
  );
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
    return 'No hay movimientos rechazados para esta categoria.';
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

  return 'No hay transacciones cerradas para esta categoría.';
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
      historyItems,
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
  const selectedInsightByFilter = {} as Record<CategoryInsightFilter, CategoryInsightRow | null>;

  for (const filter of CATEGORY_INSIGHT_VALUES) {
    selectedInsightByFilter[filter] =
      selectedCategory && selectedCategoryRow
        ? (categoryRowsByFilter[filter].find(
            (insight) => insight.row.category === selectedCategory,
          ) ?? emptyCategoryInsight(selectedCategoryRow, filter))
        : null;
  }

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
