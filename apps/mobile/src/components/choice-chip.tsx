import { Pressable, StyleSheet, Text } from 'react-native';

import { theme } from '@/lib/theme';

export interface ChoiceChipProps {
  readonly label: string;
  readonly selected?: boolean;
  readonly onPress?: () => void;
}

export function ChoiceChip({ label, selected = false, onPress }: ChoiceChipProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.base, selected ? styles.selected : null, pressed ? styles.pressed : null]}
    >
      <Text style={[styles.label, selected ? styles.selectedLabel : null]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 11,
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
    color: theme.colors.primary,
  },
});
