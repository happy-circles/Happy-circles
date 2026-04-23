import { StyleSheet, Text, View } from 'react-native';

import { theme } from '@/lib/theme';
import { transactionCategoryColor } from '@/lib/transaction-categories';

export interface StatusChipProps {
  readonly label: string;
  readonly tone?: 'primary' | 'success' | 'warning' | 'danger' | 'neutral' | 'cycle';
  readonly compact?: boolean;
}

export function StatusChip({ label, tone = 'neutral', compact = false }: StatusChipProps) {
  return (
    <View
      style={[
        styles.chip,
        compact ? styles.compactChip : null,
        tone === 'primary' ? styles.primary : null,
        tone === 'success' ? styles.success : null,
        tone === 'warning' ? styles.warning : null,
        tone === 'danger' ? styles.danger : null,
        tone === 'neutral' ? styles.neutral : null,
        tone === 'cycle' ? styles.cycle : null,
      ]}
    >
      <Text
        style={[
          styles.label,
          compact ? styles.compactLabel : null,
          tone === 'primary' ? styles.primaryText : null,
          tone === 'success' ? styles.successText : null,
          tone === 'warning' ? styles.warningText : null,
          tone === 'danger' ? styles.dangerText : null,
          tone === 'neutral' ? styles.neutralText : null,
          tone === 'cycle' ? styles.cycleText : null,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    borderRadius: theme.radius.small,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 8,
  },
  compactChip: {
    borderRadius: theme.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  label: {
    fontSize: theme.typography.caption,
    fontWeight: '700',
  },
  compactLabel: {
    fontSize: 11,
    lineHeight: 12,
  },
  primary: {
    backgroundColor: theme.colors.primarySoft,
  },
  success: {
    backgroundColor: theme.colors.successSoft,
  },
  warning: {
    backgroundColor: theme.colors.warningSoft,
  },
  danger: {
    backgroundColor: theme.colors.dangerSoft,
  },
  neutral: {
    backgroundColor: theme.colors.surfaceSoft,
  },
  cycle: {
    backgroundColor: '#eaf1ff',
  },
  primaryText: {
    color: theme.colors.primary,
  },
  successText: {
    color: theme.colors.success,
  },
  warningText: {
    color: theme.colors.warning,
  },
  dangerText: {
    color: theme.colors.danger,
  },
  neutralText: {
    color: theme.colors.textMuted,
  },
  cycleText: {
    color: transactionCategoryColor('cycle'),
  },
});
