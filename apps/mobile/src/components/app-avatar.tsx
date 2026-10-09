import { useEffect, useMemo, useState } from 'react';
import { Image as ExpoImage, type ImageRef } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import {
  HappyCirclesCenterSvg,
  resolveHappyCirclesPalette,
} from '@/components/happy-circles-glyph';
import {
  avatarImageCacheKey,
  buildAvatarLabel,
  isAvatarImageReady,
  rememberAvatarImageReady,
  useResolvedAvatarUrl,
} from '@/lib/avatar';
import { getPrefetchedAvatarImageRef } from '@/lib/avatar-prefetch';
import { AppText } from '@/components/app-text';
import { useAppTheme } from '@/providers/theme-provider';

const SYSTEM_AVATAR_FACE_VIEW_BOX = '290 290 100 100';

export type AppAvatarVariant = 'person' | 'system';

export interface AppAvatarProps {
  readonly label: string;
  readonly imageUrl?: string | null;
  readonly imageRef?: ImageRef;
  readonly priority?: 'low' | 'normal' | 'high';
  readonly size?: number;
  readonly rounded?: boolean;
  readonly fallbackBackgroundColor?: string;
  readonly fallbackTextColor?: string;
  readonly variant?: AppAvatarVariant;
}

export function AppAvatar({
  label,
  imageUrl,
  imageRef,
  priority = 'normal',
  size = 44,
  fallbackBackgroundColor,
  fallbackTextColor,
  variant = 'person',
}: AppAvatarProps) {
  const activeTheme = useAppTheme();
  const radius = size / 2;
  const avatarLabel = buildAvatarLabel(label);
  const resolvedImageUrl = useResolvedAvatarUrl(imageUrl);
  const stableImageCacheKey = avatarImageCacheKey(imageUrl);
  // Retain the native image for this mount even if the bounded prefetch cache evicts it.
  const cachedImage = useMemo(() => getPrefetchedAvatarImageRef(imageUrl), [imageUrl]);
  const prefetchedImage = imageRef ?? cachedImage;
  const initialImageReady =
    Boolean(prefetchedImage) || isAvatarImageReady(imageUrl, resolvedImageUrl);
  const [hasImageError, setHasImageError] = useState(false);
  const [isImageLoaded, setIsImageLoaded] = useState(initialImageReady);
  const hasImageSource = Boolean(imageUrl?.trim());

  useEffect(() => {
    setHasImageError(false);
    setIsImageLoaded(Boolean(prefetchedImage) || isAvatarImageReady(imageUrl, resolvedImageUrl));
  }, [imageUrl, prefetchedImage, resolvedImageUrl]);

  const isSystemAvatar = variant === 'system';
  const systemAvatarPalette = resolveHappyCirclesPalette('brand');
  const canShowImage = Boolean(
    !isSystemAvatar && hasImageSource && (prefetchedImage || resolvedImageUrl) && !hasImageError,
  );
  const backgroundColor = isSystemAvatar
    ? activeTheme.colors.successSoft
    : (fallbackBackgroundColor ?? activeTheme.colors.surfaceSoft);
  const labelColor = fallbackTextColor ?? activeTheme.colors.text;
  const systemAvatarSize = Math.max(1, size - 6);

  return (
    <View
      accessibilityLabel={isSystemAvatar ? 'Happy Circles' : undefined}
      accessibilityRole={isSystemAvatar ? 'image' : undefined}
      style={[
        styles.avatar,
        {
          backgroundColor,
          borderRadius: radius,
          height: size,
          width: size,
        },
      ]}
    >
      {isSystemAvatar ? (
        <HappyCirclesCenterSvg
          palette={systemAvatarPalette}
          size={systemAvatarSize}
          viewBox={SYSTEM_AVATAR_FACE_VIEW_BOX}
        />
      ) : (
        <>
          <AppText
            style={[
              styles.avatarLabel,
              {
                color: labelColor,
                fontSize: Math.max(16, size * 0.38),
              },
            ]}
          >
            {avatarLabel}
          </AppText>
          {canShowImage ? (
            <ExpoImage
              cachePolicy="memory-disk"
              contentFit="cover"
              onError={() => {
                setHasImageError(true);
                setIsImageLoaded(false);
              }}
              onLoad={() => {
                rememberAvatarImageReady(imageUrl, resolvedImageUrl);
                setIsImageLoaded(true);
              }}
              priority={priority}
              recyclingKey={stableImageCacheKey ?? resolvedImageUrl}
              source={
                prefetchedImage ?? {
                  uri: resolvedImageUrl ?? undefined,
                  cacheKey: stableImageCacheKey,
                }
              }
              style={[
                styles.avatarImage,
                {
                  borderRadius: radius,
                  height: size,
                  opacity: isImageLoaded ? 1 : 0,
                  width: size,
                },
              ]}
              transition={isImageLoaded ? 0 : 120}
            />
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    ...StyleSheet.absoluteFillObject,
  },
  avatarLabel: {
    fontWeight: '800',
    letterSpacing: 0,
  },
});
