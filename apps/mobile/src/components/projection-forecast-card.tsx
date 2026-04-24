import { Fragment } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';

import { SurfaceCard } from '@/components/surface-card';
import { formatCop } from '@/lib/data';
import { theme } from '@/lib/theme';

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

export interface ProjectionForecastCardProps {
  readonly currentBalanceMinor: number;
  readonly impactMinor: number;
  readonly pendingCount: number;
  readonly pendingIncomingMinor: number;
  readonly pendingOutgoingMinor: number;
  readonly projectedBalanceMinor: number;
  readonly totalIOweMinor: number;
  readonly totalOwedToMeMinor: number;
}

type BarDef = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  valTop: number;
  valBottom: number;
  isTotal: boolean;
  isForecast: boolean;
  borderColor?: string;
};

// ── Constants ────────────────────────────────────────────────────
const CHART_H = 110;
const BAR_W = 28;
const GAP = 32;
const DIVIDER_GAP = 42;
const FORECAST_START = 3; // index where forecast section begins

export function ProjectionForecastCard({
  currentBalanceMinor,
  impactMinor,
  pendingCount,
  pendingIncomingMinor,
  pendingOutgoingMinor,
  projectedBalanceMinor,
  totalIOweMinor,
  totalOwedToMeMinor,
}: ProjectionForecastCardProps) {
  const hasImpact = pendingCount > 0;

  // ── Build bars ─────────────────────────────────────────────────
  const bars: BarDef[] = [
    {
      label: 'Te deben',
      icon: 'arrow-down-outline',
      color: theme.colors.success,
      valTop: totalOwedToMeMinor,
      valBottom: 0,
      isTotal: false,
      isForecast: false,
    },
    {
      label: 'Debes',
      icon: 'arrow-up-outline',
      color: theme.colors.danger,
      valTop: totalOwedToMeMinor,
      valBottom: currentBalanceMinor,
      isTotal: false,
      isForecast: false,
    },
    {
      label: 'Balance',
      icon: 'wallet-outline',
      color: theme.colors.primary,
      valTop: Math.max(currentBalanceMinor, 0),
      valBottom: Math.min(currentBalanceMinor, 0),
      isTotal: true,
      isForecast: false,
    },
  ];

  // Forecast step bars: split impact into Te deberán / Deberás based on pending breakdown
  if (hasImpact) {
    let currentForecastTop = currentBalanceMinor;

    if (pendingIncomingMinor > 0) {
      bars.push({
        label: 'Te deberán',
        icon: 'arrow-down-outline',
        color: theme.colors.success,
        valTop: currentForecastTop + pendingIncomingMinor,
        valBottom: currentForecastTop,
        isTotal: false,
        isForecast: true,
      });
      currentForecastTop += pendingIncomingMinor;
    }

    if (pendingOutgoingMinor > 0) {
      bars.push({
        label: 'Deberás',
        icon: 'arrow-up-outline',
        color: theme.colors.danger,
        valTop: currentForecastTop,
        valBottom: currentForecastTop - pendingOutgoingMinor,
        isTotal: false,
        isForecast: true,
      });
    }
  }

  bars.push({
    label: 'Proyectado',
    icon: 'flag-outline',
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
  const idxTeDeberan = bars.findIndex(b => b.label === 'Te deberán');
  const idxDeberas = bars.findIndex(b => b.label === 'Deberás');
  if (idxTeDeberan !== -1 && idxDeberas !== -1) {
    connectors.push({
      x1: xPositions[idxTeDeberan] + BAR_W,
      x2: xPositions[idxDeberas],
      y: yPx(currentBalanceMinor + pendingIncomingMinor),
    });
  }

  // 5. Last Forecast → Proyectado
  const proyectadoIdx = bars.findIndex((b) => b.label === 'Proyectado');
  if (hasImpact && proyectadoIdx > 3) {
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
    <SurfaceCard padding="lg" style={styles.card} variant="elevated">



      {/* Chart content with forecast zone background */}
      <View style={styles.chartContent}>
        <View style={{ alignSelf: 'center', width: svgW, position: 'relative' }}>
          {/* Forecast zone background matches projected outcome */}
          <View
            style={[
              styles.forecastZone,
              { 
                backgroundColor: projectedBalanceMinor >= 0 ? `${theme.colors.success}10` : `${theme.colors.danger}10`,
                left: dividerX,
                width: svgW - dividerX + 16,
              },
            ]}
          />

          {/* Section labels */}
          <View style={styles.sectionLabelsRow}>
            <Text style={[styles.sectionLabel, { width: dividerX, textAlign: 'center' }]}>Hoy</Text>
            <Text style={[styles.sectionLabel, styles.sectionLabelForecast, { width: svgW - dividerX, textAlign: 'center' }]}>Proyección</Text>
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
                strokeDasharray="3,3"
                strokeWidth={1}
                x1={c.x1}
                x2={c.x2}
                y1={c.y}
                y2={c.y}
              />
            ))}

            {/* Forecast divider */}
            <Line
              stroke={theme.colors.muted}
              strokeDasharray="3,3"
              strokeWidth={1}
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
                  <Rect
                    fill={fill}
                    height={h}
                    rx={5}
                    ry={5}
                    width={BAR_W}
                    x={x}
                    y={top}
                  />
                  {bar.isForecast ? (
                    <Rect
                      fill="none"
                      height={h}
                      rx={5}
                      ry={5}
                      stroke={`${(bar.borderColor ?? bar.color)}88`}
                      strokeDasharray="4,3"
                      strokeWidth={1.5}
                      width={BAR_W}
                      x={x}
                      y={top}
                    />
                  ) : null}
                </Fragment>
              );
            })}
          </Svg>

          {/* Labels floating directly under each bar */}
          {bars.map((bar, i) => {
            let displayValue: number;
            if (bar.label === 'Te deben') displayValue = totalOwedToMeMinor;
            else if (bar.label === 'Debes') displayValue = totalIOweMinor;
            else if (bar.label === 'Balance') displayValue = currentBalanceMinor;
            else if (bar.label === 'Te deberán') displayValue = pendingIncomingMinor;
            else if (bar.label === 'Deberás') displayValue = pendingOutgoingMinor;
            else displayValue = projectedBalanceMinor;

            return (
              <View
                key={bar.label}
                style={[
                  styles.labelCol,
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
              </View>
            );
          })}
        </View>
        </View>
      </View>

      {/* Footer */}
      {hasImpact ? (
        <Text style={styles.footerText}>
          {pendingCount} movimiento{pendingCount === 1 ? '' : 's'} pendiente
          {pendingCount === 1 ? '' : 's'}
        </Text>
      ) : null}
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: theme.spacing.md },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  titleRow: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  title: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  badge: {
    alignItems: 'center',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: { fontSize: theme.typography.caption, fontWeight: '800' },
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
    position: 'relative',
    overflow: 'visible',
    paddingTop: 8,
  },
  forecastZone: {
    borderRadius: 12,
    bottom: -8,
    position: 'absolute',
    top: -4,
  },
  chartWrapper: { alignItems: 'center', paddingTop: 12, paddingBottom: 60, position: 'relative' },
  labelCol: {
    alignItems: 'center',
    gap: 2,
    position: 'absolute',
    width: 64,
  },
  labelText: {
    color: theme.colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  labelValue: { fontSize: 10, fontWeight: '800' },
  footerText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    textAlign: 'center',
  },
});
