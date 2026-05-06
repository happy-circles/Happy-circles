import { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import {
  HappyCirclesCenterSvg,
  resolveHappyCirclesPalette,
} from '@/components/happy-circles-glyph';
import { buildAvatarLabel, useResolvedAvatarUrl } from '@/lib/avatar';
import { theme } from '@/lib/theme';
import { AppText } from '@/components/app-text';

const SYSTEM_AVATAR_FACE_VIEW_BOX = '290 290 100 100';
const SYSTEM_AVATAR_PALETTE = resolveHappyCirclesPalette('brand');

export type AppAvatarVariant = 'person' | 'system';

export interface AppAvatarProps {
  readonly label: string;
  readonly imageUrl?: string | null;
  readonly size?: number;
  readonly rounded?: boolean;
  readonly fallbackBackgroundColor?: string;
  readonly fallbackTextColor?: string;
  readonly variant?: AppAvatarVariant;
}

export function AppAvatar({
  label,
  imageUrl,
  size = 44,
  rounded = true,
  fallbackBackgroundColor,
  fallbackTextColor,
  variant = 'person',
}: AppAvatarProps) {
  const radius = rounded ? size / 2 : Math.max(theme.radius.small, size * 0.28);
  const avatarLabel = buildAvatarLabel(label);
  const resolvedImageUrl = useResolvedAvatarUrl(imageUrl);
  const [hasImageError, setHasImageError] = useState(false);
  const hasImageSource = Boolean(imageUrl?.trim());
  const isWaitingForImage = hasImageSource && !hasImageError;

  useEffect(() => {
    setHasImageError(false);
  }, [resolvedImageUrl]);

  const isSystemAvatar = variant === 'system';
  const canShowImage = Boolean(
    !isSystemAvatar && hasImageSource && resolvedImageUrl && !hasImageError,
  );
  const backgroundColor = isSystemAvatar
    ? theme.colors.successSoft
    : isWaitingForImage
      ? theme.colors.surfaceSoft
      : (fallbackBackgroundColor ?? theme.colors.surfaceSoft);
  const labelColor = isWaitingForImage
    ? theme.colors.textMuted
    : (fallbackTextColor ?? theme.colors.text);
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
          palette={SYSTEM_AVATAR_PALETTE}
          size={systemAvatarSize}
          viewBox={SYSTEM_AVATAR_FACE_VIEW_BOX}
        />
      ) : canShowImage ? (
        <Image
          onError={() => setHasImageError(true)}
          source={{ uri: resolvedImageUrl as string }}
          style={{ borderRadius: radius, height: size, width: size }}
        />
      ) : (
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
  avatarLabel: {
    fontWeight: '800',
    letterSpacing: -0.3,
  },
});
