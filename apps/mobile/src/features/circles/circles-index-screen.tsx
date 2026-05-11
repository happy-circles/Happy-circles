import { useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

import type {
  ActiveSettlementPreviewDto,
  ActivityItemDto,
  HappyCircleScoreDto,
  PersonCardDto,
} from '@happy-circles/application';

import { AppText } from '@/components/app-text';
import { EmptyState } from '@/components/empty-state';
import { HappyCircleCard } from '@/components/happy-circle-card';
import { HappyCirclesMotion } from '@/components/happy-circles-motion';
import { HappyFacesCounter } from '@/components/happy-faces-counter';
import { HistoryCaseCard, type HistoryCaseTone } from '@/components/history-case-card';
import { ScreenShell } from '@/components/screen-shell';
import { SectionBlock } from '@/components/section-block';
import { formatCompactCop } from '@/features/balance/balance-helpers';
import {
  buildCircleProposalViewModels,
  circleStatusCounts,
  circleStateLabel,
  filterCircleProposalViewModels,
  type CircleProposalViewModel,
  type CircleStatusFilter,
} from '@/features/circles/circles-helpers';
import { triggerAppSelectionHaptic } from '@/lib/app-haptics';
import {
  buildHistoryCases,
  friendlyHistoryStepLabel,
  historyCardTitle,
  historyCaseEyebrow,
  historyCaseMeta,
  historyCaseStatusLabel,
  historyCaseStatusTone,
  historyCaseVisualCategory,
  historyImpactLabel,
  historyImpactTone,
  historyStepAmountLabel,
  historyTimelineStepAmountLabel,
  historyTimelineStepCategory,
  historyTimelineStepDetailLabel,
  isHistoryCaseItem,
  type HistoryCase,
  type HistoryCaseItem,
} from '@/lib/history-cases';
import { notificationViewKeyForItem, useAppSnapshot } from '@/lib/live-data';
import { theme } from '@/lib/theme';
import {
  transactionInitialsBackgroundColor,
  transactionPersonForItem,
} from '@/lib/transaction-people';
import { isCycleTransactionItem } from '@/lib/transaction-presentation';
import { transactionCategoryColor } from '@/lib/transaction-categories';
import { useSnapshotRefresh } from '@/lib/use-snapshot-refresh';
import { useSession } from '@/providers/session-provider';

const CIRCLE_COLOR = transactionCategoryColor('cycle');
const RECENT_ACTIVITY_LIMIT = 2;

const EMPTY_HAPPY_CIRCLE_SCORE: HappyCircleScoreDto = {
  totalFaces: 0,
  closedCircleCount: 0,
  recentAwards: [],
  latestAward: null,
};

const FILTER_OPTIONS: readonly CircleStatusFilter[] = [
  'needs_me',
  'new',
  'ready',
];

function countLabel(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

function circleFilterLabel(filter: CircleStatusFilter): string {
  return filter === 'all' ? 'Todos' : circleStateLabel(filter);
}

function circleFilterCount(
  counts: ReturnType<typeof circleStatusCounts>,
  filter: CircleStatusFilter,
): number {
  return counts[filter];
}

function circleFilterIcon(filter: CircleStatusFilter): keyof typeof Ionicons.glyphMap {
  if (filter === 'needs_me') {
    return 'checkmark-circle-outline';
  }

  if (filter === 'new') {
    return 'sparkles-outline';
  }

  if (filter === 'ready') {
    return 'checkmark-done-outline';
  }

  if (filter === 'waiting') {
    return 'ellipsis-horizontal-circle-outline';
  }

  return 'albums-outline';
}

function circleFilterColor(filter: CircleStatusFilter): string {
  if (filter === 'needs_me') {
    return theme.colors.warning;
  }

  if (filter === 'ready') {
    return theme.colors.success;
  }

  if (filter === 'waiting') {
    return theme.colors.brandNavy;
  }

  return CIRCLE_COLOR;
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

function historyPersonForCase(
  people: readonly PersonCardDto[],
  itemCase: Pick<HistoryCase<HistoryCaseItem>, 'latest'>,
): PersonCardDto | undefined {
  return transactionPersonForItem(people, itemCase.latest);
}

function CircleHeaderMetric({
  icon,
  label,
  tone = CIRCLE_COLOR,
  value,
}: {
  readonly icon: keyof typeof Ionicons.glyphMap;
  readonly label: string;
  readonly tone?: string;
  readonly value: string;
}) {
  return (
    <View style={styles.headerMetric}>
      <View style={[styles.headerMetricIcon, { backgroundColor: `${tone}18` }]}>
        <Ionicons color={tone} name={icon} size={17} />
      </View>
      <View style={styles.headerMetricCopy}>
        <AppText numberOfLines={1} style={styles.headerMetricLabel}>
          {label}
        </AppText>
        <AppText
          adjustsFontSizeToFit
          minimumFontScale={0.74}
          numberOfLines={1}
          style={[styles.headerMetricValue, { color: tone }]}
        >
          {value}
        </AppText>
      </View>
    </View>
  );
}

function CirclesHeader({
  closedCircleCount,
  metrics,
  totalFaces,
}: {
  readonly closedCircleCount: number;
  readonly metrics: {
    readonly resolvedMinor: number;
    readonly savedMovementsCount: number;
  };
  readonly totalFaces: number;
}) {
  return (
    <View style={styles.hero}>
      <View style={styles.heroTop}>
        <View style={styles.heroCopy}>
          <AppText style={styles.heroTitle}>Happy Circles</AppText>
          <AppText style={styles.heroSubtitle}>Cierra saldos en menos movimientos.</AppText>
        </View>
        <View style={styles.heroGlyphWrap}>
          <HappyCirclesMotion size={76} variant={totalFaces > 0 ? 'wink' : 'idle'} />
        </View>
      </View>

      <View style={styles.heroScoreRow}>
        <HappyFacesCounter
          closedCircleCount={closedCircleCount}
          compact
          style={styles.heroFacesCounter}
          totalFaces={totalFaces}
        />
        <View style={styles.heroScoreCopy}>
          <AppText style={styles.heroScoreTitle}>Caritas felices</AppText>
          <AppText style={styles.heroScoreDetail}>
            {closedCircleCount} {countLabel(closedCircleCount, 'Circle cerrado', 'Circles cerrados')}
          </AppText>
        </View>
      </View>

      <View style={styles.headerMetricsGrid}>
        <CircleHeaderMetric
          icon="cash-outline"
          label="Resuelto"
          tone={theme.colors.success}
          value={formatCompactCop(metrics.resolvedMinor)}
        />
        <CircleHeaderMetric
          icon="swap-horizontal-outline"
          label="Ahorrados"
          tone={CIRCLE_COLOR}
          value={String(metrics.savedMovementsCount)}
        />
        <CircleHeaderMetric
          icon="checkmark-done-outline"
          label="Cerrados"
          tone={theme.colors.brandNavy}
          value={String(closedCircleCount)}
        />
      </View>
    </View>
  );
}

function CircleFilterChip({
  count,
  filter,
  onPress,
  selected,
}: {
  readonly count: number;
  readonly filter: CircleStatusFilter;
  readonly onPress: () => void;
  readonly selected: boolean;
}) {
  const color = circleFilterColor(filter);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.filterChip,
        selected ? styles.filterChipSelected : null,
        selected ? { borderColor: color } : null,
        pressed ? styles.pressed : null,
      ]}
    >
      <Ionicons color={selected ? color : theme.colors.textMuted} name={circleFilterIcon(filter)} size={15} />
      <AppText
        style={[
          styles.filterChipText,
          selected ? styles.filterChipTextSelected : null,
          selected ? { color } : null,
        ]}
      >
        {circleFilterLabel(filter)}
      </AppText>
      <View style={[styles.filterChipCount, selected ? { backgroundColor: `${color}18` } : null]}>
        <AppText style={[styles.filterChipCountText, selected ? { color } : null]}>{count}</AppText>
      </View>
    </Pressable>
  );
}

