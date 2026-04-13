import type { PropsWithChildren } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { theme } from '@/lib/theme';

export interface FieldBlockProps extends PropsWithChildren {
  readonly label: string;
  readonly hint?: string;
  readonly error?: string | null;
}

export function FieldBlock({ label, hint, error, children }: FieldBlockProps) {
  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <Text style={[styles.label, error ? styles.labelError : null]}>{label}</Text>
        {hint ? <Text style={[styles.hint, error ? styles.hintError : null]}>{hint}</Text> : null}
      </View>
      {children}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: theme.spacing.xs,
  },
  header: {
    gap: 4,
  },
  label: {
    color: theme.colors.text,
    fontSize: theme.typography.footnote,
    fontWeight: '800',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  labelError: {
    color: theme.colors.danger,
  },
  hint: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    lineHeight: 16,
  },
  hintError: {
    color: theme.colors.danger,
  },
  error: {
    color: theme.colors.danger,
    fontSize: theme.typography.caption,
    fontWeight: '700',
    lineHeight: 16,
  },
});
