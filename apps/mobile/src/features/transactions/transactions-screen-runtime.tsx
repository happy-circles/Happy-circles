import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ActivityItemDto, PersonCardDto } from '@happy-circles/application';
import type { TransactionCategory } from '@happy-circles/shared';

import { EmptyState } from '@/components/empty-state';
import { HappyCirclesMotion } from '@/components/happy-circles-motion';
import { HistoryCaseCard, type HistoryCaseTone } from '@/components/history-case-card';
import { ScreenShell } from '@/components/screen-shell';
import { SectionBlock } from '@/components/section-block';
import { backOrReturnTo, pushRoute } from '@/lib/navigation';
import { triggerAppSelectionHaptic } from '@/lib/app-haptics';
import {
  buildHistoryCases,
  friendlyHistoryStepLabel,
  type HistoryCase,
  type HistoryCaseItem,
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
  markNotificationItemsViewed,
  notificationViewKeyForItem,
  useAppSnapshot,
} from '@/lib/live-data';
import { theme, type AppTheme } from '@/lib/theme';
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
  isNoBalanceTransactionStatus,
  isPendingTransactionItem,
  transactionVisualCategory,
} from '@/lib/transaction-presentation';
import { useSession } from '@/providers/session-provider';
import { AppText } from '@/components/app-text';
import { PendingTransactionCard } from './transactions-pending-card';
import { useAppTheme } from '@/providers/theme-provider';

const PRIMARY_FILTER_OPTIONS: readonly {
  readonly label: string;
  readonly value: Extract<
    TransactionRootFilter,
    'all' | 'owed_to_me' | 'i_owe' | 'pending' | 'rejected'
  >;
}[] = [
  { label: 'Todo', value: 'all' },
  { label: 'Pendientes', value: 'pending' },
  { label: 'Rechazadas', value: 'rejected' },
  { label: 'Te deben', value: 'owed_to_me' },
  { label: 'Debes', value: 'i_owe' },
];

function isBalanceRootItem(item: ActivityItemDto): boolean {
  return (
    !isNoBalanceTransactionStatus(item.status) &&
    (item.tone === 'positive' || item.tone === 'negative')
  );
}

function matchesPendingFilter(item: ActivityItemDto, filter: TransactionRootFilter): boolean {
  if (filter === 'all' || filter === 'pending' || filter === 'projection') {
    return true;
  }

  if (filter === 'pending_incoming') {
    return item.tone === 'positive';
  }

  if (filter === 'pending_outgoing') {
    return item.tone === 'negative';
  }

  return false;
}

function matchesHistoryFilter(item: ActivityItemDto, filter: TransactionRootFilter): boolean {
  if (filter === 'all') {
    return true;
  }

  if (filter === 'rejected') {
    return item.status === 'rejected';
  }

  if (filter === 'current_balance') {
    return isBalanceRootItem(item);
  }

  if (filter === 'owed_to_me') {
    return isBalanceRootItem(item) && item.tone === 'positive';
  }

  if (filter === 'i_owe') {
    return isBalanceRootItem(item) && item.tone === 'negative';
  }

  return false;
}

function matchesCategoryFilter(
  item: ActivityItemDto,
  category: TransactionCategory | null,
): boolean {
  return !category || transactionVisualCategory(item) === category;
}

function emptyFilterTitle(filter: TransactionRootFilter): string {
  if (filter === 'all') {
    return 'Sin transacciones';
  }

  if (filter === 'pending' || filter === 'pending_incoming' || filter === 'pending_outgoing') {
    return 'Sin pendientes';
  }

  if (filter === 'rejected') {
    return 'Sin rechazadas';
  }

  if (filter === 'projection') {
    return 'Sin raíz de proyección';
  }

  return 'Sin movimientos';
}

