import type { PropsWithChildren, ReactNode } from 'react';
import type { AccessibilityRole, StyleProp, ViewStyle } from 'react-native';

import { AppCardShell } from '@/components/card-shell';
import type { AppHapticFeedback } from '@/lib/app-haptics';

type ActivityItemCardVariant = 'default' | 'muted' | 'accent' | 'elevated';

export interface ActivityItemCardProps extends PropsWithChildren {
  readonly accentColor?: string;
  readonly attentionDot?: boolean;
  readonly compact?: boolean;
  readonly contextNode?: ReactNode;
  readonly leadingAccessibilityLabel?: string;
  readonly leadingAccessibilityRole?: AccessibilityRole;
  readonly leadingDisabled?: boolean;
  readonly leadingHaptic?: AppHapticFeedback;
  readonly leadingNode: ReactNode;
  readonly metaNode?: ReactNode;
  readonly onLeadingPress?: () => void;
  readonly sideNode?: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
  readonly title: string;
  readonly titleAccessoryNode?: ReactNode;
  readonly underlay?: ReactNode;
  readonly unread?: boolean;
  readonly unreadSurfaceColor?: string;
  readonly variant?: ActivityItemCardVariant;
}

export function ActivityItemCard({
  accentColor,
  attentionDot = false,
  children,
  compact = false,
  contextNode,
  leadingAccessibilityLabel,
  leadingAccessibilityRole,
  leadingDisabled,
  leadingHaptic,
  leadingNode,
  metaNode,
  onLeadingPress,
  sideNode,
  style,
  title,
  titleAccessoryNode,
  underlay,
  unread = false,
  unreadSurfaceColor,
  variant = 'default',
}: ActivityItemCardProps) {
  return (
    <AppCardShell
      accentColor={accentColor}
      attentionDot={attentionDot}
      compact={compact}
      contextNode={contextNode}
      leadingAccessibilityLabel={leadingAccessibilityLabel}
      leadingAccessibilityRole={leadingAccessibilityRole}
      leadingDisabled={leadingDisabled}
      leadingHaptic={leadingHaptic}
      leadingNode={leadingNode}
      metaNode={metaNode}
      onLeadingPress={onLeadingPress}
      sideNode={sideNode}
      style={style}
      title={title}
      titleAccessoryNode={titleAccessoryNode}
      underlay={underlay}
      unread={unread}
      unreadSurfaceColor={unreadSurfaceColor}
      variant={variant}
    >
      {children}
    </AppCardShell>
  );
}
