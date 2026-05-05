import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { Href } from 'expo-router';

import type { ActivityItemDto, PersonCardDto } from '@happy-circles/application';
import type { TransactionCategory } from '@happy-circles/shared';

import { EmptyState } from '@/components/empty-state';
import { HappyCirclesMotion } from '@/components/happy-circles-motion';
import { HistoryCaseCard, type HistoryCaseTone } from '@/components/history-case-card';
import { ScreenShell } from '@/components/screen-shell';
import { SectionBlock } from '@/components/section-block';
import { TransactionEventCard } from '@/components/transaction-event-card';
import { backOrReturnTo } from '@/lib/navigation';
import {
  buildHistoryCases,
  friendlyHistoryStepLabel,
  type HistoryCaseItem,
  historyCardTitle,
  historyCaseEyebrow,
  historyCaseMeta,
  historyCaseStatusLabel,
  historyCaseStatusTone,
  historyCaseVisualCategory,
  historyImpactLabel,
  historyImpactTone,
  historyStepAmountLabel,
  historyTimelineStepCategory,
  historyTimelineStepDetailLabel,
  historyTimelineStepAmountLabel,
} from '@/lib/history-cases';
import { useAppSnapshot } from '@/lib/live-data';
import {
  getSeenPendingTransactionIds,
  markPendingTransactionIdsSeen,
} from '@/lib/pending-transaction-views';
import { theme } from '@/lib/theme';
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
  isCycleTransactionItem,
  isNoBalanceTransactionStatus,
  isPendingTransactionItem,
  transactionAmountIsVoided,
  transactionAmountLabel,
  transactionCreatedByMetaLabel,
  transactionContextLabel,
  transactionFocusId,
  transactionStatusLabel,
  transactionStatusTone,
  transactionToneColor,
  transactionVisualCategory,
} from '@/lib/transaction-presentation';
import { useSession } from '@/providers/session-provider';

const AVATAR_COLORS = ['#c026d3', '#047857', '#2563eb', '#334155', '#dc2626', '#7c3aed'];

const PRIMARY_FILTER_OPTIONS: readonly {
  readonly label: string;
  readonly value: Extract<TransactionRootFilter, 'all' | 'owed_to_me' | 'i_owe' | 'pending'>;
}[] = [
  { label: 'Todo', value: 'all' },
  { label: 'Pendientes', value: 'pending' },
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

  if (filter === 'projection') {
    return 'Sin raíz de proyección';
  }

  return 'Sin movimientos';
}

