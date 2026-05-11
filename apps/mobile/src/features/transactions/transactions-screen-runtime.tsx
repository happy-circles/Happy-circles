import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import type { ActivityItemDto, PersonCardDto } from '@happy-circles/application';
import type { TransactionCategory } from '@happy-circles/shared';

import { EmptyState } from '@/components/empty-state';
import { HappyCirclesMotion } from '@/components/happy-circles-motion';
import { HistoryCaseCard, type HistoryCaseTone } from '@/components/history-case-card';
import { ScreenShell } from '@/components/screen-shell';
import { SectionBlock } from '@/components/section-block';
import { backOrReturnTo } from '@/lib/navigation';
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
  isNoBalanceTransactionStatus,
  isPendingTransactionItem,
  transactionVisualCategory,
} from '@/lib/transaction-presentation';
import { useSession } from '@/providers/session-provider';
import { AppText } from '@/components/app-text';
import { PendingTransactionCard } from './transactions-pending-card';

const AVATAR_COLORS = ['#c026d3', '#047857', '#2563eb', '#334155', '#dc2626', '#7c3aed'];

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

function initialsBackgroundColor(person: Pick<PersonCardDto, 'userId' | 'displayName'>): string {
  const source = `${person.userId}:${person.displayName}`;
  let hash = 0;

  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) >>> 0;
  }

  return AVATAR_COLORS[hash % AVATAR_COLORS.length] ?? theme.colors.primary;
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
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.filterPill,
        selected ? styles.filterPillSelected : null,
        pressed ? styles.filterPillPressed : null,
      ]}
    >
      {icon ? (
        <Ionicons
          color={selected ? (iconColor ?? theme.colors.primary) : theme.colors.textMuted}
          name={icon}
          size={14}
        />
      ) : null}
      <AppText style={[styles.filterPillText, selected ? styles.filterPillTextSelected : null]}>
        {label}
      </AppText>
    </Pressable>
  );
}

export function TransactionsScreen() {
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
  const [expandedCaseIds, setExpandedCaseIds] = useState<readonly string[]>([]);
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

  function toggleHistoryCase(caseId: string) {
    setExpandedCaseIds((current) => (current[0] === caseId ? [] : [caseId]));
  }

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
        headerVariant="plain"
        largeTitle={false}
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
        headerVariant="plain"
        largeTitle={false}
        refresh={refresh}
        subtitle="No pudimos cargar tus transacciones."
        title="Transacciones"
      >
        <AppText style={styles.supportText}>{snapshotQuery.error.message}</AppText>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell
      headerLeading={
        <Pressable
          onPress={() => {
            backOrReturnTo(router, '/home');
          }}
          style={({ pressed }) => [styles.backButton, pressed ? styles.backButtonPressed : null]}
        >
          <Ionicons color={theme.colors.text} name="chevron-back" size={20} />
        </Pressable>
      }
      headerVariant="plain"
      largeTitle={false}
      refresh={refresh}
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
          <View style={styles.categoryFilterChip}>
            <Ionicons
              color={transactionCategoryColor(categoryFilter)}
              name={transactionCategoryIcon(categoryFilter) as keyof typeof Ionicons.glyphMap}
              size={13}
            />
            <AppText style={styles.categoryFilterText}>
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
                    itemCase.isCycleSnippet ? undefined : initialsBackgroundColor(fallbackPerson)
                  }
                  amountLabel={caseAmountLabel}
                  amountStruckThrough={historyAmountIsVoided(latest)}
                  category={historyCaseVisualCategory(itemCase)}
                  description={null}
                  eyebrow={caseEyebrow}
                  isCycleSnippet={itemCase.isCycleSnippet}
                  isExpanded={expandedCaseIds[0] === itemCase.id}
                  key={itemCase.id}
                  meta={historyCaseMeta(itemCase)}
                  onToggle={() => toggleHistoryCase(itemCase.id)}
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
