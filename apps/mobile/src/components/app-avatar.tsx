import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { buildAvatarLabel, useResolvedAvatarUrl } from '@/lib/avatar';
import { theme } from '@/lib/theme';

export interface AppAvatarProps {
  readonly label: string;
  readonly imageUrl?: string | null;
  readonly size?: number;
  readonly rounded?: boolean;
  readonly fallbackBackgroundColor?: string;
  readonly fallbackTextColor?: string;
}

export function AppAvatar({
  label,
  imageUrl,
  size = 44,
  rounded = true,
  fallbackBackgroundColor,
  fallbackTextColor,
}: AppAvatarProps) {
  const radius = rounded ? size / 2 : Math.max(theme.radius.small, size * 0.28);
  const avatarLabel = buildAvatarLabel(label);
  const resolvedImageUrl = useResolvedAvatarUrl(imageUrl);
  const [hasImageError, setHasImageError] = useState(false);

  useEffect(() => {
    setHasImageError(false);
  }, [resolvedImageUrl]);

  const canShowImage = Boolean(resolvedImageUrl && !hasImageError);

  return (
    <View
      style={[
        styles.avatar,
        {
          backgroundColor: fallbackBackgroundColor ?? theme.colors.surfaceSoft,
          borderRadius: radius,
          height: size,
          width: size,
        },
      ]}
    >
      {canShowImage ? (
        <Image
          onError={() => setHasImageError(true)}
          source={{ uri: resolvedImageUrl as string }}
          style={{ borderRadius: radius, height: size, width: size }}
        />
      ) : (
        <Text
          style={[
            styles.avatarLabel,
            {
              color: fallbackTextColor ?? theme.colors.text,
              fontSize: Math.max(16, size * 0.38),
            },
          ]}
        >
          {avatarLabel}
        </Text>
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
