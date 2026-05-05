import { Fragment } from 'react';
import { Ionicons } from '@expo/vector-icons';
import type { StyleProp, ViewStyle } from 'react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';

import { SurfaceCard } from '@/components/surface-card';
import { formatCop } from '@/lib/data';
import { theme } from '@/lib/theme';
import type { ProjectionChartFilter } from '@/lib/transaction-filters';

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

function formatSignedCompactCop(minor: number): string {
  if (minor > 0) {
    return `+${formatCompactCop(minor)}`;
  }

  return formatCompactCop(minor);
}

export interface ProjectionForecastCardProps {
  readonly currentBalanceMinor: number;
  readonly impactMinor: number;
  readonly onSegmentPress?: (filter: ProjectionChartFilter) => void;
  readonly pendingCount: number;
  readonly pendingIncomingMinor: number;
  readonly pendingOutgoingMinor: number;
  readonly projectedBalanceMinor: number;
  readonly style?: StyleProp<ViewStyle>;
  readonly totalIOweMinor: number;
  readonly totalOwedToMeMinor: number;
}

type BarDef = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  filter: ProjectionChartFilter;
  color: string;
  valTop: number;
  valBottom: number;
  isTotal: boolean;
  isForecast: boolean;
  isPlaceholder?: boolean;
  borderColor?: string;
};

// ── Constants ────────────────────────────────────────────────────
const CHART_H = 120;
const BAR_W = 34;
const GAP = 26;
const DIVIDER_GAP = 34;
const FORECAST_START = 3; // index where forecast section begins
const DASH_PATTERN = '4,4';
const DASH_STROKE_WIDTH = 1.25;

