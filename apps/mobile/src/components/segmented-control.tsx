import { Pressable, StyleSheet, View } from 'react-native';

import { theme } from '@/lib/theme';
import { AppText } from '@/components/app-text';
import { useAppTheme } from '@/providers/theme-provider';

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
  const activeTheme = useAppTheme();

  return (
    <View style={styles.root}>
      {label ? (
        <AppText style={[styles.controlLabel, { color: activeTheme.colors.textMuted }]}>
          {label}
        </AppText>
      ) : null}
      <View
        accessibilityLabel={label}
        accessibilityRole="radiogroup"
        style={[
          styles.container,
          {
            backgroundColor: activeTheme.colors.surfaceMuted,
            borderColor: activeTheme.colors.border,
          },
        ]}
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              key={option.value}
              onPress={() => onChange(option.value)}
              style={({ pressed }) => [
                styles.segment,
                selected
                  ? [
                      styles.segmentSelected,
                      {
                        backgroundColor: activeTheme.colors.elevated,
                        borderColor: activeTheme.colors.hairline,
                      },
                      activeTheme.shadow.card,
                    ]
                  : null,
                pressed ? styles.segmentPressed : null,
              ]}
            >
              <AppText
                style={[
                  styles.optionLabel,
                  {
                    color: selected
                      ? activeTheme.colors.text
                      : activeTheme.colors.textMuted,
                  },
                ]}
              >
                {option.label}
              </AppText>
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
    fontSize: theme.typography.caption,
    fontWeight: '700',
    marginLeft: 2,
  },
  container: {
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
    borderWidth: StyleSheet.hairlineWidth,
  },
  segmentPressed: {
    opacity: 0.72,
  },
  optionLabel: {
    fontSize: theme.typography.footnote,
    fontWeight: '700',
  },
});
