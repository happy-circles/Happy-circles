import { useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Link, type Href } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import type {
  ActiveSettlementPreviewDto,
  ActivityItemDto,
  HappyCircleScoreDto,
} from '@happy-circles/application';

import { AppText } from '@/components/app-text';
import { EmptyState } from '@/components/empty-state';
import { HappyCircleCard } from '@/components/happy-circle-card';
import {
  HappyCircleRing,
  type HappyCircleRingParticipant,
  type HappyCircleDecision,
} from '@/components/happy-circle-ring';
import { HappyCirclesMotion } from '@/components/happy-circles-motion';
import { HappyFacesCounter, HAPPY_FACES_TREASURE_GOLD } from '@/components/happy-faces-counter';
import { HistoryCaseCard, type HistoryCaseTone } from '@/components/history-case-card';
import { ScreenShell } from '@/components/screen-shell';
import { SectionBlock } from '@/components/section-block';
import { StateAuraLayer, stateAuraVariantFromTone } from '@/components/state-aura-layer';
import type { StatusChipProps } from '@/components/status-chip';
import { SurfaceCard } from '@/components/surface-card';
import { formatCompactCop } from '@/features/balance/balance-helpers';
import {
  buildCircleProposalViewModels,
  buildCirclePersonalMetrics,
  type CirclePersonalMetrics,
  type CircleProposalViewModel,
} from '@/features/circles/circles-helpers';
import { PendingTransactionCard } from '@/features/transactions/transactions-pending-card';
import { triggerAppEmphasisHaptic, triggerAppSelectionHaptic } from '@/lib/app-haptics';
import { cycleActivityKind, isCircleActivityItem } from '@/lib/cycle-activity';
import {
  buildHistoryCases,
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
  historyTimelineStepAmountLabel,
  historyTimelineStepCategory,
  historyTimelineStepDetailLabel,
  historyTimelineStepMetaLabel,
  isHistoryCaseItem,
  type HistoryCase,
  type HistoryCaseItem,
} from '@/lib/history-cases';
import { notificationViewKeyForItem, useAppSnapshot } from '@/lib/live-data';
import { theme } from '@/lib/theme';
import { transactionCategoryColor } from '@/lib/transaction-categories';
import { useSnapshotRefresh } from '@/lib/use-snapshot-refresh';
import { useSession } from '@/providers/session-provider';
import { useAppTheme } from '@/providers/theme-provider';

const CIRCLE_COLOR = transactionCategoryColor('cycle');
const CYCLE_TRANSACTIONS_HREF = '/transactions?category=cycle' as Href;

const EMPTY_HAPPY_CIRCLE_SCORE: HappyCircleScoreDto = {
  totalFaces: 0,
  closedCircleCount: 0,
  recentAwards: [],
  latestAward: null,
};

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
    participantUserIds: item.participantUserIds,
    replacedByProposalId: item.replacedByProposalId,
    replacesProposalId: item.replacesProposalId,
    staleReason: item.staleReason,
    status: item.status,
    subtitle: item.subtitle,
    title: item.title,
    tone: item.tone,
  };
}

function CircleHeaderMetric({
  href,
  icon,
  label,
  roomy,
  tone = CIRCLE_COLOR,
  value,
}: {
  readonly href?: Href;
  readonly icon: keyof typeof Ionicons.glyphMap;
  readonly label: string;
  readonly roomy: boolean;
  readonly tone?: string;
  readonly value: string;
}) {
  const metric = (
    <Pressable
      accessibilityLabel={`${label}: ${value}`}
      accessibilityRole="button"
      hitSlop={6}
      onPressIn={triggerAppEmphasisHaptic}
      style={({ pressed }) => [
        styles.headerMetric,
        roomy ? styles.headerMetricRoomy : null,
        {
          backgroundColor: `${tone}0D`,
          borderColor: `${tone}24`,
          shadowColor: tone,
        },
        pressed ? styles.headerMetricPressed : null,
      ]}
    >
      <View style={styles.headerMetricTop}>
        <View
          style={[
            styles.headerMetricIcon,
            roomy ? styles.headerMetricIconRoomy : null,
            { backgroundColor: `${tone}1F` },
          ]}
        >
          <Ionicons color={tone} name={icon} size={roomy ? 23 : 21} />
        </View>
      </View>
      <View style={styles.headerMetricCopy}>
        <AppText
          adjustsFontSizeToFit
          minimumFontScale={0.74}
          numberOfLines={1}
          style={[styles.headerMetricValue, { color: tone }]}
        >
          {value}
        </AppText>
        <AppText
          adjustsFontSizeToFit
          minimumFontScale={0.78}
          numberOfLines={1}
          style={styles.headerMetricLabel}
        >
          {label}
        </AppText>
      </View>
    </Pressable>
  );

  return href ? (
    <Link href={href} asChild>
      {metric}
    </Link>
  ) : (
    metric
  );
}

