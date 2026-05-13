import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { theme } from '@/lib/theme';

export function SetupProfilePhotoRequirement({
  disabled,
  hasSavedPhoto,
  onPress,
}: {
  readonly disabled: boolean;
  readonly hasSavedPhoto: boolean;
  readonly onPress: () => void;
}) {
  return (
    <View
      style={[
        styles.photoRequirement,
        hasSavedPhoto ? styles.photoRequirementReady : styles.photoRequirementMissing,
      ]}
    >
      <View
        style={[
          styles.photoRequirementIcon,
          hasSavedPhoto ? styles.photoRequirementIconReady : styles.photoRequirementIconMissing,
        ]}
      >
        <Ionicons
          color={hasSavedPhoto ? theme.colors.success : theme.colors.textMuted}
          name={hasSavedPhoto ? 'checkmark' : 'camera'}
          size={18}
        />
      </View>
      <View style={styles.photoRequirementCopy}>
        <AppText style={styles.photoRequirementTitle}>Foto de perfil</AppText>
        <AppText style={styles.photoRequirementSubtitle}>
          {hasSavedPhoto
            ? 'Lista para que tus circulos te reconozcan.'
            : 'Opcional; puedes agregarla ahora o despues.'}
        </AppText>
      </View>
      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [
          styles.photoRequirementAction,
          pressed && !disabled ? styles.pressed : null,
          disabled ? styles.disabledAction : null,
        ]}
      >
        <AppText style={styles.photoRequirementActionText}>
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
  photoRequirementMissing: {
    backgroundColor: theme.colors.surfaceSoft,
    borderColor: theme.colors.border,
  },
  photoRequirementReady: {
    backgroundColor: theme.colors.successSoft,
    borderColor: theme.colors.successSoft,
  },
  photoRequirementIcon: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  photoRequirementIconMissing: {
    backgroundColor: theme.colors.surface,
  },
  photoRequirementIconReady: {
    backgroundColor: theme.colors.surface,
  },
  photoRequirementCopy: {
    flex: 1,
    gap: 2,
  },
  photoRequirementTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.footnote,
    fontWeight: '800',
  },
  photoRequirementSubtitle: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    fontWeight: '600',
    lineHeight: 16,
  },
  photoRequirementAction: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.small,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 36,
    minWidth: 76,
    paddingHorizontal: theme.spacing.sm,
  },
  photoRequirementActionText: {
    color: theme.colors.text,
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
