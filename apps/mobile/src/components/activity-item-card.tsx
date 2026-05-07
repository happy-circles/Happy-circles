import type { PropsWithChildren, ReactNode } from 'react';
import type { AccessibilityRole, StyleProp, ViewStyle } from 'react-native';

import { AppCardShell } from '@/components/card-shell';

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
  return (
    <AppCardShell
      accentColor={accentColor}
      compact={compact}
      contextNode={contextNode}
      leadingAccessibilityLabel={leadingAccessibilityLabel}
      leadingAccessibilityRole={leadingAccessibilityRole}
      leadingDisabled={leadingDisabled}
      leadingNode={leadingNode}
      metaNode={metaNode}
      onLeadingPress={onLeadingPress}
      pendingBorderColor={pendingBorderColor}
      pendingSurfaceColor={pendingSurfaceColor}
      sideNode={sideNode}
      style={style}
      title={title}
      titleAccessoryNode={titleAccessoryNode}
      unread={unread}
      variant={variant}
    >
      {children}
    </AppCardShell>
  );
}
