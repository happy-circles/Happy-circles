import { StyleSheet, Text, View } from 'react-native';

import { theme } from '@/lib/theme';

export interface StatusChipProps {
  readonly label: string;
  readonly tone?: 'primary' | 'success' | 'warning' | 'danger' | 'neutral';
}

export function StatusChip({ label, tone = 'neutral' }: StatusChipProps) {
  return (
    <View
      style={[
        styles.chip,
        tone === 'primary' ? styles.primary : null,
        tone === 'success' ? styles.success : null,
        tone === 'warning' ? styles.warning : null,
        tone === 'danger' ? styles.danger : null,
        tone === 'neutral' ? styles.neutral : null,
      ]}
    >
      <Text
        style={[
          styles.label,
          tone === 'primary' ? styles.primaryText : null,
          tone === 'success' ? styles.successText : null,
          tone === 'warning' ? styles.warningText : null,
          tone === 'danger' ? styles.dangerText : null,
          tone === 'neutral' ? styles.neutralText : null,
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
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
  },
  label: {
    fontSize: theme.typography.caption,
    fontWeight: '700',
    textTransform: 'uppercase',
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
    backgroundColor: theme.colors.surfaceMuted,
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
});
