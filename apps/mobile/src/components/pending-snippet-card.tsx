import type { PropsWithChildren, ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';

import { CardActorAvatar } from '@/components/card-actor-avatar';
import { CardPressable } from '@/components/card-shell';
import { StateAuraLayer, stateAuraVariantFromIntent } from '@/components/state-aura-layer';
import type { AppHapticFeedback } from '@/lib/app-haptics';
import {
  cardStateIntentFromTone,
  type CardHaloIntensity,
  type CardStateIntent,
} from '@/lib/card-language';
import { theme, type AppTheme } from '@/lib/theme';
import { transactionCategoryColor } from '@/lib/transaction-categories';
import { StatusChip } from './status-chip';
import { SurfaceCard } from './surface-card';
import { AppText } from '@/components/app-text';
import { useAppTheme } from '@/providers/theme-provider';

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
  readonly stateAura?: boolean;
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
  stateAura = false,
  style,
  onPress,
  children,
}: PendingSnippetCardProps) {
  const activeTheme = useAppTheme();
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
          <AppText style={[styles.eyebrow, { color: activeTheme.colors.primary }]}>
            {eyebrow}
          </AppText>
          <AppText style={[styles.title, { color: activeTheme.colors.text }]}>{title}</AppText>
        </View>
        <StatusChip compact iconOnly label={statusLabel} tone={statusTone} />
      </View>

      {amountLabel ? (
        <AppText
          style={[
            styles.amount,
            { color: pendingSnippetAmountColor(activeTheme, amountTone) },
          ]}
        >
          {amountLabel}
        </AppText>
      ) : null}
      {detail ? (
        <AppText style={[styles.detail, { color: activeTheme.colors.text }]}>{detail}</AppText>
      ) : null}
      {meta ? (
        <AppText style={[styles.meta, { color: activeTheme.colors.textMuted }]}>
          {meta.replace(/\s*\|\s*/g, META_SEPARATOR)}
        </AppText>
      ) : null}
      {helperText ? (
        <AppText style={[styles.helper, { color: activeTheme.colors.textMuted }]}>
          {helperText}
        </AppText>
      ) : null}
    </>
  );

  return (
    <SurfaceCard
      style={[
        styles.card,
        pendingSnippetToneStyle(activeTheme, tone),
        focused ? pendingSnippetFocusedStyle(activeTheme) : null,
        style,
      ]}
      padding={padding}
      underlay={
        stateAura ? (
          <StateAuraLayer
            size={focused || statusTone === 'warning' ? 'large' : 'regular'}
            variant={stateAuraVariantFromIntent(resolvedStateIntent, tone)}
          />
        ) : undefined
      }
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

function pendingSnippetAmountColor(
  activeTheme: AppTheme,
  amountTone: PendingSnippetAmountTone,
): string {
  if (amountTone === 'positive') {
    return activeTheme.colors.success;
  }
  if (amountTone === 'negative') {
    return activeTheme.colors.warning;
  }
  if (amountTone === 'danger') {
    return activeTheme.colors.danger;
  }

  return activeTheme.colors.text;
}

function pendingSnippetToneStyle(activeTheme: AppTheme, tone: PendingSnippetTone) {
  if (tone === 'primary') {
    return { borderLeftColor: activeTheme.colors.primary, borderLeftWidth: 3 };
  }
  if (tone === 'success') {
    return { borderLeftColor: activeTheme.colors.success, borderLeftWidth: 3 };
  }
  if (tone === 'warning') {
    return { borderLeftColor: activeTheme.colors.warning, borderLeftWidth: 3 };
  }
  if (tone === 'danger') {
    return { borderLeftColor: activeTheme.colors.danger, borderLeftWidth: 3 };
  }
  if (tone === 'cycle') {
    return { borderLeftColor: transactionCategoryColor('cycle'), borderLeftWidth: 3 };
  }

  return { borderLeftColor: activeTheme.colors.textMuted, borderLeftWidth: 3 };
}

function pendingSnippetFocusedStyle(activeTheme: AppTheme) {
  return {
    backgroundColor: activeTheme.colors.primaryGhost,
    borderColor: activeTheme.colors.primaryGhost,
    ...activeTheme.shadow.card,
  };
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
    borderColor: theme.colors.primaryGhost,
    ...theme.shadow.card,
  },
});