function CirclesHeader({
  closedCircleCount,
  metrics,
  totalFaces,
}: {
  readonly closedCircleCount: number;
  readonly metrics: CirclePersonalMetrics;
  readonly totalFaces: number;
}) {
  const activeTheme = useAppTheme();
  const { width } = useWindowDimensions();
  const contentWidth = Math.min(560, Math.max(0, width - theme.spacing.lg * 2));
  const isTightHeader = contentWidth < 340;
  const isRoomyMetrics = width >= 390;
  const heroGap = isTightHeader ? theme.spacing.xs : theme.spacing.md;
  const rewardSlotWidth = isTightHeader ? 96 : 106;
  const brandMaxWidth = Math.max(0, contentWidth - rewardSlotWidth - heroGap);
  const titleColor =
    activeTheme.scheme === 'dark' ? activeTheme.colors.white : activeTheme.colors.primary;

  return (
    <View style={styles.hero}>
      <View style={[styles.heroTop, { gap: heroGap }]}>
        <View style={[styles.heroBrand, { maxWidth: brandMaxWidth, width: brandMaxWidth }]}>
          <HappyCirclesMotion
            size={isTightHeader ? 38 : 46}
            variant={totalFaces > 0 ? 'wink' : 'idle'}
          />
          <AppText
            adjustsFontSizeToFit
            color={titleColor}
            minimumFontScale={0.68}
            numberOfLines={1}
            style={[styles.heroTitle, isTightHeader ? styles.heroTitleCompact : null]}
          >
            Happy Circles
          </AppText>
        </View>
        <View style={[styles.heroRewardWrap, { width: rewardSlotWidth }]}>
          <HappyFacesCounter
            closedCircleCount={closedCircleCount}
            compact
            style={[styles.heroFacesCounter, { minWidth: rewardSlotWidth }]}
            tone={HAPPY_FACES_TREASURE_GOLD}
            totalFaces={totalFaces}
            variant="reward"
          />
        </View>
      </View>

      <View
        style={[
          styles.headerMetricsGrid,
          isRoomyMetrics ? styles.headerMetricsGridRoomy : null,
        ]}
      >
        <CircleHeaderMetric
          href={CYCLE_TRANSACTIONS_HREF}
          icon="checkmark-done-outline"
          label="Cerrados"
          roomy={isRoomyMetrics}
          tone={HAPPY_FACES_TREASURE_GOLD}
          value={String(closedCircleCount)}
        />
        <CircleHeaderMetric
          href={CYCLE_TRANSACTIONS_HREF}
          icon="swap-horizontal-outline"
          label="Plata cruzada"
          roomy={isRoomyMetrics}
          tone={theme.colors.success}
          value={formatCompactCop(metrics.ledgerAmountMinor)}
        />
        <CircleHeaderMetric
          href={CYCLE_TRANSACTIONS_HREF}
          icon="receipt-outline"
          label="Ahorradas"
          roomy={isRoomyMetrics}
          tone={CIRCLE_COLOR}
          value={String(metrics.savedTransactionCount)}
        />
      </View>
    </View>
  );
}

type PastCircleArchiveItem = {
  readonly amountLabel: string | null;
  readonly amountVoided: boolean;
  readonly decisions: readonly {
    readonly decision: HappyCircleDecision;
    readonly label: string;
    readonly userId: string;
  }[];
  readonly href: Href;
  readonly id: string;
  readonly metaLabel: string;
  readonly primaryLabel: string;
  readonly statusLabel: string;
  readonly statusTone: StatusChipProps['tone'];
  readonly titleLabel: string;
};

