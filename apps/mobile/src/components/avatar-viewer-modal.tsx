import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Image as ExpoImage } from 'expo-image';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { isAvatarImageReady, rememberAvatarImageReady, useResolvedAvatarUrl } from '@/lib/avatar';
import { theme } from '@/lib/theme';

import { AppAvatar } from './app-avatar';
import { AppText } from '@/components/app-text';

export interface AvatarViewerModalProps {
  readonly imageUrl?: string | null;
  readonly label: string;
  readonly onClose: () => void;
  readonly visible: boolean;
}

export function AvatarViewerModal({ imageUrl, label, onClose, visible }: AvatarViewerModalProps) {
  const resolvedImageUrl = useResolvedAvatarUrl(imageUrl);
  const initialImageReady = isAvatarImageReady(imageUrl, resolvedImageUrl);
  const [hasImageError, setHasImageError] = useState(false);
  const [isImageLoaded, setIsImageLoaded] = useState(initialImageReady);

  useEffect(() => {
    setHasImageError(false);
    setIsImageLoaded(isAvatarImageReady(imageUrl, resolvedImageUrl));
  }, [imageUrl, resolvedImageUrl, visible]);

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

          <View style={styles.photoWrap}>
            <AppAvatar
              fallbackBackgroundColor={theme.colors.primarySoft}
              fallbackTextColor={theme.colors.primary}
              imageUrl={null}
              label={label}
              size={240}
            />
            {canShowImage ? (
              <ExpoImage
                cachePolicy="disk"
                contentFit="cover"
                onError={() => {
                  setHasImageError(true);
                  setIsImageLoaded(false);
                }}
                onLoad={() => {
                  rememberAvatarImageReady(imageUrl, resolvedImageUrl);
                  setIsImageLoaded(true);
                }}
                recyclingKey={resolvedImageUrl}
                source={resolvedImageUrl}
                style={[styles.photo, { opacity: isImageLoaded ? 1 : 0 }]}
                transition={isImageLoaded ? 0 : 160}
              />
            ) : null}
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
  photo: {
    ...StyleSheet.absoluteFillObject,
    borderColor: theme.glass.softEdge,
    borderRadius: 120,
    borderWidth: 2,
    height: 240,
    width: 240,
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
