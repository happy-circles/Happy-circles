import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { directionVisual, type LedgerDirection } from '@/lib/direction-ui';
import { theme } from '@/lib/theme';

export interface DirectionPillProps {
  readonly direction: LedgerDirection;
  readonly onPress?: () => void;
  readonly selected?: boolean;
  readonly style?: StyleProp<ViewStyle>;
}

export function DirectionPill({ direction, onPress, selected = true, style }: DirectionPillProps) {
  const visual = directionVisual(direction);

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
          : styles.baseUnselected,
        pressed ? styles.pressed : null,
        style,
      ]}
    >
      <Ionicons color={visual.accentColor} name={visual.icon} size={18} />
      <Text style={[styles.label, { color: visual.accentColor }]}>{visual.label}</Text>
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
  baseUnselected: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
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
