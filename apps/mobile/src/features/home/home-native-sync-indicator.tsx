import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { theme } from '@/lib/theme';

const HOME_NATIVE_SYNC_LANE_HEIGHT = theme.spacing.lg;

export function HomeNativeSyncIndicator({
  top,
  visible,
}: {
  readonly top: number;
  readonly visible: boolean;
}) {
  if (!visible) {
    return null;
  }

  return (
    <View pointerEvents="none" style={[styles.wrap, { top }]}>
      <ActivityIndicator color={theme.colors.primary} size="small" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    height: HOME_NATIVE_SYNC_LANE_HEIGHT,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    zIndex: 41,
  },
});
