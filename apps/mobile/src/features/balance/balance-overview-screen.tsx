import { useEffect, useRef, useState } from 'react';
import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type {
  DimensionValue,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView as ScrollViewType,
} from 'react-native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

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
import { ScreenShell } from '@/components/screen-shell';
import { SectionBlock } from '@/components/section-block';
import { SegmentedControl, type SegmentedOption } from '@/components/segmented-control';
import { SurfaceCard } from '@/components/surface-card';
import { formatCop } from '@/lib/data';
import { toneVisual } from '@/lib/direction-ui';
import { useAppSnapshot } from '@/lib/live-data';
import { pushRoute } from '@/lib/navigation';
import { theme } from '@/lib/theme';
import { transactionCategoryLabel } from '@/lib/transaction-categories';
import type { ProjectionChartFilter } from '@/lib/transaction-filters';
import { useSnapshotRefresh } from '@/lib/use-snapshot-refresh';

export type BalanceFocus = 'balance' | 'projection' | 'people' | 'categories' | 'settlements';

type FocusOption = {
  readonly label: string;
  readonly value: BalanceFocus;
  readonly icon: keyof typeof Ionicons.glyphMap;
};

const FOCUS_OPTIONS: readonly FocusOption[] = [
  { label: 'Balance', value: 'balance', icon: 'wallet-outline' },
  { label: 'Proyeccion', value: 'projection', icon: 'trending-up-outline' },
  { label: 'Personas', value: 'people', icon: 'people-outline' },
  { label: 'Categorias', value: 'categories', icon: 'pricetags-outline' },
  { label: 'Happy Circles', value: 'settlements', icon: 'happy-outline' },
];

const FOCUS_CARD_HEIGHT = 350;

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

function isBalanceFocus(value: string | null | undefined): value is BalanceFocus {
  return (
    value === 'balance' ||
    value === 'projection' ||
    value === 'people' ||
    value === 'categories' ||
    value === 'settlements'
  );
}

function balanceTone(amountMinor: number): 'positive' | 'negative' | 'neutral' {
  if (amountMinor > 0) {
    return 'positive';
  }

  if (amountMinor < 0) {
    return 'negative';
  }

  return 'neutral';
}

function amountTone(amountMinor: number): 'positive' | 'negative' | 'neutral' {
  if (amountMinor > 0) {
    return 'positive';
  }

  if (amountMinor < 0) {
    return 'negative';
  }

  return 'neutral';
}

function formatCompactCop(minor: number): string {
  const value = Math.abs(minor) / 100;
  if (value >= 1_000_000) {
    const formatted = (value / 1_000_000).toFixed(1).replace(/\.0$/, '');
    return minor < 0 ? `-$${formatted}M` : `$${formatted}M`;
  }

  if (value >= 10_000) {
    const formatted = (value / 1_000).toFixed(1).replace(/\.0$/, '');
    return minor < 0 ? `-$${formatted}K` : `$${formatted}K`;
  }

  return formatCop(minor);
}

function signedFormatCop(minor: number): string {
  if (minor > 0) {
    return `+${formatCop(minor)}`;
  }

  return formatCop(minor);
}

function signedFormatCompactCop(minor: number): string {
  if (minor > 0) {
    return `+${formatCompactCop(minor)}`;
  }

  return formatCompactCop(minor);
}

function formatHomeBalanceCop(minor: number): string {
  if (minor < 0) {
    return `- ${formatCop(Math.abs(minor))}`;
  }

  return formatCop(minor);
}

function periodScopeLabel(period: BalanceAnalyticsPeriod): string {
  if (period === 'week') {
    return 'esta semana';
  }

  if (period === 'month') {
    return 'este mes';
  }

  if (period === 'year') {
    return 'este ano';
  }

  return 'desde el inicio';
}

function comparisonCopy(changeRatio: number | null, previousLabel: string | null): string {
  if (changeRatio === null || !previousLabel) {
    return 'Sin comparacion disponible.';
  }

  const percentage = `${Math.round(Math.abs(changeRatio) * 100)}%`;
  const previous = previousLabel.toLocaleLowerCase('es-CO');
  if (changeRatio === 0) {
    return `Sin cambio frente a ${previous}.`;
  }

  return changeRatio > 0
    ? `Subio ${percentage} frente a ${previous}.`
    : `Bajo ${percentage} frente a ${previous}.`;
}

