import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useResolvedAvatarUrl } from '@/lib/avatar';
import { theme } from '@/lib/theme';

import { AppAvatar } from './app-avatar';

export interface AvatarViewerModalProps {
  readonly imageUrl?: string | null;
  readonly label: string;
  readonly onClose: () => void;
  readonly visible: boolean;
}

export function AvatarViewerModal({ imageUrl, label, onClose, visible }: AvatarViewerModalProps) {
  const resolvedImageUrl = useResolvedAvatarUrl(imageUrl);
  const [hasImageError, setHasImageError] = useState(false);

  useEffect(() => {
    setHasImageError(false);
  }, [resolvedImageUrl, visible]);

  const canShowImage = Boolean(resolvedImageUrl && !hasImageError);

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

          {canShowImage ? (
            <Image
              onError={() => setHasImageError(true)}
              source={{ uri: resolvedImageUrl as string }}
              style={styles.photo}
            />
          ) : (
            <AppAvatar
              fallbackBackgroundColor={theme.colors.primarySoft}
              fallbackTextColor={theme.colors.primary}
              imageUrl={null}
              label={label}
              size={240}
            />
          )}

          <Text numberOfLines={2} style={styles.label}>
            {label}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    backgroundColor: 'rgba(14, 20, 29, 0.78)',
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
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderRadius: theme.radius.pill,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  photo: {
    borderColor: 'rgba(255, 255, 255, 0.32)',
    borderRadius: 120,
    borderWidth: 2,
    height: 240,
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
