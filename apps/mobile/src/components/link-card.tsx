import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { theme } from '@/lib/theme';

export interface LinkCardProps {
  readonly href:
    | '/auth'
    | '/home'
    | '/balances'
    | '/relationships'
    | '/inbox'
    | '/audit'
    | '/requests/new'
    | `/relationship/${string}`
    | `/settlements/${string}`;
  readonly title: string;
  readonly subtitle: string;
}

export function LinkCard({ href, title, subtitle }: LinkCardProps) {
  return (
    <Link href={href} asChild>
      <Pressable style={styles.card}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </Pressable>
    </Link>
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
});
