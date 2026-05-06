import { Fragment, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import type { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';

import { SurfaceCard } from '@/components/surface-card';
import { formatCop } from '@/lib/data';
import { theme } from '@/lib/theme';
import type { ProjectionChartFilter } from '@/lib/transaction-filters';
import { AppText } from '@/components/app-text';

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
const CHART_H = 100;
const BAR_W = 34;
const GAP = 26;
const DIVIDER_GAP = 34;
const LABEL_W = 64;
const FORECAST_ZONE_EXTRA_W = 16;
const FORECAST_START = 3; // index where forecast section begins
const DASH_LENGTH = 4;
const DASH_STROKE_WIDTH = 1.25;
const BASE_SVG_W = BAR_W * 6 + GAP * 4 + DIVIDER_GAP;
const LABEL_EDGE_INSET = Math.max(0, LABEL_W / 2 - BAR_W / 2);
const CHART_EDGE_END = Math.max(LABEL_EDGE_INSET, FORECAST_ZONE_EXTRA_W);
const CHART_OUTER_W = BASE_SVG_W + LABEL_EDGE_INSET + CHART_EDGE_END;

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
  const [chartAvailableWidth, setChartAvailableWidth] = useState(0);
  const hasImpact = pendingCount > 0;
  const impactTone = impactMinor > 0 ? 'positive' : impactMinor < 0 ? 'negative' : 'neutral';
  const pendingLabel = `${pendingCount} pendiente${pendingCount === 1 ? '' : 's'}`;
  const chartScale = chartAvailableWidth > 0 ? Math.min(1, chartAvailableWidth / CHART_OUTER_W) : 1;
  const chartH = CHART_H * chartScale;
  const barW = BAR_W * chartScale;
  const gap = GAP * chartScale;
  const dividerGap = DIVIDER_GAP * chartScale;
  const labelW = LABEL_W * chartScale;
  const chartInsetStart = LABEL_EDGE_INSET * chartScale;
  const chartInsetEnd = CHART_EDGE_END * chartScale;
  const dashPattern = `${DASH_LENGTH * chartScale},${DASH_LENGTH * chartScale}`;
  const dashStrokeWidth = DASH_STROKE_WIDTH * chartScale;
  const labelIconSize = 12 * chartScale;
  const labelTextSize = 10 * chartScale;
  const labelTextLineHeight = 12 * chartScale;

  function handleChartContentLayout(event: LayoutChangeEvent) {
    const nextWidth = Math.max(0, event.nativeEvent.layout.width);
    setChartAvailableWidth((currentWidth) =>
      Math.abs(currentWidth - nextWidth) < 0.5 ? currentWidth : nextWidth,
    );
  }

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
    return chartH * (1 - (v - minV) / range);
  }

  const zeroY = yPx(0);

  // ── X positions ────────────────────────────────────────────────
  const xPositions: number[] = [];
  let cx = 0;
  for (let i = 0; i < bars.length; i++) {
    if (i === FORECAST_START) cx += dividerGap;
    else if (i > 0) cx += gap;
    xPositions.push(cx);
    cx += barW;
  }
  const svgW = cx;
  const chartOuterW = svgW + chartInsetStart + chartInsetEnd;

  // ── Connectors ─────────────────────────────────────────────────
  type Connector = { x1: number; x2: number; y: number };
  const connectors: Connector[] = [];

  // 1. Te deben → Debes
  connectors.push({
    x1: xPositions[0] + barW,
    x2: xPositions[1],
    y: yPx(totalOwedToMeMinor),
  });

  // 2. Debes → Balance
  connectors.push({
    x1: xPositions[1] + barW,
    x2: xPositions[2],
    y: yPx(currentBalanceMinor),
  });

  // 3. Balance → First Forecast
  if (bars.length > 3) {
    connectors.push({
      x1: xPositions[2] + barW,
      x2: xPositions[3],
      y: yPx(currentBalanceMinor),
    });
  }

  // 4. Te deberán → Deberás (if both exist)
  const idxTeDeberan = bars.findIndex((b) => b.label === 'Te deberán');
  const idxDeberas = bars.findIndex((b) => b.label === 'Deberás');
  if (idxTeDeberan !== -1 && idxDeberas !== -1) {
    connectors.push({
      x1: xPositions[idxTeDeberan] + barW,
      x2: xPositions[idxDeberas],
      y: yPx(currentBalanceMinor + pendingIncomingMinor),
    });
  }

  // 5. Last Forecast → Proyectado
  const proyectadoIdx = bars.findIndex((b) => b.label === 'Proyectado');
  if (proyectadoIdx > 3) {
    connectors.push({
      x1: xPositions[proyectadoIdx - 1] + barW,
      x2: xPositions[proyectadoIdx],
      y: yPx(projectedBalanceMinor),
    });
  }

  // ── Divider X position (exactly between Balance right edge and first forecast bar) ──
  const balanceRightEdge = xPositions[2] + barW;
  const firstForecastLeft = xPositions[FORECAST_START] ?? xPositions[bars.length - 1];
  const dividerX = (balanceRightEdge + firstForecastLeft) / 2;

  return (
    <SurfaceCard padding="none" style={[styles.card, style]}>
      <View style={styles.body}>
        <View style={styles.cardHeader}>
          <AppText numberOfLines={1} style={styles.cardTitle}>
            Proyeccion
          </AppText>
          <View style={styles.cardContextPill}>
            <AppText numberOfLines={1} style={styles.cardContextText}>
              {hasImpact ? pendingLabel : 'sin pendientes'}
            </AppText>
          </View>
        </View>
        <View style={styles.summaryRow}>
          <View style={styles.projectedStack}>
            <View style={styles.projectedMetaRow}>
              <AppText
                adjustsFontSizeToFit
                minimumFontScale={0.82}
                numberOfLines={1}
                style={styles.projectedValue}
              >
                {formatCompactCop(projectedBalanceMinor)}
              </AppText>
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
                    <AppText numberOfLines={1} style={styles.impactLabel}>
                      Impacto
                    </AppText>
                    <AppText
                      numberOfLines={1}
                      style={[
                        styles.impactValue,
                        impactTone === 'positive' ? styles.positiveText : null,
                        impactTone === 'negative' ? styles.negativeText : null,
                      ]}
                    >
                      {formatSignedCompactCop(impactMinor)}
                    </AppText>
                  </View>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        {/* Chart content with forecast zone background */}
        <View onLayout={handleChartContentLayout} style={styles.chartContent}>
          <View style={{ alignSelf: 'center', width: chartOuterW, position: 'relative' }}>
            {/* Forecast zone background matches projected outcome */}
            <View
              style={[
                styles.forecastZone,
                {
                  backgroundColor:
                    projectedBalanceMinor >= 0
                      ? `${theme.colors.success}10`
                      : `${theme.colors.danger}10`,
                  borderRadius: 12 * chartScale,
                  bottom: -8 * chartScale,
                  left: chartInsetStart + dividerX,
                  top: -4 * chartScale,
                  width: svgW - dividerX + FORECAST_ZONE_EXTRA_W * chartScale,
                },
              ]}
            />

            {/* Section labels */}
            <View style={[styles.sectionLabelsRow, { marginLeft: chartInsetStart, width: svgW }]}>
              <AppText
                style={[
                  styles.sectionLabel,
                  {
                    fontSize: labelTextSize,
                    letterSpacing: 0.8 * chartScale,
                    lineHeight: labelTextLineHeight,
                    width: dividerX,
                    textAlign: 'center',
                  },
                ]}
              >
                Hoy
              </AppText>
              <AppText
                style={[
                  styles.sectionLabel,
                  styles.sectionLabelForecast,
                  {
                    fontSize: labelTextSize,
                    letterSpacing: 0.8 * chartScale,
                    lineHeight: labelTextLineHeight,
                    width: svgW - dividerX,
                    textAlign: 'center',
                  },
                ]}
              >
                Proyección
              </AppText>
            </View>

            {/* SVG Chart */}
            <View
              style={[
                styles.chartWrapper,
                {
                  paddingBottom: 36 * chartScale,
                  paddingTop: 8 * chartScale,
                  width: chartOuterW,
                },
              ]}
            >
              <Svg height={chartH} style={{ marginLeft: chartInsetStart }} width={svgW}>
                {/* Zero line */}
                <Line
                  stroke={theme.colors.border}
                  strokeWidth={chartScale}
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
                    strokeDasharray={dashPattern}
                    strokeWidth={dashStrokeWidth}
                    x1={c.x1}
                    x2={c.x2}
                    y1={c.y}
                    y2={c.y}
                  />
                ))}

                {/* Forecast divider */}
                <Line
                  stroke={theme.colors.muted}
                  strokeDasharray={dashPattern}
                  strokeWidth={dashStrokeWidth}
                  x1={dividerX}
                  x2={dividerX}
                  y1={0}
                  y2={chartH}
                />

                {/* Bars */}
                {bars.map((bar, i) => {
                  const x = xPositions[i];
                  const top = yPx(bar.valTop);
                  const bottom = yPx(bar.valBottom);
                  const h = Math.max(bottom - top, 3 * chartScale);
                  const hitHeight = Math.max(h + 16 * chartScale, 36);
                  const hitWidth = Math.max(barW + 18 * chartScale, 32);
                  const fill = bar.isForecast ? `${bar.color}30` : bar.color;

                  return (
                    <Fragment key={bar.label}>
                      {bar.isPlaceholder ? (
                        <Line
                          opacity={0.64}
                          stroke={bar.color}
                          strokeLinecap="round"
                          strokeWidth={2 * chartScale}
                          x1={x + 8 * chartScale}
                          x2={x + barW - 8 * chartScale}
                          y1={Math.max(6 * chartScale, Math.min(bottom, chartH - 6 * chartScale))}
                          y2={Math.max(6 * chartScale, Math.min(bottom, chartH - 6 * chartScale))}
                        />
                      ) : (
                        <>
                          <Rect
                            fill={fill}
                            height={h}
                            onPress={onSegmentPress ? () => onSegmentPress(bar.filter) : undefined}
                            rx={5 * chartScale}
                            ry={5 * chartScale}
                            width={barW}
                            x={x}
                            y={top}
                          />
                          {onSegmentPress ? (
                            <Rect
                              fill="transparent"
                              height={hitHeight}
                              onPress={() => onSegmentPress(bar.filter)}
                              rx={8 * chartScale}
                              ry={8 * chartScale}
                              width={hitWidth}
                              x={x - (hitWidth - barW) / 2}
                              y={Math.max(top - (hitHeight - h) / 2, 0)}
                            />
                          ) : null}
                          {bar.isForecast ? (
                            <Rect
                              fill="none"
                              height={h}
                              onPress={
                                onSegmentPress ? () => onSegmentPress(bar.filter) : undefined
                              }
                              rx={5 * chartScale}
                              ry={5 * chartScale}
                              stroke={`${bar.borderColor ?? bar.color}88`}
                              strokeDasharray={dashPattern}
                              strokeWidth={dashStrokeWidth}
                              width={barW}
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
                        gap: 2 * chartScale,
                        left: chartInsetStart + xPositions[i] + barW / 2 - labelW / 2,
                        top: yPx(bar.valBottom) + 14 * chartScale,
                        width: labelW,
                      },
                    ]}
                  >
                    <Ionicons
                      color={bar.isForecast ? `${bar.color}99` : bar.color}
                      name={bar.icon}
                      size={labelIconSize}
                    />
                    <AppText
                      numberOfLines={1}
                      style={[
                        styles.labelText,
                        { fontSize: labelTextSize, lineHeight: labelTextLineHeight },
                      ]}
                    >
                      {bar.label}
                    </AppText>
                    <AppText
                      numberOfLines={1}
                      style={[
                        styles.labelValue,
                        {
                          color: bar.isForecast ? `${bar.color}BB` : bar.color,
                          fontSize: labelTextSize,
                          lineHeight: labelTextLineHeight,
                        },
                      ]}
                    >
                      {formatCompactCop(displayValue)}
                    </AppText>
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
    gap: theme.spacing.xs,
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
  cardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
    minHeight: 30,
  },
  cardTitle: {
    flex: 1,
    color: theme.colors.text,
    fontSize: theme.typography.title3,
    fontWeight: '800',
    lineHeight: 24,
    minWidth: 0,
  },
  cardContextPill: {
    borderColor: theme.colors.hairline,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  cardContextText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    fontWeight: '800',
    lineHeight: 15,
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
    position: 'absolute',
  },
  chartWrapper: { position: 'relative' },
  labelCol: {
    alignItems: 'center',
    position: 'absolute',
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
