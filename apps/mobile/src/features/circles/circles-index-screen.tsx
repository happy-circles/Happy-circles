import { useMemo } from 'react';
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
import { HappyCircleRing } from '@/components/happy-circle-ring';
import { HappyCirclesMotion } from '@/components/happy-circles-motion';
import { HappyFacesCounter, HAPPY_FACES_TREASURE_GOLD } from '@/components/happy-faces-counter';
import { ScreenShell } from '@/components/screen-shell';
import { SectionBlock } from '@/components/section-block';
import { StatusChip, type StatusChipProps } from '@/components/status-chip';
import { SurfaceCard } from '@/components/surface-card';
import { formatCompactCop } from '@/features/balance/balance-helpers';
import {
  buildCircleProposalViewModels,
  buildCirclePersonalMetrics,
  type CirclePersonalMetrics,
  type CircleProposalViewModel,
} from '@/features/circles/circles-helpers';
import { triggerAppEmphasisHaptic, triggerAppSelectionHaptic } from '@/lib/app-haptics';
import { isCircleActivityItem } from '@/lib/cycle-activity';
import {
  buildHistoryCases,
  historyAmountIsVoided,
  historyCardTitle,
  historyCaseAmountLabel,
  historyCaseMeta,
  historyCaseStatusLabel,
  historyCaseStatusTone,
  isHistoryCaseItem,
  type HistoryCase,
  type HistoryCaseItem,
} from '@/lib/history-cases';
import { formatCop } from '@/lib/data';
import { notificationViewKeyForItem, useAppSnapshot } from '@/lib/live-data';
import { theme } from '@/lib/theme';
import { transactionCategoryColor } from '@/lib/transaction-categories';
import { useSnapshotRefresh } from '@/lib/use-snapshot-refresh';
import { useSession } from '@/providers/session-provider';

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
  tone = CIRCLE_COLOR,
  value,
}: {
  readonly href?: Href;
  readonly icon: keyof typeof Ionicons.glyphMap;
  readonly label: string;
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
        {
          backgroundColor: `${tone}0D`,
          borderColor: `${tone}24`,
          shadowColor: tone,
        },
        pressed ? styles.headerMetricPressed : null,
      ]}
    >
      <View style={styles.headerMetricTop}>
        <View style={[styles.headerMetricIcon, { backgroundColor: `${tone}1F` }]}>
          <Ionicons color={tone} name={icon} size={21} />
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
        <AppText numberOfLines={1} style={styles.headerMetricLabel}>
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
  return (
    <View style={styles.hero}>
      <View style={styles.heroTop}>
        <View style={styles.heroBrand}>
          <HappyCirclesMotion size={46} variant={totalFaces > 0 ? 'wink' : 'idle'} />
          <AppText adjustsFontSizeToFit numberOfLines={1} style={styles.heroTitle}>
            Happy Circles
          </AppText>
        </View>
        <View style={styles.heroRewardWrap}>
          <View style={styles.heroRewardSparkle}>
            <Ionicons color={HAPPY_FACES_TREASURE_GOLD} name="sparkles" size={12} />
          </View>
          <HappyFacesCounter
            closedCircleCount={closedCircleCount}
            compact
            style={styles.heroFacesCounter}
            tone={HAPPY_FACES_TREASURE_GOLD}
            totalFaces={totalFaces}
            variant="reward"
          />
        </View>
      </View>

      <View style={styles.headerMetricsGrid}>
        <CircleHeaderMetric
          href={CYCLE_TRANSACTIONS_HREF}
          icon="checkmark-done-outline"
          label="Cerrados"
          tone={HAPPY_FACES_TREASURE_GOLD}
          value={String(closedCircleCount)}
        />
        <CircleHeaderMetric
          href={CYCLE_TRANSACTIONS_HREF}
          icon="swap-horizontal-outline"
          label="Plata cruzada"
          tone={theme.colors.success}
          value={formatCompactCop(metrics.ledgerAmountMinor)}
        />
        <CircleHeaderMetric
          href={CYCLE_TRANSACTIONS_HREF}
          icon="receipt-outline"
          label="Ahorradas"
          tone={CIRCLE_COLOR}
          value={String(metrics.savedTransactionCount)}
        />
      </View>
    </View>
  );
}

