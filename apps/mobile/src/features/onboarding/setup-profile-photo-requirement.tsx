import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { theme } from '@/lib/theme';
import { useAppTheme } from '@/providers/theme-provider';

export function SetupProfilePhotoRequirement({
  disabled,
  hasSavedPhoto,
  onPress,
}: {
  readonly disabled: boolean;
  readonly hasSavedPhoto: boolean;
  readonly onPress: () => void;
}) {
  const activeTheme = useAppTheme();

  return (
    <View
      style={[
        styles.photoRequirement,
        {
          backgroundColor: hasSavedPhoto
            ? activeTheme.colors.successSoft
            : activeTheme.colors.surfaceSoft,
          borderColor: hasSavedPhoto ? activeTheme.colors.successSoft : activeTheme.colors.border,
        },
      ]}
    >
      <View
        style={[
          styles.photoRequirementIcon,
          {
            backgroundColor: activeTheme.colors.elevated,
          },
        ]}
      >
        <Ionicons
          color={hasSavedPhoto ? activeTheme.colors.success : activeTheme.colors.textMuted}
          name={hasSavedPhoto ? 'checkmark' : 'camera'}
          size={18}
        />
      </View>
      <View style={styles.photoRequirementCopy}>
        <AppText style={[styles.photoRequirementTitle, { color: activeTheme.colors.text }]}>
          Foto de perfil
        </AppText>
        <AppText style={[styles.photoRequirementSubtitle, { color: activeTheme.colors.textMuted }]}>
          {hasSavedPhoto
            ? 'Lista para que tus círculos te reconozcan.'
            : 'Opcional; puedes agregarla ahora o despues.'}
        </AppText>
      </View>
      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [
          styles.photoRequirementAction,
          {
            backgroundColor: activeTheme.colors.elevated,
            borderColor: activeTheme.colors.border,
          },
          pressed && !disabled ? styles.pressed : null,
          disabled ? styles.disabledAction : null,
        ]}
      >
        <AppText
          style={[
            styles.photoRequirementActionText,
            { color: disabled ? activeTheme.colors.textMuted : activeTheme.colors.primaryStrong },
          ]}
        >
          {hasSavedPhoto ? 'Cambiar' : 'Agregar'}
        </AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  photoRequirement: {
    alignItems: 'center',
    borderRadius: theme.radius.medium,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  photoRequirementIcon: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  photoRequirementCopy: {
    flex: 1,
    gap: 2,
  },
  photoRequirementTitle: {
    fontSize: theme.typography.footnote,
    fontWeight: '800',
  },
  photoRequirementSubtitle: {
    fontSize: theme.typography.caption,
    fontWeight: '600',
    lineHeight: 16,
  },
  photoRequirementAction: {
    alignItems: 'center',
    borderRadius: theme.radius.small,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 36,
    minWidth: 76,
    paddingHorizontal: theme.spacing.sm,
  },
  photoRequirementActionText: {
    fontSize: theme.typography.caption,
    fontWeight: '800',
  },
  disabledAction: {
    opacity: 0.58,
  },
  pressed: {
    opacity: 0.9,
  },
});
