import { Image, StyleSheet, Text, View } from 'react-native';

import { buildAvatarLabel } from '@/lib/avatar';
import { theme } from '@/lib/theme';

export interface AppAvatarProps {
  readonly label: string;
  readonly imageUrl?: string | null;
  readonly size?: number;
  readonly rounded?: boolean;
}

export function AppAvatar({ label, imageUrl, size = 44, rounded = true }: AppAvatarProps) {
  const radius = rounded ? size / 2 : Math.max(theme.radius.small, size * 0.28);
  const avatarLabel = buildAvatarLabel(label);

  return (
    <View style={[styles.avatar, { borderRadius: radius, height: size, width: size }]}>
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={{ borderRadius: radius, height: size, width: size }} />
      ) : (
        <Text style={[styles.avatarLabel, { fontSize: Math.max(16, size * 0.38) }]}>{avatarLabel}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceSoft,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarLabel: {
    color: theme.colors.text,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
});
