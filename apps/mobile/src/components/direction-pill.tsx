import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { directionVisual, type LedgerDirection } from '@/lib/direction-ui';
import { theme } from '@/lib/theme';
import { AppText } from '@/components/app-text';
import { useAppTheme } from '@/providers/theme-provider';

export interface DirectionPillProps {
  readonly direction: LedgerDirection;
  readonly onPress?: () => void;
  readonly selected?: boolean;
  readonly style?: StyleProp<ViewStyle>;
}

export function DirectionPill({ direction, onPress, selected = true, style }: DirectionPillProps) {
  const activeTheme = useAppTheme();
  const visual = directionVisual(direction, activeTheme);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        selected
          ? {
              backgroundColor: visual.softBackgroundColor,
              borderColor: visual.borderColor,
            }
          : {
              backgroundColor: activeTheme.colors.surface,
              borderColor: activeTheme.colors.border,
            },
        pressed ? styles.pressed : null,
        style,
      ]}
    >
      <Ionicons color={visual.accentColor} name={visual.icon} size={18} />
      <AppText style={[styles.label, { color: visual.accentColor }]}>{visual.label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.xs,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  label: {
    fontSize: theme.typography.callout,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.94,
    transform: [{ scale: 0.99 }],
  },
});
