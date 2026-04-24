import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/lib/theme';

export interface SegmentedOption<T extends string> {
  readonly label: string;
  readonly value: T;
}

export interface SegmentedControlProps<T extends string> {
  readonly label?: string;
  readonly options: readonly SegmentedOption<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
}

export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <View style={styles.root}>
      {label ? <Text style={styles.controlLabel}>{label}</Text> : null}
      <View style={styles.container}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[styles.segment, selected ? styles.segmentSelected : null]}
          >
            <Text style={[styles.label, selected ? styles.labelSelected : null]}>{option.label}</Text>
          </Pressable>
        );
      })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 6,
  },
  controlLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    fontWeight: '700',
    marginLeft: 2,
  },
  container: {
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.medium,
    borderWidth: 1,
    flexDirection: 'row',
    padding: 4,
  },
  segment: {
    alignItems: 'center',
    borderRadius: theme.radius.medium,
    flex: 1,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: theme.spacing.sm,
  },
  segmentSelected: {
    backgroundColor: theme.colors.elevated,
    ...theme.shadow.card,
  },
  label: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    fontWeight: '700',
  },
  labelSelected: {
    color: theme.colors.text,
  },
});
