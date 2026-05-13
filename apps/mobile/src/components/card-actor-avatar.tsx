import type { PropsWithChildren } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';

import type { CardHaloIntensity, CardStateIntent, CardStatusTone } from '@/lib/card-language';

export interface CardActorAvatarProps extends PropsWithChildren {
  readonly haloColor?: string;
  readonly haloIntensity?: CardHaloIntensity;
  readonly haloSize?: number;
  readonly intent?: CardStateIntent;
  readonly size: number;
  readonly style?: StyleProp<ViewStyle>;
  readonly tone?: CardStatusTone;
}

export function CardActorAvatar({ children, haloSize, size, style }: CardActorAvatarProps) {
  const resolvedHaloSize = haloSize ?? Math.round(size * 1.34);

  return (
    <View
      style={[
        styles.wrap,
        {
          height: resolvedHaloSize,
          width: resolvedHaloSize,
        },
        style,
      ]}
    >
      <View style={[styles.content, { minHeight: size, minWidth: size }]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    flexShrink: 0,
    justifyContent: 'center',
    position: 'relative',
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
