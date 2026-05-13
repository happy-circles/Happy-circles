import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { theme, type ThemePreference } from '@/lib/theme';
import { triggerAppSelectionHaptic } from '@/lib/app-haptics';
import { useAppTheme, useThemePreference } from '@/providers/theme-provider';

import { ProfileStatusRow } from './profile-status-row';

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
    subtitle: 'Usa el modo del celular',
  },
  {
    icon: 'sunny-outline',
    label: 'Claro',
    preference: 'light',
    subtitle: 'Fondo claro',
  },
  {
    icon: 'moon-outline',
    label: 'Oscuro',
    preference: 'dark',
    subtitle: 'Fondo oscuro',
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
      </View>

      <View
        accessibilityLabel="Tema de la aplicacion"
        accessibilityRole="radiogroup"
        style={styles.sectionList}
      >
        {THEME_OPTIONS.map((option, index) => {
          const selected = preference === option.preference;
          const subtitle =
            option.preference === 'system'
              ? `${option.subtitle}: ${resolvedLabel}`
              : option.subtitle;

          return (
            <View key={option.preference}>
              {index > 0 ? (
                <View style={[styles.separator, { backgroundColor: activeTheme.colors.hairline }]} />
              ) : null}
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                onPress={() => {
                  triggerAppSelectionHaptic();
                  void setPreference(option.preference);
                }}
                style={({ pressed }) => [pressed ? styles.rowPressed : null]}
              >
                <ProfileStatusRow
                  icon={option.icon}
                  subtitle={subtitle}
                  title={option.label}
                  tone={selected ? 'primary' : 'muted'}
                  trailing={
                    selected ? (
                      <Ionicons
                        color={activeTheme.colors.primary}
                        name="checkmark-circle"
                        size={20}
                      />
                    ) : undefined
                  }
                />
              </Pressable>
            </View>
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
  sectionList: {
    gap: theme.spacing.sm,
  },
  rowPressed: {
    opacity: 0.72,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginBottom: theme.spacing.sm,
    width: '100%',
  },
});
