import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, Text, View } from 'react-native';

import { HappyCirclesMotion } from '@/components/happy-circles-motion';
import {
  type GlobalFeedbackPayload,
  subscribeGlobalFeedback,
} from '@/lib/global-feedback';
import { theme } from '@/lib/theme';

const VISIBLE_MS = 1550;
const SHOULD_USE_NATIVE_DRIVER = Platform.OS !== 'web';

export function GlobalFeedbackOverlay() {
  const [feedback, setFeedback] = useState<GlobalFeedbackPayload | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.96)).current;
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () =>
      subscribeGlobalFeedback((nextFeedback) => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }

        setFeedback(nextFeedback);
        opacity.setValue(0);
        scale.setValue(0.96);

        Animated.parallel([
          Animated.timing(opacity, {
            duration: 180,
            easing: Easing.out(Easing.cubic),
            toValue: 1,
            useNativeDriver: SHOULD_USE_NATIVE_DRIVER,
          }),
          Animated.spring(scale, {
            damping: 16,
            mass: 0.8,
            stiffness: 180,
            toValue: 1,
            useNativeDriver: SHOULD_USE_NATIVE_DRIVER,
          }),
        ]).start();

        timeoutRef.current = setTimeout(() => {
          Animated.timing(opacity, {
            duration: 180,
            easing: Easing.in(Easing.cubic),
            toValue: 0,
            useNativeDriver: SHOULD_USE_NATIVE_DRIVER,
          }).start(({ finished }) => {
            if (finished) {
              setFeedback(null);
            }
          });
          timeoutRef.current = null;
        }, VISIBLE_MS);
      }),
    [opacity, scale],
  );

  useEffect(
    () => () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    },
    [],
  );

  if (!feedback) {
    return null;
  }

  return (
    <View pointerEvents="none" style={styles.host}>
      <Animated.View style={[styles.card, { opacity, transform: [{ scale }] }]}>
        <HappyCirclesMotion
          size={112}
          variant={feedback.tone === 'success' || !feedback.tone ? 'success' : 'idle'}
        />
        <View style={styles.copy}>
          <Text style={styles.title}>{feedback.title}</Text>
          {feedback.message ? <Text style={styles.message}>{feedback.message}</Text> : null}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    paddingHorizontal: theme.spacing.lg,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 80,
  },
  card: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderColor: theme.colors.hairline,
    borderRadius: theme.radius.large,
    borderWidth: 1,
    gap: theme.spacing.sm,
    maxWidth: 340,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.lg,
    width: '100%',
    ...theme.shadow.floating,
  },
  copy: {
    gap: theme.spacing.xs,
  },
  message: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    fontWeight: '600',
    lineHeight: 18,
    textAlign: 'center',
  },
  title: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '800',
    lineHeight: 20,
    textAlign: 'center',
  },
});