type CircleArchiveItem =
  | {
      readonly id: string;
      readonly kind: 'active';
      readonly proposal: CircleProposalViewModel;
      readonly statusTone: StatusChipProps['tone'];
    }
  | {
      readonly id: string;
      readonly kind: 'past';
      readonly statusTone: StatusChipProps['tone'];
      readonly value: PastCircleArchiveItem;
    };

function circleToneColor(tone: StatusChipProps['tone']): string {
  if (tone === 'warning') {
    return theme.colors.warning;
  }

  if (tone === 'success') {
    return theme.colors.success;
  }

  if (tone === 'danger') {
    return theme.colors.danger;
  }

  if (tone === 'primary') {
    return theme.colors.primary;
  }

  if (tone === 'cycle') {
    return CIRCLE_COLOR;
  }

  return theme.colors.textMuted;
}

function CircleArchiveStatusIcon({
  label,
  tone,
}: {
  readonly label: string;
  readonly tone: StatusChipProps['tone'];
}) {
  const icon: keyof typeof Ionicons.glyphMap =
    tone === 'success'
      ? 'checkmark-done-circle-outline'
      : tone === 'danger'
        ? 'close-circle-outline'
        : tone === 'warning'
          ? 'alert-circle-outline'
          : tone === 'cycle'
            ? 'radio-button-on-outline'
            : 'ellipse-outline';
  const color = circleToneColor(tone);

  return (
    <View
      accessibilityLabel={label}
      accessible
      style={[styles.archiveStatusIcon, { backgroundColor: `${color}12` }]}
    >
      <Ionicons color={color} name={icon} size={18} />
    </View>
  );
}

function activeCircleStatusTone(state: CircleProposalViewModel['state']): StatusChipProps['tone'] {
  if (state === 'needs_me' || state === 'new') {
    return 'warning';
  }

  if (state === 'ready') {
    return 'cycle';
  }

  return 'neutral';
}

function archiveDecisionForTone(tone: StatusChipProps['tone']): HappyCircleDecision {
  if (tone === 'success') {
    return 'approved';
  }

  if (tone === 'danger') {
    return 'rejected';
  }

  return 'pending';
}

function circleCaseDetailHref(itemCase: HistoryCase<HistoryCaseItem>): Href {
  const proposalId =
    itemCase.latest.originSettlementProposalId ??
    itemCase.steps.find((step) => step.originSettlementProposalId)?.originSettlementProposalId;

  return proposalId
    ? (`/settlements/${proposalId}` as Href)
    : ((itemCase.latest.href as Href | undefined) ?? CYCLE_TRANSACTIONS_HREF);
}

function isArchivedCircleCase(itemCase: HistoryCase<HistoryCaseItem>): boolean {
  return cycleActivityKind(itemCase.latest) !== 'lifecycle_replaced';
}

function archiveDecisionsForHistoryCase(
  itemCase: HistoryCase<HistoryCaseItem>,
  currentUserId: string | null | undefined,
  decision: HappyCircleDecision,
): PastCircleArchiveItem['decisions'] {
  const currentNode: HappyCircleRingParticipant = {
    decision,
    label: 'Tu',
    userId: currentUserId ?? `${itemCase.id}:self`,
  };
  let incomingNode: HappyCircleRingParticipant | null = null;
  let outgoingNode: HappyCircleRingParticipant | null = null;

  for (const step of itemCase.steps) {
    const [from, to] = (step.flowLabel ?? '').split('->').map((part) => part.trim());

    if (!outgoingNode && from === 'Tu' && to && to !== 'Happy Circle') {
      outgoingNode = {
        decision,
        label: to,
        userId: `${itemCase.id}:outgoing:${to}`,
      };
    }

    if (!incomingNode && to === 'Tu' && from && from !== 'Happy Circle') {
      incomingNode = {
        decision,
        label: from,
        userId: `${itemCase.id}:incoming:${from}`,
      };
    }
  }

  const anonymousNode = (key: string): HappyCircleRingParticipant => ({
    decision,
    label: 'Happy',
    userId: `${itemCase.id}:${key}`,
  });

  return [
    currentNode,
    outgoingNode ?? anonymousNode('outgoing'),
    anonymousNode('hidden-right'),
    anonymousNode('hidden-left'),
    incomingNode ?? anonymousNode('incoming'),
  ];
}