function transactionFilterHref(filter: ProjectionChartFilter): Href {
  return `/transactions?filter=${filter}` as Href;
}

function personImpactAmount(row: BalanceAnalyticsPersonRowDto): number {
  return row.periodNetMinor;
}

function categoryImpactAmount(row: BalanceAnalyticsCategoryRowDto): number {
  return row.netMinor;
}

function personLensAmount(row: BalanceAnalyticsPersonRowDto, lens: BalanceAnalyticsLens): number {
  if (lens === 'i_owe') {
    return row.periodIOweMinor;
  }

  if (lens === 'owed_to_me') {
    return row.periodOwedToMeMinor;
  }

  return row.periodNetMinor;
}

function categoryLensAmount(
  row: BalanceAnalyticsCategoryRowDto,
  lens: BalanceAnalyticsLens,
): number {
  if (lens === 'i_owe') {
    return row.iOweMinor;
  }

  if (lens === 'owed_to_me') {
    return row.owedToMeMinor;
  }

  return row.netMinor;
}

function focusIndex(focus: BalanceFocus): number {
  const index = FOCUS_OPTIONS.findIndex((option) => option.value === focus);
  return index >= 0 ? index : 0;
}

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

function FocusHeader({
  icon,
  label,
  meta,
}: {
  readonly icon: keyof typeof Ionicons.glyphMap;
  readonly label: string;
  readonly meta?: string;
}) {
  return (
    <View style={styles.cardHeader}>
      <View style={styles.cardCharacter}>
        <View style={styles.cardCharacterFace}>
          <Ionicons color={theme.colors.primary} name={icon} size={24} />
        </View>
      </View>
      <View style={styles.cardHeaderCopy}>
        <Text numberOfLines={1} style={styles.cardTitle}>
          {label}
        </Text>
        {meta ? (
          <Text numberOfLines={2} style={styles.cardSubtitle}>
            {meta}
          </Text>
        ) : null}
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
      <Text
        numberOfLines={1}
        style={[
          styles.trendChipValue,
          tone === 'positive' ? styles.positiveText : null,
          tone === 'negative' ? styles.negativeText : null,
        ]}
      >
        {hasComparison ? valueLabel : 'Sin data'}
      </Text>
      <Text numberOfLines={1} style={styles.trendChipContext}>
        {contextLabel}
      </Text>
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
      <Text numberOfLines={1} style={[styles.balanceMetricLabel, { color: visual.accentColor }]}>
        {visual.label}
      </Text>
      <Text
        adjustsFontSizeToFit
        minimumFontScale={0.82}
        numberOfLines={1}
        style={[styles.balanceMetricAmount, { color: visual.accentColor }]}
      >
        {formatCop(amountMinor)}
      </Text>
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
      <Text style={styles.emptyCardText}>{label}</Text>
    </View>
  );
}

function BalanceFocusCard({
  netBalanceMinor,
  periodContextLabel,
  periodChangeMinor,
  totalIOweMinor,
  totalOwedToMeMinor,
  updatedAtLabel,
}: {
  readonly netBalanceMinor: number;
  readonly periodContextLabel: string;
  readonly periodChangeMinor: number;
  readonly totalIOweMinor: number;
  readonly totalOwedToMeMinor: number;
  readonly updatedAtLabel: string;
}) {
  const tone = balanceTone(netBalanceMinor);
  const balanceVisual = toneVisual(tone);

  return (
    <SurfaceCard
      padding="lg"
      style={[styles.focusCard, styles.balanceFocusCard]}
      variant="elevated"
    >
      <FocusHeader icon="wallet-outline" label="Balance actual" meta={updatedAtLabel} />
      <View style={styles.balanceHomeBody}>
        <Text style={styles.homeBalanceLabel}>Tu balance</Text>
        <Text
          adjustsFontSizeToFit
          minimumFontScale={0.78}
          numberOfLines={1}
          style={[
            styles.homeBalanceAmount,
            balanceVisual ? { color: balanceVisual.accentColor } : null,
          ]}
        >
          {formatHomeBalanceCop(netBalanceMinor)}
        </Text>
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
  rows,
}: {
  readonly emptyLabel: string;
  readonly rows: readonly {
    readonly key: string;
    readonly label: string;
    readonly amountMinor: number;
    readonly meta: string;
    readonly trendMinor?: number;
  }[];
}) {
  const visibleRows = rows.slice(0, 2);
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
                <Text numberOfLines={1} style={styles.barLabel}>
                  {row.label}
                </Text>
                <View style={styles.barMetaLine}>
                  <Text numberOfLines={1} style={[styles.cardMeta, styles.barMetaText]}>
                    {row.meta}
                  </Text>
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
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.miniTrendText,
                          row.trendMinor > 0 ? styles.positiveText : null,
                          row.trendMinor < 0 ? styles.negativeText : null,
                        ]}
                      >
                        {signedFormatCompactCop(row.trendMinor)}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
              <Text
                numberOfLines={1}
                style={[
                  styles.barAmount,
                  tone === 'positive' ? styles.positiveText : null,
                  tone === 'negative' ? styles.negativeText : null,
                ]}
              >
                {formatCompactCop(row.amountMinor)}
              </Text>
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
        <Text numberOfLines={1} style={styles.detailRowTitle}>
          {label}
        </Text>
        {description ? (
          <Text numberOfLines={1} style={styles.detailRowDescription}>
            {description}
          </Text>
        ) : null}
        <Text numberOfLines={1} style={styles.cardMeta}>
          {meta}
        </Text>
      </View>
      <Text
        numberOfLines={1}
        style={[
          styles.detailRowAmount,
          tone === 'positive' ? styles.positiveText : null,
          tone === 'negative' ? styles.negativeText : null,
        ]}
      >
        {valueLabel}
      </Text>
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