type CircleLibraryItem =
  | {
      readonly amountLabel: string;
      readonly href: Href;
      readonly id: string;
      readonly kind: 'active';
      readonly metaLabel: string;
      readonly primaryLabel: string;
      readonly proposal: ActiveSettlementPreviewDto;
      readonly statusLabel: string;
      readonly statusTone: StatusChipProps['tone'];
    }
  | {
      readonly amountLabel: string | null;
      readonly amountVoided: boolean;
      readonly href: Href;
      readonly id: string;
      readonly kind: 'past';
      readonly metaLabel: string;
      readonly primaryLabel: string;
      readonly statusLabel: string;
      readonly statusTone: StatusChipProps['tone'];
      readonly titleLabel: string;
    };

function circleStatusTone(state: CircleProposalViewModel['state']): StatusChipProps['tone'] {
  if (state === 'needs_me') {
    return 'warning';
  }

  if (state === 'ready') {
    return 'cycle';
  }

  if (state === 'new') {
    return 'primary';
  }

  return 'neutral';
}

function circleTileToneColor(tone: StatusChipProps['tone']): string {
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

function circleHistoryIcon(tone: StatusChipProps['tone']): keyof typeof Ionicons.glyphMap {
  if (tone === 'success') {
    return 'checkmark-done-circle-outline';
  }

  if (tone === 'danger') {
    return 'close-circle-outline';
  }

  if (tone === 'warning') {
    return 'time-outline';
  }

  if (tone === 'cycle') {
    return 'happy-outline';
  }

  return 'refresh-circle-outline';
}

function subtitleParts(value: string): string[] {
  return value
    .split('|')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function isUsefulCircleContextLabel(value: string): boolean {
  const normalized = value.toLocaleLowerCase('es-CO');

  if (
    normalized === 'happy circle' ||
    normalized === 'sistema' ||
    normalized === 'usuario' ||
    normalized.startsWith('hace ') ||
    normalized === 'hoy' ||
    normalized === 'ayer'
  ) {
    return false;
  }

  return value.startsWith('Con ') || value.includes('->');
}

function circleHistoryPrimaryLabel(itemCase: HistoryCase<HistoryCaseItem>): string {
  const candidates = itemCase.steps.flatMap((step) => [
    step.flowLabel ?? '',
    ...subtitleParts(step.subtitle),
  ]);
  const contextLabel = candidates.find(isUsefulCircleContextLabel);

  if (contextLabel) {
    return contextLabel;
  }

  const fallbackTitle = historyCardTitle(itemCase)
    .replace(/^Happy Circle\s*/i, '')
    .replace(/^Circle\s*/i, '')
    .trim();

  return fallbackTitle.length > 0 ? fallbackTitle : 'Circle pasado';
}

function activeCircleLibraryItem(item: CircleProposalViewModel): CircleLibraryItem {
  return {
    amountLabel: formatCop(item.proposal.personalAmountMinor),
    href: `/settlements/${item.proposal.proposalId}` as Href,
    id: `active:${item.proposal.proposalId}`,
    kind: 'active',
    metaLabel: `${item.movementReductionLabel} / ${item.approvalLabel}`,
    primaryLabel: item.participantLabel || item.proposal.title,
    proposal: item.proposal,
    statusLabel: item.statusLabel,
    statusTone: circleStatusTone(item.state),
  };
}

function pastCircleLibraryItem(itemCase: HistoryCase<HistoryCaseItem>): CircleLibraryItem {
  const statusTone = historyCaseStatusTone(itemCase);
  const metaLabel = historyCaseMeta(itemCase).replace(/\s*\|\s*/g, ' / ');

  return {
    amountLabel: historyCaseAmountLabel(itemCase.latest),
    amountVoided: historyAmountIsVoided(itemCase.latest),
    href: (itemCase.latest.href as Href | undefined) ?? CYCLE_TRANSACTIONS_HREF,
    id: `past:${itemCase.id}`,
    kind: 'past',
    metaLabel,
    primaryLabel: circleHistoryPrimaryLabel(itemCase),
    statusLabel: historyCaseStatusLabel(itemCase),
    statusTone,
    titleLabel: historyCardTitle(itemCase),
  };
}

function orderedCircleDecisions(
  proposal: ActiveSettlementPreviewDto,
  currentUserId: string | null | undefined,
): ActiveSettlementPreviewDto['participantDecisions'] {
  const decisions = [...proposal.participantDecisions];
  const myIndex = currentUserId
    ? decisions.findIndex((participant) => participant.userId === currentUserId)
    : -1;

  if (myIndex > 0) {
    return [...decisions.slice(myIndex), ...decisions.slice(0, myIndex)];
  }

  return decisions;
}

function CircleLibraryTile({
  currentUserId,
  item,
  width,
}: {
  readonly currentUserId: string | null | undefined;
  readonly item: CircleLibraryItem;
  readonly width: number;
}) {
  const toneColor = circleTileToneColor(item.statusTone);
  const ringSize = Math.min(Math.max(width * 0.38, 84), 110);

  return (
    <SurfaceCard
      glassTreatment="flatSoft"
      padding="none"
      style={[styles.circleTileCard, { minHeight: width, width }]}
      variant={item.kind === 'active' ? 'elevated' : 'muted'}
    >
      <Link href={item.href} asChild>
        <Pressable
          accessibilityLabel={[item.statusLabel, item.primaryLabel, item.amountLabel]
            .filter(Boolean)
            .join(', ')}
          accessibilityRole="button"
          onPressIn={triggerAppSelectionHaptic}
          style={({ pressed }) => [
            styles.circleTilePressable,
            pressed ? styles.circleTilePressed : null,
          ]}
        >
          <View style={styles.circleTileTop}>
            <StatusChip compact label={item.statusLabel} tone={item.statusTone} />
            <Ionicons color={theme.colors.textMuted} name="chevron-forward" size={17} />
          </View>

          <View style={styles.circleTileVisual}>
            {item.kind === 'active' ? (
              <HappyCircleRing
                decisions={orderedCircleDecisions(item.proposal, currentUserId)}
                ringSize={ringSize}
              />
            ) : (
              <View
                style={[
                  styles.circleHistoryIcon,
                  { backgroundColor: `${toneColor}14`, borderColor: `${toneColor}26` },
                ]}
              >
                <Ionicons
                  color={toneColor}
                  name={circleHistoryIcon(item.statusTone)}
                  size={Math.round(ringSize * 0.48)}
                />
              </View>
            )}
          </View>

          <View style={styles.circleTileCopy}>
            <AppText numberOfLines={1} style={styles.circleTileTitle}>
              {item.primaryLabel}
            </AppText>
            {item.amountLabel ? (
              <AppText
                adjustsFontSizeToFit
                minimumFontScale={0.76}
                numberOfLines={1}
                style={[
                  styles.circleTileAmount,
                  item.kind === 'past' && item.amountVoided ? styles.circleTileAmountVoided : null,
                ]}
              >
                {item.amountLabel}
              </AppText>
            ) : item.kind === 'past' ? (
              <AppText numberOfLines={1} style={styles.circleTileFallbackTitle}>
                {item.titleLabel}
              </AppText>
            ) : null}
            <AppText numberOfLines={2} style={styles.circleTileMeta}>
              {item.metaLabel}
            </AppText>
          </View>
        </Pressable>
      </Link>
    </SurfaceCard>
  );
}

function CircleLibraryRail({
  currentUserId,
  items,
}: {
  readonly currentUserId: string | null | undefined;
  readonly items: readonly CircleLibraryItem[];
}) {
  const { width } = useWindowDimensions();
  const contentWidth = Math.min(width - theme.spacing.lg * 2, 560);
  const tileWidth = Math.min(Math.max(contentWidth * 0.68, 232), 296);
  const snapInterval = tileWidth + theme.spacing.sm;

  if (items.length === 0) {
    return (
      <EmptyState
        description="Apareceran cuando haya saldos por simplificar o Circles cerrados."
        title="Sin Circles todavia"
      />
    );
  }

  if (items.length === 1) {
    return (
      <View style={styles.singleCircleTileWrap}>
        <CircleLibraryTile currentUserId={currentUserId} item={items[0]} width={tileWidth} />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.circleLibraryRail}
      decelerationRate="fast"
      horizontal
      showsHorizontalScrollIndicator={false}
      snapToInterval={snapInterval}
    >
      {items.map((item) => (
        <CircleLibraryTile
          currentUserId={currentUserId}
          item={item}
          key={item.id}
          width={tileWidth}
        />
      ))}
    </ScrollView>
  );
}

export function CirclesIndexScreen() {
  const session = useSession();
  const snapshotQuery = useAppSnapshot();
  const refresh = useSnapshotRefresh(snapshotQuery);
  const snapshot = snapshotQuery.data ?? null;

  const happyCircleScore = snapshot?.happyCircleScore ?? EMPTY_HAPPY_CIRCLE_SCORE;
  const pendingSection = snapshot?.activitySections.find((section) => section.key === 'pending');
  const historySection = snapshot?.activitySections.find((section) => section.key === 'history');
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
  const circleLibraryItems = useMemo(
    () => [
      ...circleItems.map(activeCircleLibraryItem),
      ...circleHistoryCases.map(pastCircleLibraryItem),
    ],
    [circleHistoryCases, circleItems],
  );

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

      <SectionBlock
        action={
          <Link href={CYCLE_TRANSACTIONS_HREF} asChild>
            <Pressable
              style={({ pressed }) => [styles.sectionAction, pressed ? styles.pressed : null]}
            >
              <AppText style={styles.sectionActionText}>Ver todo</AppText>
            </Pressable>
          </Link>
        }
        subtitle={`${circleItems.length} activos / ${circleHistoryCases.length} pasados`}
        title="Tus Circles"
      >
        <CircleLibraryRail currentUserId={session.userId} items={circleLibraryItems} />
      </SectionBlock>
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
    gap: theme.spacing.md,
    justifyContent: 'space-between',
  },
  heroBrand: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    minWidth: 0,
  },
  heroTitle: {
    color: theme.colors.primary,
    fontSize: theme.typography.title1,
    fontWeight: '900',
    letterSpacing: -0.4,
    lineHeight: 34,
  },
  heroFacesCounter: {
    flexShrink: 0,
  },
  heroRewardWrap: {
    position: 'relative',
  },
  heroRewardSparkle: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    right: -5,
    top: -9,
    zIndex: 2,
  },
  headerMetricsGrid: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
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
  singleCircleTileWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  circleLibraryRail: {
    gap: theme.spacing.sm,
    paddingRight: theme.spacing.sm,
    paddingVertical: 2,
  },
  circleTileCard: {
    borderRadius: theme.radius.large,
    flexShrink: 0,
  },
  circleTilePressable: {
    flex: 1,
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
    padding: theme.spacing.md,
  },
  circleTilePressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }],
  },
  circleTileTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
    justifyContent: 'space-between',
    minHeight: 28,
  },
  circleTileVisual: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 98,
  },
  circleHistoryIcon: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    height: 104,
    justifyContent: 'center',
    width: 104,
  },
  circleTileCopy: {
    gap: 3,
    minWidth: 0,
  },
  circleTileTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '800',
    lineHeight: 20,
    textAlign: 'center',
  },
  circleTileAmount: {
    color: theme.colors.primary,
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 29,
    textAlign: 'center',
  },
  circleTileAmountVoided: {
    color: theme.colors.textMuted,
    textDecorationLine: 'line-through',
  },
  circleTileFallbackTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.footnote,
    fontWeight: '800',
    lineHeight: 18,
    textAlign: 'center',
  },
  circleTileMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    lineHeight: 16,
    textAlign: 'center',
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
