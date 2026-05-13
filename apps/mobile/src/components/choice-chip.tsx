import {
  Pressable,
  StyleSheet,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { theme } from '@/lib/theme';
import { AppText } from '@/components/app-text';
import { useAppTheme } from '@/providers/theme-provider';

export interface ChoiceChipProps {
  readonly label: string;
  readonly selected?: boolean;
  readonly onPress?: () => void;
  readonly style?: StyleProp<ViewStyle>;
  readonly labelStyle?: StyleProp<TextStyle>;
}

export function ChoiceChip({
  label,
  selected = false,
  onPress,
  style,
  labelStyle,
}: ChoiceChipProps) {
  const activeTheme = useAppTheme();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: selected ? activeTheme.colors.primarySoft : activeTheme.colors.surface,
          borderColor: selected ? activeTheme.colors.primary : activeTheme.colors.border,
        },
        pressed ? styles.pressed : null,
        style,
      ]}
    >
      <AppText
        style={[
          styles.label,
          { color: selected ? activeTheme.colors.text : activeTheme.colors.text },
          selected ? styles.selectedLabel : null,
          labelStyle,
        ]}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 54,
    minWidth: 86,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  selected: {
    backgroundColor: theme.colors.primarySoft,
    borderColor: theme.colors.primary,
  },
  pressed: {
    opacity: 0.88,
  },
  label: {
    color: theme.colors.text,
    fontSize: theme.typography.footnote,
    fontWeight: '700',
  },
  selectedLabel: {
    color: theme.colors.text,
  },
});
