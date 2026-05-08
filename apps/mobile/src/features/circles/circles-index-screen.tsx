import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

import type {
  ActiveSettlementPreviewDto,
  BalanceAnalyticsPeriod,
  BalanceSettlementMetricsDto,
  HappyCircleScoreDto,
} from '@happy-circles/application';

import { AppText } from '@/components/app-text';
import { EmptyState } from '@/components/empty-state';
import { HappyCircleCard } from '@/components/happy-circle-card';
import { HappyCirclesMotion } from '@/components/happy-circles-motion';
import { PrimaryAction } from '@/components/primary-action';
import { ScreenShell } from '@/components/screen-shell';
import { SectionBlock } from '@/components/section-block';
import { SegmentedControl, type SegmentedOption } from '@/components/segmented-control';
import { SurfaceCard } from '@/components/surface-card';
import { comparisonCopy } from '@/features/balance/balance-helpers';
import { formatCop } from '@/lib/data';
import { useAppSnapshot } from '@/lib/live-data';
import { theme } from '@/lib/theme';
import { transactionCategoryColor } from '@/lib/transaction-categories';
import { useSnapshotRefresh } from '@/lib/use-snapshot-refresh';

const CIRCLE_COLOR = transactionCategoryColor('cycle');
const EMPTY_HAPPY_CIRCLE_SCORE: HappyCircleScoreDto = {
  totalFaces: 0,
  closedCircleCount: 0,
  recentAwards: [],
  latestAward: null,
};

const PERIOD_OPTIONS: readonly SegmentedOption<BalanceAnalyticsPeriod>[] = [
  { label: 'Semana', value: 'week' },
  { label: 'Mes', value: 'month' },
  { label: 'Ano', value: 'year' },
  { label: 'Todo', value: 'all' },
];

