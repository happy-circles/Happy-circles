import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import type { Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatCop } from '@/lib/data';
import { theme } from '@/lib/theme';

type BalanceTone = 'positive' | 'negative' | 'neutral';

export interface BalanceSummaryCardProps {
  readonly netBalanceMinor: number;
  readonly totalIOweMinor: number;
  readonly totalOwedToMeMinor: number;
  readonly detailsHref?: Href;
}

function balanceTone(amountMinor: number): BalanceTone {
  if (amountMinor > 0) {
    return 'positive';
  }

  if (amountMinor < 0) {
    return 'negative';
  }

  return 'neutral';
}

function formatSignedCop(amountMinor: number): string {
  if (amountMinor > 0) {
    return formatCop(amountMinor);
  }

  if (amountMinor < 0) {
    return `- ${formatCop(Math.abs(amountMinor))}`;
  }

  return formatCop(0);
}

function BalanceMetricItem({
  amountMinor,
  icon,
  label,
  tone,
}: {
  readonly amountMinor: number;
  readonly icon: keyof typeof Ionicons.glyphMap;
  readonly label: string;
  readonly tone: Extract<BalanceTone, 'positive' | 'negative'>;
}) {
  return (
    <View style={styles.metricItem}>
      <Ionicons
        color={tone === 'negative' ? theme.colors.warning : theme.colors.success}
        name={icon}
        size={20}
      />
      <Text
        numberOfLines={1}
        style={[styles.metricLabel, tone === 'negative' ? styles.warningText : styles.successText]}
      >
        {label}
      </Text>
      <Text
        adjustsFontSizeToFit
        minimumFontScale={0.82}
        numberOfLines={1}
        style={[styles.metricAmount, tone === 'negative' ? styles.warningText : styles.successText]}
      >
        {formatCop(amountMinor)}
      </Text>
    </View>
  );
}

export function BalanceSummaryCard({
  netBalanceMinor,
  totalIOweMinor,
  totalOwedToMeMinor,
  detailsHref,
}: BalanceSummaryCardProps) {
  const tone = balanceTone(netBalanceMinor);
  const detailContent = (
    <Pressable style={({ pressed }) => [styles.detailsLink, pressed ? styles.pressed : null]}>
      <View style={styles.detailsContent}>
        <Text style={styles.detailsText}>Ver como se compone</Text>
        <Ionicons color={theme.colors.textMuted} name="chevron-forward" size={15} />
      </View>
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.label}>Tu balance</Text>
      </View>

      <Text
        adjustsFontSizeToFit
        minimumFontScale={0.78}
        numberOfLines={1}
        style={[
          styles.amount,
          tone === 'positive' ? styles.successText : null,
          tone === 'negative' ? styles.warningText : null,
        ]}
      >
        {formatSignedCop(netBalanceMinor)}
      </Text>

      <View style={styles.metricsRow}>
        <BalanceMetricItem
          amountMinor={totalIOweMinor}
          icon="arrow-down"
          label="Debes"
          tone="negative"
        />
        <BalanceMetricItem
          amountMinor={totalOwedToMeMinor}
          icon="arrow-up"
          label="Te deben"
          tone="positive"
        />
      </View>

      {detailsHref ? (
        <Link href={detailsHref} asChild>
          {detailContent}
        </Link>
      ) : (
        detailContent
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: theme.spacing.lg,
    paddingHorizontal: theme.spacing.sm,
    paddingBottom: theme.spacing.lg,
    paddingTop: theme.spacing.md,
  },
  header: {
    alignItems: 'center',
  },
  label: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '800',
    lineHeight: 20,
    textAlign: 'center',
  },
  amount: {
    color: theme.colors.text,
    fontSize: 44,
    fontWeight: '800',
    lineHeight: 52,
    textAlign: 'center',
  },
  metricsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.lg,
    justifyContent: 'center',
    marginTop: 2,
    width: '100%',
  },
  metricItem: {
    alignItems: 'center',
    flexDirection: 'row',
    flex: 1,
    gap: 5,
    justifyContent: 'center',
    maxWidth: 190,
    minWidth: 0,
  },
  metricLabel: {
    fontSize: theme.typography.callout,
    fontWeight: '800',
    lineHeight: 19,
  },
  metricAmount: {
    flexShrink: 1,
    fontSize: theme.typography.body,
    fontWeight: '800',
    lineHeight: 21,
  },
  detailsLink: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    justifyContent: 'center',
    marginTop: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 8,
    width: '100%',
  },
  detailsContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 3,
    justifyContent: 'center',
  },
  detailsText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    fontWeight: '800',
    lineHeight: 17,
  },
  pressed: {
    opacity: 0.62,
  },
  successText: {
    color: theme.colors.success,
  },
  warningText: {
    color: theme.colors.warning,
  },
});
