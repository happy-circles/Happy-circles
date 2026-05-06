import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type {
  DimensionValue,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView as ScrollViewType,
} from 'react-native';
import { Pressable, ScrollView, View } from 'react-native';

import type {
  BalanceAnalyticsCategoryRowDto,
  BalanceAnalyticsLens,
  BalanceAnalyticsPeriod,
  BalanceAnalyticsPeriodDto,
  BalanceAnalyticsPersonRowDto,
} from '@happy-circles/application';

import { HappyCircleCard } from '@/components/happy-circle-card';
import { HappyWaterfallChart } from '@/components/happy-waterfall-chart';
import { ProjectionForecastCard } from '@/components/projection-forecast-card';
import { SectionBlock } from '@/components/section-block';
import { SegmentedControl, type SegmentedOption } from '@/components/segmented-control';
import { SurfaceCard } from '@/components/surface-card';
import { formatCop } from '@/lib/data';
import { toneVisual } from '@/lib/direction-ui';
import { theme } from '@/lib/theme';
import { transactionCategoryLabel } from '@/lib/transaction-categories';
import type { ProjectionChartFilter } from '@/lib/transaction-filters';
import { balanceOverviewStyles as styles } from './balance-overview-screen.styles';
import {
  FOCUS_OPTIONS,
  amountTone,
  balanceTone,
  categoryFocusMeta,
  categoryImpactAmount,
  categoryLensAmount,
  comparisonCopy,
  firstName,
  focusIndex,
  formatCompactCop,
  formatHomeBalanceCop,
  periodScopeLabel,
  personFocusMeta,
  personImpactAmount,
  personLensAmount,
  signedFormatCop,
  signedFormatCompactCop,
  transactionFilterHref,
  type BalanceFocus,
} from './balance-helpers';
import { AppText } from '@/components/app-text';

const PERIOD_OPTIONS: readonly SegmentedOption<BalanceAnalyticsPeriod>[] = [
  { label: 'Semana', value: 'week' },
  { label: 'Mes', value: 'month' },
  { label: 'Ano', value: 'year' },
  { label: 'Todo', value: 'all' },
];

const LENS_OPTIONS: readonly SegmentedOption<BalanceAnalyticsLens>[] = [
  { label: 'Balance', value: 'balance' },
  { label: 'Debes', value: 'i_owe' },
  { label: 'Te deben', value: 'owed_to_me' },
];

function CarouselDots({
  activeFocus,
  onChange,
}: {
  readonly activeFocus: BalanceFocus;
  readonly onChange: (focus: BalanceFocus) => void;
}) {
  return (
    <View style={styles.carouselDots}>
      {FOCUS_OPTIONS.map((option) => {
        const selected = option.value === activeFocus;
        return (
          <Pressable
            accessibilityLabel={option.label}
            accessibilityRole="button"
            key={option.value}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [styles.carouselDotHitArea, pressed ? styles.pressed : null]}
          >
            <View style={[styles.carouselDot, selected ? styles.carouselDotSelected : null]} />
          </Pressable>
        );
      })}
    </View>
  );
}

function FocusCardTitle({
  children,
  contextLabel,
}: {
  readonly children: string;
  readonly contextLabel: string;
}) {
  return (
    <View style={styles.focusCardHeader}>
      <AppText numberOfLines={1} style={styles.focusCardTitle}>
        {children}
      </AppText>
      <View style={styles.focusCardContextPill}>
        <AppText numberOfLines={1} style={styles.focusCardContextText}>
          {contextLabel}
        </AppText>
      </View>
    </View>
  );
}

function TrendChip({
  amountMinor,
  changeRatio,
  centered = false,
  contextLabel,
}: {
  readonly amountMinor?: number;
  readonly changeRatio?: number | null;
  readonly centered?: boolean;
  readonly contextLabel: string;
}) {
  const hasComparison =
    amountMinor !== undefined || (changeRatio !== undefined && changeRatio !== null);
  const comparable = amountMinor ?? changeRatio ?? 0;
  const tone = comparable > 0 ? 'positive' : comparable < 0 ? 'negative' : 'neutral';
  const valueLabel =
    amountMinor !== undefined
      ? signedFormatCompactCop(amountMinor)
      : changeRatio === null || changeRatio === undefined
        ? 'Sin data'
        : `${Math.round(Math.abs(changeRatio) * 100)}%`;

  return (
    <View
      style={[
        styles.trendChip,
        centered ? styles.trendChipCentered : null,
        tone === 'positive' ? styles.trendChipPositive : null,
        tone === 'negative' ? styles.trendChipNegative : null,
      ]}
    >
      <Ionicons
        color={
          tone === 'positive'
            ? theme.colors.success
            : tone === 'negative'
              ? theme.colors.warning
              : theme.colors.textMuted
        }
        name={
          tone === 'positive'
            ? 'trending-up-outline'
            : tone === 'negative'
              ? 'trending-down-outline'
              : 'remove-outline'
        }
        size={15}
      />
      <AppText
        numberOfLines={1}
        style={[
          styles.trendChipValue,
          tone === 'positive' ? styles.positiveText : null,
          tone === 'negative' ? styles.negativeText : null,
        ]}
      >
        {hasComparison ? valueLabel : 'Sin data'}
      </AppText>
      <AppText numberOfLines={1} style={styles.trendChipContext}>
        {contextLabel}
      </AppText>
    </View>
  );
}