function pastCircleArchiveItem(
  itemCase: HistoryCase<HistoryCaseItem>,
  currentUserId: string | null | undefined,
): PastCircleArchiveItem {
  const statusTone = historyCaseStatusTone(itemCase);
  const metaLabel = historyCaseMeta(itemCase).replace(/\s*\|\s*/g, ' / ');
  const titleLabel = historyCardTitle(itemCase);
  const decision = archiveDecisionForTone(statusTone);

  return {
    amountLabel: historyCaseAmountLabel(itemCase.latest),
    amountVoided: historyAmountIsVoided(itemCase.latest),
    decisions: archiveDecisionsForHistoryCase(itemCase, currentUserId, decision),
    href: circleCaseDetailHref(itemCase),
    id: `past:${itemCase.id}`,
    metaLabel,
    primaryLabel: titleLabel,
    statusLabel: historyCaseStatusLabel(itemCase),
    statusTone,
    titleLabel,
  };
}

function CircleArchivePastCard({
  item,
  width,
}: {
  readonly item: PastCircleArchiveItem;
  readonly width: number;
}) {
  const ringSize = 260;

  return (
    <SurfaceCard
      padding="none"
      style={[styles.archiveCard, { width }]}
      underlay={
        <StateAuraLayer
          size="large"
          variant={stateAuraVariantFromTone(item.statusTone)}
        />
      }
      variant="elevated"
    >
      <Link href={item.href} asChild>
        <Pressable
          accessibilityLabel={[item.statusLabel, item.primaryLabel, item.amountLabel]
            .filter(Boolean)
            .join(', ')}
          accessibilityRole="button"
          onPressIn={triggerAppSelectionHaptic}
          style={({ pressed }) => [styles.archivePressable, pressed ? styles.archivePressed : null]}
        >
          <View style={styles.archiveBody}>
            <View style={styles.archiveAmountBlock}>
              <View style={styles.archiveHeader}>
                <AppText adjustsFontSizeToFit numberOfLines={1} style={styles.archiveTitle}>
                  Happy Circle
                </AppText>
                <View style={styles.archiveStatusSlot}>
                  <CircleArchiveStatusIcon label={item.statusLabel} tone={item.statusTone} />
                </View>
              </View>
            </View>

            <View style={styles.archiveVisual}>
              <HappyCircleRing
                centerColor={CIRCLE_COLOR}
                centerLabel={item.amountLabel}
                centerSubLabel={
                  item.amountLabel ? (item.amountVoided ? 'no aplicado' : 'a solucionar') : null
                }
                decisions={item.decisions}
                ringSize={ringSize}
                style={styles.archiveRing}
              />
            </View>

            <AppText numberOfLines={2} style={styles.archiveMeta}>
              {item.metaLabel}
            </AppText>

            <View style={styles.detailCta}>
              <AppText style={styles.detailCtaText}>Ver detalle</AppText>
              <Ionicons color={CIRCLE_COLOR} name="chevron-forward" size={17} />
            </View>
          </View>
        </Pressable>
      </Link>
    </SurfaceCard>
  );
}

function CircleArchiveCard({
  item,
  width,
}: {
  readonly item: CircleArchiveItem;
  readonly width: number;
}) {
  if (item.kind === 'active') {
    return (
      <View style={[styles.archiveCardWrap, { width }]}>
        <HappyCircleCard
          proposal={item.proposal.proposal}
          unread={item.proposal.state === 'new'}
          variant="showcase"
        />
      </View>
    );
  }

  return <CircleArchivePastCard item={item.value} width={width} />;
}

function CircleArchiveRail({ items }: { readonly items: readonly CircleArchiveItem[] }) {
  const { width } = useWindowDimensions();
  const contentWidth = Math.max(width - theme.spacing.lg * 2, 288);
  const cardWidth = Math.min(Math.max(contentWidth, 288), 420);
  const snapInterval = cardWidth + theme.spacing.md;

  if (items.length === 0) {
    return (
      <EmptyState description="No hay tarjetas en este filtro todavia." title="Sin Circles aqui" />
    );
  }

  if (items.length === 1) {
    return (
      <View style={styles.archiveSingleWrap}>
        <CircleArchiveCard item={items[0]} width={cardWidth} />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.archiveRail}
      decelerationRate="fast"
      horizontal
      showsHorizontalScrollIndicator={false}
      snapToInterval={snapInterval}
    >
      {items.map((item) => (
        <CircleArchiveCard item={item} key={item.id} width={cardWidth} />
      ))}
    </ScrollView>
  );
}

