import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { theme } from '@/lib/theme';

import { AppText } from './app-text';

type AvatarOption = {
  readonly icon: keyof typeof Ionicons.glyphMap;
  readonly label: string;
  readonly onPress: () => void;
};

function AvatarOptionRow({ icon, label, onPress }: AvatarOption) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.optionRow, pressed ? styles.pressed : null]}
    >
      <View style={styles.optionIcon}>
        <Ionicons color={theme.colors.text} name={icon} size={20} />
      </View>
      <AppText style={styles.optionLabel}>{label}</AppText>
    </Pressable>
  );
}

export function AvatarOptionsSheet({
  canViewPhoto,
  onChoosePhoto,
  onClose,
  onTakePhoto,
  onViewPhoto,
  visible,
}: {
  readonly canViewPhoto: boolean;
  readonly onChoosePhoto: () => void;
  readonly onClose: () => void;
  readonly onTakePhoto: () => void;
  readonly onViewPhoto: () => void;
  readonly visible: boolean;
}) {
  const insets = useSafeAreaInsets();
  const options: readonly AvatarOption[] = [
    ...(canViewPhoto
      ? [{ icon: 'eye-outline' as const, label: 'Ver foto', onPress: onViewPhoto }]
      : []),
    { icon: 'camera-outline', label: 'Tomar foto', onPress: onTakePhoto },
    { icon: 'images-outline', label: 'Elegir foto', onPress: onChoosePhoto },
  ];

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View style={styles.scrim}>
        <Pressable accessibilityLabel="Cerrar opciones" onPress={onClose} style={styles.backdrop} />
        <View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(theme.spacing.lg, insets.bottom + theme.spacing.sm) },
          ]}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <AppText style={styles.title}>Foto de perfil</AppText>
            <Pressable
              accessibilityLabel="Cerrar opciones"
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => [styles.closeButton, pressed ? styles.pressed : null]}
            >
              <Ionicons color={theme.colors.text} name="close" size={22} />
            </Pressable>
          </View>
          <View style={styles.optionList}>
            {options.map((option) => (
              <AvatarOptionRow
                icon={option.icon}
                key={option.label}
                label={option.label}
                onPress={option.onPress}
              />
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    backgroundColor: theme.colors.overlay,
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radius.large,
    borderTopRightRadius: theme.radius.large,
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    ...theme.shadow.floating,
  },
  handle: {
    alignSelf: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.pill,
    height: 4,
    width: 42,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  title: {
    color: theme.colors.text,
    flex: 1,
    fontSize: theme.typography.body,
    fontWeight: '800',
  },
  closeButton: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  optionList: {
    gap: theme.spacing.xs,
  },
  optionRow: {
    alignItems: 'center',
    borderRadius: theme.radius.small,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    minHeight: 56,
    paddingHorizontal: theme.spacing.sm,
  },
  optionIcon: {
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radius.pill,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  optionLabel: {
    color: theme.colors.text,
    flex: 1,
    fontSize: theme.typography.callout,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.7,
  },
});
