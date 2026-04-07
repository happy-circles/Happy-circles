import type { PropsWithChildren } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { theme } from '@/lib/theme';

export interface ListCardProps extends PropsWithChildren {
  readonly title: string;
  readonly subtitle?: string;
  readonly trailing?: string;
}

export function ListCard({ title, subtitle, trailing, children }: ListCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.textWrap}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {trailing ? <Text style={styles.trailing}>{trailing}</Text> : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.medium,
    borderWidth: 1,
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  textWrap: {
    flex: 1,
    gap: 4,
  },
  title: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  subtitle: {
    color: theme.colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  trailing: {
    color: theme.colors.accent,
    fontSize: 14,
    fontWeight: '700',
  },
});
