import { StyleSheet, Text, View } from 'react-native';

import { formatCop } from '@/lib/data';
import { theme } from '@/lib/theme';

export interface StatCardProps {
  readonly label: string;
  readonly amountMinor: number;
}

export function StatCard({ label, amountMinor }: StatCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{formatCop(amountMinor)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.medium,
    borderWidth: 1,
    gap: theme.spacing.xs,
    padding: theme.spacing.md,
  },
  label: {
    color: theme.colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  value: {
    color: theme.colors.text,
    fontSize: 24,
    fontWeight: '800',
  },
});