function BalanceDetail({
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
        <Text style={styles.cardEyebrow}>{currentPeriod.labels.current}</Text>
        <Text style={styles.detailHeroAmount}>{formatCop(lensSummary.finalMinor)}</Text>
        <Text style={styles.focusCaption}>
          Inicio {formatCop(lensSummary.initialMinor)} - Cambio{' '}
          {signedFormatCop(lensSummary.deltaMinor)}
        </Text>
        <TrendChip changeRatio={lensSummary.changeRatio} contextLabel={periodScopeLabel(period)} />
        <Text style={styles.detailInsight}>
          {comparisonCopy(lensSummary.changeRatio, currentPeriod.labels.previous)}
        </Text>
      </SurfaceCard>
      <SurfaceCard padding="md" variant="muted">
        <Text style={styles.detailInsight}>{currentPeriod.insight}</Text>
      </SurfaceCard>
      <View style={styles.detailGrid}>
        {topPerson ? (
          <SurfaceCard padding="md" style={styles.detailGridCard}>
            <Text style={styles.cardEyebrow}>Persona clave</Text>
            <Text numberOfLines={1} style={styles.detailRowTitle}>
              {topPerson.label}
            </Text>
            <Text style={styles.cardMeta}>{formatCop(personLensAmount(topPerson, lens))}</Text>
          </SurfaceCard>
        ) : null}
        {topCategory ? (
          <SurfaceCard padding="md" style={styles.detailGridCard}>
            <Text style={styles.cardEyebrow}>Categoria clave</Text>
            <Text numberOfLines={1} style={styles.detailRowTitle}>
              {topCategory.label}
            </Text>
            <Text style={styles.cardMeta}>{formatCop(categoryLensAmount(topCategory, lens))}</Text>
          </SurfaceCard>
        ) : null}
      </View>
    </SectionBlock>
  );
}

