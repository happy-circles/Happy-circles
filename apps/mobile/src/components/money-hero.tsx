import { StyleSheet, Text, View } from 'react-native';

import { formatCop } from '@/lib/data';
import { theme } from '@/lib/theme';

import { StatusChip } from './status-chip';

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
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        {badgeLabel ? (
          <StatusChip
            label={badgeLabel}
            tone={isNegative ? 'warning' : isPositive ? 'success' : 'primary'}
          />
        ) : null}
      </View>
      <Text style={[styles.amount, isNegative ? styles.negative : null, isPositive ? styles.positive : null]}>
        {formatCop(amountMinor)}
      </Text>
      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
      {secondaryMetrics?.length ? (
        <View style={styles.metricsRow}>
          {secondaryMetrics.map((metric) => (
            <View key={metric.label} style={styles.metricCard}>
              <Text style={styles.metricLabel}>{metric.label}</Text>
              <Text
                style={[
                  styles.metricAmount,
                  metric.tone === 'positive' ? styles.positive : null,
                  metric.tone === 'negative' ? styles.negative : null,
                ]}
              >
                {formatCop(metric.amountMinor)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.elevated,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.xlarge,
    borderWidth: 1,
    gap: theme.spacing.xs,
    padding: theme.spacing.lg,
    ...theme.shadow.card,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  label: {
    color: theme.colors.textMuted,
    flex: 1,
    fontSize: theme.typography.callout,
    fontWeight: '600',
  },
  amount: {
    color: theme.colors.text,
    fontSize: 38,
    fontWeight: '800',
    lineHeight: 44,
  },
  caption: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
  metricCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.hairline,
    borderRadius: theme.radius.medium,
    borderWidth: 1,
    flex: 1,
    gap: 4,
    padding: theme.spacing.sm,
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
