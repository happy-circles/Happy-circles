import type { PropsWithChildren } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/lib/theme';
import { StatusChip } from './status-chip';
import { SurfaceCard } from './surface-card';

type PendingSnippetVariant = 'default' | 'muted' | 'accent' | 'elevated';
type PendingSnippetTone = 'primary' | 'success' | 'warning' | 'neutral' | 'danger';
type PendingSnippetAmountTone = 'positive' | 'negative' | 'neutral' | 'danger';

export interface PendingSnippetCardProps extends PropsWithChildren {
  readonly eyebrow: string;
  readonly title: string;
  readonly statusLabel: string;
  readonly statusTone?: 'primary' | 'success' | 'warning' | 'neutral' | 'danger';
  readonly amountLabel?: string | null;
  readonly amountTone?: PendingSnippetAmountTone;
  readonly detail?: string | null;
  readonly meta?: string | null;
  readonly helperText?: string | null;
  readonly variant?: PendingSnippetVariant;
  readonly tone?: PendingSnippetTone;
  readonly style?: StyleProp<ViewStyle>;
  readonly onPress?: () => void;
}

export function PendingSnippetCard({
  eyebrow,
  title,
  statusLabel,
  statusTone = 'neutral',
  amountLabel,
  amountTone = 'neutral',
  detail,
  meta,
  helperText,
  variant = 'default',
  tone = 'neutral',
  style,
  onPress,
  children,
}: PendingSnippetCardProps) {
  const body = (
    <>
      <View style={styles.header}>
        <View style={styles.copy}>
          <Text style={styles.eyebrow}>{eyebrow}</Text>
          <Text style={styles.title}>{title}</Text>
        </View>
        <StatusChip label={statusLabel} tone={statusTone} />
      </View>

      {amountLabel ? (
        <Text
          style={[
            styles.amount,
            amountTone === 'positive' ? styles.amountPositive : null,
            amountTone === 'negative' ? styles.amountNegative : null,
            amountTone === 'neutral' ? styles.amountNeutral : null,
            amountTone === 'danger' ? styles.amountDanger : null,
          ]}
        >
          {amountLabel}
        </Text>
      ) : null}
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      {meta ? <Text style={styles.meta}>{meta}</Text> : null}
      {helperText ? <Text style={styles.helper}>{helperText}</Text> : null}
    </>
  );

  return (
    <SurfaceCard
      padding="md"
      style={[
        styles.card,
        tone === 'primary' ? styles.cardPrimary : null,
        tone === 'success' ? styles.cardSuccess : null,
        tone === 'warning' ? styles.cardWarning : null,
        tone === 'neutral' ? styles.cardNeutral : null,
        tone === 'danger' ? styles.cardDanger : null,
        style,
      ]}
      variant={variant}
    >
      {onPress ? (
        <Pressable
          onPress={onPress}
          style={({ pressed }) => [styles.pressable, pressed ? styles.pressablePressed : null]}
        >
          {body}
        </Pressable>
      ) : (
        body
      )}
      {children ? <View style={styles.actions}>{children}</View> : null}
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: theme.spacing.sm,
    marginVertical: theme.spacing.xxs,
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  copy: {
    flex: 1,
    gap: 3,
  },
  eyebrow: {
    color: theme.colors.primary,
    fontSize: theme.typography.caption,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  title: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '800',
    letterSpacing: -0.2,
    lineHeight: 22,
  },
  amount: {
    color: theme.colors.text,
    fontSize: theme.typography.title3,
    fontWeight: '800',
    letterSpacing: -0.4,
    lineHeight: 24,
  },
  amountPositive: {
    color: theme.colors.success,
  },
  amountNegative: {
    color: theme.colors.warning,
  },
  amountNeutral: {
    color: theme.colors.text,
  },
  amountDanger: {
    color: theme.colors.danger,
  },
  detail: {
    color: theme.colors.text,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
  },
  meta: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    lineHeight: 16,
  },
  helper: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    lineHeight: 16,
  },
  actions: {
    gap: theme.spacing.xs,
  },
  pressable: {
    gap: theme.spacing.xs,
  },
  pressablePressed: {
    opacity: 0.94,
  },
  cardPrimary: {
    borderLeftColor: theme.colors.primary,
    borderLeftWidth: 3,
  },
  cardSuccess: {
    borderLeftColor: theme.colors.success,
    borderLeftWidth: 3,
  },
  cardWarning: {
    borderLeftColor: theme.colors.warning,
    borderLeftWidth: 3,
  },
  cardNeutral: {
    borderLeftColor: theme.colors.textMuted,
    borderLeftWidth: 3,
  },
  cardDanger: {
    borderLeftColor: theme.colors.danger,
    borderLeftWidth: 3,
  },
});