function metricCountLabel(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

function CirclesMetricCard({
  detail,
  icon,
  label,
  tone = 'neutral',
  value,
}: {
  readonly detail: string;
  readonly icon: keyof typeof Ionicons.glyphMap;
  readonly label: string;
  readonly tone?: 'neutral' | 'positive' | 'warning';
  readonly value: string;
}) {
  const accentColor =
    tone === 'positive'
      ? theme.colors.success
      : tone === 'warning'
        ? theme.colors.warning
        : CIRCLE_COLOR;

  return (
    <SurfaceCard padding="md" style={styles.metricCard}>
      <View style={[styles.metricIcon, { backgroundColor: `${accentColor}1A` }]}>
        <Ionicons color={accentColor} name={icon} size={19} />
      </View>
      <View style={styles.metricCopy}>
        <AppText style={styles.metricLabel}>{label}</AppText>
        <AppText
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          numberOfLines={1}
          style={[styles.metricValue, { color: accentColor }]}
        >
          {value}
        </AppText>
        <AppText style={styles.metricDetail}>{detail}</AppText>
      </View>
    </SurfaceCard>
  );
}

function CirclesMetrics({
  happyCircleScore,
  metrics,
  previousLabel,
}: {
  readonly happyCircleScore: HappyCircleScoreDto;
  readonly metrics: BalanceSettlementMetricsDto;
  readonly previousLabel: string | null;
}) {
  const totalFaces = happyCircleScore.totalFaces;
  const closedCircleCount = happyCircleScore.closedCircleCount;

  return (
    <View style={styles.metricsGrid}>
      <CirclesMetricCard
        detail={`${closedCircleCount} ${metricCountLabel(
          closedCircleCount,
          'circulo cerrado',
          'circulos cerrados',
        )}`}
        icon="happy-outline"
        label="Caritas felices"
        tone={totalFaces > 0 ? 'positive' : 'neutral'}
        value={String(totalFaces)}
      />
      <CirclesMetricCard
        detail={comparisonCopy(metrics.changeRatio, previousLabel)}
        icon="cash-outline"
        label="Monto resuelto"
        tone="positive"
        value={formatCop(metrics.resolvedMinor)}
      />
      <CirclesMetricCard
        detail={`${metrics.movementCount} ${metricCountLabel(
          metrics.movementCount,
          'movimiento ejecutado',
          'movimientos ejecutados',
        )}`}
        icon="swap-horizontal-outline"
        label="Movimientos ahorrados"
        value={String(metrics.savedMovementsCount)}
      />
      <CirclesMetricCard
        detail={`${metrics.activeCount} ${metricCountLabel(
          metrics.activeCount,
          'Circle activo',
          'Circles activos',
        )}`}
        icon="happy-outline"
        label="Circulos participados"
        tone={metrics.activeCount > 0 ? 'warning' : 'neutral'}
        value={String(metrics.participatedCount)}
      />
    </View>
  );
}

function activeCircleCountLabel(count: number): string {
  return `${count} ${metricCountLabel(count, 'propuesta activa', 'propuestas activas')}`;
}

function HappyCircleProposalCarousel({
  proposals,
}: {
  readonly proposals: readonly ActiveSettlementPreviewDto[];
}) {
  const { width } = useWindowDimensions();
  const [activeIndex, setActiveIndex] = useState(0);
  const cardWidth = Math.min(Math.max(width - theme.spacing.xl * 2, 284), 420);
  const snapInterval = cardWidth + theme.spacing.md;
  const visibleIndex = Math.min(activeIndex, Math.max(0, proposals.length - 1));

  function handleMomentumScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / snapInterval);
    setActiveIndex(Math.max(0, Math.min(proposals.length - 1, nextIndex)));
  }

  return (
    <View style={styles.carousel}>
      <View style={styles.carouselMeta}>
        <AppText style={styles.carouselCount}>{activeCircleCountLabel(proposals.length)}</AppText>
        {proposals.length > 1 ? (
          <AppText style={styles.carouselPosition}>
            {visibleIndex + 1}/{proposals.length}
          </AppText>
        ) : null}
      </View>
      <ScrollView
        contentContainerStyle={styles.carouselContent}
        decelerationRate="fast"
        horizontal
        onMomentumScrollEnd={handleMomentumScrollEnd}
        showsHorizontalScrollIndicator={false}
        snapToInterval={snapInterval}
      >
        {proposals.map((proposal) => (
          <View key={proposal.proposalId} style={[styles.carouselItem, { width: cardWidth }]}>
            <HappyCircleCard proposal={proposal} variant="compact" />
          </View>
        ))}
      </ScrollView>
      {proposals.length > 1 ? (
        <View style={styles.carouselDots}>
          {proposals.map((proposal, index) => (
            <View
              key={proposal.proposalId}
              style={[styles.carouselDot, index === visibleIndex ? styles.carouselDotActive : null]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function CirclesIndexScreen() {
  const snapshotQuery = useAppSnapshot();
  const refresh = useSnapshotRefresh(snapshotQuery);
  const analytics = snapshotQuery.data?.balanceAnalytics ?? null;
  const [period, setPeriod] = useState<BalanceAnalyticsPeriod>(analytics?.defaultPeriod ?? 'month');

  useEffect(() => {
    if (analytics?.defaultPeriod) {
      setPeriod(analytics.defaultPeriod);
    }
  }, [analytics?.defaultPeriod]);

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

  if (snapshotQuery.isLoading || !analytics) {
    return (
      <ScreenShell headerVariant="plain" largeTitle={false} title="Happy Circles">
        <View style={styles.loadingState}>
          <HappyCirclesMotion size={108} variant="loading" />
          <AppText style={styles.supportText}>Estamos buscando tus Circles.</AppText>
        </View>
      </ScreenShell>
    );
  }

  const currentPeriod = analytics.periods[period];
  const metrics = currentPeriod.settlements;
  const happyCircleScore = snapshotQuery.data?.happyCircleScore ?? EMPTY_HAPPY_CIRCLE_SCORE;
  const activeProposals =
    metrics.activeProposals ?? (metrics.activeProposal ? [metrics.activeProposal] : []);

  return (
    <ScreenShell
      headerVariant="plain"
      largeTitle={false}
      refresh={refresh}
      subtitle="Cierres que simplifican saldos confirmados."
      title="Happy Circles"
    >
      <SegmentedControl
        label="Periodo"
        onChange={setPeriod}
        options={PERIOD_OPTIONS}
        value={period}
      />

      <SectionBlock title="Circles activos">
        {activeProposals.length > 0 ? (
          <HappyCircleProposalCarousel proposals={activeProposals} />
        ) : (
          <EmptyState
            description="Cuando haya una oportunidad real para simplificar saldos, aparecera aqui."
            title="Sin Circle activo"
          />
        )}
      </SectionBlock>

      <SectionBlock title="Resumen">
        <CirclesMetrics
          happyCircleScore={happyCircleScore}
          metrics={metrics}
          previousLabel={currentPeriod.labels.previous}
        />
      </SectionBlock>

      <SurfaceCard padding="md" style={styles.noteCard} variant="muted">
        <View style={styles.noteIcon}>
          <Ionicons color={CIRCLE_COLOR} name="shield-checkmark-outline" size={18} />
        </View>
        <AppText style={styles.noteText}>
          Los Happy Circles no cambian el historial: crean movimientos confirmados para reducir
          deudas redundantes.
        </AppText>
      </SurfaceCard>

      <PrimaryAction
        href="/transactions?category=cycle"
        icon="time-outline"
        label="Ver movimientos de Circles"
        variant="secondary"
      />
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
  metricsGrid: {
    gap: theme.spacing.sm,
  },
  carousel: {
    gap: theme.spacing.sm,
  },
  carouselMeta: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  carouselCount: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    fontWeight: '800',
    lineHeight: 18,
  },
  carouselPosition: {
    color: CIRCLE_COLOR,
    fontSize: theme.typography.footnote,
    fontWeight: '800',
    lineHeight: 18,
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
    height: 6,
    width: 18,
  },
  carouselDotActive: {
    backgroundColor: CIRCLE_COLOR,
    width: 28,
  },
  metricCard: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  metricIcon: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  metricCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  metricLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    fontWeight: '800',
    letterSpacing: 0.3,
    lineHeight: 15,
    textTransform: 'uppercase',
  },
  metricValue: {
    color: theme.colors.text,
    fontSize: theme.typography.title2,
    fontWeight: '800',
    lineHeight: 28,
  },
  metricDetail: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
  },
  noteCard: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  noteIcon: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.hairline,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  noteText: {
    color: theme.colors.text,
    flex: 1,
    fontSize: theme.typography.callout,
    fontWeight: '700',
    lineHeight: 21,
  },
});