function BalanceCarouselMetricItem({
  amountMinor,
  tone,
}: {
  readonly amountMinor: number;
  readonly tone: 'positive' | 'negative';
}) {
  const visual = toneVisual(tone);

  if (!visual) {
    return null;
  }

  return (
    <View style={styles.balanceMetricItem}>
      <Ionicons color={visual.accentColor} name={visual.icon} size={18} />
      <AppText numberOfLines={1} style={[styles.balanceMetricLabel, { color: visual.accentColor }]}>
        {visual.label}
      </AppText>
      <AppText
        adjustsFontSizeToFit
        minimumFontScale={0.82}
        numberOfLines={1}
        style={[styles.balanceMetricAmount, { color: visual.accentColor }]}
      >
        {formatCop(amountMinor)}
      </AppText>
    </View>
  );
}

function EmptyCardState({
  icon,
  label,
}: {
  readonly icon: keyof typeof Ionicons.glyphMap;
  readonly label: string;
}) {
  return (
    <View style={styles.emptyCardState}>
      <Ionicons color={theme.colors.textMuted} name={icon} size={18} />
      <AppText style={styles.emptyCardText}>{label}</AppText>
    </View>
  );
}

function BalanceFocusCard({
  netBalanceMinor,
  periodContextLabel,
  periodChangeMinor,
  totalIOweMinor,
  totalOwedToMeMinor,
}: {
  readonly netBalanceMinor: number;
  readonly periodContextLabel: string;
  readonly periodChangeMinor: number;
  readonly totalIOweMinor: number;
  readonly totalOwedToMeMinor: number;
}) {
  const tone = balanceTone(netBalanceMinor);
  const balanceVisual = toneVisual(tone);

  return (
    <SurfaceCard padding="lg" style={[styles.focusCard, styles.balanceFocusCard]}>
      <FocusCardTitle contextLabel={periodContextLabel}>Balance actual</FocusCardTitle>
      <View style={styles.balanceHomeBody}>
        <AppText
          adjustsFontSizeToFit
          minimumFontScale={0.78}
          numberOfLines={1}
          style={[
            styles.homeBalanceAmount,
            balanceVisual ? { color: balanceVisual.accentColor } : null,
          ]}
        >
          {formatHomeBalanceCop(netBalanceMinor)}
        </AppText>
        <TrendChip amountMinor={periodChangeMinor} centered contextLabel={periodContextLabel} />
        <View style={styles.homeBalanceMetricsRow}>
          <BalanceCarouselMetricItem amountMinor={totalIOweMinor} tone="negative" />
          <BalanceCarouselMetricItem amountMinor={totalOwedToMeMinor} tone="positive" />
        </View>
      </View>
    </SurfaceCard>
  );
}

