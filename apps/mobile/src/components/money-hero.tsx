import { StyleSheet, View } from 'react-native';

import { formatCop } from '@/lib/data';
import { theme } from '@/lib/theme';

import { StatusChip } from './status-chip';
import { SurfaceCard } from './surface-card';
import { AppText } from '@/components/app-text';

export interface MoneyHeroProps {
  readonly label: string;
  readonly amountMinor: number;
  readonly caption?: string;
  readonly tone?: 'positive' | 'negative' | 'neutral';
  readonly badgeLabel?: string;
  readonly secondaryMetrics?: readonly {
    readonly label: string;
    readonly amountMinor: number;
    readonly tone?: 'positive' | 'negative' | 'neutral';
  }[];
}

export function MoneyHero({
  label,
  amountMinor,
  caption,
  tone = 'neutral',
  badgeLabel,
  secondaryMetrics,
}: MoneyHeroProps) {
  const isNegative = tone === 'negative';
  const isPositive = tone === 'positive';

  return (
    <SurfaceCard style={styles.card} variant="elevated" padding="lg">
      <View style={styles.header}>
        <AppText style={styles.label}>{label}</AppText>
        {badgeLabel ? (
          <StatusChip
            label={badgeLabel}
            tone={isNegative ? 'warning' : isPositive ? 'success' : 'primary'}
          />
        ) : null}
      </View>
      <AppText
        style={[
          styles.amount,
          isNegative ? styles.negative : null,
          isPositive ? styles.positive : null,
        ]}
      >
        {formatCop(amountMinor)}
      </AppText>
      {caption ? <AppText style={styles.caption}>{caption}</AppText> : null}
      {secondaryMetrics?.length ? (
        <View style={styles.metricsRow}>
          {secondaryMetrics.map((metric) => (
            <SurfaceCard key={metric.label} style={styles.metricCard} variant="muted" padding="sm">
              <AppText style={styles.metricLabel}>{metric.label}</AppText>
              <AppText
                style={[
                  styles.metricAmount,
                  metric.tone === 'positive' ? styles.positive : null,
                  metric.tone === 'negative' ? styles.negative : null,
                ]}
              >
                {formatCop(metric.amountMinor)}
              </AppText>
            </SurfaceCard>
          ))}
        </View>
      ) : null}
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: theme.spacing.sm,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  label: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  amount: {
    color: theme.colors.text,
    fontSize: 40,
    fontWeight: '800',
    letterSpacing: -1.2,
    lineHeight: 46,
  },
  caption: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 19,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  metricCard: {
    flex: 1,
    gap: 6,
  },
  metricLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    fontWeight: '700',
  },
  metricAmount: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '800',
  },
  positive: {
    color: theme.colors.success,
  },
  negative: {
    color: theme.colors.warning,
  },
});