function emptyFilterDescription(filter: TransactionRootFilter): string {
  if (filter === 'all') {
    return 'Cuando registres movimientos o se creen propuestas, aparecerán aquí.';
  }

  if (filter === 'pending_incoming') {
    return 'No hay pendientes que aumenten tu balance proyectado.';
  }

  if (filter === 'pending_outgoing') {
    return 'No hay pendientes que reduzcan tu balance proyectado.';
  }

  if (filter === 'pending' || filter === 'projection') {
    return 'No hay movimientos pendientes para esta raiz.';
  }

  if (filter === 'rejected') {
    return 'No hay movimientos rechazados en esta vista.';
  }

  if (filter === 'owed_to_me') {
    return 'No hay movimientos donde te deban en esta vista.';
  }

  if (filter === 'i_owe') {
    return 'No hay movimientos donde debas en esta vista.';
  }

  return 'No hay movimientos que expliquen esta raiz del balance.';
}

function initialsBackgroundColor(
  person: Pick<PersonCardDto, 'userId' | 'displayName'>,
  activeTheme: AppTheme = theme,
): string {
  const source = `${person.userId}:${person.displayName}`;
  let hash = 0;

  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) >>> 0;
  }

  return (
    activeTheme.palette.avatar[hash % activeTheme.palette.avatar.length] ??
    activeTheme.colors.primary
  );
}

