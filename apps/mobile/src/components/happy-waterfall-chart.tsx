import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { BalanceWaterfallGroupDto } from '@happy-circles/application';

import { formatCop } from '@/lib/data';
import { theme } from '@/lib/theme';
import { SurfaceCard } from './surface-card';

const CHART_HEIGHT = 240;
const GROUP_WIDTH = 100;
const BAR_WIDTH = 16;
const BAR_GAP = 6;

export interface HappyWaterfallChartProps {
  readonly groups: readonly BalanceWaterfallGroupDto[];
}

export function HappyWaterfallChart({ groups }: HappyWaterfallChartProps) {
  if (groups.length === 0) {
    return null;
  }

  // Find min and max for the Y axis
  const allValues: number[] = [0];
  groups.forEach((g) => {
    allValues.push(g.cumulativeBalanceMinor);
    if (g.key !== 'starting_balance' && g.key !== 'ending_balance') {
      allValues.push(g.iOweMinor);
      allValues.push(g.owedToMeMinor);
      allValues.push(g.resolvedMinor);
    }
  });

  const minY = Math.min(...allValues);
  const maxY = Math.max(...allValues);
  const rangeY = maxY - minY || 1; // prevent div by zero

  const getY = (val: number) => {
    const percentage = (val - minY) / rangeY;
    // Invert Y axis because React Native Y grows downwards
    return CHART_HEIGHT - percentage * CHART_HEIGHT;
  };

  const zeroY = getY(0);

  // We need to track the previous cumulative balance to draw the connecting line
  let previousCumulative = groups[0]?.cumulativeBalanceMinor ?? 0;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
    >
      <View style={[styles.chartContainer, { height: CHART_HEIGHT }]}>
        {/* Zero Line */}
        <View style={[styles.zeroLine, { top: zeroY }]} />

        {groups.map((group, index) => {
          const isEndpoint = group.key === 'starting_balance' || group.key === 'ending_balance';
          const startY = getY(previousCumulative);
          const endY = getY(group.cumulativeBalanceMinor);
          
          // Next previous cumulative
          previousCumulative = group.cumulativeBalanceMinor;

          return (
            <View key={group.key} style={styles.groupContainer}>
              {/* Endpoint Cards */}
              {isEndpoint ? (
                <View style={styles.endpointWrapper}>
                  <SurfaceCard padding="md" style={styles.endpointCard}>
                    <Text style={styles.endpointLabel}>{group.label}</Text>
                    <Text style={styles.endpointAmount}>{formatCop(group.cumulativeBalanceMinor)}</Text>
                  </SurfaceCard>
                  {/* Connecting line entering the endpoint */}
                  {index > 0 && (
                     <View
                       style={[
                         styles.dashedLineHorizontal,
                         { top: endY, left: -GROUP_WIDTH / 2, width: GROUP_WIDTH / 2 },
                       ]}
                     />
                  )}
                </View>
              ) : (
                <>
                  {/* The continuous dashed line logic for intermediate groups */}
                  {/* 1. Horizontal line across the group at previous cumulative */}
                  <View
                    style={[
                      styles.dashedLineHorizontal,
                      { top: startY, left: 0, width: GROUP_WIDTH },
                    ]}
                  />
                  {/* 2. Vertical jump at the end of the group to the new cumulative */}
                  {startY !== endY && (
                    <View
                      style={[
                        styles.dashedLineVertical,
                        {
                          left: GROUP_WIDTH - 1,
                          top: Math.min(startY, endY),
                          height: Math.abs(startY - endY),
                        },
                      ]}
                    />
                  )}

                  {/* Bars Container */}
                  <View style={styles.barsWrapper}>
                    {group.iOweMinor > 0 && (
                      <View style={styles.barCol}>
                        <View
                          style={[
                            styles.bar,
                            styles.barOwe,
                            { top: getY(group.iOweMinor), height: zeroY - getY(group.iOweMinor) },
                          ]}
                        />
                      </View>
                    )}
                    {group.owedToMeMinor > 0 && (
                      <View style={styles.barCol}>
                        <View
                          style={[
                            styles.bar,
                            styles.barOwedToMe,
                            { top: getY(group.owedToMeMinor), height: zeroY - getY(group.owedToMeMinor) },
                          ]}
                        />
                      </View>
                    )}
                    {group.resolvedMinor > 0 && (
                      <View style={styles.barCol}>
                        <View
                          style={[
                            styles.bar,
                            styles.barResolved,
                            { top: getY(group.resolvedMinor), height: zeroY - getY(group.resolvedMinor) },
                          ]}
                        />
                      </View>
                    )}
                  </View>

                  {/* Group Label */}
                  <View style={styles.groupLabelWrapper}>
                    <Text style={styles.groupLabel} numberOfLines={1}>
                      {group.label}
                    </Text>
                    <Text style={styles.groupAmount}>{formatCop(group.netMinor)}</Text>
                  </View>
                </>
              )}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.xl,
    paddingBottom: 80, // Space for labels at bottom
  },
  chartContainer: {
    flexDirection: 'row',
    position: 'relative',
  },
  zeroLine: {
    backgroundColor: theme.colors.border,
    height: 1,
    left: 0,
    position: 'absolute',
    right: 0,
    zIndex: -1,
  },
  groupContainer: {
    position: 'relative',
    width: GROUP_WIDTH,
  },
  endpointWrapper: {
    alignItems: 'center',
    height: '100%',
    justifyContent: 'center',
    width: '100%',
  },
  endpointCard: {
    alignItems: 'center',
    width: 140, // Wider for endpoint
    zIndex: 10,
  },
  endpointLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    fontWeight: '700',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  endpointAmount: {
    color: theme.colors.text,
    fontSize: theme.typography.title3,
    fontWeight: '800',
  },
  dashedLineHorizontal: {
    borderColor: theme.colors.textMuted,
    borderRadius: 1,
    borderStyle: 'dashed',
    borderTopWidth: 2,
    position: 'absolute',
    zIndex: 5,
  },
  dashedLineVertical: {
    borderColor: theme.colors.textMuted,
    borderLeftWidth: 2,
    borderRadius: 1,
    borderStyle: 'dashed',
    position: 'absolute',
    zIndex: 5,
  },
  barsWrapper: {
    alignItems: 'flex-end',
    bottom: 0,
    flexDirection: 'row',
    gap: BAR_GAP,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 2,
  },
  barCol: {
    alignItems: 'center',
    height: '100%',
    position: 'relative',
    width: BAR_WIDTH,
  },
  bar: {
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    position: 'absolute',
    width: '100%',
  },
  barOwe: {
    backgroundColor: theme.colors.warning,
  },
  barOwedToMe: {
    backgroundColor: theme.colors.success,
  },
  barResolved: {
    backgroundColor: theme.colors.brandNavy,
  },
  groupLabelWrapper: {
    alignItems: 'center',
    bottom: -40,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  groupLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    fontWeight: '600',
  },
  groupAmount: {
    color: theme.colors.text,
    fontSize: theme.typography.footnote,
    fontWeight: '700',
    marginTop: 2,
  },
});