function ProjectionDetail({
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
          <Text style={styles.inlineMetricValue}>{overview.pendingCount}</Text>
          <Text style={styles.inlineMetricLabel}>pendientes abiertos</Text>
        </View>
        <View style={styles.inlineMetric}>
          <Text style={styles.inlineMetricValue}>{formatCompactCop(overview.impactMinor)}</Text>
          <Text style={styles.inlineMetricLabel}>impacto estimado</Text>
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

function PeopleDetail({
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
          <Text style={styles.supportText}>Todavia no hay actividad visible en este periodo.</Text>
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

function CategoriesDetail({
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
          <Text style={styles.supportText}>
            Todavia no hay categorias con impacto en este periodo.
          </Text>
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

function HappyCirclesDetail({
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
          <Text style={styles.supportText}>No hay un Happy Circle activo en este momento.</Text>
        </SurfaceCard>
      )}
      <View style={styles.detailGrid}>
        <SurfaceCard padding="md" style={styles.detailGridCard}>
          <Text style={styles.cardEyebrow}>Monto resuelto</Text>
          <Text style={styles.detailMetricAmount}>
            {formatCop(currentPeriod.settlements.resolvedMinor)}
          </Text>
          <Text style={styles.cardMeta}>
            {comparisonCopy(currentPeriod.settlements.changeRatio, currentPeriod.labels.previous)}
          </Text>
        </SurfaceCard>
        <SurfaceCard padding="md" style={styles.detailGridCard}>
          <Text style={styles.cardEyebrow}>Movimientos ahorrados</Text>
          <Text style={styles.detailMetricAmount}>
            {currentPeriod.settlements.savedMovementsCount}
          </Text>
          <Text style={styles.cardMeta}>
            {currentPeriod.settlements.movementCount} movimiento
            {currentPeriod.settlements.movementCount === 1 ? '' : 's'} ejecutado
            {currentPeriod.settlements.movementCount === 1 ? '' : 's'}
          </Text>
        </SurfaceCard>
        <SurfaceCard padding="md" style={styles.detailGridCard}>
          <Text style={styles.cardEyebrow}>Circulos participados</Text>
          <Text style={styles.detailMetricAmount}>
            {currentPeriod.settlements.participatedCount}
          </Text>
          <Text style={styles.cardMeta}>
            {currentPeriod.settlements.activeCount} activo
            {currentPeriod.settlements.activeCount === 1 ? '' : 's'} hoy
          </Text>
        </SurfaceCard>
      </View>
    </SectionBlock>
  );
}

function PeopleFocusCard({
  periodContextLabel,
  periodLabel,
  people,
}: {
  readonly periodContextLabel: string;
  readonly periodLabel: string;
  readonly people: readonly BalanceAnalyticsPersonRowDto[];
}) {
  const topPerson = people[0] ?? null;

  return (
    <SurfaceCard padding="lg" style={styles.focusCard} variant="elevated">
      <FocusHeader icon="people-outline" label="Personas" meta={`Actividad de ${periodLabel}`} />
      <Text style={styles.focusTitle}>{topPerson ? topPerson.label : 'Sin actividad visible'}</Text>
      <Text style={styles.focusCaption}>
        {topPerson
          ? `Mayor impacto: ${signedFormatCop(personImpactAmount(topPerson))}`
          : 'Todavia no hay movimientos para comparar en este periodo.'}
      </Text>
      {topPerson ? (
        <TrendChip
          amountMinor={topPerson.periodNetMinor - topPerson.previousPeriodNetMinor}
          contextLabel={periodContextLabel}
        />
      ) : null}
      <ImpactBars
        emptyLabel="Todavia no hay actividad visible por persona."
        rows={people.map((row) => ({
          key: row.key,
          label: row.label,
          amountMinor: personImpactAmount(row),
          trendMinor: row.periodNetMinor - row.previousPeriodNetMinor,
          meta:
            row.topCategories.length > 0
              ? row.topCategories.map((category) => transactionCategoryLabel(category)).join(', ')
              : `${row.movementCount} movimiento${row.movementCount === 1 ? '' : 's'}`,
        }))}
      />
    </SurfaceCard>
  );
}

function CategoriesFocusCard({
  categories,
  periodContextLabel,
  periodLabel,
}: {
  readonly categories: readonly BalanceAnalyticsCategoryRowDto[];
  readonly periodContextLabel: string;
  readonly periodLabel: string;
}) {
  const topCategory = categories[0] ?? null;

  return (
    <SurfaceCard padding="lg" style={styles.focusCard} variant="elevated">
      <FocusHeader
        icon="pricetags-outline"
        label="Categorias"
        meta={`Actividad de ${periodLabel}`}
      />
      <Text style={styles.focusTitle}>
        {topCategory ? topCategory.label : 'Sin categorias visibles'}
      </Text>
      <Text style={styles.focusCaption}>
        {topCategory
          ? `Mayor impacto: ${signedFormatCop(categoryImpactAmount(topCategory))}`
          : 'Todavia no hay categorias con impacto en este periodo.'}
      </Text>
      {topCategory ? (
        <TrendChip
          amountMinor={topCategory.netMinor - topCategory.previousNetMinor}
          contextLabel={periodContextLabel}
        />
      ) : null}
      <ImpactBars
        emptyLabel="Todavia no hay categorias con impacto en este periodo."
        rows={categories.map((row) => ({
          key: row.key,
          label: row.label,
          amountMinor: categoryImpactAmount(row),
          trendMinor: row.netMinor - row.previousNetMinor,
          meta:
            row.personLabels.length > 0
              ? row.personLabels.join(', ')
              : `${row.movementCount} movimiento${row.movementCount === 1 ? '' : 's'}`,
        }))}
      />
    </SurfaceCard>
  );
}

function SettlementsFocusCard({
  activeCount,
  changeRatio,
  movementCount,
  periodContextLabel,
  periodLabel,
  resolvedMinor,
  savedMovementsCount,
}: {
  readonly activeCount: number;
  readonly changeRatio: number | null;
  readonly movementCount: number;
  readonly periodContextLabel: string;
  readonly periodLabel: string;
  readonly resolvedMinor: number;
  readonly savedMovementsCount: number;
}) {
  return (
    <SurfaceCard padding="lg" style={styles.focusCard} variant="elevated">
      <FocusHeader icon="happy-outline" label="Happy Circles" meta={`Cierres de ${periodLabel}`} />
      <Text
        adjustsFontSizeToFit
        minimumFontScale={0.78}
        numberOfLines={1}
        style={styles.focusAmount}
      >
        {formatCop(resolvedMinor)}
      </Text>
      <TrendChip changeRatio={changeRatio} contextLabel={periodContextLabel} />
      <View style={styles.compactMetricGrid}>
        <View style={styles.compactMetricTile}>
          <Text style={styles.compactMetricValue}>{savedMovementsCount}</Text>
          <Text style={styles.compactMetricLabel}>movimientos ahorrados</Text>
        </View>
        <View style={styles.compactMetricTile}>
          <Text style={styles.compactMetricValue}>{activeCount}</Text>
          <Text style={styles.compactMetricLabel}>activos</Text>
        </View>
        <View style={styles.compactMetricTile}>
          <Text style={styles.compactMetricValue}>{movementCount}</Text>
          <Text style={styles.compactMetricLabel}>ejecutados</Text>
        </View>
      </View>
    </SurfaceCard>
  );
}

export interface BalanceOverviewScreenProps {
  readonly initialFocus?: string | null;
}

export function BalanceOverviewScreen({ initialFocus }: BalanceOverviewScreenProps) {
  const router = useRouter();
  const carouselRef = useRef<ScrollViewType | null>(null);
  const snapshotQuery = useAppSnapshot();
  const refresh = useSnapshotRefresh(snapshotQuery);
  const overview = snapshotQuery.data?.balanceOverview ?? null;
  const analytics = snapshotQuery.data?.balanceAnalytics ?? null;
  const [carouselWidth, setCarouselWidth] = useState(0);
  const [period, setPeriod] = useState<BalanceAnalyticsPeriod>(analytics?.defaultPeriod ?? 'month');
  const [lens, setLens] = useState<BalanceAnalyticsLens>('balance');
  const [activeFocus, setActiveFocus] = useState<BalanceFocus>(
    isBalanceFocus(initialFocus) ? initialFocus : 'balance',
  );

  useEffect(() => {
    if (analytics?.defaultPeriod) {
      setPeriod(analytics.defaultPeriod);
    }
  }, [analytics?.defaultPeriod]);

  useEffect(() => {
    if (isBalanceFocus(initialFocus)) {
      setActiveFocus(initialFocus);
    }
  }, [initialFocus]);

  useEffect(() => {
    if (carouselWidth <= 0) {
      return;
    }

    carouselRef.current?.scrollTo({
      animated: true,
      x: focusIndex(activeFocus) * carouselWidth,
      y: 0,
    });
  }, [activeFocus, carouselWidth]);

  if (snapshotQuery.error && (!overview || !analytics)) {
    return (
      <ScreenShell
        headerVariant="plain"
        refresh={refresh}
        subtitle="No pudimos cargar el resumen financiero."
        title="Balance"
      >
        <Text style={styles.supportText}>{snapshotQuery.error.message}</Text>
      </ScreenShell>
    );
  }

  if (snapshotQuery.isLoading || !overview || !analytics) {
    return (
      <ScreenShell
        headerVariant="plain"
        refresh={refresh}
        subtitle="Estamos preparando el resumen de tu balance."
        title="Balance"
      >
        <SurfaceCard padding="lg" variant="elevated">
          <Text style={styles.loadingText}>Cargando tu balance...</Text>
        </SurfaceCard>
      </ScreenShell>
    );
  }

  const currentPeriod = analytics.periods[period];
  const periodContextLabel = periodScopeLabel(period);
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
  const handleCarouselMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (carouselWidth <= 0) {
      return;
    }

    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / carouselWidth);
    const nextFocus = FOCUS_OPTIONS[nextIndex]?.value;
    if (nextFocus && nextFocus !== activeFocus) {
      setActiveFocus(nextFocus);
    }
  };

  return (
    <ScreenShell headerVariant="plain" refresh={refresh} title="Balance">
      <View
        onLayout={(event) => setCarouselWidth(event.nativeEvent.layout.width)}
        style={styles.carouselViewport}
      >
        <ScrollView
          ref={carouselRef}
          decelerationRate="fast"
          horizontal
          onMomentumScrollEnd={handleCarouselMomentumEnd}
          pagingEnabled
          scrollEventThrottle={16}
          snapToAlignment="start"
          showsHorizontalScrollIndicator={false}
          snapToInterval={carouselWidth > 0 ? carouselWidth : undefined}
          style={styles.carousel}
        >
          <View style={[styles.carouselPage, { width: carouselWidth }]}>
            <BalanceFocusCard
              netBalanceMinor={overview.summary.netBalanceMinor}
              periodContextLabel={periodContextLabel}
              periodChangeMinor={balanceSummary.deltaMinor}
              totalIOweMinor={overview.summary.totalIOweMinor}
              totalOwedToMeMinor={overview.summary.totalOwedToMeMinor}
              updatedAtLabel={overview.updatedAtLabel}
            />
          </View>

          <View style={[styles.carouselPage, { width: carouselWidth }]}>
            <ProjectionForecastCard
              currentBalanceMinor={overview.summary.netBalanceMinor}
              impactMinor={overview.projection.impactMinor}
              onSegmentPress={(filter) => pushRoute(router, transactionFilterHref(filter))}
              pendingCount={overview.projection.pendingCount}
              pendingIncomingMinor={overview.projection.pendingIncomingMinor}
              pendingOutgoingMinor={overview.projection.pendingOutgoingMinor}
              projectedBalanceMinor={overview.projection.projectedNetBalanceMinor}
              style={styles.focusCard}
              totalIOweMinor={overview.summary.totalIOweMinor}
              totalOwedToMeMinor={overview.summary.totalOwedToMeMinor}
            />
          </View>

          <View style={[styles.carouselPage, { width: carouselWidth }]}>
            <PeopleFocusCard
              people={sortedPeople}
              periodContextLabel={periodContextLabel}
              periodLabel={currentPeriod.labels.current}
            />
          </View>

          <View style={[styles.carouselPage, { width: carouselWidth }]}>
            <CategoriesFocusCard
              categories={sortedCategories}
              periodContextLabel={periodContextLabel}
              periodLabel={currentPeriod.labels.current}
            />
          </View>

          <View style={[styles.carouselPage, { width: carouselWidth }]}>
            <SettlementsFocusCard
              activeCount={currentPeriod.settlements.activeCount}
              changeRatio={currentPeriod.settlements.changeRatio}
              movementCount={currentPeriod.settlements.movementCount}
              periodContextLabel={periodContextLabel}
              periodLabel={currentPeriod.labels.current}
              resolvedMinor={currentPeriod.settlements.resolvedMinor}
              savedMovementsCount={currentPeriod.settlements.savedMovementsCount}
            />
          </View>
        </ScrollView>
      </View>

      <CarouselDots activeFocus={activeFocus} onChange={setActiveFocus} />

      {activeFocus === 'balance' ? (
        <BalanceDetail
          currentPeriod={currentPeriod}
          lens={lens}
          onLensChange={setLens}
          onPeriodChange={setPeriod}
          period={period}
          sortedCategories={sortedCategories}
          sortedPeople={sortedPeople}
        />
      ) : null}

      {activeFocus === 'projection' ? (
        <ProjectionDetail
          onSegmentPress={(filter) => pushRoute(router, transactionFilterHref(filter))}
          overview={{
            netBalanceMinor: overview.summary.netBalanceMinor,
            projectedBalanceMinor: overview.projection.projectedNetBalanceMinor,
            impactMinor: overview.projection.impactMinor,
            pendingCount: overview.projection.pendingCount,
            pendingIncomingMinor: overview.projection.pendingIncomingMinor,
            pendingOutgoingMinor: overview.projection.pendingOutgoingMinor,
            totalOwedToMeMinor: overview.summary.totalOwedToMeMinor,
            totalIOweMinor: overview.summary.totalIOweMinor,
          }}
        />
      ) : null}

      {activeFocus === 'people' ? (
        <PeopleDetail
          currentPeriod={currentPeriod}
          lens={lens}
          onLensChange={setLens}
          onOpenPerson={(person) => pushRoute(router, `/person/${person.userId}` as Href)}
          onPeriodChange={setPeriod}
          period={period}
          sortedPeople={sortedPeople}
        />
      ) : null}

      {activeFocus === 'categories' ? (
        <CategoriesDetail
          currentPeriod={currentPeriod}
          lens={lens}
          onLensChange={setLens}
          onPeriodChange={setPeriod}
          period={period}
          sortedCategories={sortedCategories}
        />
      ) : null}

      {activeFocus === 'settlements' ? <HappyCirclesDetail currentPeriod={currentPeriod} /> : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  supportText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.body,
    lineHeight: 22,
  },
  loadingText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.body,
    lineHeight: 22,
    textAlign: 'center',
  },
  detailFilters: {
    gap: theme.spacing.sm,
  },
  detailCard: {
    gap: theme.spacing.sm,
  },
  detailHeroAmount: {
    color: theme.colors.text,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.8,
    lineHeight: 40,
  },
  detailInsight: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '700',
    lineHeight: 22,
  },
  detailGrid: {
    gap: theme.spacing.sm,
  },
  detailGridCard: {
    gap: theme.spacing.xs,
  },
  detailMetricAmount: {
    color: theme.colors.text,
    fontSize: theme.typography.title2,
    fontWeight: '800',
    lineHeight: 28,
  },
  projectionSummary: {
    gap: theme.spacing.sm,
  },
  rankingRow: {
    alignItems: 'center',
    borderBottomColor: theme.colors.hairline,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
  },
  rankingIcon: {
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radius.large,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  rankingCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  detailRowTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '800',
    lineHeight: 20,
  },
  detailRowDescription: {
    color: theme.colors.text,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
  },
  detailRowAmount: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '800',
    lineHeight: 20,
    maxWidth: 118,
    textAlign: 'right',
  },
  carouselDots: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
    justifyContent: 'center',
    marginTop: -theme.spacing.xs,
  },
  carouselDotHitArea: {
    alignItems: 'center',
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  carouselDot: {
    backgroundColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    height: 7,
    width: 7,
  },
  carouselDotSelected: {
    backgroundColor: theme.colors.primary,
    width: 18,
  },
  carouselViewport: {
    overflow: 'hidden',
  },
  carousel: {
    marginHorizontal: -theme.spacing.xs,
  },
  carouselPage: {
    paddingHorizontal: theme.spacing.xs,
  },
  focusCard: {
    gap: theme.spacing.sm,
    height: FOCUS_CARD_HEIGHT,
  },
  balanceFocusCard: {
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
    paddingTop: theme.spacing.xl,
  },
  balanceHomeBody: {
    alignItems: 'center',
    flex: 1,
    gap: theme.spacing.sm,
    justifyContent: 'center',
    width: '100%',
  },
  homeBalanceLabel: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '800',
    lineHeight: 20,
    textAlign: 'center',
  },
  homeBalanceAmount: {
    color: theme.colors.text,
    fontSize: 44,
    fontWeight: '800',
    lineHeight: 52,
    marginTop: theme.spacing.xs,
    textAlign: 'center',
  },
  homeBalanceMetricsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xl,
    justifyContent: 'center',
    marginTop: theme.spacing.xs,
    width: '100%',
  },
  balanceMetricItem: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'center',
    maxWidth: 190,
    minWidth: 0,
  },
  balanceMetricLabel: {
    fontSize: theme.typography.footnote,
    fontWeight: '800',
    lineHeight: 17,
  },
  balanceMetricAmount: {
    flexShrink: 1,
    fontSize: theme.typography.callout,
    fontWeight: '800',
    lineHeight: 19,
  },
  cardHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    minWidth: 0,
  },
  cardCharacter: {
    alignItems: 'center',
    backgroundColor: theme.colors.primarySoft,
    borderRadius: theme.radius.large,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  cardCharacterFace: {
    alignItems: 'center',
    backgroundColor: theme.colors.white,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  cardHeaderCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  cardTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.title3,
    fontWeight: '800',
    lineHeight: 23,
  },
  cardSubtitle: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
  },
  cardEyebrow: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  cardMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    lineHeight: 17,
  },
  heroAmount: {
    color: theme.colors.text,
    fontSize: 38,
    fontWeight: '800',
    letterSpacing: -1,
    lineHeight: 44,
  },
  focusAmount: {
    color: theme.colors.text,
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.8,
    lineHeight: 38,
  },
  focusTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.title2,
    fontWeight: '800',
    letterSpacing: -0.3,
    lineHeight: 28,
  },
  focusCaption: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
  },
  trendChip: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'transparent',
    borderColor: theme.colors.hairline,
    borderWidth: 1,
    borderRadius: theme.radius.medium,
    flexDirection: 'row',
    gap: theme.spacing.xs,
    maxWidth: '100%',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  trendChipCentered: {
    alignSelf: 'center',
  },
  trendChipPositive: {
    borderColor: theme.colors.success,
  },
  trendChipNegative: {
    borderColor: theme.colors.warning,
  },
  trendChipValue: {
    color: theme.colors.text,
    flexShrink: 1,
    fontSize: theme.typography.footnote,
    fontWeight: '800',
    lineHeight: 17,
  },
  trendChipContext: {
    color: theme.colors.textMuted,
    flexShrink: 1,
    fontSize: theme.typography.caption,
    fontWeight: '700',
    lineHeight: 15,
  },
  emptyCardState: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderColor: theme.colors.hairline,
    borderWidth: 1,
    borderRadius: theme.radius.medium,
    flexDirection: 'row',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  emptyCardText: {
    color: theme.colors.textMuted,
    flex: 1,
    fontSize: theme.typography.footnote,
    fontWeight: '700',
    lineHeight: 18,
  },
  barList: {
    gap: theme.spacing.sm,
  },
  barRow: {
    gap: theme.spacing.xs,
  },
  barRowHeader: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  barCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  barMetaLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
    minWidth: 0,
  },
  barMetaText: {
    flex: 1,
    minWidth: 0,
  },
  barLabel: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '800',
    lineHeight: 20,
  },
  barAmount: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '800',
    lineHeight: 20,
    maxWidth: 112,
    textAlign: 'right',
  },
  barTrack: {
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radius.pill,
    height: 8,
    overflow: 'hidden',
  },
  barFill: {
    borderRadius: theme.radius.pill,
    height: '100%',
  },
  barFillPositive: {
    backgroundColor: theme.colors.success,
  },
  barFillNegative: {
    backgroundColor: theme.colors.warning,
  },
  barFillNeutral: {
    backgroundColor: theme.colors.primary,
  },
  miniTrend: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderColor: theme.colors.hairline,
    borderWidth: 1,
    borderRadius: theme.radius.pill,
    flexDirection: 'row',
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  miniTrendPositive: {
    borderColor: theme.colors.success,
  },
  miniTrendNegative: {
    borderColor: theme.colors.warning,
  },
  miniTrendText: {
    color: theme.colors.textMuted,
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 12,
  },
  compactMetricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  compactMetricTile: {
    alignItems: 'flex-start',
    backgroundColor: 'transparent',
    borderColor: theme.colors.hairline,
    borderWidth: 1,
    borderRadius: theme.radius.medium,
    flexBasis: '30%',
    flexGrow: 1,
    gap: 2,
    minWidth: 92,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  compactMetricValue: {
    color: theme.colors.text,
    fontSize: theme.typography.title3,
    fontWeight: '800',
    lineHeight: 23,
  },
  compactMetricLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    fontWeight: '700',
    lineHeight: 15,
  },
  inlineMetric: {
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radius.medium,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  inlineMetricValue: {
    color: theme.colors.text,
    fontSize: theme.typography.title3,
    fontWeight: '800',
    minWidth: 52,
  },
  inlineMetricLabel: {
    color: theme.colors.textMuted,
    flex: 1,
    fontSize: theme.typography.footnote,
    fontWeight: '700',
    lineHeight: 18,
    textAlign: 'right',
  },
  positiveText: {
    color: theme.colors.success,
  },
  negativeText: {
    color: theme.colors.warning,
  },
  pressed: {
    opacity: 0.9,
  },
});