export function ProjectionForecastCard({
  currentBalanceMinor,
  impactMinor,
  onSegmentPress,
  pendingCount,
  pendingIncomingMinor,
  pendingOutgoingMinor,
  projectedBalanceMinor,
  style,
  totalIOweMinor,
  totalOwedToMeMinor,
}: ProjectionForecastCardProps) {
  const hasImpact = pendingCount > 0;
  const impactTone = impactMinor > 0 ? 'positive' : impactMinor < 0 ? 'negative' : 'neutral';
  const pendingLabel = `${pendingCount} pendiente${pendingCount === 1 ? '' : 's'}`;

  // ── Build bars ─────────────────────────────────────────────────
  const bars: BarDef[] = [
    {
      label: 'Te deben',
      icon: 'arrow-down-outline',
      filter: 'owed_to_me',
      color: theme.colors.success,
      valTop: totalOwedToMeMinor,
      valBottom: 0,
      isTotal: false,
      isForecast: false,
    },
    {
      label: 'Debes',
      icon: 'arrow-up-outline',
      filter: 'i_owe',
      color: theme.colors.danger,
      valTop: totalOwedToMeMinor,
      valBottom: currentBalanceMinor,
      isTotal: false,
      isForecast: false,
    },
    {
      label: 'Balance',
      icon: 'wallet-outline',
      filter: 'current_balance',
      color: theme.colors.primary,
      valTop: Math.max(currentBalanceMinor, 0),
      valBottom: Math.min(currentBalanceMinor, 0),
      isTotal: true,
      isForecast: false,
    },
  ];

  // Forecast slots stay fixed so the projection area keeps its shape even without pending items.
  const incomingForecastStart = currentBalanceMinor;
  const incomingForecastEnd = incomingForecastStart + pendingIncomingMinor;
  bars.push({
    label: 'Te deberán',
    icon: 'arrow-down-outline',
    filter: 'pending_incoming',
    color: theme.colors.success,
    valTop: incomingForecastEnd,
    valBottom: incomingForecastStart,
    isTotal: false,
    isForecast: true,
    isPlaceholder: pendingIncomingMinor <= 0,
  });

  const outgoingForecastStart = incomingForecastEnd;
  const outgoingForecastEnd = outgoingForecastStart - pendingOutgoingMinor;
  bars.push({
    label: 'Deberás',
    icon: 'arrow-up-outline',
    filter: 'pending_outgoing',
    color: theme.colors.danger,
    valTop: outgoingForecastStart,
    valBottom: outgoingForecastEnd,
    isTotal: false,
    isForecast: true,
    isPlaceholder: pendingOutgoingMinor <= 0,
  });

  bars.push({
    label: 'Proyectado',
    icon: 'flag-outline',
    filter: 'projection',
    color: theme.colors.primary,
    valTop: Math.max(projectedBalanceMinor, 0),
    valBottom: Math.min(projectedBalanceMinor, 0),
    isTotal: true,
    isForecast: true,
  });

  // ── Value → pixel mapping ──────────────────────────────────────
  const allVals = bars.flatMap((b) => [b.valTop, b.valBottom]);
  const maxV = Math.max(...allVals, 0);
  const minV = Math.min(...allVals, 0);
  const range = maxV - minV || 1;

  function yPx(v: number): number {
    return CHART_H * (1 - (v - minV) / range);
  }

  const zeroY = yPx(0);

  // ── X positions ────────────────────────────────────────────────
  const xPositions: number[] = [];
  let cx = 0;
  for (let i = 0; i < bars.length; i++) {
    if (i === FORECAST_START) cx += DIVIDER_GAP;
    else if (i > 0) cx += GAP;
    xPositions.push(cx);
    cx += BAR_W;
  }
  const svgW = cx;

  // ── Connectors ─────────────────────────────────────────────────
  type Connector = { x1: number; x2: number; y: number };
  const connectors: Connector[] = [];

  // 1. Te deben → Debes
  connectors.push({
    x1: xPositions[0] + BAR_W,
    x2: xPositions[1],
    y: yPx(totalOwedToMeMinor),
  });

  // 2. Debes → Balance
  connectors.push({
    x1: xPositions[1] + BAR_W,
    x2: xPositions[2],
    y: yPx(currentBalanceMinor),
  });

  // 3. Balance → First Forecast
  if (bars.length > 3) {
    connectors.push({
      x1: xPositions[2] + BAR_W,
      x2: xPositions[3],
      y: yPx(currentBalanceMinor),
    });
  }

  // 4. Te deberán → Deberás (if both exist)
  const idxTeDeberan = bars.findIndex((b) => b.label === 'Te deberán');
  const idxDeberas = bars.findIndex((b) => b.label === 'Deberás');
  if (idxTeDeberan !== -1 && idxDeberas !== -1) {
    connectors.push({
      x1: xPositions[idxTeDeberan] + BAR_W,
      x2: xPositions[idxDeberas],
      y: yPx(currentBalanceMinor + pendingIncomingMinor),
    });
  }

  // 5. Last Forecast → Proyectado
  const proyectadoIdx = bars.findIndex((b) => b.label === 'Proyectado');
  if (proyectadoIdx > 3) {
    connectors.push({
      x1: xPositions[proyectadoIdx - 1] + BAR_W,
      x2: xPositions[proyectadoIdx],
      y: yPx(projectedBalanceMinor),
    });
  }

  // ── Divider X position (exactly between Balance right edge and first forecast bar) ──
  const balanceRightEdge = xPositions[2] + BAR_W;
  const firstForecastLeft = xPositions[FORECAST_START] ?? xPositions[bars.length - 1];
  const dividerX = (balanceRightEdge + firstForecastLeft) / 2;

  return (
    <SurfaceCard padding="none" style={[styles.card, style]} variant="elevated">
      <View style={styles.body}>
        <View style={styles.summaryRow}>
          <View style={styles.projectedStack}>
            <View style={styles.projectionHeader}>
              <View style={styles.cardCharacter}>
                <View style={styles.cardCharacterFace}>
                  <Ionicons color={theme.colors.primary} name="trending-up-outline" size={24} />
                </View>
              </View>
              <View style={styles.headerCopy}>
                <Text numberOfLines={1} style={styles.cardTitle}>
                  Proyeccion
                </Text>
                <Text numberOfLines={2} style={styles.cardSubtitle}>
                  {hasImpact ? `${pendingLabel} por simular` : 'Sin pendientes por simular'}
                </Text>
              </View>
            </View>
            <View style={styles.projectedMetaRow}>
              <Text
                adjustsFontSizeToFit
                minimumFontScale={0.82}
                numberOfLines={1}
                style={styles.projectedValue}
              >
                {formatCompactCop(projectedBalanceMinor)}
              </Text>
              {hasImpact ? (
                <View
                  style={[
                    styles.impactPill,
                    impactTone === 'positive' ? styles.impactPillPositive : null,
                    impactTone === 'negative' ? styles.impactPillNegative : null,
                  ]}
                >
                  <Ionicons
                    color={
                      impactTone === 'positive'
                        ? theme.colors.success
                        : impactTone === 'negative'
                          ? theme.colors.danger
                          : theme.colors.textMuted
                    }
                    name={impactMinor >= 0 ? 'trending-up-outline' : 'trending-down-outline'}
                    size={12}
                  />
                  <View style={styles.impactTextStack}>
                    <Text numberOfLines={1} style={styles.impactLabel}>
                      Impacto
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.impactValue,
                        impactTone === 'positive' ? styles.positiveText : null,
                        impactTone === 'negative' ? styles.negativeText : null,
                      ]}
                    >
                      {formatSignedCompactCop(impactMinor)}
                    </Text>
                  </View>
                </View>
              ) : null}
            </View>
          </View>
          {hasImpact ? (
            <View style={styles.pendingChip}>
              <Text style={styles.pendingChipText}>{pendingLabel}</Text>
            </View>
          ) : null}
        </View>

        {/* Chart content with forecast zone background */}
        <View style={styles.chartContent}>
          <View style={{ alignSelf: 'center', width: svgW, position: 'relative' }}>
            {/* Forecast zone background matches projected outcome */}
            <View
              style={[
                styles.forecastZone,
                {
                  backgroundColor:
                    projectedBalanceMinor >= 0
                      ? `${theme.colors.success}10`
                      : `${theme.colors.danger}10`,
                  left: dividerX,
                  width: svgW - dividerX + 16,
                },
              ]}
            />

            {/* Section labels */}
            <View style={styles.sectionLabelsRow}>
              <Text style={[styles.sectionLabel, { width: dividerX, textAlign: 'center' }]}>
                Hoy
              </Text>
              <Text
                style={[
                  styles.sectionLabel,
                  styles.sectionLabelForecast,
                  { width: svgW - dividerX, textAlign: 'center' },
                ]}
              >
                Proyección
              </Text>
            </View>

            {/* SVG Chart */}
            <View style={styles.chartWrapper}>
              <Svg height={CHART_H} width={svgW}>
                {/* Zero line */}
                <Line
                  stroke={theme.colors.border}
                  strokeWidth={1}
                  x1={0}
                  x2={svgW}
                  y1={zeroY}
                  y2={zeroY}
                />

                {/* Connectors */}
                {connectors.map((c, i) => (
                  <Line
                    key={`conn-${i}`}
                    stroke={theme.colors.muted}
                    strokeDasharray={DASH_PATTERN}
                    strokeWidth={DASH_STROKE_WIDTH}
                    x1={c.x1}
                    x2={c.x2}
                    y1={c.y}
                    y2={c.y}
                  />
                ))}

                {/* Forecast divider */}
                <Line
                  stroke={theme.colors.muted}
                  strokeDasharray={DASH_PATTERN}
                  strokeWidth={DASH_STROKE_WIDTH}
                  x1={dividerX}
                  x2={dividerX}
                  y1={0}
                  y2={CHART_H}
                />

                {/* Bars */}
                {bars.map((bar, i) => {
                  const x = xPositions[i];
                  const top = yPx(bar.valTop);
                  const bottom = yPx(bar.valBottom);
                  const h = Math.max(bottom - top, 3);
                  const fill = bar.isForecast ? `${bar.color}30` : bar.color;

                  return (
                    <Fragment key={bar.label}>
                      {bar.isPlaceholder ? (
                        <Line
                          opacity={0.64}
                          stroke={bar.color}
                          strokeLinecap="round"
                          strokeWidth={2}
                          x1={x + 8}
                          x2={x + BAR_W - 8}
                          y1={Math.max(6, Math.min(bottom, CHART_H - 6))}
                          y2={Math.max(6, Math.min(bottom, CHART_H - 6))}
                        />
                      ) : (
                        <>
                          <Rect
                            fill={fill}
                            height={h}
                            onPress={onSegmentPress ? () => onSegmentPress(bar.filter) : undefined}
                            rx={5}
                            ry={5}
                            width={BAR_W}
                            x={x}
                            y={top}
                          />
                          {onSegmentPress ? (
                            <Rect
                              fill="transparent"
                              height={Math.max(h + 16, 36)}
                              onPress={() => onSegmentPress(bar.filter)}
                              rx={8}
                              ry={8}
                              width={BAR_W + 18}
                              x={x - 9}
                              y={Math.max(top - 8, 0)}
                            />
                          ) : null}
                          {bar.isForecast ? (
                            <Rect
                              fill="none"
                              height={h}
                              onPress={
                                onSegmentPress ? () => onSegmentPress(bar.filter) : undefined
                              }
                              rx={5}
                              ry={5}
                              stroke={`${bar.borderColor ?? bar.color}88`}
                              strokeDasharray={DASH_PATTERN}
                              strokeWidth={DASH_STROKE_WIDTH}
                              width={BAR_W}
                              x={x}
                              y={top}
                            />
                          ) : null}
                        </>
                      )}
                    </Fragment>
                  );
                })}
              </Svg>

              {/* Labels floating directly under each bar */}
              {bars.map((bar, i) => {
                if (bar.isPlaceholder) {
                  return null;
                }

                let displayValue: number;
                if (bar.label === 'Te deben') displayValue = totalOwedToMeMinor;
                else if (bar.label === 'Debes') displayValue = totalIOweMinor;
                else if (bar.label === 'Balance') displayValue = currentBalanceMinor;
                else if (bar.label === 'Te deberán') displayValue = pendingIncomingMinor;
                else if (bar.label === 'Deberás') displayValue = pendingOutgoingMinor;
                else displayValue = projectedBalanceMinor;

                return (
                  <Pressable
                    accessibilityRole="button"
                    hitSlop={8}
                    key={bar.label}
                    onPress={() => onSegmentPress?.(bar.filter)}
                    style={[
                      styles.labelCol,
                      onSegmentPress ? styles.labelColPressable : null,
                      {
                        left: xPositions[i] + BAR_W / 2 - 32,
                        top: yPx(bar.valBottom) + 14,
                      },
                    ]}
                  >
                    <Ionicons
                      color={bar.isForecast ? `${bar.color}99` : bar.color}
                      name={bar.icon}
                      size={12}
                    />
                    <Text numberOfLines={1} style={styles.labelText}>
                      {bar.label}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.labelValue,
                        { color: bar.isForecast ? `${bar.color}BB` : bar.color },
                      ]}
                    >
                      {formatCompactCop(displayValue)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </View>
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: 0 },
  body: {
    gap: theme.spacing.sm,
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
  },
  summaryRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  projectedStack: {
    flex: 1,
    gap: theme.spacing.xs,
    minWidth: 0,
  },
  projectionHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.sm,
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
  headerCopy: {
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
  projectedMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  projectedValue: {
    color: 'rgba(15, 23, 40, 0.58)',
    fontSize: theme.typography.title3,
    fontWeight: '800',
    letterSpacing: -0.2,
    lineHeight: 23,
  },
  pendingChip: {
    backgroundColor: 'transparent',
    borderColor: theme.colors.hairline,
    borderWidth: 1,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pendingChipText: {
    color: 'rgba(26, 39, 68, 0.62)',
    fontSize: theme.typography.footnote,
    fontWeight: '800',
  },
  impactPill: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'transparent',
    borderColor: theme.colors.hairline,
    borderWidth: 1,
    borderRadius: theme.radius.small,
    flexDirection: 'row',
    gap: 4,
    maxWidth: '100%',
    paddingHorizontal: 7,
    paddingVertical: 5,
  },
  impactPillPositive: {
    borderColor: theme.colors.success,
  },
  impactPillNegative: {
    borderColor: theme.colors.danger,
  },
  impactTextStack: {
    gap: 0,
  },
  impactLabel: {
    color: theme.colors.textMuted,
    flexShrink: 1,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.3,
    lineHeight: 9,
    textTransform: 'uppercase',
  },
  impactValue: {
    color: theme.colors.text,
    fontSize: 11,
    fontWeight: '800',
    lineHeight: 13,
  },
  sectionLabelsRow: {
    flexDirection: 'row',
  },
  sectionLabel: {
    color: theme.colors.text,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  sectionLabelForecast: { color: theme.colors.textMuted },
  chartContent: {
    alignItems: 'center',
    position: 'relative',
    overflow: 'visible',
    paddingTop: theme.spacing.xs,
  },
  forecastZone: {
    borderRadius: 12,
    bottom: -8,
    position: 'absolute',
    top: -4,
  },
  chartWrapper: { alignItems: 'center', paddingTop: 10, paddingBottom: 42, position: 'relative' },
  labelCol: {
    alignItems: 'center',
    gap: 2,
    position: 'absolute',
    width: 64,
  },
  labelColPressable: {
    borderRadius: theme.radius.tiny,
  },
  labelText: {
    color: theme.colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  labelValue: { fontSize: 10, fontWeight: '800' },
  positiveText: {
    color: theme.colors.success,
  },
  negativeText: {
    color: theme.colors.danger,
  },
});
