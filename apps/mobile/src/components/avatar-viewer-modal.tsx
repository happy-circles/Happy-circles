import { Ionicons } from '@expo/vector-icons';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';

import { theme } from '@/lib/theme';
import { useAvatarViewerImage } from '@/lib/use-avatar-viewer-image';

import { AppAvatar } from './app-avatar';
import { AppText } from '@/components/app-text';

export interface AvatarViewerModalProps {
  readonly imageUrl?: string | null;
  readonly label: string;
  readonly onClose: () => void;
  readonly visible: boolean;
}

export function AvatarViewerModal({ imageUrl, label, onClose, visible }: AvatarViewerModalProps) {
  const imageRef = useAvatarViewerImage(imageUrl, visible);
  // Wait for the shared native image instead of downloading a cold photo again
  // through a separate URL source while that load is still pending.
  // Browser image elements also support external URLs whose CORS policy blocks loadAsync.
  const preparedImageUrl = Platform.OS === 'web' || imageRef ? imageUrl : undefined;

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.root}>
        <Pressable accessibilityLabel="Cerrar foto" onPress={onClose} style={styles.backdrop} />
        <View style={styles.content}>
          <Pressable
            accessibilityLabel="Cerrar foto"
            onPress={onClose}
            style={({ pressed }) => [styles.closeButton, pressed ? styles.pressed : null]}
          >
            <Ionicons color={theme.colors.white} name="close" size={22} />
          </Pressable>

          <View style={styles.photoWrap}>
            <AppAvatar
              fallbackBackgroundColor={theme.colors.primarySoft}
              fallbackTextColor={theme.colors.primary}
              imageUrl={preparedImageUrl}
              imageRef={imageRef}
              label={label}
              priority="high"
              size={240}
            />
            <View pointerEvents="none" style={styles.photoFrame} />
          </View>

          <AppText numberOfLines={2} style={styles.label}>
            {label}
          </AppText>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    backgroundColor: theme.colors.inverseOverlay,
    flex: 1,
    justifyContent: 'center',
    padding: theme.spacing.lg,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  content: {
    alignItems: 'center',
    gap: theme.spacing.md,
    maxWidth: 320,
    width: '100%',
  },
  closeButton: {
    alignItems: 'center',
    alignSelf: 'flex-end',
    backgroundColor: theme.colors.whiteAlphaStrong,
    borderRadius: theme.radius.pill,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  photoFrame: {
    ...StyleSheet.absoluteFillObject,
    borderColor: theme.glass.softEdge,
    borderRadius: 120,
    borderWidth: 2,
  },
  photoWrap: {
    borderRadius: 120,
    height: 240,
    overflow: 'hidden',
    width: 240,
  },
  label: {
    color: theme.colors.white,
    fontSize: theme.typography.title3,
    fontWeight: '800',
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.78,
  },
});