function ImpactBars({
  emptyLabel,
  maxRows = 2,
  rows,
}: {
  readonly emptyLabel: string;
  readonly maxRows?: number;
  readonly rows: readonly {
    readonly key: string;
    readonly label: string;
    readonly amountMinor: number;
    readonly meta: string;
    readonly trendMinor?: number;
  }[];
}) {
  const visibleRows = rows.slice(0, maxRows);
  const maxAmount = Math.max(...visibleRows.map((row) => Math.abs(row.amountMinor)), 1);

  if (visibleRows.length === 0) {
    return <EmptyCardState icon="remove-circle-outline" label={emptyLabel} />;
  }

  return (
    <View style={styles.barList}>
      {visibleRows.map((row) => {
        const tone = amountTone(row.amountMinor);
        const width =
          `${Math.max((Math.abs(row.amountMinor) / maxAmount) * 100, 8)}%` as DimensionValue;
        return (
          <View key={row.key} style={styles.barRow}>
            <View style={styles.barRowHeader}>
              <View style={styles.barCopy}>
                <AppText numberOfLines={1} style={styles.barLabel}>
                  {row.label}
                </AppText>
                <View style={styles.barMetaLine}>
                  <AppText numberOfLines={1} style={[styles.cardMeta, styles.barMetaText]}>
                    {row.meta}
                  </AppText>
                  {row.trendMinor !== undefined ? (
                    <View
                      style={[
                        styles.miniTrend,
                        row.trendMinor > 0 ? styles.miniTrendPositive : null,
                        row.trendMinor < 0 ? styles.miniTrendNegative : null,
                      ]}
                    >
                      <Ionicons
                        color={
                          row.trendMinor > 0
                            ? theme.colors.success
                            : row.trendMinor < 0
                              ? theme.colors.warning
                              : theme.colors.textMuted
                        }
                        name={
                          row.trendMinor > 0
                            ? 'trending-up-outline'
                            : row.trendMinor < 0
                              ? 'trending-down-outline'
                              : 'remove-outline'
                        }
                        size={10}
                      />
                      <AppText
                        numberOfLines={1}
                        style={[
                          styles.miniTrendText,
                          row.trendMinor > 0 ? styles.positiveText : null,
                          row.trendMinor < 0 ? styles.negativeText : null,
                        ]}
                      >
                        {signedFormatCompactCop(row.trendMinor)}
                      </AppText>
                    </View>
                  ) : null}
                </View>
              </View>
              <AppText
                numberOfLines={1}
                style={[
                  styles.barAmount,
                  tone === 'positive' ? styles.positiveText : null,
                  tone === 'negative' ? styles.negativeText : null,
                ]}
              >
                {formatCompactCop(row.amountMinor)}
              </AppText>
            </View>
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.barFill,
                  tone === 'positive' ? styles.barFillPositive : null,
                  tone === 'negative' ? styles.barFillNegative : null,
                  tone === 'neutral' ? styles.barFillNeutral : null,
                  { width },
                ]}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

function DetailFilters({
  lens,
  onLensChange,
  onPeriodChange,
  period,
}: {
  readonly lens: BalanceAnalyticsLens;
  readonly onLensChange: (lens: BalanceAnalyticsLens) => void;
  readonly onPeriodChange: (period: BalanceAnalyticsPeriod) => void;
  readonly period: BalanceAnalyticsPeriod;
}) {
  return (
    <View style={styles.detailFilters}>
      <SegmentedControl
        label="Periodo"
        onChange={onPeriodChange}
        options={PERIOD_OPTIONS}
        value={period}
      />
      <SegmentedControl
        label="Filtro"
        onChange={onLensChange}
        options={LENS_OPTIONS}
        value={lens}
      />
    </View>
  );
}

function RankingRow({
  description,
  icon,
  label,
  meta,
  onPress,
  tone,
  valueLabel,
}: {
  readonly description?: string | null;
  readonly icon: keyof typeof Ionicons.glyphMap;
  readonly label: string;
  readonly meta: string;
  readonly onPress?: () => void;
  readonly tone: 'positive' | 'negative' | 'neutral';
  readonly valueLabel: string;
}) {
  const rowContent = (
    <>
      <View style={styles.rankingIcon}>
        <Ionicons color={theme.colors.textMuted} name={icon} size={20} />
      </View>
      <View style={styles.rankingCopy}>
        <AppText numberOfLines={1} style={styles.detailRowTitle}>
          {label}
        </AppText>
        {description ? (
          <AppText numberOfLines={1} style={styles.detailRowDescription}>
            {description}
          </AppText>
        ) : null}
        <AppText numberOfLines={1} style={styles.cardMeta}>
          {meta}
        </AppText>
      </View>
      <AppText
        numberOfLines={1}
        style={[
          styles.detailRowAmount,
          tone === 'positive' ? styles.positiveText : null,
          tone === 'negative' ? styles.negativeText : null,
        ]}
      >
        {valueLabel}
      </AppText>
    </>
  );

  if (!onPress) {
    return <View style={styles.rankingRow}>{rowContent}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.rankingRow, pressed ? styles.pressed : null]}
    >
      {rowContent}
    </Pressable>
  );
}

export function BalanceDetail({
  currentPeriod,
  lens,
  onLensChange,
  onPeriodChange,
  period,
  sortedCategories,
  sortedPeople,
}: {
  readonly currentPeriod: BalanceAnalyticsPeriodDto;
  readonly lens: BalanceAnalyticsLens;
  readonly onLensChange: (lens: BalanceAnalyticsLens) => void;
  readonly onPeriodChange: (period: BalanceAnalyticsPeriod) => void;
  readonly period: BalanceAnalyticsPeriod;
  readonly sortedCategories: readonly BalanceAnalyticsCategoryRowDto[];
  readonly sortedPeople: readonly BalanceAnalyticsPersonRowDto[];
}) {
  const lensSummary = currentPeriod.summaries[lens];
  const topPerson = sortedPeople[0] ?? null;
  const topCategory = sortedCategories[0] ?? null;

  return (
    <SectionBlock title="Detalle del balance">
      <DetailFilters
        lens={lens}
        onLensChange={onLensChange}
        onPeriodChange={onPeriodChange}
        period={period}
      />
      <SurfaceCard padding="lg" style={styles.detailCard} variant="elevated">
        <AppText style={styles.cardEyebrow}>{currentPeriod.labels.current}</AppText>
        <AppText style={styles.detailHeroAmount}>{formatCop(lensSummary.finalMinor)}</AppText>
        <AppText style={styles.focusCaption}>
          Inicio {formatCop(lensSummary.initialMinor)} - Cambio{' '}
          {signedFormatCop(lensSummary.deltaMinor)}
        </AppText>
        <TrendChip changeRatio={lensSummary.changeRatio} contextLabel={periodScopeLabel(period)} />
        <AppText style={styles.detailInsight}>
          {comparisonCopy(lensSummary.changeRatio, currentPeriod.labels.previous)}
        </AppText>
      </SurfaceCard>
      <SurfaceCard padding="md" variant="muted">
        <AppText style={styles.detailInsight}>{currentPeriod.insight}</AppText>
      </SurfaceCard>
      <View style={styles.detailGrid}>
        {topPerson ? (
          <SurfaceCard padding="md" style={styles.detailGridCard}>
            <AppText style={styles.cardEyebrow}>Persona clave</AppText>
            <AppText numberOfLines={1} style={styles.detailRowTitle}>
              {topPerson.label}
            </AppText>
            <AppText style={styles.cardMeta}>
              {formatCop(personLensAmount(topPerson, lens))}
            </AppText>
          </SurfaceCard>
        ) : null}
        {topCategory ? (
          <SurfaceCard padding="md" style={styles.detailGridCard}>
            <AppText style={styles.cardEyebrow}>Categoria clave</AppText>
            <AppText numberOfLines={1} style={styles.detailRowTitle}>
              {topCategory.label}
            </AppText>
            <AppText style={styles.cardMeta}>
              {formatCop(categoryLensAmount(topCategory, lens))}
            </AppText>
          </SurfaceCard>
        ) : null}
      </View>
    </SectionBlock>
  );
}

export function ProjectionDetail({
  onSegmentPress,
  overview,
}: {
  readonly onSegmentPress: (filter: ProjectionChartFilter) => void;
  readonly overview: {
    readonly netBalanceMinor: number;
    readonly projectedBalanceMinor: number;
    readonly impactMinor: number;
    readonly pendingCount: number;
    readonly pendingIncomingMinor: number;
    readonly pendingOutgoingMinor: number;
    readonly totalOwedToMeMinor: number;
    readonly totalIOweMinor: number;
  };
}) {
  const rows: readonly {
    readonly filter: ProjectionChartFilter;
    readonly icon: keyof typeof Ionicons.glyphMap;
    readonly label: string;
    readonly valueMinor: number;
  }[] = [
    {
      filter: 'owed_to_me',
      icon: 'arrow-down-outline',
      label: 'Te deben hoy',
      valueMinor: overview.totalOwedToMeMinor,
    },
    {
      filter: 'i_owe',
      icon: 'arrow-up-outline',
      label: 'Debes hoy',
      valueMinor: overview.totalIOweMinor,
    },
    {
      filter: 'current_balance',
      icon: 'wallet-outline',
      label: 'Balance actual',
      valueMinor: overview.netBalanceMinor,
    },
    {
      filter: 'pending_incoming',
      icon: 'arrow-down-circle-outline',
      label: 'Te deberan',
      valueMinor: overview.pendingIncomingMinor,
    },
    {
      filter: 'pending_outgoing',
      icon: 'arrow-up-circle-outline',
      label: 'Deberas',
      valueMinor: overview.pendingOutgoingMinor,
    },
    {
      filter: 'projection',
      icon: 'flag-outline',
      label: 'Proyectado',
      valueMinor: overview.projectedBalanceMinor,
    },
  ];

  return (
    <SectionBlock title="Detalle de proyeccion">
      <SurfaceCard padding="md" style={styles.projectionSummary} variant="muted">
        <View style={styles.inlineMetric}>
          <AppText style={styles.inlineMetricValue}>{overview.pendingCount}</AppText>
          <AppText style={styles.inlineMetricLabel}>pendientes abiertos</AppText>
        </View>
        <View style={styles.inlineMetric}>
          <AppText style={styles.inlineMetricValue}>
            {formatCompactCop(overview.impactMinor)}
          </AppText>
          <AppText style={styles.inlineMetricLabel}>impacto estimado</AppText>
        </View>
      </SurfaceCard>
      <SurfaceCard padding="md">
        {rows.map((row) => (
          <RankingRow
            icon={row.icon}
            key={row.filter}
            label={row.label}
            meta="Abrir movimientos relacionados"
            onPress={() => onSegmentPress(row.filter)}
            tone={amountTone(row.valueMinor)}
            valueLabel={formatCop(row.valueMinor)}
          />
        ))}
      </SurfaceCard>
    </SectionBlock>
  );
}

export function PeopleDetail({
  currentPeriod,
  lens,
  onLensChange,
  onOpenPerson,
  onPeriodChange,
  period,
  sortedPeople,
}: {
  readonly currentPeriod: BalanceAnalyticsPeriodDto;
  readonly lens: BalanceAnalyticsLens;
  readonly onLensChange: (lens: BalanceAnalyticsLens) => void;
  readonly onOpenPerson: (person: BalanceAnalyticsPersonRowDto) => void;
  readonly onPeriodChange: (period: BalanceAnalyticsPeriod) => void;
  readonly period: BalanceAnalyticsPeriod;
  readonly sortedPeople: readonly BalanceAnalyticsPersonRowDto[];
}) {
  return (
    <SectionBlock title="Detalle por persona">
      <DetailFilters
        lens={lens}
        onLensChange={onLensChange}
        onPeriodChange={onPeriodChange}
        period={period}
      />
      <HappyWaterfallChart groups={currentPeriod.waterfallByPerson} />
      <SurfaceCard padding="md">
        {sortedPeople.length === 0 ? (
          <AppText style={styles.supportText}>
            Todavia no hay actividad visible en este periodo.
          </AppText>
        ) : (
          sortedPeople.map((row) => (
            <RankingRow
              description={
                row.topCategories.length > 0
                  ? row.topCategories
                      .map((category) => transactionCategoryLabel(category))
                      .join(', ')
                  : 'Sin categorias dominantes'
              }
              icon="person"
              key={row.key}
              label={row.label}
              meta={`${row.movementCount} movimiento${row.movementCount === 1 ? '' : 's'} - saldo actual ${formatCop(row.netMinor)}`}
              onPress={() => onOpenPerson(row)}
              tone={amountTone(personLensAmount(row, lens))}
              valueLabel={formatCop(personLensAmount(row, lens))}
            />
          ))
        )}
      </SurfaceCard>
    </SectionBlock>
  );
}

export function CategoriesDetail({
  currentPeriod,
  lens,
  onLensChange,
  onPeriodChange,
  period,
  sortedCategories,
}: {
  readonly currentPeriod: BalanceAnalyticsPeriodDto;
  readonly lens: BalanceAnalyticsLens;
  readonly onLensChange: (lens: BalanceAnalyticsLens) => void;
  readonly onPeriodChange: (period: BalanceAnalyticsPeriod) => void;
  readonly period: BalanceAnalyticsPeriod;
  readonly sortedCategories: readonly BalanceAnalyticsCategoryRowDto[];
}) {
  return (
    <SectionBlock title="Detalle por categoria">
      <DetailFilters
        lens={lens}
        onLensChange={onLensChange}
        onPeriodChange={onPeriodChange}
        period={period}
      />
      <HappyWaterfallChart groups={currentPeriod.waterfallByCategory} />
      <SurfaceCard padding="md">
        {sortedCategories.length === 0 ? (
          <AppText style={styles.supportText}>
            Todavia no hay categorias con impacto en este periodo.
          </AppText>
        ) : (
          sortedCategories.map((row) => (
            <RankingRow
              description={
                row.personLabels.length > 0
                  ? row.personLabels.join(', ')
                  : 'Sin personas visibles en este periodo'
              }
              icon="pricetag"
              key={row.key}
              label={row.label}
              meta={`${row.movementCount} movimiento${row.movementCount === 1 ? '' : 's'} - ${comparisonCopy(
                row.previousNetMinor === 0
                  ? null
                  : (row.netMinor - row.previousNetMinor) / Math.abs(row.previousNetMinor),
                currentPeriod.labels.previous,
              )}`}
              tone={amountTone(categoryLensAmount(row, lens))}
              valueLabel={formatCop(categoryLensAmount(row, lens))}
            />
          ))
        )}
      </SurfaceCard>
    </SectionBlock>
  );
}

export function HappyCirclesDetail({
  currentPeriod,
}: {
  readonly currentPeriod: BalanceAnalyticsPeriodDto;
}) {
  const settlementPreview = currentPeriod.settlements.activeProposal;

  return (
    <SectionBlock title="Detalle de Happy Circles">
      {settlementPreview ? (
        <HappyCircleCard proposal={settlementPreview} variant="compact" />
      ) : (
        <SurfaceCard padding="md" variant="muted">
          <AppText style={styles.supportText}>
            No hay un Happy Circle activo en este momento.
          </AppText>
        </SurfaceCard>
      )}
      <View style={styles.detailGrid}>
        <SurfaceCard padding="md" style={styles.detailGridCard}>
          <AppText style={styles.cardEyebrow}>Monto resuelto</AppText>
          <AppText style={styles.detailMetricAmount}>
            {formatCop(currentPeriod.settlements.resolvedMinor)}
          </AppText>
          <AppText style={styles.cardMeta}>
            {comparisonCopy(currentPeriod.settlements.changeRatio, currentPeriod.labels.previous)}
          </AppText>
        </SurfaceCard>
        <SurfaceCard padding="md" style={styles.detailGridCard}>
          <AppText style={styles.cardEyebrow}>Movimientos ahorrados</AppText>
          <AppText style={styles.detailMetricAmount}>
            {currentPeriod.settlements.savedMovementsCount}
          </AppText>
          <AppText style={styles.cardMeta}>
            {currentPeriod.settlements.movementCount} movimiento
            {currentPeriod.settlements.movementCount === 1 ? '' : 's'} ejecutado
            {currentPeriod.settlements.movementCount === 1 ? '' : 's'}
          </AppText>
        </SurfaceCard>
        <SurfaceCard padding="md" style={styles.detailGridCard}>
          <AppText style={styles.cardEyebrow}>Circulos participados</AppText>
          <AppText style={styles.detailMetricAmount}>
            {currentPeriod.settlements.participatedCount}
          </AppText>
          <AppText style={styles.cardMeta}>
            {currentPeriod.settlements.activeCount} activo
            {currentPeriod.settlements.activeCount === 1 ? '' : 's'} hoy
          </AppText>
        </SurfaceCard>
      </View>
    </SectionBlock>
  );
}

function PeopleFocusCard({
  periodContextLabel,
  people,
}: {
  readonly periodContextLabel: string;
  readonly people: readonly BalanceAnalyticsPersonRowDto[];
}) {
  const rows = people.map((row) => ({
    key: row.key,
    label: firstName(row.label),
    amountMinor: personImpactAmount(row),
    trendMinor: row.periodNetMinor - row.previousPeriodNetMinor,
    meta: personFocusMeta(row),
  }));

  return (
    <ImpactFocusCard
      emptyLabel="Todavia no hay actividad visible por persona."
      periodContextLabel={periodContextLabel}
      rows={rows}
      title="Personas"
    />
  );
}

function CategoriesFocusCard({
  categories,
  periodContextLabel,
}: {
  readonly categories: readonly BalanceAnalyticsCategoryRowDto[];
  readonly periodContextLabel: string;
}) {
  const rows = categories.map((row) => ({
    key: row.key,
    label: row.label,
    amountMinor: categoryImpactAmount(row),
    trendMinor: row.netMinor - row.previousNetMinor,
    meta: categoryFocusMeta(row),
  }));

  return (
    <ImpactFocusCard
      emptyLabel="Todavia no hay categorias con impacto en este periodo."
      periodContextLabel={periodContextLabel}
      rows={rows}
      title="Categorias"
    />
  );
}

function ImpactFocusCard({
  emptyLabel,
  periodContextLabel,
  rows,
  title,
}: {
  readonly emptyLabel: string;
  readonly periodContextLabel: string;
  readonly rows: readonly {
    readonly key: string;
    readonly label: string;
    readonly amountMinor: number;
    readonly meta: string;
    readonly trendMinor?: number;
  }[];
  readonly title: string;
}) {
  return (
    <SurfaceCard padding="lg" style={styles.focusCard}>
      <FocusCardTitle contextLabel={periodContextLabel}>{title}</FocusCardTitle>
      <ImpactBars emptyLabel={emptyLabel} rows={rows} />
    </SurfaceCard>
  );
}

function SettlementsFocusCard({
  activeCount,
  changeRatio,
  movementCount,
  periodContextLabel,
  resolvedMinor,
  savedMovementsCount,
}: {
  readonly activeCount: number;
  readonly changeRatio: number | null;
  readonly movementCount: number;
  readonly periodContextLabel: string;
  readonly resolvedMinor: number;
  readonly savedMovementsCount: number;
}) {
  return (
    <SurfaceCard padding="lg" style={styles.focusCard}>
      <FocusCardTitle contextLabel={periodContextLabel}>Happy Circles</FocusCardTitle>
      <AppText
        adjustsFontSizeToFit
        minimumFontScale={0.78}
        numberOfLines={1}
        style={styles.focusAmount}
      >
        {formatCop(resolvedMinor)}
      </AppText>
      <TrendChip changeRatio={changeRatio} contextLabel={periodContextLabel} />
      <View style={styles.compactMetricGrid}>
        <View style={styles.compactMetricTile}>
          <AppText style={styles.compactMetricValue}>{savedMovementsCount}</AppText>
          <AppText style={styles.compactMetricLabel}>movimientos ahorrados</AppText>
        </View>
        <View style={styles.compactMetricTile}>
          <AppText style={styles.compactMetricValue}>{activeCount}</AppText>
          <AppText style={styles.compactMetricLabel}>activos</AppText>
        </View>
        <View style={styles.compactMetricTile}>
          <AppText style={styles.compactMetricValue}>{movementCount}</AppText>
          <AppText style={styles.compactMetricLabel}>ejecutados</AppText>
        </View>
      </View>
    </SurfaceCard>
  );
}

type BalanceCarouselOverview = {
  readonly projection: {
    readonly impactMinor: number;
    readonly pendingCount: number;
    readonly pendingIncomingMinor: number;
    readonly pendingOutgoingMinor: number;
    readonly projectedNetBalanceMinor: number;
  };
  readonly summary: {
    readonly netBalanceMinor: number;
    readonly totalIOweMinor: number;
    readonly totalOwedToMeMinor: number;
  };
};

type BalanceCarouselAnalytics = {
  readonly defaultPeriod: BalanceAnalyticsPeriod;
  readonly periods: Record<BalanceAnalyticsPeriod, BalanceAnalyticsPeriodDto>;
};

export function BalanceLensCarousel({
  analytics,
  initialFocus = 'balance',
  lens = 'balance',
  onFocusPress,
  onProjectionSegmentPress,
  overview,
  period,
  swipeEnabled = true,
}: {
  readonly analytics: BalanceCarouselAnalytics;
  readonly initialFocus?: BalanceFocus;
  readonly lens?: BalanceAnalyticsLens;
  readonly onFocusPress?: (focus: BalanceFocus) => void;
  readonly onProjectionSegmentPress?: (filter: ProjectionChartFilter) => void;
  readonly overview: BalanceCarouselOverview;
  readonly period?: BalanceAnalyticsPeriod;
  readonly swipeEnabled?: boolean;
}) {
  const carouselRef = useRef<ScrollViewType | null>(null);
  const lastSyncedFocusRef = useRef<BalanceFocus>(initialFocus);
  const activeFocusRef = useRef<BalanceFocus>(initialFocus);
  const visualFocusRef = useRef<BalanceFocus>(initialFocus);
  const latestCarouselOffsetRef = useRef(0);
  const syncedCarouselWidthRef = useRef(0);
  const hasSyncedCarouselPositionRef = useRef(false);
  const carouselSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [carouselWidth, setCarouselWidth] = useState(0);
  const [activeFocus, setActiveFocus] = useState<BalanceFocus>(initialFocus);
  const [visualFocus, setVisualFocus] = useState<BalanceFocus>(initialFocus);
  const selectedPeriod = period ?? analytics.defaultPeriod ?? 'month';
  const currentPeriod = analytics.periods[selectedPeriod];
  const periodContextLabel = periodScopeLabel(selectedPeriod);
  const balanceSummary = currentPeriod.summaries.balance;
  const sortedPeople = [...currentPeriod.people].sort((left, right) => {
    const amountDiff =
      Math.abs(personLensAmount(right, lens)) - Math.abs(personLensAmount(left, lens));
    if (amountDiff !== 0) {
      return amountDiff;
    }

    if (right.movementCount !== left.movementCount) {
      return right.movementCount - left.movementCount;
    }

    return left.label.localeCompare(right.label, 'es-CO');
  });
  const sortedCategories = [...currentPeriod.categories].sort((left, right) => {
    const amountDiff =
      Math.abs(categoryLensAmount(right, lens)) - Math.abs(categoryLensAmount(left, lens));
    if (amountDiff !== 0) {
      return amountDiff;
    }

    if (right.movementCount !== left.movementCount) {
      return right.movementCount - left.movementCount;
    }

    return left.label.localeCompare(right.label, 'es-CO');
  });

  useEffect(() => {
    setActiveFocus(initialFocus);
    setVisualFocus(initialFocus);
    activeFocusRef.current = initialFocus;
    visualFocusRef.current = initialFocus;
  }, [initialFocus]);

  useEffect(() => {
    activeFocusRef.current = activeFocus;
  }, [activeFocus]);

  useEffect(
    () => () => {
      if (carouselSettleTimerRef.current) {
        clearTimeout(carouselSettleTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (carouselWidth <= 0) {
      return;
    }

    if (
      lastSyncedFocusRef.current === activeFocus &&
      syncedCarouselWidthRef.current === carouselWidth
    ) {
      return;
    }

    lastSyncedFocusRef.current = activeFocus;
    syncedCarouselWidthRef.current = carouselWidth;
    const nextX = focusIndex(activeFocus) * carouselWidth;
    latestCarouselOffsetRef.current = nextX;
    carouselRef.current?.scrollTo({
      animated: hasSyncedCarouselPositionRef.current,
      x: nextX,
      y: 0,
    });
    hasSyncedCarouselPositionRef.current = true;
  }, [activeFocus, carouselWidth]);

  function clearCarouselSettleTimer() {
    if (carouselSettleTimerRef.current) {
      clearTimeout(carouselSettleTimerRef.current);
      carouselSettleTimerRef.current = null;
    }
  }

  function updateVisualFocus(nextFocus: BalanceFocus) {
    if (nextFocus === visualFocusRef.current) {
      return;
    }

    visualFocusRef.current = nextFocus;
    setVisualFocus(nextFocus);
  }

  function settleCarousel(offsetX: number) {
    if (carouselWidth <= 0) {
      return;
    }

    const rawIndex = offsetX / carouselWidth;
    const nextIndex = Math.max(0, Math.min(FOCUS_OPTIONS.length - 1, Math.round(rawIndex)));
    const nextFocus = FOCUS_OPTIONS[nextIndex]?.value;
    if (!nextFocus) {
      return;
    }

    const nextX = nextIndex * carouselWidth;
    latestCarouselOffsetRef.current = nextX;
    lastSyncedFocusRef.current = nextFocus;
    syncedCarouselWidthRef.current = carouselWidth;
    updateVisualFocus(nextFocus);

    if (Math.abs(offsetX - nextX) > 1) {
      carouselRef.current?.scrollTo({ animated: true, x: nextX, y: 0 });
    }

    if (nextFocus !== activeFocusRef.current) {
      activeFocusRef.current = nextFocus;
      lastSyncedFocusRef.current = nextFocus;
      setActiveFocus(nextFocus);
    }
  }

  function handleCarouselScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const offsetX = event.nativeEvent.contentOffset.x;
    latestCarouselOffsetRef.current = offsetX;

    if (carouselWidth <= 0) {
      return;
    }

    const rawIndex = offsetX / carouselWidth;
    const nextIndex = Math.max(0, Math.min(FOCUS_OPTIONS.length - 1, Math.round(rawIndex)));
    const nextFocus = FOCUS_OPTIONS[nextIndex]?.value;

    if (nextFocus) {
      updateVisualFocus(nextFocus);
    }
  }

  function handleCarouselScrollEndDrag() {
    clearCarouselSettleTimer();
    carouselSettleTimerRef.current = setTimeout(() => {
      carouselSettleTimerRef.current = null;
      settleCarousel(latestCarouselOffsetRef.current);
    }, 140);
  }

  function handleCarouselMomentumScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    clearCarouselSettleTimer();
    settleCarousel(event.nativeEvent.contentOffset.x);
  }

  function renderPage(focus: BalanceFocus, content: ReactNode) {
    const pageContent = onFocusPress ? (
      <Pressable
        accessibilityRole="button"
        onPress={() => onFocusPress(focus)}
        style={({ pressed }) => [pressed ? styles.pressed : null]}
      >
        {content}
      </Pressable>
    ) : (
      content
    );

    return (
      <View key={focus} style={[styles.carouselPage, { width: carouselWidth }]}>
        {pageContent}
      </View>
    );
  }

  return (
    <>
      <View
        onLayout={(event) => setCarouselWidth(event.nativeEvent.layout.width)}
        style={styles.carouselViewport}
      >
        <ScrollView
          ref={carouselRef}
          alwaysBounceHorizontal={false}
          bounces={false}
          decelerationRate="fast"
          directionalLockEnabled
          disableIntervalMomentum
          horizontal
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          onMomentumScrollBegin={clearCarouselSettleTimer}
          onMomentumScrollEnd={handleCarouselMomentumScrollEnd}
          onScroll={handleCarouselScroll}
          onScrollBeginDrag={clearCarouselSettleTimer}
          onScrollEndDrag={handleCarouselScrollEndDrag}
          overScrollMode="never"
          pagingEnabled
          removeClippedSubviews={false}
          scrollEnabled={swipeEnabled}
          scrollEventThrottle={16}
          snapToAlignment="start"
          showsHorizontalScrollIndicator={false}
          snapToInterval={carouselWidth > 0 ? carouselWidth : undefined}
          style={styles.carousel}
        >
          {renderPage(
            'balance',
            <BalanceFocusCard
              netBalanceMinor={overview.summary.netBalanceMinor}
              periodChangeMinor={balanceSummary.deltaMinor}
              periodContextLabel={periodContextLabel}
              totalIOweMinor={overview.summary.totalIOweMinor}
              totalOwedToMeMinor={overview.summary.totalOwedToMeMinor}
            />,
          )}

          {renderPage(
            'projection',
            <ProjectionForecastCard
              currentBalanceMinor={overview.summary.netBalanceMinor}
              impactMinor={overview.projection.impactMinor}
              onSegmentPress={onFocusPress ? undefined : onProjectionSegmentPress}
              pendingCount={overview.projection.pendingCount}
              pendingIncomingMinor={overview.projection.pendingIncomingMinor}
              pendingOutgoingMinor={overview.projection.pendingOutgoingMinor}
              projectedBalanceMinor={overview.projection.projectedNetBalanceMinor}
              style={styles.focusCard}
              totalIOweMinor={overview.summary.totalIOweMinor}
              totalOwedToMeMinor={overview.summary.totalOwedToMeMinor}
            />,
          )}

          {renderPage(
            'people',
            <PeopleFocusCard people={sortedPeople} periodContextLabel={periodContextLabel} />,
          )}

          {renderPage(
            'categories',
            <CategoriesFocusCard
              categories={sortedCategories}
              periodContextLabel={periodContextLabel}
            />,
          )}

          {renderPage(
            'settlements',
            <SettlementsFocusCard
              activeCount={currentPeriod.settlements.activeCount}
              changeRatio={currentPeriod.settlements.changeRatio}
              movementCount={currentPeriod.settlements.movementCount}
              periodContextLabel={periodContextLabel}
              resolvedMinor={currentPeriod.settlements.resolvedMinor}
              savedMovementsCount={currentPeriod.settlements.savedMovementsCount}
            />,
          )}
        </ScrollView>
      </View>

      <CarouselDots
        activeFocus={visualFocus}
        onChange={(nextFocus) => {
          updateVisualFocus(nextFocus);
          setActiveFocus(nextFocus);
        }}
      />
    </>
  );
}