function emptyFilterDescription(filter: TransactionRootFilter): string {
  if (filter === 'all') {
    return 'Cuando registres movimientos o se creen propuestas, apareceran aqui.';
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

function transactionPersonForItem(
  people: readonly PersonCardDto[],
  item: ActivityItemDto,
): PersonCardDto | undefined {
  const hrefPersonId = personIdFromHref(item.href);
  if (hrefPersonId) {
    const matchedPerson = people.find((person) => person.userId === hrefPersonId);
    if (matchedPerson) {
      return matchedPerson;
    }
  }

  return people.find((person) => person.displayName === item.counterpartyLabel);
}

function transactionDetailHref(
  people: readonly PersonCardDto[],
  item: ActivityItemDto,
  panel: 'pending' | 'history',
): Href {
  if (item.kind === 'settlement_proposal') {
    return `/settlements/${item.id}` as Href;
  }

  const matchedPerson = transactionPersonForItem(people, item);
  const personId = matchedPerson?.userId ?? personIdFromHref(item.href);

  if (!personId) {
    return (item.href ?? '/transactions') as Href;
  }

  return `/person/${personId}?panel=${panel}&focus=${encodeURIComponent(
    transactionFocusId(item),
  )}` as Href;
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
    id: item.id,
    kind: normalizedKind,
    originRequestId: item.originRequestId,
    originSettlementProposalId: item.originSettlementProposalId,
    status: item.status,
    subtitle: item.subtitle,
    title: item.title,
    tone: item.tone,
  };
}

function PendingTransactionCard({
  item,
  people,
}: {
  readonly item: ActivityItemDto;
  readonly people: readonly PersonCardDto[];
}) {
  const isSystemTransaction = isCycleTransactionItem(item);
  const actorLabel = isSystemTransaction ? 'Happy Circle' : (item.counterpartyLabel ?? 'Persona');
  const matchedPerson = transactionPersonForItem(people, item);
  const fallbackPerson = {
    displayName: actorLabel,
    userId: matchedPerson?.userId ?? item.id,
  };

  return (
    <TransactionEventCard
      accentColor={transactionToneColor(item)}
      actorAvatarUrl={isSystemTransaction ? null : (matchedPerson?.avatarUrl ?? null)}
      actorAvatarVariant={isSystemTransaction ? 'system' : 'person'}
      actorFallbackColor={
        isSystemTransaction ? transactionToneColor(item) : initialsBackgroundColor(fallbackPerson)
      }
      actorLabel={actorLabel}
      amountColor={transactionToneColor(item)}
      amountLabel={transactionAmountLabel(item)}
      amountStruckThrough={transactionAmountIsVoided(item)}
      category={transactionVisualCategory(item)}
      categoryPlacement="none"
      compact
      compactMetaLayout="inline"
      context={transactionContextLabel(item, actorLabel)}
      href={transactionDetailHref(people, item, 'pending')}
      meta={transactionCreatedByMetaLabel(item, actorLabel)}
      statusLabel={transactionStatusLabel(item)}
      statusTone={transactionStatusTone(item)}
    />
  );
}

function FilterPill({
  label,
  onPress,
  selected,
}: {
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
      <Text style={[styles.filterPillText, selected ? styles.filterPillTextSelected : null]}>
        {label}
      </Text>
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
  const [activeFilter, setActiveFilter] = useState<TransactionRootFilter>(initialFilter);
  const [expandedCaseIds, setExpandedCaseIds] = useState<readonly string[]>([]);
  const [seenPendingTransactionIds, setSeenPendingTransactionIds] =
    useState<ReadonlySet<string> | null>(null);

  const sections = snapshotQuery.data?.activitySections ?? [];
  const pendingSection = sections.find((section) => section.key === 'pending');
  const historySection = sections.find((section) => section.key === 'history');
  const activePrimaryFilter = primaryTransactionFilter(activeFilter);
  const pendingTransactionItems = (pendingSection?.items ?? []).filter(isPendingTransactionItem);
  const visiblePendingTransactionItems = pendingTransactionItems.filter(
    (item) =>
      matchesPendingFilter(item, activeFilter) && matchesCategoryFilter(item, categoryFilter),
  );
  const historyTransactionItems = (historySection?.items ?? [])
    .filter(isConsolidatedTransactionItem)
    .filter(
      (item) =>
        matchesHistoryFilter(item, activeFilter) && matchesCategoryFilter(item, categoryFilter),
    );
  const people = snapshotQuery.data?.dashboard.activePeople ?? snapshotQuery.data?.people ?? [];
  const historyCases = useMemo(
    () => buildHistoryCases(historyTransactionItems.map((item) => activityHistoryCaseItem(item))),
    [historyTransactionItems],
  );
  const hasVisibleTransactions =
    visiblePendingTransactionItems.length > 0 || historyCases.length > 0;

  useEffect(() => {
    let isMounted = true;

    setSeenPendingTransactionIds(null);
    void getSeenPendingTransactionIds(session.userId).then((nextIds) => {
      if (isMounted) {
        setSeenPendingTransactionIds(nextIds);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [session.userId]);

  useEffect(() => {
    setActiveFilter(initialFilter);
  }, [initialFilter]);

  useEffect(() => {
    if (!seenPendingTransactionIds) {
      return;
    }

    const unseenItemIds = pendingTransactionItems
      .map((item) => item.id)
      .filter((itemId) => !seenPendingTransactionIds.has(itemId));

    if (unseenItemIds.length === 0) {
      return;
    }

    void markPendingTransactionIdsSeen(session.userId, unseenItemIds);
  }, [pendingTransactionItems, seenPendingTransactionIds, session.userId]);

  function toggleHistoryCase(caseId: string) {
    setExpandedCaseIds((current) => (current[0] === caseId ? [] : [caseId]));
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
          <Text style={styles.supportText}>Leyendo el ledger real desde Supabase.</Text>
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
        <Text style={styles.supportText}>{snapshotQuery.error.message}</Text>
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
              onPress={() => setActiveFilter(option.value)}
              selected={activePrimaryFilter === option.value}
            />
          ))}
        </ScrollView>
        {categoryFilter ? (
          <View style={styles.categoryFilterChip}>
            <Ionicons
              color={transactionCategoryColor(categoryFilter)}
              name={transactionCategoryIcon(categoryFilter) as keyof typeof Ionicons.glyphMap}
              size={13}
            />
            <Text style={styles.categoryFilterText}>
              Categoria: {transactionCategoryLabel(categoryFilter)}
            </Text>
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
              <PendingTransactionCard item={item} key={item.id} people={people} />
            ))}
          </View>
        </SectionBlock>
      ) : null}

      {historyCases.length > 0 ? (
        <SectionBlock title="Historial">
          <View style={styles.list}>
            {historyCases.map((itemCase) => {
              const latest = itemCase.latest;
              const caseAmountLabel = historyStepAmountLabel(latest);
              const caseTone = historyImpactTone(latest) as HistoryCaseTone;
              const caseTitle = friendlyHistoryStepLabel(latest);
              const caseDescription = historyCardTitle(itemCase);

              return (
                <HistoryCaseCard
                  amountLabel={caseAmountLabel}
                  category={historyCaseVisualCategory(itemCase)}
                  description={null}
                  eyebrow={historyCaseEyebrow(itemCase)}
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
                      meta: step.happenedAtLabel ?? null,
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

const styles = StyleSheet.create({
  backButton: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  backButtonPressed: {
    opacity: 0.68,
  },
  list: {
    gap: theme.spacing.sm,
  },
  filterStack: {
    gap: theme.spacing.xs,
  },
  categoryFilterChip: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.hairline,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  categoryFilterText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    fontWeight: '800',
    lineHeight: 16,
  },
  filterRail: {
    gap: theme.spacing.xs,
    paddingRight: theme.spacing.lg,
  },
  filterPill: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 7,
  },
  filterPillSelected: {
    backgroundColor: theme.colors.primaryGhost,
    borderColor: 'rgba(26, 39, 68, 0.22)',
  },
  filterPillPressed: {
    opacity: 0.76,
  },
  filterPillText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    fontWeight: '800',
  },
  filterPillTextSelected: {
    color: theme.colors.primary,
  },
  loadingState: {
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.xl,
  },
  supportText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.callout,
    lineHeight: 22,
    textAlign: 'center',
  },
});