function LatestCircleTransactionCard({
  expanded,
  itemCase,
  onToggle,
}: {
  readonly expanded: boolean;
  readonly itemCase: HistoryCase<HistoryCaseItem>;
  readonly onToggle: () => void;
}) {
  const latest = itemCase.latest;
  const caseAmountLabel = historyCaseAmountLabel(latest);
  const caseTone = historyImpactTone(latest) as HistoryCaseTone;
  const caseTitle = friendlyHistoryStepLabel(latest);
  const caseDescription = historyCardTitle(itemCase);
  const caseEyebrow = historyCaseEyebrow(itemCase);

  return (
    <HistoryCaseCard
      actorAvatarUrl={null}
      actorFallbackColor={undefined}
      amountLabel={caseAmountLabel}
      amountStruckThrough={historyAmountIsVoided(latest)}
      category={historyCaseVisualCategory(itemCase)}
      description={null}
      eyebrow={caseEyebrow}
      isCycleSnippet={itemCase.isCycleSnippet}
      isExpanded={expanded}
      meta={historyCaseMeta(itemCase)}
      onToggle={onToggle}
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
            !amountLabel && caseAmountLabel && impact?.includes(caseAmountLabel) ? null : impact,
          meta: historyTimelineStepMetaLabel(itemCase, step),
          title: friendlyHistoryStepLabel(step),
          tone: historyImpactTone(step) as HistoryCaseTone,
        };
      })}
      title={caseDescription || caseTitle}
      tone={caseTone}
    />
  );
}

