import type { PropsWithChildren, ReactNode } from 'react';
import type { AccessibilityRole, GestureResponderEvent, StyleProp, ViewStyle } from 'react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { StatusChip, type StatusChipProps } from '@/components/status-chip';
import {
  SurfaceCard,
  type SurfaceCardPadding,
  type SurfaceCardVariant,
} from '@/components/surface-card';
import { triggerAppHaptic, type AppHapticFeedback } from '@/lib/app-haptics';
import { theme } from '@/lib/theme';

export type CardTone = 'primary' | 'success' | 'warning' | 'neutral' | 'danger' | 'cycle';

export interface CardPressableProps extends PropsWithChildren {
  readonly accessibilityLabel?: string;
  readonly accessibilityRole?: AccessibilityRole;
  readonly disabled?: boolean;
  readonly haptic?: AppHapticFeedback;
  readonly onPress?: (event: GestureResponderEvent) => void;
  readonly style?: StyleProp<ViewStyle>;
}

export function CardPressable({
  accessibilityLabel,
  accessibilityRole,
  children,
  disabled = false,
  haptic = 'none',
  onPress,
  style,
}: CardPressableProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      disabled={disabled}
      onPress={(event) => {
        if (disabled) {
          return;
        }

        triggerAppHaptic(haptic);
        onPress?.(event);
      }}
      style={({ pressed }) => [
        styles.pressable,
        pressed && !disabled ? styles.pressablePressed : null,
        disabled ? styles.pressableDisabled : null,
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

export interface AppCardShellProps extends PropsWithChildren {
  readonly accentColor?: string;
  readonly attentionDot?: boolean;
  readonly compact?: boolean;
  readonly contextNode?: ReactNode;
  readonly leadingAccessibilityLabel?: string;
  readonly leadingAccessibilityRole?: AccessibilityRole;
  readonly leadingDisabled?: boolean;
  readonly leadingHaptic?: AppHapticFeedback;
  readonly leadingNode?: ReactNode;
  readonly metaNode?: ReactNode;
  readonly onLeadingPress?: () => void;
  readonly padding?: SurfaceCardPadding;
  readonly sideNode?: ReactNode;
  readonly statusLabel?: string | null;
  readonly statusTone?: StatusChipProps['tone'];
  readonly style?: StyleProp<ViewStyle>;
  readonly title: ReactNode;
  readonly titleAccessoryNode?: ReactNode;
  readonly unread?: boolean;
  readonly unreadSurfaceColor?: string;
  readonly variant?: SurfaceCardVariant;
}

export function AppCardShell({
  accentColor,
  attentionDot = false,
  children,
  compact = false,
  contextNode,
  leadingAccessibilityLabel,
  leadingAccessibilityRole,
  leadingDisabled,
  leadingHaptic = 'none',
  leadingNode,
  metaNode,
  onLeadingPress,
  padding,
  sideNode,
  statusLabel,
  statusTone = 'neutral',
  style,
  title,
  titleAccessoryNode,
  unread = false,
  unreadSurfaceColor,
  variant = 'default',
}: AppCardShellProps) {
  const hasLeadingAction = Boolean(onLeadingPress);
  const unreadTintColor =
    unreadSurfaceColor ?? (accentColor ? withAlpha(accentColor, 0.1) : theme.colors.primaryGhost);
  const leadingContent = (
    <>
      {leadingNode}
      <View style={[styles.copy, compact ? styles.copyCompact : null]}>
        <View style={styles.titleRow}>
          {typeof title === 'string' ? (
            <AppText
              numberOfLines={1}
              style={[styles.title, compact ? styles.titleCompact : null]}
            >
              {title}
            </AppText>
          ) : (
            title
          )}
          {titleAccessoryNode}
          {statusLabel ? (
            <StatusChip compact iconOnly label={statusLabel} tone={statusTone} />
          ) : null}
        </View>
        {contextNode}
        {metaNode}
      </View>
    </>
  );

  return (
    <SurfaceCard
      padding={padding ?? (compact ? 'sm' : 'md')}
      shape="pill"
      style={[
        styles.card,
        compact ? styles.cardCompact : null,
        style,
      ]}
      variant={variant}
    >
      {unread ? (
        <View
          pointerEvents="none"
          style={[
            styles.unreadSurfaceFilm,
            compact ? styles.unreadSurfaceFilmCompact : null,
            { backgroundColor: unreadTintColor },
          ]}
        />
      ) : null}
      <View style={[styles.body, compact ? styles.bodyCompact : null]}>
        {hasLeadingAction ? (
          <CardPressable
            accessibilityLabel={leadingAccessibilityLabel}
            accessibilityRole={leadingAccessibilityRole ?? 'button'}
            disabled={leadingDisabled}
            haptic={leadingHaptic}
            onPress={onLeadingPress}
            style={[styles.leadingGroup, compact ? styles.leadingGroupCompact : null]}
          >
            {leadingContent}
          </CardPressable>
        ) : (
          <View style={[styles.leadingGroup, compact ? styles.leadingGroupCompact : null]}>
            {leadingContent}
          </View>
        )}
        {sideNode ? (
          <View style={[styles.side, compact ? styles.sideCompact : null]}>{sideNode}</View>
        ) : null}
      </View>
      {attentionDot ? <View pointerEvents="none" style={styles.pendingCornerDot} /> : null}
      {children ? <View style={styles.footer}>{children}</View> : null}
    </SurfaceCard>
  );
}

function withAlpha(color: string, alpha: number): string {
  const normalized = color.trim();
  const compactHexMatch = normalized.match(/^#([\da-f]{3})$/i);
  if (compactHexMatch) {
    const [r, g, b] = compactHexMatch[1].split('').map((entry) => entry + entry);
    return withAlpha(`#${r}${g}${b}`, alpha);
  }

  const hexMatch = normalized.match(/^#([\da-f]{6})$/i);
  if (!hexMatch) {
    return color;
  }

  const rawHex = hexMatch[1];
  const red = Number.parseInt(rawHex.slice(0, 2), 16);
  const green = Number.parseInt(rawHex.slice(2, 4), 16);
  const blue = Number.parseInt(rawHex.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export interface CardTimelineStep {
  readonly amountLabel?: string | null;
  readonly detail?: string | null;
  readonly id: string;
  readonly leadingNode?: ReactNode;
  readonly meta?: string | null;
  readonly tone?: CardTone;
  readonly title: string;
}

export function CardTimeline({ steps }: { readonly steps: readonly CardTimelineStep[] }) {
  return (
    <View style={styles.timeline}>
      {steps.map((step, index) => (
        <View key={step.id} style={styles.timelineRow}>
          <View style={styles.timelineRail}>
            <View style={[styles.timelineMarker, timelineToneStyle(step.tone ?? 'neutral')]} />
            {index < steps.length - 1 ? <View style={styles.timelineLine} /> : null}
          </View>
          <View style={styles.timelineBody}>
            <View style={styles.timelineTop}>
              <View style={styles.timelineTitleRow}>
                {step.leadingNode}
                <AppText style={styles.timelineTitle}>{step.title}</AppText>
              </View>
              {step.amountLabel ? (
                <AppText
                  style={[styles.timelineAmount, timelineTextToneStyle(step.tone ?? 'neutral')]}
                >
                  {step.amountLabel}
                </AppText>
              ) : null}
            </View>
            {step.detail ? <AppText style={styles.timelineDetail}>{step.detail}</AppText> : null}
            {step.meta ? <AppText style={styles.timelineMeta}>{step.meta}</AppText> : null}
          </View>
        </View>
      ))}
    </View>
  );
}

function timelineToneStyle(tone: CardTone) {
  if (tone === 'primary') {
    return styles.timelineMarkerPrimary;
  }
  if (tone === 'success') {
    return styles.timelineMarkerSuccess;
  }
  if (tone === 'warning') {
    return styles.timelineMarkerWarning;
  }
  if (tone === 'danger') {
    return styles.timelineMarkerDanger;
  }
  if (tone === 'cycle') {
    return styles.timelineMarkerCycle;
  }

  return styles.timelineMarkerNeutral;
}

function timelineTextToneStyle(tone: CardTone) {
  if (tone === 'primary') {
    return styles.timelineTextPrimary;
  }
  if (tone === 'success') {
    return styles.timelineTextSuccess;
  }
  if (tone === 'warning') {
    return styles.timelineTextWarning;
  }
  if (tone === 'danger') {
    return styles.timelineTextDanger;
  }
  if (tone === 'cycle') {
    return styles.timelineTextCycle;
  }

  return styles.timelineTextNeutral;
}

const styles = StyleSheet.create({
  pressable: {
    borderRadius: theme.radius.medium,
  },
  pressablePressed: {
    opacity: 0.86,
    transform: [{ scale: 0.997 }],
  },
  pressableDisabled: {
    opacity: 0.58,
  },
  card: {
    minHeight: 92,
  },
  cardCompact: {
    minHeight: 68,
  },
  body: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
    minHeight: 58,
  },
  bodyCompact: {
    minHeight: 44,
  },
  leadingGroup: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    minWidth: 0,
  },
  leadingGroupCompact: {
    gap: 10,
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
    minWidth: 82,
  },
  unreadSurfaceFilm: {
    borderRadius: theme.radius.large,
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  unreadSurfaceFilmCompact: {
    borderRadius: theme.radius.pill,
  },
  pendingCornerDot: {
    backgroundColor: '#2f80ed',
    borderRadius: theme.radius.pill,
    height: 9,
    position: 'absolute',
    right: 9,
    top: 9,
    width: 9,
  },
  footer: {
    gap: theme.spacing.xs,
  },
  timeline: {
    borderTopColor: theme.colors.hairline,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
  },
  timelineRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  timelineRail: {
    alignItems: 'center',
    width: 14,
  },
  timelineMarker: {
    borderRadius: theme.radius.pill,
    height: 10,
    marginTop: 4,
    width: 10,
  },
  timelineMarkerPrimary: {
    backgroundColor: theme.colors.primary,
  },
  timelineMarkerSuccess: {
    backgroundColor: theme.colors.success,
  },
  timelineMarkerWarning: {
    backgroundColor: theme.colors.warning,
  },
  timelineMarkerNeutral: {
    backgroundColor: theme.colors.textMuted,
  },
  timelineMarkerDanger: {
    backgroundColor: theme.colors.warning,
  },
  timelineMarkerCycle: {
    backgroundColor: '#2563eb',
  },
  timelineLine: {
    backgroundColor: theme.colors.hairline,
    flex: 1,
    marginTop: 4,
    width: 1,
  },
  timelineBody: {
    flex: 1,
    gap: 4,
  },
  timelineTop: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  timelineTitleRow: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    minWidth: 0,
    paddingRight: theme.spacing.sm,
  },
  timelineTitle: {
    color: theme.colors.text,
    flexShrink: 1,
    fontSize: theme.typography.footnote,
    fontWeight: '700',
    lineHeight: 18,
  },
  timelineAmount: {
    flexShrink: 0,
    fontSize: theme.typography.footnote,
    fontWeight: '800',
    lineHeight: 17,
  },
  timelineDetail: {
    color: theme.colors.text,
    fontSize: theme.typography.caption,
    lineHeight: 16,
  },
  timelineMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    lineHeight: 16,
  },
  timelineTextPrimary: {
    color: theme.colors.primary,
  },
  timelineTextSuccess: {
    color: theme.colors.success,
  },
  timelineTextWarning: {
    color: theme.colors.warning,
  },
  timelineTextNeutral: {
    color: theme.colors.textMuted,
  },
  timelineTextDanger: {
    color: theme.colors.warning,
  },
  timelineTextCycle: {
    color: '#2563eb',
  },
});
