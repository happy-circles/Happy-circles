import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { PropsWithChildren, ReactNode } from 'react';
import type { AccessibilityRole, StyleProp, ViewStyle } from 'react-native';

import { theme } from '@/lib/theme';
import { SurfaceCard } from './surface-card';

type ActivityItemCardVariant = 'default' | 'muted' | 'accent' | 'elevated';

export interface ActivityItemCardProps extends PropsWithChildren {
  readonly accentColor: string;
  readonly compact?: boolean;
  readonly contextNode?: ReactNode;
  readonly leadingAccessibilityLabel?: string;
  readonly leadingAccessibilityRole?: AccessibilityRole;
  readonly leadingDisabled?: boolean;
  readonly leadingNode: ReactNode;
  readonly metaNode?: ReactNode;
  readonly onLeadingPress?: () => void;
  readonly pendingBorderColor?: string;
  readonly pendingSurfaceColor?: string;
  readonly sideNode?: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
  readonly title: string;
  readonly titleAccessoryNode?: ReactNode;
  readonly unread?: boolean;
  readonly variant?: ActivityItemCardVariant;
}

export function ActivityItemCard({
  accentColor,
  children,
  compact = false,
  contextNode,
  leadingAccessibilityLabel,
  leadingAccessibilityRole,
  leadingDisabled,
  leadingNode,
  metaNode,
  onLeadingPress,
  pendingBorderColor,
  pendingSurfaceColor,
  sideNode,
  style,
  title,
  titleAccessoryNode,
  unread = false,
  variant = 'default',
}: ActivityItemCardProps) {
  const hasLeadingAction = Boolean(onLeadingPress);
  const hasPendingTreatment = Boolean(pendingSurfaceColor || pendingBorderColor);

  return (
    <SurfaceCard
      padding={compact ? 'sm' : 'md'}
      style={[
        styles.card,
        compact ? styles.cardCompact : null,
        hasPendingTreatment
          ? [
              styles.pendingCard,
              pendingSurfaceColor ? { backgroundColor: pendingSurfaceColor } : null,
              pendingBorderColor ? { borderColor: pendingBorderColor } : null,
            ]
          : null,
        { borderLeftColor: accentColor },
        style,
      ]}
      variant={variant}
    >
      <View style={[styles.body, compact ? styles.bodyCompact : null]}>
        <Pressable
          accessibilityLabel={hasLeadingAction ? leadingAccessibilityLabel : undefined}
          accessibilityRole={hasLeadingAction ? (leadingAccessibilityRole ?? 'button') : undefined}
          disabled={leadingDisabled ?? !hasLeadingAction}
          onPress={hasLeadingAction ? onLeadingPress : undefined}
          style={({ pressed }) => [
            styles.leading,
            compact ? styles.leadingCompact : null,
            hasLeadingAction ? styles.leadingAction : null,
            pressed ? styles.leadingPressed : null,
          ]}
        >
          {leadingNode}
          <View style={[styles.copy, compact ? styles.copyCompact : null]}>
            <View style={styles.titleRow}>
              <Text numberOfLines={1} style={[styles.title, compact ? styles.titleCompact : null]}>
                {title}
              </Text>
              {titleAccessoryNode}
            </View>
            {contextNode}
            {metaNode}
          </View>
        </Pressable>

        {sideNode ? (
          <View style={[styles.side, compact ? styles.sideCompact : null]}>{sideNode}</View>
        ) : null}
      </View>
      {unread ? <View pointerEvents="none" style={styles.unreadCornerDot} /> : null}
      {children ? <View style={styles.actions}>{children}</View> : null}
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  card: {
    borderLeftWidth: 3,
    minHeight: 92,
  },
  cardCompact: {
    borderRadius: theme.radius.medium,
    minHeight: 76,
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
  bodyCompact: {
    minHeight: 48,
  },
  leading: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    minWidth: 0,
  },
  leadingCompact: {
    gap: 10,
  },
  leadingAction: {
    borderRadius: theme.radius.medium,
  },
  leadingPressed: {
    opacity: 0.72,
  },
  copy: {
    flex: 1,
    gap: 1,
    minWidth: 0,
  },
  copyCompact: {
    gap: 2,
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    minWidth: 0,
  },
  title: {
    color: theme.colors.text,
    flexShrink: 1,
    fontSize: theme.typography.callout,
    fontWeight: '700',
    lineHeight: 19,
  },
  titleCompact: {
    fontWeight: '800',
    lineHeight: 18,
  },
  side: {
    alignItems: 'flex-end',
    gap: 4,
    minWidth: 88,
  },
  sideCompact: {
    gap: 3,
    minWidth: 92,
  },
  unreadCornerDot: {
    backgroundColor: '#2f80ed',
    borderRadius: theme.radius.pill,
    height: 9,
    position: 'absolute',
    right: 9,
    top: 9,
    width: 9,
  },
  actions: {
    gap: theme.spacing.xs,
  },
});
