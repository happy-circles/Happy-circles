import type { PropsWithChildren } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';

import { theme } from '@/lib/theme';

type SurfaceCardVariant = 'default' | 'muted' | 'accent' | 'elevated';
type SurfaceCardPadding = 'sm' | 'md' | 'lg';

export interface SurfaceCardProps extends PropsWithChildren {
  readonly style?: StyleProp<ViewStyle>;
  readonly variant?: SurfaceCardVariant;
  readonly padding?: SurfaceCardPadding;
}

export function SurfaceCard({
  children,
  style,
  variant = 'default',
  padding = 'md',
}: SurfaceCardProps) {
  return (
    <View
      style={[
        styles.base,
        variant === 'default' ? styles.default : null,
        variant === 'muted' ? styles.muted : null,
        variant === 'accent' ? styles.accent : null,
        variant === 'elevated' ? styles.elevated : null,
        padding === 'sm' ? styles.paddingSm : null,
        padding === 'md' ? styles.paddingMd : null,
        padding === 'lg' ? styles.paddingLg : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderColor: theme.colors.border,
    borderRadius: theme.radius.large,
    borderWidth: 1,
    gap: theme.spacing.sm,
    position: 'relative',
  },
  default: {
    backgroundColor: theme.colors.surface,
  },
  muted: {
    backgroundColor: theme.colors.surfaceMuted,
  },
  accent: {
    backgroundColor: theme.colors.accentSoft,
    borderColor: 'rgba(230, 186, 107, 0.32)',
  },
  elevated: {
    backgroundColor: theme.colors.elevated,
    borderColor: 'rgba(255, 255, 255, 0.72)',
    ...theme.shadow.card,
  },
  paddingSm: {
    padding: theme.spacing.sm,
  },
  paddingMd: {
    padding: theme.spacing.md,
  },
  paddingLg: {
    padding: theme.spacing.lg,
  },
});
