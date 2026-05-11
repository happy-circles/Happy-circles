import type { PropsWithChildren, ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';

import { CardActorAvatar } from '@/components/card-actor-avatar';
import { CardPressable } from '@/components/card-shell';
import type { AppHapticFeedback } from '@/lib/app-haptics';
import {
  cardStateIntentFromTone,
  type CardHaloIntensity,
  type CardStateIntent,
} from '@/lib/card-language';
import { theme } from '@/lib/theme';
import { transactionCategoryColor } from '@/lib/transaction-categories';
import { StatusChip } from './status-chip';
import { SurfaceCard } from './surface-card';
import { AppText } from '@/components/app-text';

const META_SEPARATOR = ` ${String.fromCharCode(183)} `;

type PendingSnippetVariant = 'default' | 'muted' | 'accent' | 'elevated';
type PendingSnippetTone = 'primary' | 'success' | 'warning' | 'neutral' | 'danger' | 'cycle';
type PendingSnippetAmountTone = 'positive' | 'negative' | 'neutral' | 'danger';
type PendingSnippetPadding = 'sm' | 'md' | 'lg';

export interface PendingSnippetCardProps extends PropsWithChildren {
  readonly eyebrow: string;
  readonly title: string;
  readonly statusLabel: string;
  readonly statusTone?: 'primary' | 'success' | 'warning' | 'neutral' | 'danger' | 'cycle';
  readonly amountLabel?: string | null;
  readonly amountTone?: PendingSnippetAmountTone;
  readonly detail?: string | null;
  readonly meta?: string | null;
  readonly helperText?: string | null;
  readonly haptic?: AppHapticFeedback;
  readonly focused?: boolean;
  readonly haloColor?: string;
  readonly haloIntensity?: CardHaloIntensity;
  readonly leadingNode?: ReactNode;
  readonly variant?: PendingSnippetVariant;
  readonly tone?: PendingSnippetTone;
  readonly padding?: PendingSnippetPadding;
  readonly stateIntent?: CardStateIntent;
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
  haptic = 'selection',
  focused = false,
  haloColor,
  haloIntensity = 'strong',
  leadingNode,
  variant = 'default',
  tone = 'neutral',
  padding = 'md',
  stateIntent,
  style,
  onPress,
  children,
}: PendingSnippetCardProps) {
  const resolvedStateIntent = stateIntent ?? cardStateIntentFromTone(statusTone);
  const body = (
    <>
      <View style={styles.header}>
        {leadingNode ? (
          <CardActorAvatar
            haloColor={haloColor}
            haloIntensity={haloIntensity}
            haloSize={42}
            intent={resolvedStateIntent}
            size={34}
            tone={statusTone}
          >
            {leadingNode}
          </CardActorAvatar>
        ) : null}
        <View style={styles.copy}>
          <AppText style={styles.eyebrow}>{eyebrow}</AppText>
          <AppText style={styles.title}>{title}</AppText>
        </View>
        <StatusChip compact iconOnly label={statusLabel} tone={statusTone} />
      </View>

      {amountLabel ? (
        <AppText
          style={[
            styles.amount,
            amountTone === 'positive' ? styles.amountPositive : null,
            amountTone === 'negative' ? styles.amountNegative : null,
            amountTone === 'neutral' ? styles.amountNeutral : null,
            amountTone === 'danger' ? styles.amountDanger : null,
          ]}
        >
          {amountLabel}
        </AppText>
      ) : null}
      {detail ? <AppText style={styles.detail}>{detail}</AppText> : null}
      {meta ? (
        <AppText style={styles.meta}>{meta.replace(/\s*\|\s*/g, META_SEPARATOR)}</AppText>
      ) : null}
      {helperText ? <AppText style={styles.helper}>{helperText}</AppText> : null}
    </>
  );

  return (
    <SurfaceCard
      style={[
        styles.card,
        tone === 'primary' ? styles.cardPrimary : null,
        tone === 'success' ? styles.cardSuccess : null,
        tone === 'warning' ? styles.cardWarning : null,
        tone === 'neutral' ? styles.cardNeutral : null,
        tone === 'danger' ? styles.cardDanger : null,
        tone === 'cycle' ? styles.cardCycle : null,
        focused ? styles.cardFocused : null,
        style,
      ]}
      padding={padding}
      variant={variant}
    >
      {onPress ? (
        <CardPressable
          accessibilityRole="button"
          haptic={haptic}
          onPress={onPress}
          style={styles.pressable}
        >
          {body}
        </CardPressable>
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
    minHeight: 76,
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
  cardCycle: {
    borderLeftColor: transactionCategoryColor('cycle'),
    borderLeftWidth: 3,
  },
  cardFocused: {
    backgroundColor: theme.colors.primaryGhost,
    borderColor: 'rgba(26, 39, 68, 0.26)',
    ...theme.shadow.card,
  },
});
