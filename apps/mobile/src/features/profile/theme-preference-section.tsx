import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { theme, type ThemePreference } from '@/lib/theme';
import { triggerAppSelectionHaptic } from '@/lib/app-haptics';
import { useAppTheme, useThemePreference } from '@/providers/theme-provider';

const THEME_OPTIONS: readonly {
  readonly icon: keyof typeof Ionicons.glyphMap;
  readonly label: string;
  readonly preference: ThemePreference;
  readonly subtitle: string;
}[] = [
  {
    icon: 'phone-portrait-outline',
    label: 'Sistema',
    preference: 'system',
    subtitle: 'Usa el modo del dispositivo',
  },
  {
    icon: 'sunny-outline',
    label: 'Claro',
    preference: 'light',
    subtitle: 'Fondo claro y alto contraste',
  },
  {
    icon: 'moon-outline',
    label: 'Oscuro',
    preference: 'dark',
    subtitle: 'Navy oscuro de Happy Circles',
  },
];

export function ThemePreferenceSection() {
  const activeTheme = useAppTheme();
  const { preference, scheme, setPreference } = useThemePreference();
  const resolvedLabel = scheme === 'dark' ? 'Oscuro' : 'Claro';

  return (
    <View style={[styles.sectionBlock, { borderTopColor: activeTheme.colors.hairline }]}>
      <View style={styles.sectionHeader}>
        <AppText style={[styles.sectionTitle, { color: activeTheme.colors.text }]}>
          Apariencia
        </AppText>
        {preference === 'system' ? (
          <AppText style={[styles.resolvedLabel, { color: activeTheme.colors.textMuted }]}>
            Sistema: {resolvedLabel}
          </AppText>
        ) : null}
      </View>

      <View style={styles.optionGroup}>
        {THEME_OPTIONS.map((option) => {
          const selected = preference === option.preference;

          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={option.preference}
              onPress={() => {
                triggerAppSelectionHaptic();
                void setPreference(option.preference);
              }}
              style={({ pressed }) => [
                styles.option,
                {
                  backgroundColor: selected
                    ? activeTheme.colors.primarySoft
                    : activeTheme.colors.surface,
                  borderColor: selected ? activeTheme.colors.primary : activeTheme.colors.border,
                  opacity: pressed ? 0.72 : 1,
                },
              ]}
            >
              <View
                style={[
                  styles.optionIcon,
                  {
                    backgroundColor: selected
                      ? activeTheme.colors.primaryGhost
                      : activeTheme.colors.surfaceSoft,
                  },
                ]}
              >
                <Ionicons
                  color={selected ? activeTheme.colors.primary : activeTheme.colors.textMuted}
                  name={option.icon}
                  size={18}
                />
              </View>
              <View style={styles.optionCopy}>
                <AppText style={[styles.optionLabel, { color: activeTheme.colors.text }]}>
                  {option.label}
                </AppText>
                <AppText style={[styles.optionSubtitle, { color: activeTheme.colors.textMuted }]}>
                  {option.subtitle}
                </AppText>
              </View>
              {selected ? (
                <Ionicons color={activeTheme.colors.primary} name="checkmark-circle" size={20} />
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionBlock: {
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: theme.spacing.md,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.md,
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: theme.typography.body,
    fontWeight: '800',
  },
  resolvedLabel: {
    fontSize: theme.typography.caption,
    fontWeight: '700',
  },
  optionGroup: {
    gap: theme.spacing.sm,
  },
  option: {
    alignItems: 'center',
    borderRadius: theme.radius.medium,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    minHeight: 62,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  optionIcon: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  optionCopy: {
    flex: 1,
    gap: 3,
  },
  optionLabel: {
    fontSize: theme.typography.callout,
    fontWeight: '800',
  },
  optionSubtitle: {
    fontSize: theme.typography.footnote,
    lineHeight: 18,
  },
});
