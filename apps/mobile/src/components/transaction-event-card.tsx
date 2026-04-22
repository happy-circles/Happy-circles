import { Ionicons } from '@expo/vector-icons';
import { Link, type Href } from 'expo-router';
import type { PropsWithChildren } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppAvatar } from '@/components/app-avatar';
import { StatusChip, type StatusChipProps } from '@/components/status-chip';
import { SurfaceCard } from '@/components/surface-card';
import { theme } from '@/lib/theme';
import {
  transactionCategoryBackgroundColor,
  transactionCategoryColor,
  transactionCategoryIcon,
} from '@/lib/transaction-categories';

export interface TransactionEventCardProps extends PropsWithChildren {
  readonly accentColor: string;
  readonly actorAvatarUrl?: string | null;
  readonly actorFallbackColor: string;
  readonly actorLabel: string;
  readonly amountColor: string;
  readonly amountLabel?: string | null;
  readonly amountStruckThrough?: boolean;
  readonly badgeBackgroundColor?: string;
  readonly badgeColor?: string;
  readonly badgeIcon?: keyof typeof Ionicons.glyphMap;
  readonly category?: string | null;
  readonly context: string;
  readonly directionLabel?: string | null;
  readonly href?: Href;
  readonly meta?: string | null;
  readonly onPress?: () => void;
  readonly pending?: boolean;
  readonly statusLabel?: string | null;
  readonly statusTone?: StatusChipProps['tone'];
  readonly unread?: boolean;
  readonly variant?: 'default' | 'muted' | 'accent' | 'elevated';
}

export function TransactionEventCard({
  accentColor,
  actorAvatarUrl = null,
  actorFallbackColor,
  actorLabel,
  amountColor,
  amountLabel,
  amountStruckThrough = false,
  badgeBackgroundColor,
  badgeColor,
  badgeIcon,
  category,
  children,
  context,
  directionLabel,
  href,
  meta,
  onPress,
  pending = false,
  statusLabel,
  statusTone = 'neutral',
  unread = false,
  variant = 'default',
}: TransactionEventCardProps) {
  const safeCategory = category ?? 'other';
  const categoryIcon =
    badgeIcon ?? (transactionCategoryIcon(safeCategory) as keyof typeof Ionicons.glyphMap);
  const resolvedBadgeBackgroundColor =
    badgeBackgroundColor ?? transactionCategoryBackgroundColor(safeCategory);
  const resolvedBadgeColor = badgeColor ?? transactionCategoryColor(safeCategory);
  const hasAction = Boolean(href || onPress);
  const card = (
    <SurfaceCard
      padding="md"
      style={[
        styles.card,
        pending ? styles.pendingCard : null,
        { borderLeftColor: accentColor },
      ]}
      variant={variant}
    >
      <View style={styles.body}>
        <View style={styles.leading}>
          <View style={styles.avatarWrap}>
            <AppAvatar
              fallbackBackgroundColor={actorFallbackColor}
              fallbackTextColor={theme.colors.white}
              imageUrl={actorAvatarUrl}
              label={actorLabel}
              rounded={false}
              size={44}
            />
            <View
              style={[
                styles.categoryBadge,
                {
                  backgroundColor: resolvedBadgeBackgroundColor,
                  borderColor: pending ? '#fff9ed' : theme.colors.surface,
                },
              ]}
            >
              <Ionicons color={resolvedBadgeColor} name={categoryIcon} size={13} />
            </View>
          </View>
          <View style={styles.copy}>
            <Text numberOfLines={1} style={styles.actor}>
              {actorLabel}
            </Text>
            <Text numberOfLines={1} style={styles.context}>
              {context}
            </Text>
            {meta ? (
              <Text numberOfLines={1} style={styles.meta}>
                {meta}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.side}>
          {unread ? <View style={styles.unreadDot} /> : null}
          {statusLabel ? <StatusChip label={statusLabel} tone={statusTone} /> : null}
          {directionLabel ? (
            <Text numberOfLines={1} style={[styles.direction, { color: amountColor }]}>
              {directionLabel}
            </Text>
          ) : null}
          <View style={styles.amountRow}>
            {amountLabel ? (
              <Text
                numberOfLines={1}
                style={[
                  styles.amount,
                  { color: amountColor },
                  amountStruckThrough ? styles.amountStruckThrough : null,
                ]}
              >
                {amountLabel}
              </Text>
            ) : null}
            {hasAction ? (
              <Ionicons color={theme.colors.textMuted} name="chevron-forward" size={16} />
            ) : null}
          </View>
        </View>
      </View>
      {children ? <View style={styles.actions}>{children}</View> : null}
    </SurfaceCard>
  );

  if (href) {
    return (
      <Link href={href} asChild>
        <Pressable style={({ pressed }) => [pressed ? styles.pressed : null]}>{card}</Pressable>
      </Link>
    );
  }

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [pressed ? styles.pressed : null]}>
        {card}
      </Pressable>
    );
  }

  return card;
}

const styles = StyleSheet.create({
  card: {
    borderLeftWidth: 3,
    minHeight: 92,
  },
  pendingCard: {
    backgroundColor: '#fff9ed',
    borderColor: 'rgba(163, 95, 25, 0.14)',
  },
  body: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
    minHeight: 58,
  },
  leading: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    minWidth: 0,
  },
  avatarWrap: {
    height: 48,
    justifyContent: 'center',
    position: 'relative',
    width: 48,
  },
  categoryBadge: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    borderWidth: 2,
    bottom: -1,
    height: 22,
    justifyContent: 'center',
    position: 'absolute',
    right: -1,
    width: 22,
  },
  copy: {
    flex: 1,
    gap: 1,
    minWidth: 0,
  },
  actor: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '700',
    lineHeight: 19,
  },
  context: {
    color: theme.colors.text,
    fontSize: theme.typography.footnote,
    fontWeight: '600',
    lineHeight: 17,
  },
  meta: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    lineHeight: 16,
  },
  side: {
    alignItems: 'flex-end',
    gap: 4,
    minWidth: 88,
  },
  unreadDot: {
    backgroundColor: '#2f80ed',
    borderRadius: theme.radius.pill,
    height: 8,
    width: 8,
  },
  direction: {
    fontSize: theme.typography.caption,
    fontWeight: '600',
    lineHeight: 16,
    textAlign: 'right',
  },
  amountRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
    minHeight: 20,
  },
  amount: {
    fontSize: theme.typography.callout,
    fontWeight: '800',
    lineHeight: 20,
    textAlign: 'right',
  },
  amountStruckThrough: {
    opacity: 0.72,
    textDecorationLine: 'line-through',
  },
  actions: {
    gap: theme.spacing.xs,
  },
  pressed: {
    opacity: 0.6,
  },
});
