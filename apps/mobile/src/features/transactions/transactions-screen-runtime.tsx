import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandedRefreshVirtualizedListContainer } from '@/components/branded-refresh-control';
import { EmptyState } from '@/components/empty-state';
import { HappyCirclesMotion } from '@/components/happy-circles-motion';
import { HistoryCaseCard, type HistoryCaseTone } from '@/components/history-case-card';
import { ScreenShell } from '@/components/screen-shell';
import { SectionBlock } from '@/components/section-block';
import { pushRoute, returnToRoute } from '@/lib/navigation';
import { triggerAppSelectionHaptic } from '@/lib/app-haptics';
import {
  friendlyHistoryStepLabel,
  historyAmountIsVoided,
  historyCardTitle,
  historyCaseAmountLabel,
  historyCaseEyebrow,
  historyCaseMeta,
  historyCaseStatusLabel,
  historyCaseStatusTone,
  historyCaseVisualCategory,
  historyImpactLabel,
  historyImpactTone,
  historyTimelineStepCategory,
  historyTimelineStepDetailLabel,
  historyTimelineStepAmountLabel,
  historyTimelineStepMetaLabel,
} from '@/lib/history-cases';
import {
  notificationItemCanAlert,
  notificationViewKeyForItem,
  notificationViewedKeysWithLocalCache,
  useAppSnapshot,
} from '@/lib/live-data';
import { theme } from '@/lib/theme';
import { transactionsScreenStyles as styles } from './transactions-screen-styles';
import {
  normalizeTransactionCategory,
  transactionCategoryColor,
  transactionCategoryIcon,
  transactionCategoryLabel,
} from '@/lib/transaction-categories';
import {
  normalizeTransactionFilter,
  primaryTransactionFilter,
  type TransactionRootFilter,
} from '@/lib/transaction-filters';
import { useSnapshotRefresh } from '@/lib/use-snapshot-refresh';
import {
  isConsolidatedTransactionItem,
  isPendingTransactionItem,
} from '@/lib/transaction-presentation';
import {
  buildTransactionMovementHistoryCases,
  historyCaseVisibleWithPendingHappyCircle,
  pendingHappyCircleCaseIds,
} from '@/lib/transaction-history-cases';
import { useSession } from '@/providers/session-provider';
import { AppText } from '@/components/app-text';
import { PendingTransactionCard } from './transactions-pending-card';
import { useAppTheme } from '@/providers/theme-provider';
import {
  PRIMARY_FILTER_OPTIONS,
  emptyFilterDescription,
  emptyFilterTitle,
  initialsBackgroundColor,
  matchesCategoryFilter,
  matchesHistoryFilter,
  matchesPendingFilter,
  transactionHistoryCaseHref,
  transactionPersonForHistoryCase,
} from './transactions-screen-model';

function FilterPill({
  icon,
  iconColor,
  label,
  onPress,
  selected,
}: {
  readonly icon?: keyof typeof Ionicons.glyphMap;
  readonly iconColor?: string;
  readonly label: string;
  readonly onPress: () => void;
  readonly selected: boolean;
}) {
  const activeTheme = useAppTheme();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.filterPill,
        {
          backgroundColor: selected ? activeTheme.colors.primaryGhost : activeTheme.colors.surface,
          borderColor: selected ? activeTheme.colors.primaryGhost : activeTheme.colors.border,
        },
        pressed ? styles.filterPillPressed : null,
      ]}
    >
      {icon ? (
        <Ionicons
          color={
            selected ? (iconColor ?? activeTheme.colors.primary) : activeTheme.colors.textMuted
          }
          name={icon}
          size={14}
        />
      ) : null}
      <AppText
        style={[
          styles.filterPillText,
          { color: selected ? activeTheme.colors.primary : activeTheme.colors.textMuted },
        ]}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

function HistoryListSeparator() {
  return <View style={styles.historyListSeparator} />;
}