function CircleStatusFilters({
  counts,
  onChange,
  value,
}: {
  readonly counts: ReturnType<typeof circleStatusCounts>;
  readonly onChange: (filter: CircleStatusFilter) => void;
  readonly value: CircleStatusFilter;
}) {
  const visibleFilters = FILTER_OPTIONS.filter((filter) => circleFilterCount(counts, filter) > 0);

  if (visibleFilters.length === 0) {
    return null;
  }

  return (
    <ScrollView
      horizontal
      contentContainerStyle={styles.filterRail}
      showsHorizontalScrollIndicator={false}
    >
      {visibleFilters.map((filter) => (
        <CircleFilterChip
          count={circleFilterCount(counts, filter)}
          filter={filter}
          key={filter}
          onPress={() => {
            triggerAppSelectionHaptic();
            onChange(value === filter ? 'all' : filter);
          }}
          selected={value === filter}
        />
      ))}
    </ScrollView>
  );
}

function HappyCircleProposalCarousel({
  activeIndex,
  items,
  onActiveIndexChange,
}: {
  readonly activeIndex: number;
  readonly items: readonly CircleProposalViewModel[];
  readonly onActiveIndexChange: (index: number) => void;
}) {
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(Math.max(width - theme.spacing.xxl * 2, 300), 430);
  const snapInterval = cardWidth + theme.spacing.md;
  const visibleIndex = Math.min(activeIndex, Math.max(0, items.length - 1));

  function handleMomentumScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / snapInterval);
    onActiveIndexChange(Math.max(0, Math.min(items.length - 1, nextIndex)));
  }

  if (items.length === 0) {
    return (
      <EmptyState
        description="Prueba otro estado."
        title="Sin Circles en este estado"
      />
    );
  }

  return (
    <View style={styles.carousel}>
      <ScrollView
        contentContainerStyle={styles.carouselContent}
        decelerationRate="fast"
        horizontal
        onMomentumScrollEnd={handleMomentumScrollEnd}
        showsHorizontalScrollIndicator={false}
        snapToInterval={snapInterval}
      >
        {items.map((item) => (
          <View key={item.proposal.proposalId} style={[styles.carouselItem, { width: cardWidth }]}>
            <HappyCircleCard proposal={item.proposal} variant="showcase" />
          </View>
        ))}
      </ScrollView>
      {items.length > 1 ? (
        <View style={styles.carouselDots}>
          {items.map((item, index) => (
            <View
              key={item.proposal.proposalId}
              style={[styles.carouselDot, index === visibleIndex ? styles.carouselDotActive : null]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function CircleRecentActivity({
  historyCases,
  people,
}: {
  readonly historyCases: readonly HistoryCase<HistoryCaseItem>[];
  readonly people: readonly PersonCardDto[];
}) {
  const [expandedCaseIds, setExpandedCaseIds] = useState<readonly string[]>([]);

  function toggleHistoryCase(caseId: string) {
    setExpandedCaseIds((current) => (current[0] === caseId ? [] : [caseId]));
  }

  return (
    <SectionBlock
      action={
        <Link href="/transactions?category=cycle" asChild>
          <Pressable style={({ pressed }) => [styles.sectionAction, pressed ? styles.pressed : null]}>
            <AppText style={styles.sectionActionText}>Ver todo</AppText>
          </Pressable>
        </Link>
      }
      title="Actividad reciente"
    >
      {historyCases.length === 0 ? (
        <EmptyState
          description="Completados y no aprobados aparecerán aquí."
          title="Sin actividad reciente"
        />
      ) : (
        <View style={styles.activityList}>
          {historyCases.map((itemCase) => {
            const latest = itemCase.latest;
            const caseAmountLabel = historyStepAmountLabel(latest);
            const caseTone = historyImpactTone(latest) as HistoryCaseTone;
            const caseTitle = friendlyHistoryStepLabel(latest);
            const caseDescription = historyCardTitle(itemCase);
            const caseEyebrow = historyCaseEyebrow(itemCase);
            const historyPerson = historyPersonForCase(people, itemCase);
            const fallbackPerson = {
              displayName: caseEyebrow ?? latest.counterpartyLabel ?? 'Persona',
              userId: historyPerson?.userId ?? itemCase.id,
            };

            return (
              <HistoryCaseCard
                actorAvatarUrl={itemCase.isCycleSnippet ? null : (historyPerson?.avatarUrl ?? null)}
                actorFallbackColor={
                  itemCase.isCycleSnippet
                    ? undefined
                    : transactionInitialsBackgroundColor(fallbackPerson)
                }
                amountLabel={caseAmountLabel}
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
      )}
    </SectionBlock>
  );
}

export function CirclesIndexScreen() {
  const session = useSession();
  const snapshotQuery = useAppSnapshot();
  const refresh = useSnapshotRefresh(snapshotQuery);
  const analytics = snapshotQuery.data?.balanceAnalytics ?? null;
  const [activeFilter, setActiveFilter] = useState<CircleStatusFilter>('all');
  const [activeIndex, setActiveIndex] = useState(0);

  const currentPeriod =
    analytics?.periods[analytics.defaultPeriod] ??
    analytics?.periods.month ??
    analytics?.periods.all ??
    null;
  const metrics = currentPeriod?.settlements ?? null;
  const happyCircleScore = snapshotQuery.data?.happyCircleScore ?? EMPTY_HAPPY_CIRCLE_SCORE;
  const pendingSection = snapshotQuery.data?.activitySections.find(
    (section) => section.key === 'pending',
  );
  const historySection = snapshotQuery.data?.activitySections.find(
    (section) => section.key === 'history',
  );
  const newCircleProposalIds = useMemo(() => {
    const notificationViewedKeys = new Set(snapshotQuery.data?.notificationViewedKeys ?? []);

    return new Set(
      (pendingSection?.items ?? []).flatMap((item) =>
        item.kind === 'settlement_proposal' &&
        isCycleTransactionItem(item) &&
        !notificationViewedKeys.has(notificationViewKeyForItem(item))
          ? [item.originSettlementProposalId ?? item.id]
          : [],
      ),
    );
  }, [pendingSection?.items, snapshotQuery.data?.notificationViewedKeys]);
  const activeProposals: readonly ActiveSettlementPreviewDto[] =
    metrics?.activeProposals ?? (metrics?.activeProposal ? [metrics.activeProposal] : []);
  const circleItems = useMemo(
    () =>
      buildCircleProposalViewModels({
        currentUserId: session.userId,
        newCircleProposalIds,
        proposals: activeProposals,
      }),
    [activeProposals, newCircleProposalIds, session.userId],
  );
  const counts = useMemo(() => circleStatusCounts(circleItems), [circleItems]);
  const visibleCircleItems = useMemo(
    () => filterCircleProposalViewModels(circleItems, activeFilter),
    [activeFilter, circleItems],
  );
  const people = snapshotQuery.data?.dashboard.activePeople ?? snapshotQuery.data?.people ?? [];
  const recentHistoryCases = useMemo(
    () =>
      buildHistoryCases(
        (historySection?.items ?? [])
          .filter(isCycleTransactionItem)
          .filter(isHistoryCaseItem)
          .map(activityHistoryCaseItem),
      ).slice(0, RECENT_ACTIVITY_LIMIT),
    [historySection?.items],
  );

  useEffect(() => {
    setActiveIndex(0);
  }, [activeFilter, circleItems.length]);

  useEffect(() => {
    if (activeFilter !== 'all' && circleFilterCount(counts, activeFilter) === 0) {
      setActiveFilter('all');
    }
  }, [activeFilter, counts]);

  if (snapshotQuery.error && !analytics) {
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

  if (snapshotQuery.isLoading || !analytics || !currentPeriod || !metrics) {
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
        closedCircleCount={happyCircleScore.closedCircleCount}
        metrics={metrics}
        totalFaces={happyCircleScore.totalFaces}
      />

      <SectionBlock title="Tus Circles">
        {circleItems.length > 0 ? (
          <>
            <CircleStatusFilters counts={counts} onChange={setActiveFilter} value={activeFilter} />
            <HappyCircleProposalCarousel
              activeIndex={activeIndex}
              items={visibleCircleItems}
              key={activeFilter}
              onActiveIndexChange={setActiveIndex}
            />
          </>
        ) : (
          <EmptyState
            description="Aparecerán cuando haya saldos por simplificar."
            title="Sin Circle activo"
          />
        )}
      </SectionBlock>

      <CircleRecentActivity historyCases={recentHistoryCases} people={people} />
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
  heroCopy: {
    flex: 1,
    gap: theme.spacing.xs,
    minWidth: 0,
  },
  heroTitle: {
    color: theme.colors.primary,
    fontSize: theme.typography.title1,
    fontWeight: '900',
    letterSpacing: -0.4,
    lineHeight: 34,
  },
  heroSubtitle: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.callout,
    lineHeight: 21,
  },
  heroGlyphWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroScoreRow: {
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.hairline,
    borderRadius: theme.radius.medium,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
  },
  heroFacesCounter: {
    flexShrink: 0,
  },
  heroScoreCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  heroScoreTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '800',
    lineHeight: 20,
  },
  heroScoreDetail: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
  },
  headerMetricsGrid: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  headerMetric: {
    alignItems: 'center',
    flex: 1,
    gap: 6,
    minWidth: 0,
  },
  headerMetricIcon: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  headerMetricCopy: {
    alignItems: 'center',
    gap: 1,
    minWidth: 0,
    width: '100%',
  },
  headerMetricLabel: {
    color: theme.colors.textMuted,
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 12,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  headerMetricValue: {
    fontSize: theme.typography.title3,
    fontWeight: '900',
    lineHeight: 23,
    textAlign: 'center',
  },
  filterRail: {
    gap: theme.spacing.xs,
    paddingVertical: 2,
  },
  filterChip: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    minHeight: 38,
    paddingHorizontal: theme.spacing.sm,
  },
  filterChipSelected: {
    backgroundColor: theme.colors.surface,
  },
  filterChipText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    fontWeight: '800',
    lineHeight: 17,
  },
  filterChipTextSelected: {
    color: theme.colors.text,
  },
  filterChipCount: {
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radius.pill,
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  filterChipCountText: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 14,
  },
  carousel: {
    gap: theme.spacing.sm,
  },
  carouselContent: {
    gap: theme.spacing.md,
    paddingVertical: 2,
  },
  carouselItem: {
    flexShrink: 0,
  },
  carouselDots: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
    justifyContent: 'center',
  },
  carouselDot: {
    backgroundColor: theme.colors.surfaceSoft,
    borderRadius: theme.radius.pill,
    height: 7,
    width: 7,
  },
  carouselDotActive: {
    backgroundColor: CIRCLE_COLOR,
    width: 20,
  },
  activityList: {
    gap: theme.spacing.sm,
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
