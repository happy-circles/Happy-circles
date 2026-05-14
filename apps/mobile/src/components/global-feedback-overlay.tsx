import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { type GlobalFeedbackPayload, subscribeGlobalFeedback } from '@/lib/global-feedback';
import { theme } from '@/lib/theme';
import { AppText } from '@/components/app-text';
import { useAppTheme } from '@/providers/theme-provider';

const VISIBLE_MS = 2200;
const SHOULD_USE_NATIVE_DRIVER = Platform.OS !== 'web';

export function GlobalFeedbackOverlay() {
  const activeTheme = useAppTheme();
  const [feedback, setFeedback] = useState<GlobalFeedbackPayload | null>(null);
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-12)).current;
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSuccess = feedback?.tone === 'success' || !feedback?.tone;

  useEffect(
    () =>
      subscribeGlobalFeedback((nextFeedback) => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }

        setFeedback(nextFeedback);
        opacity.setValue(0);
        translateY.setValue(-12);

        Animated.parallel([
          Animated.timing(opacity, {
            duration: 180,
            easing: Easing.out(Easing.cubic),
            toValue: 1,
            useNativeDriver: SHOULD_USE_NATIVE_DRIVER,
          }),
          Animated.spring(translateY, {
            damping: 18,
            mass: 0.72,
            stiffness: 190,
            toValue: 0,
            useNativeDriver: SHOULD_USE_NATIVE_DRIVER,
          }),
        ]).start();

        timeoutRef.current = setTimeout(() => {
          Animated.parallel([
            Animated.timing(opacity, {
              duration: 180,
              easing: Easing.in(Easing.cubic),
              toValue: 0,
              useNativeDriver: SHOULD_USE_NATIVE_DRIVER,
            }),
            Animated.timing(translateY, {
              duration: 180,
              easing: Easing.in(Easing.cubic),
              toValue: -8,
              useNativeDriver: SHOULD_USE_NATIVE_DRIVER,
            }),
          ]).start(({ finished }) => {
            if (finished) {
              setFeedback(null);
            }
          });
          timeoutRef.current = null;
        }, VISIBLE_MS);
      }),
    [opacity, translateY],
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
    <View pointerEvents="none" style={[styles.host, { top: insets.top + theme.spacing.md }]}>
      <Animated.View
        style={[
          styles.card,
          {
            backgroundColor: activeTheme.colors.floatingSurface,
            borderColor: activeTheme.colors.hairline,
            opacity,
            transform: [{ translateY }],
            ...activeTheme.shadow.floating,
          },
        ]}
      >
        <View
          style={[
            styles.iconShell,
            {
              backgroundColor: isSuccess
                ? activeTheme.colors.successSoft
                : activeTheme.colors.surfaceMuted,
            },
          ]}
        >
          <Ionicons
            color={isSuccess ? activeTheme.colors.success : activeTheme.colors.textMuted}
            name={isSuccess ? 'checkmark' : 'information'}
            size={22}
          />
        </View>
        <View style={styles.copy}>
          <AppText numberOfLines={1} style={[styles.title, { color: activeTheme.colors.text }]}>
            {feedback.title}
          </AppText>
          {feedback.message ? (
            <AppText
              numberOfLines={1}
              style={[styles.message, { color: activeTheme.colors.textMuted }]}
            >
              {feedback.message}
            </AppText>
          ) : null}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    alignItems: 'center',
    left: 0,
    paddingHorizontal: theme.spacing.lg,
    position: 'absolute',
    right: 0,
    zIndex: 80,
  },
  card: {
    alignItems: 'center',
    alignSelf: 'center',
    borderRadius: theme.radius.medium,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    maxWidth: 340,
    minHeight: 72,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    width: '100%',
  },
  copy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  iconShell: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  iconShellSuccess: {},
  message: {
    fontSize: theme.typography.footnote,
    fontWeight: '600',
    lineHeight: 18,
  },
  title: {
    fontSize: theme.typography.callout,
    fontWeight: '800',
    lineHeight: 20,
  },
});