function personIdFromHref(href: string | undefined): string | null {
  const match = href?.match(/^\/person\/([^/?#]+)/);
  if (!match?.[1]) {
    return null;
  }

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function activityHistoryCaseItem(item: ActivityItemDto): HistoryCaseItem {
  const normalizedKind: HistoryCaseItem['kind'] =
    item.kind === 'settlement'
      ? 'settlement'
      : item.kind === 'payment' || item.kind === 'manual_payment'
        ? 'payment'
        : item.kind === 'system'
          ? 'system'
          : 'request';

  return {
    amountMinor: item.amountMinor,
    category: item.category,
    counterpartyLabel: item.counterpartyLabel,
    detail: item.detail,
    flowLabel: item.flowLabel,
    happenedAt: item.happenedAt,
    happenedAtLabel: item.happenedAtLabel,
    happyCircleCaseId: item.happyCircleCaseId,
    href: item.href,
    id: item.id,
    kind: normalizedKind,
    originRequestId: item.originRequestId,
    originSettlementProposalId: item.originSettlementProposalId,
    replacedByProposalId: item.replacedByProposalId,
    replacesProposalId: item.replacesProposalId,
    staleReason: item.staleReason,
    status: item.status,
    subtitle: item.subtitle,
    title: item.title,
    tone: item.tone,
  };
}

function transactionPersonForHistoryCase(
  people: readonly PersonCardDto[],
  itemCase: Pick<HistoryCase<HistoryCaseItem>, 'latest'>,
): PersonCardDto | undefined {
  const hrefPersonId = personIdFromHref(itemCase.latest.href);
  if (hrefPersonId) {
    const matchedPerson = people.find((person) => person.userId === hrefPersonId);
    if (matchedPerson) {
      return matchedPerson;
    }
  }

  return people.find((person) => person.displayName === itemCase.latest.counterpartyLabel);
}

function transactionHistoryCaseHref(
  people: readonly PersonCardDto[],
  itemCase: HistoryCase<HistoryCaseItem>,
): Href {
  if (itemCase.isCycleSnippet) {
    const proposalId =
      itemCase.latest.originSettlementProposalId ??
      itemCase.steps.find((step) => step.originSettlementProposalId)?.originSettlementProposalId;

    if (proposalId) {
      return `/settlements/${proposalId}` as Href;
    }

    return itemCase.latest.href?.startsWith('/settlements/')
      ? (itemCase.latest.href as Href)
      : ('/circles' as Href);
  }

  const matchedPerson = transactionPersonForHistoryCase(people, itemCase);
  const personId = matchedPerson?.userId ?? personIdFromHref(itemCase.latest.href);
  if (!personId) {
    return itemCase.latest.href?.startsWith('/person/')
      ? (itemCase.latest.href as Href)
      : ('/transactions' as Href);
  }

  const focusId =
    itemCase.latest.originSettlementProposalId ??
    itemCase.latest.originRequestId ??
    itemCase.latest.id;

  return `/person/${personId}?panel=history&focus=${encodeURIComponent(focusId)}` as Href;
}

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
          backgroundColor: selected
            ? activeTheme.colors.primaryGhost
            : activeTheme.colors.surface,
          borderColor: selected ? activeTheme.colors.primaryGhost : activeTheme.colors.border,
        },
        pressed ? styles.filterPillPressed : null,
      ]}
    >
      {icon ? (
        <Ionicons
          color={selected ? (iconColor ?? activeTheme.colors.primary) : activeTheme.colors.textMuted}
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

export function TransactionsScreen() {
  const activeTheme = useAppTheme();
  const { top: topInset } = useSafeAreaInsets();
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
  const [optimisticNotificationViewedKeys, setOptimisticNotificationViewedKeys] = useState<
    ReadonlySet<string>
  >(() => new Set());

  const sections = snapshotQuery.data?.activitySections ?? [];
  const pendingSection = sections.find((section) => section.key === 'pending');
  const historySection = sections.find((section) => section.key === 'history');
  const activePrimaryFilter = primaryTransactionFilter(activeFilter);
  const pendingTransactionItems = (pendingSection?.items ?? []).filter(isPendingTransactionItem);
  const notificationViewedKeys = useMemo(() => {
    const keys = new Set(snapshotQuery.data?.notificationViewedKeys ?? []);
    for (const key of optimisticNotificationViewedKeys) {
      keys.add(key);
    }

    return keys;
  }, [optimisticNotificationViewedKeys, snapshotQuery.data?.notificationViewedKeys]);
  const unviewedPendingTransactionItems = useMemo(
    () =>
      pendingTransactionItems.filter(
        (item) => !notificationViewedKeys.has(notificationViewKeyForItem(item)),
      ),
    [notificationViewedKeys, pendingTransactionItems],
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
    () =>
      new Set(
        visiblePendingTransactionItems.flatMap((item) =>
          item.kind === 'settlement_proposal' && item.happyCircleCaseId
            ? [item.happyCircleCaseId]
            : [],
        ),
      ),
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
      buildHistoryCases(
        historyTransactionItems.map((item) => activityHistoryCaseItem(item)),
      ).filter(
        (itemCase) =>
          itemCase.latest.status !== 'stale' ||
          !itemCase.latest.happyCircleCaseId ||
          !visiblePendingHappyCircleCaseIds.has(itemCase.latest.happyCircleCaseId),
      ),
    [historyTransactionItems, visiblePendingHappyCircleCaseIds],
  );
  const hasVisibleTransactions =
    visiblePendingTransactionItems.length > 0 || historyCases.length > 0;

  useEffect(() => {
    setOptimisticNotificationViewedKeys(new Set());
  }, [session.userId]);

  useEffect(() => {
    setActiveFilter(initialFilter);
  }, [initialFilter]);

  useEffect(() => {
    if (!session.userId || unviewedPendingTransactionItems.length === 0) {
      return;
    }

    const nextKeys = unviewedPendingTransactionItems.map((item) =>
      notificationViewKeyForItem(item),
    );
    const nextKeySet = new Set(nextKeys);
    setOptimisticNotificationViewedKeys((current) => {
      const merged = new Set(current);
      for (const key of nextKeys) {
        merged.add(key);
      }

      return merged;
    });

    void markNotificationItemsViewed(session.userId, unviewedPendingTransactionItems).catch(() => {
      setOptimisticNotificationViewedKeys((current) => {
        const next = new Set(current);
        for (const key of nextKeySet) {
          next.delete(key);
        }

        return next;
      });
    });
  }, [session.userId, unviewedPendingTransactionItems]);

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

  if (snapshotQuery.isLoading) {
    return (
      <ScreenShell
        contentContainerStyle={{ paddingTop: topInset + theme.spacing.md }}
        headerVariant="plain"
        largeTitle={false}
        safeAreaEdges={['left', 'right']}
        subtitle="Estamos organizando tus pendientes y el historial completo."
        title="Transacciones"
      >
        <View style={styles.loadingState}>
          <HappyCirclesMotion size={108} variant="loading" />
          <AppText style={styles.supportText}>Leyendo el ledger real desde Supabase.</AppText>
        </View>
      </ScreenShell>
    );
  }

  if (snapshotQuery.error) {
    return (
      <ScreenShell
        contentContainerStyle={{ paddingTop: topInset + theme.spacing.md }}
        headerVariant="plain"
        largeTitle={false}
        refresh={refresh}
        safeAreaEdges={['left', 'right']}
        subtitle="No pudimos cargar tus transacciones."
        title="Transacciones"
      >
        <AppText style={styles.supportText}>{snapshotQuery.error.message}</AppText>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell
      contentContainerStyle={{ paddingTop: topInset + theme.spacing.md }}
      headerLeading={
        <Pressable
          onPress={() => {
            backOrReturnTo(router, '/home');
          }}
          style={({ pressed }) => [styles.backButton, pressed ? styles.backButtonPressed : null]}
        >
          <Ionicons color={activeTheme.colors.text} name="chevron-back" size={20} />
        </Pressable>
      }
      headerVariant="plain"
      largeTitle={false}
      refresh={refresh}
      safeAreaEdges={['left', 'right']}
      title="Transacciones"
      titleAlign="center"
    >
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
              Categoria: {transactionCategoryLabel(categoryFilter)}
            </AppText>
          </View>
        ) : null}
      </View>

      {!hasVisibleTransactions ? (
        <EmptyState
          description={emptyFilterDescription(activeFilter)}
          title={emptyFilterTitle(activeFilter)}
        />
      ) : null}

      {visiblePendingTransactionItems.length > 0 ? (
        <SectionBlock title="Pendientes">
          <View style={styles.list}>
            {visiblePendingTransactionItems.map((item) => (
              <PendingTransactionCard
                item={item}
                key={item.id}
                people={people}
                unread={!notificationViewedKeys.has(notificationViewKeyForItem(item))}
              />
            ))}
          </View>
        </SectionBlock>
      ) : null}

      {historyCases.length > 0 ? (
        <SectionBlock title="Historial">
          <View style={styles.list}>
            {historyCases.map((itemCase) => {
              const latest = itemCase.latest;
              const caseAmountLabel = historyCaseAmountLabel(latest);
              const caseTone = historyImpactTone(latest) as HistoryCaseTone;
              const caseTitle = friendlyHistoryStepLabel(latest);
              const caseDescription = historyCardTitle(itemCase);
              const caseEyebrow = historyCaseEyebrow(itemCase);
              const historyPerson = transactionPersonForHistoryCase(people, itemCase);
              const fallbackPerson = {
                displayName: caseEyebrow ?? latest.counterpartyLabel ?? 'Persona',
                userId: historyPerson?.userId ?? itemCase.id,
              };

              return (
                <HistoryCaseCard
                  actorAvatarUrl={
                    itemCase.isCycleSnippet ? null : (historyPerson?.avatarUrl ?? null)
                  }
                  actorFallbackColor={
                    itemCase.isCycleSnippet
                      ? undefined
                      : initialsBackgroundColor(fallbackPerson, activeTheme)
                  }
                  amountLabel={caseAmountLabel}
                  amountStruckThrough={historyAmountIsVoided(latest)}
                  category={historyCaseVisualCategory(itemCase)}
                  description={null}
                  eyebrow={caseEyebrow}
                  expandable={false}
                  isCycleSnippet={itemCase.isCycleSnippet}
                  isExpanded={false}
                  key={itemCase.id}
                  meta={historyCaseMeta(itemCase)}
                  onPress={() => pushRoute(router, transactionHistoryCaseHref(people, itemCase))}
                  statusLabel={historyCaseStatusLabel(itemCase)}
                  statusTone={historyCaseStatusTone(itemCase)}
                  steps={itemCase.steps.map((step, index) => {
                    const amountLabel = historyTimelineStepAmountLabel(itemCase, step, index);
                    const impact = historyImpactLabel(step);

                    return {
                      amountLabel,
                      category: historyTimelineStepCategory(itemCase, step, index),
                      detail: historyTimelineStepDetailLabel(step),
                      id: step.id,
                      impact:
                        !amountLabel && caseAmountLabel && impact?.includes(caseAmountLabel)
                          ? null
                          : impact,
                      meta: historyTimelineStepMetaLabel(itemCase, step),
                      title: friendlyHistoryStepLabel(step),
                      tone: historyImpactTone(step) as HistoryCaseTone,
                    };
                  })}
                  title={caseDescription || caseTitle}
                  tone={caseTone}
                />
              );
            })}
          </View>
        </SectionBlock>
      ) : null}
    </ScreenShell>
  );
}
