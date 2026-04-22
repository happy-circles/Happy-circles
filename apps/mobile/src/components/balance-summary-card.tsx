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
    return `+ ${formatCop(amountMinor)}`;
  }

  if (amountMinor < 0) {
    return `- ${formatCop(Math.abs(amountMinor))}`;
  }

  return formatCop(0);
}

function statusLabel(tone: BalanceTone): string {
  if (tone === 'positive') {
    return 'Saldo positivo';
  }

  if (tone === 'negative') {
    return 'Saldo por pagar';
  }

  return 'En equilibrio';
}

function statusIcon(tone: BalanceTone): keyof typeof Ionicons.glyphMap {
  if (tone === 'positive') {
    return 'trending-up';
  }

  if (tone === 'negative') {
    return 'trending-down';
  }

  return 'remove';
}

function BalanceMetricPill({
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
    <View
      style={[
        styles.metricPill,
        tone === 'negative' ? styles.metricPillWarning : styles.metricPillSuccess,
      ]}
    >
      <View
        style={[
          styles.metricIcon,
          tone === 'negative' ? styles.metricIconWarning : styles.metricIconSuccess,
        ]}
      >
        <Ionicons color={theme.colors.white} name={icon} size={15} />
      </View>
      <View style={styles.metricCopy}>
        <Text numberOfLines={1} style={styles.metricLabel}>
          {label}
        </Text>
        <Text
          adjustsFontSizeToFit
          minimumFontScale={0.82}
          numberOfLines={1}
          style={[
            styles.metricAmount,
            tone === 'negative' ? styles.warningText : styles.successText,
          ]}
        >
          {formatCop(amountMinor)}
        </Text>
      </View>
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
      <Text style={styles.detailsText}>Ver como se compone</Text>
      <Ionicons color={theme.colors.text} name="chevron-forward" size={15} />
    </Pressable>
  );

  return (
    <View style={styles.card}>
      <View
        style={[
          styles.toneWash,
          tone === 'positive' ? styles.toneWashPositive : null,
          tone === 'negative' ? styles.toneWashNegative : null,
          tone === 'neutral' ? styles.toneWashNeutral : null,
        ]}
      />

      <View style={styles.header}>
        <Text style={styles.label}>Tu balance</Text>
        <View
          style={[
            styles.statusPill,
            tone === 'positive' ? styles.statusPillPositive : null,
            tone === 'negative' ? styles.statusPillNegative : null,
            tone === 'neutral' ? styles.statusPillNeutral : null,
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
            name={statusIcon(tone)}
            size={12}
          />
          <Text
            style={[
              styles.statusText,
              tone === 'positive' ? styles.successText : null,
              tone === 'negative' ? styles.warningText : null,
            ]}
          >
            {statusLabel(tone)}
          </Text>
        </View>
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
        <BalanceMetricPill
          amountMinor={totalIOweMinor}
          icon="arrow-down"
          label="Debes"
          tone="negative"
        />
        <View style={styles.equationBadge}>
          <Text style={styles.equationText}>=</Text>
        </View>
        <BalanceMetricPill
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
  card: {
    backgroundColor: theme.colors.surface,
    borderColor: 'rgba(255, 255, 255, 0.72)',
    borderRadius: theme.radius.large,
    borderWidth: 1,
    gap: theme.spacing.sm,
    overflow: 'hidden',
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
    position: 'relative',
    ...theme.shadow.card,
  },
  toneWash: {
    height: 82,
    left: 0,
    opacity: 0.5,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  toneWashPositive: {
    backgroundColor: theme.colors.successSoft,
  },
  toneWashNegative: {
    backgroundColor: theme.colors.warningSoft,
  },
  toneWashNeutral: {
    backgroundColor: theme.colors.surfaceMuted,
  },
  header: {
    alignItems: 'center',
    gap: 7,
  },
  label: {
    color: theme.colors.text,
    fontSize: theme.typography.body,
    fontWeight: '800',
    lineHeight: 20,
    textAlign: 'center',
  },
  statusPill: {
    alignItems: 'center',
    alignSelf: 'center',
    borderRadius: theme.radius.pill,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
  },
  statusPillPositive: {
    backgroundColor: 'rgba(220, 245, 235, 0.86)',
  },
  statusPillNegative: {
    backgroundColor: 'rgba(249, 234, 215, 0.86)',
  },
  statusPillNeutral: {
    backgroundColor: 'rgba(244, 246, 250, 0.92)',
  },
  statusText: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    lineHeight: 14,
  },
  amount: {
    color: theme.colors.text,
    fontSize: 38,
    fontWeight: '800',
    lineHeight: 46,
    textAlign: 'center',
  },
  metricsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
    justifyContent: 'center',
    marginTop: theme.spacing.xs,
  },
  metricPill: {
    alignItems: 'center',
    borderRadius: theme.radius.small,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: theme.spacing.xs,
    minHeight: 58,
    minWidth: 0,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  metricPillWarning: {
    backgroundColor: 'rgba(249, 234, 215, 0.62)',
    borderColor: 'rgba(163, 95, 25, 0.14)',
  },
  metricPillSuccess: {
    backgroundColor: 'rgba(220, 245, 235, 0.72)',
    borderColor: 'rgba(15, 138, 95, 0.14)',
  },
  metricIcon: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  metricIconWarning: {
    backgroundColor: '#e4822c',
  },
  metricIconSuccess: {
    backgroundColor: theme.colors.success,
  },
  metricCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  metricLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    lineHeight: 14,
  },
  metricAmount: {
    fontSize: theme.typography.footnote,
    fontWeight: '800',
    lineHeight: 17,
  },
  equationBadge: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  equationText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.callout,
    fontWeight: '800',
    lineHeight: 18,
  },
  detailsLink: {
    alignItems: 'center',
    alignSelf: 'center',
    borderRadius: theme.radius.pill,
    flexDirection: 'row',
    gap: 3,
    marginTop: 2,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
  },
  detailsText: {
    color: theme.colors.text,
    fontSize: theme.typography.caption,
    fontWeight: '800',
    lineHeight: 15,
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
