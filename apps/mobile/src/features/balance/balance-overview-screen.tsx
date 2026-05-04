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
import { StatusChip } from '@/components/status-chip';
import { SurfaceCard } from '@/components/surface-card';
import { formatCop } from '@/lib/data';
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

const FOCUS_CARD_MIN_HEIGHT = 430;

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
      <View style={styles.cardIconBox}>
        <Ionicons color={theme.colors.primary} name={icon} size={20} />
      </View>
      <View style={styles.cardHeaderCopy}>
        <Text style={styles.cardEyebrow}>{label}</Text>
        {meta ? <Text style={styles.cardMeta}>{meta}</Text> : null}
      </View>
    </View>
  );
}

function BalanceFocusCard({
  netBalanceMinor,
  periodChangeMinor,
  totalIOweMinor,
  totalOwedToMeMinor,
  updatedAtLabel,
}: {
  readonly netBalanceMinor: number;
  readonly periodChangeMinor: number;
  readonly totalIOweMinor: number;
  readonly totalOwedToMeMinor: number;
  readonly updatedAtLabel: string;
}) {
  const tone = balanceTone(netBalanceMinor);

  return (
    <SurfaceCard padding="lg" style={styles.focusCard} variant="elevated">
      <View style={styles.balanceHeader}>
        <FocusHeader icon="wallet-outline" label="Balance actual" meta={updatedAtLabel} />
        <StatusChip
          label={tone === 'negative' ? 'Por pagar' : tone === 'positive' ? 'A favor' : 'Al dia'}
          tone={tone === 'negative' ? 'warning' : tone === 'positive' ? 'success' : 'primary'}
        />
      </View>
      <Text
        adjustsFontSizeToFit
        minimumFontScale={0.72}
        numberOfLines={1}
        style={[
          styles.heroAmount,
          tone === 'positive' ? styles.positiveText : null,
          tone === 'negative' ? styles.negativeText : null,
        ]}
      >
        {formatCop(netBalanceMinor)}
      </Text>
      <Text style={styles.focusCaption}>
        Cambio del periodo: {signedFormatCop(periodChangeMinor)}
      </Text>
      <View style={styles.balanceSplit}>
        <Text style={styles.balanceSplitText}>Te deben {formatCompactCop(totalOwedToMeMinor)}</Text>
        <View style={styles.balanceDivider} />
        <Text style={styles.balanceSplitText}>Debes {formatCompactCop(totalIOweMinor)}</Text>
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
  }[];
}) {
  const visibleRows = rows.slice(0, 3);
  const maxAmount = Math.max(...visibleRows.map((row) => Math.abs(row.amountMinor)), 1);

  if (visibleRows.length === 0) {
    return <Text style={styles.supportText}>{emptyLabel}</Text>;
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
                <Text numberOfLines={1} style={styles.cardMeta}>
                  {row.meta}
                </Text>
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
  periodLabel,
  people,
}: {
  readonly periodLabel: string;
  readonly people: readonly BalanceAnalyticsPersonRowDto[];
}) {
  const topPerson = people[0] ?? null;

  return (
    <SurfaceCard padding="lg" style={styles.focusCard} variant="elevated">
      <FocusHeader icon="people-outline" label="Personas" meta={periodLabel} />
      <Text style={styles.focusTitle}>{topPerson ? topPerson.label : 'Sin actividad visible'}</Text>
      <Text style={styles.focusCaption}>
        {topPerson
          ? `Mayor impacto: ${signedFormatCop(personImpactAmount(topPerson))}`
          : 'Todavia no hay movimientos para comparar en este periodo.'}
      </Text>
      <ImpactBars
        emptyLabel="Todavia no hay actividad visible por persona."
        rows={people.map((row) => ({
          key: row.key,
          label: row.label,
          amountMinor: personImpactAmount(row),
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
  periodLabel,
}: {
  readonly categories: readonly BalanceAnalyticsCategoryRowDto[];
  readonly periodLabel: string;
}) {
  const topCategory = categories[0] ?? null;

  return (
    <SurfaceCard padding="lg" style={styles.focusCard} variant="elevated">
      <FocusHeader icon="pricetags-outline" label="Categorias" meta={periodLabel} />
      <Text style={styles.focusTitle}>
        {topCategory ? topCategory.label : 'Sin categorias visibles'}
      </Text>
      <Text style={styles.focusCaption}>
        {topCategory
          ? `Mayor impacto: ${signedFormatCop(categoryImpactAmount(topCategory))}`
          : 'Todavia no hay categorias con impacto en este periodo.'}
      </Text>
      <ImpactBars
        emptyLabel="Todavia no hay categorias con impacto en este periodo."
        rows={categories.map((row) => ({
          key: row.key,
          label: row.label,
          amountMinor: categoryImpactAmount(row),
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
  activeProposal,
  changeRatio,
  movementCount,
  periodLabel,
  previousLabel,
  resolvedMinor,
  savedMovementsCount,
}: {
  readonly activeCount: number;
  readonly activeProposal: {
    readonly title: string;
    readonly subtitle: string;
    readonly totalAmountMinor: number;
    readonly approvalsPending: number;
  } | null;
  readonly changeRatio: number | null;
  readonly movementCount: number;
  readonly periodLabel: string;
  readonly previousLabel: string | null;
  readonly resolvedMinor: number;
  readonly savedMovementsCount: number;
}) {
  return (
    <SurfaceCard padding="lg" style={styles.focusCard} variant="elevated">
      <FocusHeader icon="happy-outline" label="Happy Circles" meta={periodLabel} />
      <Text
        adjustsFontSizeToFit
        minimumFontScale={0.78}
        numberOfLines={1}
        style={styles.focusAmount}
      >
        {formatCop(resolvedMinor)}
      </Text>
      <Text style={styles.focusCaption}>{comparisonCopy(changeRatio, previousLabel)}</Text>
      <View style={styles.settlementSummary}>
        <View style={styles.inlineMetric}>
          <Text style={styles.inlineMetricValue}>{savedMovementsCount}</Text>
          <Text style={styles.inlineMetricLabel}>movimientos ahorrados</Text>
        </View>
        <View style={styles.inlineMetric}>
          <Text style={styles.inlineMetricValue}>{activeCount}</Text>
          <Text style={styles.inlineMetricLabel}>Happy Circles activos</Text>
        </View>
        <View style={styles.inlineMetric}>
          <Text style={styles.inlineMetricValue}>{movementCount}</Text>
          <Text style={styles.inlineMetricLabel}>movimientos ejecutados</Text>
        </View>
      </View>
      {activeProposal ? (
        <View style={styles.activeSettlement}>
          <Text style={styles.cardEyebrow}>Happy Circle activo</Text>
          <Text numberOfLines={1} style={styles.barLabel}>
            {activeProposal.title}
          </Text>
          <Text style={styles.cardMeta}>{activeProposal.subtitle}</Text>
          <Text style={styles.cardMeta}>
            {formatCop(activeProposal.totalAmountMinor)} - {activeProposal.approvalsPending}{' '}
            aprobacion
            {activeProposal.approvalsPending === 1 ? '' : 'es'} pendiente
            {activeProposal.approvalsPending === 1 ? '' : 's'}
          </Text>
        </View>
      ) : null}
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
            <PeopleFocusCard people={sortedPeople} periodLabel={currentPeriod.labels.current} />
          </View>

          <View style={[styles.carouselPage, { width: carouselWidth }]}>
            <CategoriesFocusCard
              categories={sortedCategories}
              periodLabel={currentPeriod.labels.current}
            />
          </View>

          <View style={[styles.carouselPage, { width: carouselWidth }]}>
            <SettlementsFocusCard
              activeCount={currentPeriod.settlements.activeCount}
              activeProposal={currentPeriod.settlements.activeProposal}
              changeRatio={currentPeriod.settlements.changeRatio}
              movementCount={currentPeriod.settlements.movementCount}
              periodLabel={currentPeriod.labels.current}
              previousLabel={currentPeriod.labels.previous}
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
    gap: theme.spacing.md,
    minHeight: FOCUS_CARD_MIN_HEIGHT,
  },
  balanceHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  cardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    flex: 1,
    gap: theme.spacing.sm,
    minWidth: 0,
  },
  cardIconBox: {
    alignItems: 'center',
    backgroundColor: theme.colors.primarySoft,
    borderRadius: theme.radius.medium,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  cardHeaderCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
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
    fontSize: 42,
    fontWeight: '800',
    letterSpacing: -1,
    lineHeight: 48,
  },
  focusAmount: {
    color: theme.colors.text,
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: -0.8,
    lineHeight: 42,
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
    fontSize: theme.typography.callout,
    lineHeight: 22,
  },
  balanceSplit: {
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radius.medium,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  balanceSplitText: {
    color: theme.colors.text,
    flex: 1,
    fontSize: theme.typography.footnote,
    fontWeight: '800',
    lineHeight: 18,
    textAlign: 'center',
  },
  balanceDivider: {
    backgroundColor: theme.colors.border,
    height: 24,
    width: 1,
  },
  barList: {
    gap: theme.spacing.md,
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
  settlementSummary: {
    gap: theme.spacing.sm,
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
  activeSettlement: {
    backgroundColor: theme.colors.surfaceSoft,
    borderRadius: theme.radius.medium,
    gap: 4,
    padding: theme.spacing.md,
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
