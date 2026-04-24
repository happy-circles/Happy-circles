import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';

import type { ActivityItemDto, PersonCardDto } from '@happy-circles/application';

import { EmptyState } from '@/components/empty-state';
import { HappyCirclesMotion } from '@/components/happy-circles-motion';
import { HistoryCaseCard, type HistoryCaseTone } from '@/components/history-case-card';
import { ScreenShell } from '@/components/screen-shell';
import { SectionBlock } from '@/components/section-block';
import { TransactionEventCard } from '@/components/transaction-event-card';
import {
  buildHistoryCases,
  friendlyHistoryStepLabel,
  type HistoryCaseItem,
  historyCardTitle,
  historyCaseEyebrow,
  historyCaseImpactLabel,
  historyCaseMeta,
  historyCaseStatusLabel,
  historyCaseStatusTone,
  historyImpactLabel,
  historyImpactTone,
  historyStepAmountLabel,
} from '@/lib/history-cases';
import { useAppSnapshot } from '@/lib/live-data';
import {
  getSeenPendingTransactionIds,
  markPendingTransactionIdsSeen,
} from '@/lib/pending-transaction-views';
import { theme } from '@/lib/theme';
import { useSnapshotRefresh } from '@/lib/use-snapshot-refresh';
import {
  isConsolidatedTransactionItem,
  isPendingTransactionItem,
  transactionAccentColor,
  transactionAmountIsVoided,
  transactionAmountLabel,
  transactionContextLabel,
  transactionDirectionLabel,
  transactionFocusId,
  transactionMetaLabel,
  transactionToneColor,
  transactionVisualCategory,
} from '@/lib/transaction-presentation';
import { useSession } from '@/providers/session-provider';

const AVATAR_COLORS = ['#c026d3', '#047857', '#2563eb', '#334155', '#dc2626', '#7c3aed'];

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
  highlightPending,
  item,
  people,
}: {
  readonly highlightPending: boolean;
  readonly item: ActivityItemDto;
  readonly people: readonly PersonCardDto[];
}) {
  const actorLabel =
    item.category === 'cycle' || item.kind === 'settlement' || item.kind === 'settlement_proposal'
      ? 'Happy Circle'
      : (item.counterpartyLabel ?? 'Persona');
  const matchedPerson = transactionPersonForItem(people, item);
  const fallbackPerson = {
    displayName: actorLabel,
    userId: matchedPerson?.userId ?? item.id,
  };

  return (
    <TransactionEventCard
      accentColor={transactionAccentColor(item)}
      actorAvatarUrl={matchedPerson?.avatarUrl ?? null}
      actorFallbackColor={initialsBackgroundColor(fallbackPerson)}
      actorLabel={actorLabel}
      amountColor={transactionToneColor(item)}
      amountLabel={transactionAmountLabel(item)}
      amountStruckThrough={transactionAmountIsVoided(item)}
      category={transactionVisualCategory(item)}
      categoryPlacement="meta"
      compact
      compactMetaLayout="stacked"
      context={transactionContextLabel(item, actorLabel)}
      directionLabel={transactionDirectionLabel(item)}
      href={transactionDetailHref(people, item, 'pending')}
      meta={transactionMetaLabel(item)}
      pending={highlightPending}
      pendingHighlightColor={highlightPending ? transactionAccentColor(item) : undefined}
      unread
    />
  );
}

export function TransactionsScreen() {
  const router = useRouter();
  const session = useSession();
  const snapshotQuery = useAppSnapshot();
  const refresh = useSnapshotRefresh(snapshotQuery);
  const [expandedCaseIds, setExpandedCaseIds] = useState<readonly string[]>([]);
  const [seenPendingTransactionIds, setSeenPendingTransactionIds] =
    useState<ReadonlySet<string> | null>(null);

  const sections = snapshotQuery.data?.activitySections ?? [];
  const pendingSection = sections.find((section) => section.key === 'pending');
  const historySection = sections.find((section) => section.key === 'history');
  const pendingTransactionItems = (pendingSection?.items ?? []).filter(isPendingTransactionItem);
  const historyTransactionItems = (historySection?.items ?? []).filter(isConsolidatedTransactionItem);
  const people = snapshotQuery.data?.dashboard.activePeople ?? snapshotQuery.data?.people ?? [];
  const historyCases = useMemo(
    () => buildHistoryCases(historyTransactionItems.map((item) => activityHistoryCaseItem(item))),
    [historyTransactionItems],
  );

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
    setExpandedCaseIds((current) =>
      current.includes(caseId)
        ? current.filter((itemId) => itemId !== caseId)
        : [caseId, ...current],
    );
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
            if (router.canGoBack()) {
              router.back();
              return;
            }

            router.replace('/home');
          }}
          style={({ pressed }) => [
            styles.backButton,
            pressed ? styles.backButtonPressed : null,
          ]}
        >
          <Ionicons color={theme.colors.text} name="chevron-back" size={20} />
        </Pressable>
      }
      headerVariant="plain"
      largeTitle={false}
      refresh={refresh}
      subtitle="Pendientes arriba y debajo todo el historial registrado."
      title="Transacciones"
      titleAlign="center"
    >
      {pendingTransactionItems.length === 0 && historyCases.length === 0 ? (
        <EmptyState
          description="Cuando registres movimientos o se creen propuestas, apareceran aqui."
          title="Sin transacciones"
        />
      ) : null}

      {pendingTransactionItems.length > 0 ? (
        <SectionBlock
          subtitle="Todo lo que aun espera una respuesta o una aprobacion."
          title="Pendientes"
        >
          <View style={styles.list}>
            {pendingTransactionItems.map((item) => (
              <PendingTransactionCard
                highlightPending={Boolean(
                  seenPendingTransactionIds && !seenPendingTransactionIds.has(item.id),
                )}
                item={item}
                key={item.id}
                people={people}
              />
            ))}
          </View>
        </SectionBlock>
      ) : null}

      {historyCases.length > 0 ? (
        <SectionBlock
          subtitle="Casos agrupados para que puedas ver la historia completa de cada movimiento."
          title="Historial"
        >
          <View style={styles.list}>
            {historyCases.map((itemCase) => {
              const latest = itemCase.latest;
              const caseTone = historyImpactTone(latest) as HistoryCaseTone;

              return (
                <HistoryCaseCard
                  category={latest.category}
                  eyebrow={historyCaseEyebrow(itemCase)}
                  impact={historyCaseImpactLabel(itemCase)}
                  isCycleSnippet={itemCase.isCycleSnippet}
                  isExpanded={expandedCaseIds.includes(itemCase.id)}
                  key={itemCase.id}
                  meta={historyCaseMeta(itemCase) || null}
                  onToggle={() => toggleHistoryCase(itemCase.id)}
                  statusLabel={historyCaseStatusLabel(itemCase)}
                  statusTone={historyCaseStatusTone(itemCase)}
                  steps={itemCase.steps.map((step) => ({
                    amountLabel: historyStepAmountLabel(step),
                    id: step.id,
                    impact: historyImpactLabel(step),
                    meta: step.happenedAtLabel ?? null,
                    title: friendlyHistoryStepLabel(step),
                    tone: historyImpactTone(step) as HistoryCaseTone,
                  }))}
                  title={historyCardTitle(itemCase)}
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