export function CirclesIndexScreen() {
  const [expandedLatestCaseId, setExpandedLatestCaseId] = useState<string | null>(null);
  const session = useSession();
  const snapshotQuery = useAppSnapshot();
  const refresh = useSnapshotRefresh(snapshotQuery);
  const snapshot = snapshotQuery.data ?? null;

  const happyCircleScore = snapshot?.happyCircleScore ?? EMPTY_HAPPY_CIRCLE_SCORE;
  const pendingSection = snapshot?.activitySections.find((section) => section.key === 'pending');
  const historySection = snapshot?.activitySections.find((section) => section.key === 'history');
  const people = snapshot?.dashboard.activePeople ?? snapshot?.people ?? [];
  const personalMetrics = useMemo(
    () =>
      buildCirclePersonalMetrics({
        currentUserId: session.userId,
        historyItems: historySection?.items ?? [],
        settlementsById: snapshot?.settlementsById ?? {},
      }),
    [historySection?.items, session.userId, snapshot?.settlementsById],
  );
  const newCircleProposalIds = useMemo(() => {
    const notificationViewedKeys = new Set(snapshot?.notificationViewedKeys ?? []);

    return new Set(
      (pendingSection?.items ?? []).flatMap((item) =>
        item.kind === 'settlement_proposal' &&
        isCircleActivityItem(item) &&
        !notificationViewedKeys.has(notificationViewKeyForItem(item))
          ? [item.originSettlementProposalId ?? item.id]
          : [],
      ),
    );
  }, [pendingSection?.items, snapshot?.notificationViewedKeys]);
  const activeProposals: readonly ActiveSettlementPreviewDto[] =
    snapshot?.balanceOverview.resolution.activeProposals ?? [];
  const circleItems = useMemo(
    () =>
      buildCircleProposalViewModels({
        currentUserId: session.userId,
        newCircleProposalIds,
        proposals: activeProposals,
      }),
    [activeProposals, newCircleProposalIds, session.userId],
  );
  const circleHistoryCases = useMemo(
    () =>
      buildHistoryCases(
        (historySection?.items ?? [])
          .filter(isCircleActivityItem)
          .filter(isHistoryCaseItem)
          .map(activityHistoryCaseItem),
      ),
    [historySection?.items],
  );
  const archiveItems = useMemo<readonly CircleArchiveItem[]>(
    () => [
      ...circleItems.map(
        (item): CircleArchiveItem => ({
          id: `active:${item.proposal.proposalId}`,
          kind: 'active',
          proposal: item,
          statusTone: activeCircleStatusTone(item.state),
        }),
      ),
      ...circleHistoryCases.filter(isArchivedCircleCase).map((itemCase): CircleArchiveItem => {
        const value = pastCircleArchiveItem(itemCase, session.userId);

        return {
          id: value.id,
          kind: 'past',
          statusTone: value.statusTone,
          value,
        };
      }),
    ],
    [circleHistoryCases, circleItems, session.userId],
  );
  const latestCircleTransactionCases = useMemo(
    () => circleHistoryCases.slice(0, 3),
    [circleHistoryCases],
  );
  const pendingCircleTransactions = useMemo(
    () => (pendingSection?.items ?? []).filter(isCircleActivityItem).slice(0, 3),
    [pendingSection?.items],
  );
  const notificationViewedKeys = useMemo(
    () => new Set(snapshot?.notificationViewedKeys ?? []),
    [snapshot?.notificationViewedKeys],
  );
  const hasCircleTransactions =
    pendingCircleTransactions.length > 0 || latestCircleTransactionCases.length > 0;

  if (snapshotQuery.error && !snapshot) {
    return (
      <ScreenShell
        headerVariant="plain"
        largeTitle={false}
        refresh={refresh}
        subtitle="No pudimos cargar tus Happy Circles."
        title="Happy Circles"
      >
        <AppText style={styles.supportText}>{snapshotQuery.error.message}</AppText>
      </ScreenShell>
    );
  }

  if (snapshotQuery.isLoading || !snapshot) {
    return (
      <ScreenShell headerVariant="plain" largeTitle={false} title="Happy Circles">
        <View style={styles.loadingState}>
          <HappyCirclesMotion size={108} variant="loading" />
          <AppText style={styles.supportText}>Estamos buscando tus Circles.</AppText>
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell headerVisible={false} refresh={refresh} title="Happy Circles">
      <CirclesHeader
        closedCircleCount={personalMetrics.closedCircleCount}
        metrics={personalMetrics}
        totalFaces={happyCircleScore.totalFaces}
      />

      <View style={styles.archiveCardsBlock}>
        <CircleArchiveRail items={archiveItems} />
      </View>

      {hasCircleTransactions ? (
        <SectionBlock
          action={
            <Link href={CYCLE_TRANSACTIONS_HREF} asChild>
              <Pressable
                onPressIn={triggerAppSelectionHaptic}
                style={({ pressed }) => [styles.sectionAction, pressed ? styles.pressed : null]}
              >
                <AppText style={styles.sectionActionText}>Ver todas</AppText>
              </Pressable>
            </Link>
          }
          title="Últimas transacciones"
        >
          <View style={styles.transactionGroups}>
            {pendingCircleTransactions.length > 0 ? (
              <View style={styles.transactionGroup}>
                <View style={styles.transactionGroupHeader}>
                  <AppText style={styles.transactionGroupTitle}>Pendientes</AppText>
                  <View style={styles.transactionGroupBadge}>
                    <AppText style={styles.transactionGroupBadgeText}>
                      {pendingCircleTransactions.length}
                    </AppText>
                  </View>
                </View>
                <View style={styles.latestTransactionsList}>
                  {pendingCircleTransactions.map((item) => (
                    <PendingTransactionCard
                      item={item}
                      key={item.id}
                      people={people}
                      unread={!notificationViewedKeys.has(notificationViewKeyForItem(item))}
                    />
                  ))}
                </View>
              </View>
            ) : null}
            {latestCircleTransactionCases.length > 0 ? (
              <View style={styles.transactionGroup}>
                <View style={styles.transactionGroupHeader}>
                  <AppText style={styles.transactionGroupTitle}>Histórico reciente</AppText>
                </View>
                <View style={styles.latestTransactionsList}>
                  {latestCircleTransactionCases.map((itemCase) => (
                    <LatestCircleTransactionCard
                      expanded={expandedLatestCaseId === itemCase.id}
                      itemCase={itemCase}
                      key={itemCase.id}
                      onToggle={() =>
                        setExpandedLatestCaseId((current) =>
                          current === itemCase.id ? null : itemCase.id,
                        )
                      }
                    />
                  ))}
                </View>
              </View>
            ) : null}
          </View>
        </SectionBlock>
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  supportText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.body,
    lineHeight: 22,
  },
  loadingState: {
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  hero: {
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
  },
  heroTop: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  heroBrand: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    minWidth: 0,
  },
  heroTitle: {
    color: theme.colors.primary,
    flexShrink: 1,
    fontSize: theme.typography.title1,
    fontWeight: '900',
    letterSpacing: -0.4,
    lineHeight: 34,
    minWidth: 0,
  },
  heroTitleCompact: {
    fontSize: 25,
    lineHeight: 30,
  },
  heroFacesCounter: {
    flexShrink: 0,
  },
  heroRewardWrap: {
    alignItems: 'flex-end',
    position: 'relative',
  },
  headerMetricsGrid: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    paddingTop: theme.spacing.xs,
  },
  headerMetricsGridRoomy: {
    gap: theme.spacing.md,
  },
  headerMetric: {
    alignItems: 'center',
    borderRadius: theme.radius.large,
    borderWidth: 1,
    flex: 1,
    gap: theme.spacing.xs,
    minHeight: 104,
    minWidth: 0,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
  },
  headerMetricRoomy: {
    gap: theme.spacing.sm,
    minHeight: 124,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  headerMetricPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.97 }],
  },
  headerMetricTop: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    width: '100%',
  },
  headerMetricIcon: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  headerMetricIconRoomy: {
    height: 48,
    width: 48,
  },
  headerMetricCopy: {
    alignItems: 'center',
    gap: 1,
    minWidth: 0,
    width: '100%',
  },
  headerMetricLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    lineHeight: 14,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  headerMetricValue: {
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 29,
    textAlign: 'center',
  },
  archiveCardsBlock: {
    gap: theme.spacing.sm,
  },
  archiveSingleWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  archiveRail: {
    gap: theme.spacing.md,
    paddingRight: theme.spacing.md,
    paddingVertical: 2,
  },
  archiveCardWrap: {
    flexShrink: 0,
  },
  archiveCard: {
    borderRadius: theme.radius.large,
    flexShrink: 0,
    minHeight: 560,
  },
  archivePressable: {
    gap: theme.spacing.lg,
    minHeight: 560,
    paddingBottom: theme.spacing.lg,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.xxl,
  },
  archivePressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }],
  },
  archiveStatusIcon: {
    alignItems: 'center',
    borderRadius: theme.radius.small,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  archiveBody: {
    alignItems: 'center',
    gap: 22,
  },
  archiveAmountBlock: {
    alignItems: 'center',
    width: '100%',
  },
  archiveHeader: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 46,
    position: 'relative',
    width: '100%',
  },
  archiveStatusSlot: {
    position: 'absolute',
    right: theme.spacing.xs,
    top: 5,
  },
  archiveTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.title3,
    fontWeight: '900',
    lineHeight: 24,
    textAlign: 'center',
  },
  archiveVisual: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 336,
    width: '100%',
  },
  archiveRing: {
    marginRight: 0,
  },
  archiveMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
    textAlign: 'center',
  },
  detailCta: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'center',
    paddingTop: theme.spacing.xs,
  },
  detailCtaText: {
    color: CIRCLE_COLOR,
    fontSize: theme.typography.callout,
    fontWeight: '800',
    lineHeight: 20,
  },
  latestTransactionsList: {
    gap: theme.spacing.sm,
  },
  transactionGroups: {
    gap: theme.spacing.lg,
  },
  transactionGroup: {
    gap: theme.spacing.sm,
  },
  transactionGroupHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
    minHeight: 28,
  },
  transactionGroupTitle: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    fontWeight: '900',
    lineHeight: 17,
    textTransform: 'uppercase',
  },
  transactionGroupBadge: {
    alignItems: 'center',
    backgroundColor: theme.colors.primaryGhost,
    borderColor: theme.colors.hairline,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    height: 22,
    justifyContent: 'center',
    minWidth: 22,
    paddingHorizontal: 7,
  },
  transactionGroupBadgeText: {
    color: theme.colors.primary,
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 13,
  },
  sectionAction: {
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 4,
  },
  sectionActionText: {
    color: CIRCLE_COLOR,
    fontSize: theme.typography.footnote,
    fontWeight: '800',
    lineHeight: 18,
  },
  pressed: {
    opacity: 0.68,
  },
});