export function TransactionsScreen() {
  const activeTheme = useAppTheme();
  const { bottom: bottomInset, top: topInset } = useSafeAreaInsets();
  const router = useRouter();
  const searchParams = useLocalSearchParams<{
    category?: string | string[];
    filter?: string | string[];
  }>();
  const session = useSession();
  const snapshotQuery = useAppSnapshot();
  const refresh = useSnapshotRefresh(snapshotQuery);
  const initialFilter = normalizeTransactionFilter(searchParams.filter);
  const rawCategory = Array.isArray(searchParams.category)
    ? searchParams.category[0]
    : searchParams.category;
  const categoryFilter = rawCategory ? normalizeTransactionCategory(rawCategory) : null;
  const circleFilterSelected = categoryFilter === 'cycle';
  const [activeFilter, setActiveFilter] = useState<TransactionRootFilter>(initialFilter);
  const sections = snapshotQuery.data?.activitySections ?? [];
  const pendingSection = sections.find((section) => section.key === 'pending');
  const historySection = sections.find((section) => section.key === 'history');
  const activePrimaryFilter = primaryTransactionFilter(activeFilter);
  const pendingTransactionItems = useMemo(
    () => (pendingSection?.items ?? []).filter(isPendingTransactionItem),
    [pendingSection?.items],
  );
  const notificationViewedKeys = useMemo(
    () =>
      notificationViewedKeysWithLocalCache(
        session.userId,
        snapshotQuery.data?.notificationViewedKeys ?? [],
      ),
    [session.userId, snapshotQuery.data?.notificationViewedKeys],
  );
  const visiblePendingTransactionItems = useMemo(
    () =>
      pendingTransactionItems.filter(
        (item) =>
          matchesPendingFilter(item, activeFilter) && matchesCategoryFilter(item, categoryFilter),
      ),
    [activeFilter, categoryFilter, pendingTransactionItems],
  );
  const visiblePendingHappyCircleCaseIds = useMemo(
    () => pendingHappyCircleCaseIds(visiblePendingTransactionItems),
    [visiblePendingTransactionItems],
  );
  const historyTransactionItems = useMemo(
    () =>
      (historySection?.items ?? [])
        .filter(isConsolidatedTransactionItem)
        .filter(
          (item) =>
            matchesHistoryFilter(item, activeFilter) && matchesCategoryFilter(item, categoryFilter),
        ),
    [activeFilter, categoryFilter, historySection?.items],
  );
  const people = snapshotQuery.data?.dashboard.activePeople ?? snapshotQuery.data?.people ?? [];
  const historyCases = useMemo(
    () =>
      buildTransactionMovementHistoryCases(historyTransactionItems).filter((itemCase) =>
        historyCaseVisibleWithPendingHappyCircle(itemCase, visiblePendingHappyCircleCaseIds),
      ),
    [historyTransactionItems, visiblePendingHappyCircleCaseIds],
  );
  const hasVisibleTransactions =
    visiblePendingTransactionItems.length > 0 || historyCases.length > 0;

  useEffect(() => {
    setActiveFilter(initialFilter);
  }, [initialFilter]);

  function selectPrimaryFilter(filter: (typeof PRIMARY_FILTER_OPTIONS)[number]['value']) {
    triggerAppSelectionHaptic();
    setActiveFilter(filter);

    if (circleFilterSelected) {
      router.setParams({ category: undefined });
    }
  }

  function selectCircleFilter() {
    triggerAppSelectionHaptic();
    setActiveFilter('all');
    router.setParams({ category: 'cycle', filter: undefined });
  }

  function renderHistoryCase({ item }: { readonly item: (typeof historyCases)[number] }) {
    const latest = item.latest;
    const caseAmountLabel = historyCaseAmountLabel(latest);
    const caseTone = historyImpactTone(latest) as HistoryCaseTone;
    const caseTitle = friendlyHistoryStepLabel(latest);
    const caseDescription = historyCardTitle(item);
    const caseEyebrow = historyCaseEyebrow(item);
    const historyPerson = transactionPersonForHistoryCase(people, item);
    const fallbackPerson = {
      displayName: caseEyebrow ?? latest.counterpartyLabel ?? 'Persona',
      userId: historyPerson?.userId ?? item.id,
    };

    return (
      <View style={styles.containedListItem}>
        <HistoryCaseCard
          actorAvatarUrl={item.isCycleSnippet ? null : (historyPerson?.avatarUrl ?? null)}
          actorFallbackColor={
            item.isCycleSnippet ? undefined : initialsBackgroundColor(fallbackPerson, activeTheme)
          }
          amountLabel={caseAmountLabel}
          amountStruckThrough={historyAmountIsVoided(latest)}
          category={historyCaseVisualCategory(item)}
          description={null}
          eyebrow={caseEyebrow}
          expandable={false}
          isCycleSnippet={item.isCycleSnippet}
          isExpanded={false}
          meta={historyCaseMeta(item)}
          onPress={() => pushRoute(router, transactionHistoryCaseHref(people, item))}
          statusLabel={historyCaseStatusLabel(item)}
          statusTone={historyCaseStatusTone(item)}
          steps={item.steps.map((step, index) => {
            const amountLabel = historyTimelineStepAmountLabel(item, step, index);
            const impact = historyImpactLabel(step);

            return {
              amountLabel,
              category: historyTimelineStepCategory(item, step, index),
              detail: historyTimelineStepDetailLabel(step),
              id: step.id,
              impact:
                !amountLabel && caseAmountLabel && impact?.includes(caseAmountLabel)
                  ? null
                  : impact,
              meta: historyTimelineStepMetaLabel(item, step),
              title: friendlyHistoryStepLabel(step),
              tone: historyImpactTone(step) as HistoryCaseTone,
            };
          })}
          title={caseDescription || caseTitle}
          tone={caseTone}
        />
      </View>
    );
  }

  const filterControls = (
    <View style={styles.filterStack}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRail}
      >
        {PRIMARY_FILTER_OPTIONS.map((option) => (
          <FilterPill
            key={option.value}
            label={option.label}
            onPress={() => selectPrimaryFilter(option.value)}
            selected={!circleFilterSelected && activePrimaryFilter === option.value}
          />
        ))}
        <FilterPill
          icon="happy-outline"
          iconColor={transactionCategoryColor('cycle')}
          label="Circles"
          onPress={selectCircleFilter}
          selected={circleFilterSelected}
        />
      </ScrollView>
      {categoryFilter && !circleFilterSelected ? (
        <View
          style={[
            styles.categoryFilterChip,
            {
              backgroundColor: activeTheme.colors.surfaceMuted,
              borderColor: activeTheme.colors.hairline,
            },
          ]}
        >
          <Ionicons
            color={transactionCategoryColor(categoryFilter)}
            name={transactionCategoryIcon(categoryFilter) as keyof typeof Ionicons.glyphMap}
            size={13}
          />
          <AppText style={[styles.categoryFilterText, { color: activeTheme.colors.textMuted }]}>
            Categoría: {transactionCategoryLabel(categoryFilter)}
          </AppText>
        </View>
      ) : null}
    </View>
  );

  const pendingTransactionsSection =
    visiblePendingTransactionItems.length > 0 ? (
      <SectionBlock title="Pendientes">
        <View style={styles.list}>
          {visiblePendingTransactionItems.map((item) => (
            <PendingTransactionCard
              item={item}
              key={item.id}
              people={people}
              unread={
                notificationItemCanAlert(item) &&
                !notificationViewedKeys.has(notificationViewKeyForItem(item))
              }
            />
          ))}
        </View>
      </SectionBlock>
    ) : null;

  const listHeader = (
    <>
      <View style={[styles.transactionsTopChrome, { paddingTop: topInset + theme.spacing.md }]}>
        <View style={styles.containedContent}>
          <View style={styles.transactionsHeader}>
            <Pressable
              onPress={() => returnToRoute(router, '/home')}
              style={({ pressed }) => [
                styles.backButton,
                pressed ? styles.backButtonPressed : null,
              ]}
            >
              <Ionicons color={activeTheme.colors.text} name="chevron-back" size={20} />
            </Pressable>
            <AppText style={[styles.transactionsHeaderTitle, { color: activeTheme.colors.text }]}>
              Movimientos
            </AppText>
            <View style={styles.headerActionSpacer} />
          </View>
        </View>
      </View>

      <View style={[styles.containedContent, styles.transactionsControlsSection]}>
        {filterControls}

        {!hasVisibleTransactions ? (
          <EmptyState
            description={emptyFilterDescription(activeFilter)}
            title={emptyFilterTitle(activeFilter)}
          />
        ) : null}

        {pendingTransactionsSection}

        {historyCases.length > 0 ? (
          <View style={styles.virtualHistoryHeader}>
            <AppText style={[styles.virtualHistoryTitle, { color: activeTheme.colors.text }]}>
              Historial
            </AppText>
          </View>
        ) : null}
      </View>
    </>
  );

  if ((snapshotQuery.isRestoringCache || snapshotQuery.isLoading) && !snapshotQuery.data) {
    return (
      <ScreenShell
        contentContainerStyle={{ paddingTop: topInset + theme.spacing.md }}
        headerVariant="plain"
        largeTitle={false}
        safeAreaEdges={['left', 'right']}
        subtitle="Estamos organizando tus pendientes y el historial completo."
        title="Movimientos"
      >
        <View style={styles.loadingState}>
          <HappyCirclesMotion size={108} variant="loading" />
          <AppText style={styles.supportText}>Estamos cargando tus movimientos.</AppText>
        </View>
      </ScreenShell>
    );
  }

  if (snapshotQuery.error && !snapshotQuery.data) {
    return (
      <ScreenShell
        contentContainerStyle={{ paddingTop: topInset + theme.spacing.md }}
        headerVariant="plain"
        largeTitle={false}
        refresh={refresh}
        safeAreaEdges={['left', 'right']}
        subtitle="No pudimos cargar tus movimientos."
        title="Movimientos"
      >
        <AppText style={styles.supportText}>{snapshotQuery.error.message}</AppText>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell
      contentWidthStyle={styles.transactionsContentWidth}
      contentContainerStyle={styles.transactionsScreenRoot}
      contentMode="full"
      headerVisible={false}
      safeAreaEdges={['left', 'right']}
      scrollEnabled={false}
      title="Movimientos"
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
          <FlatList
            ItemSeparatorComponent={HistoryListSeparator}
            ListFooterComponent={
              <View
                style={[
                  styles.historyListFooter,
                  { height: theme.spacing.md + Math.max(0, bottomInset) },
                ]}
              />
            }
            ListHeaderComponent={listHeader}
            contentContainerStyle={styles.transactionsScreenContent}
            data={historyCases}
            keyExtractor={(item) => item.id}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            onScroll={onScroll}
            onTouchCancel={onTouchCancel}
            onTouchEnd={onTouchEnd}
            onTouchMove={onTouchMove}
            onTouchStart={onTouchStart}
            refreshControl={refreshControl}
            renderItem={renderHistoryCase}
            scrollEventThrottle={scrollEventThrottle}
            showsVerticalScrollIndicator={false}
            style={[styles.virtualList, { backgroundColor: activeTheme.colors.background }]}
          />
        )}
      </BrandedRefreshVirtualizedListContainer>
    </ScreenShell>
  );
}
