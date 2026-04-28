import { useEffect, useRef } from 'react';
import { Animated, Platform, StyleSheet, Text, View } from 'react-native';

import { HappyCirclesMotion } from '@/components/happy-circles-motion';
import { theme } from '@/lib/theme';

type SnackbarTone = 'success' | 'danger' | 'neutral';
const SHOULD_USE_NATIVE_DRIVER = Platform.OS !== 'web';

export interface SnackbarProps {
  readonly visible: boolean;
  readonly message: string | null;
  readonly tone?: SnackbarTone;
}

export function Snackbar({ visible, message, tone = 'neutral' }: SnackbarProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        duration: 180,
        toValue: visible ? 1 : 0,
        useNativeDriver: SHOULD_USE_NATIVE_DRIVER,
      }),
      Animated.timing(translateY, {
        duration: 180,
        toValue: visible ? 0 : 24,
        useNativeDriver: SHOULD_USE_NATIVE_DRIVER,
      }),
    ]).start();
  }, [opacity, translateY, visible]);

  if (!message) {
    return null;
  }

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.wrapper,
        {
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      <View
        style={[
          styles.snackbar,
          tone === 'success' ? styles.success : null,
          tone === 'danger' ? styles.danger : null,
        ]}
      >
        {tone === 'success' ? (
          <HappyCirclesMotion color={theme.colors.white} size={42} tone="mono" variant="success" />
        ) : null}
        <Text style={styles.text}>{message}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    bottom: theme.spacing.xl,
    left: theme.spacing.lg,
    position: 'absolute',
    right: theme.spacing.lg,
    zIndex: 20,
  },
  snackbar: {
    alignItems: 'center',
    backgroundColor: theme.colors.text,
    borderRadius: theme.radius.medium,
    flexDirection: 'row',
    gap: theme.spacing.xs,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    ...theme.shadow.floating,
  },
  success: {
    backgroundColor: theme.colors.success,
  },
  danger: {
    backgroundColor: theme.colors.danger,
  },
  text: {
    color: theme.colors.white,
    fontSize: theme.typography.footnote,
    fontWeight: '700',
    lineHeight: 18,
    textAlign: 'center',
  },
});
