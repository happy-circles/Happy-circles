import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Platform, StyleSheet, View } from 'react-native';

import { HappyCirclesMotion } from '@/components/happy-circles-motion';
import { theme } from '@/lib/theme';
import { AppText } from '@/components/app-text';
import { useAppTheme } from '@/providers/theme-provider';

export interface LoadingOverlayProps {
  readonly visible: boolean;
  readonly title: string;
  readonly message?: string;
  readonly variant?: 'loading' | 'success' | 'danger';
}

const SHOULD_USE_NATIVE_DRIVER = Platform.OS !== 'web';

type OverlayState = Required<Pick<LoadingOverlayProps, 'title' | 'variant'>> &
  Pick<LoadingOverlayProps, 'message'>;

function motionVariant(variant: OverlayState['variant']) {
  if (variant === 'loading') {
    return 'loading';
  }

  if (variant === 'success') {
    return 'success';
  }

  return 'idle';
}

function StatusVisual({ variant }: { readonly variant: OverlayState['variant'] }) {
  const activeTheme = useAppTheme();
  const isDanger = variant === 'danger';
  return (
    <HappyCirclesMotion
      color={isDanger ? activeTheme.colors.danger : undefined}
      size={64}
      tone={isDanger ? 'mono' : 'brand'}
      variant={motionVariant(variant)}
    />
  );
}

export function LoadingOverlay({
  message,
  title,
  variant = 'loading',
  visible,
}: LoadingOverlayProps) {
  const activeTheme = useAppTheme();
  const [mounted, setMounted] = useState(visible);
  const [displayState, setDisplayState] = useState<OverlayState>({
    message,
    title,
    variant,
  });
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const cardScale = useRef(new Animated.Value(visible ? 1 : 0.96)).current;
  const cardTranslateY = useRef(new Animated.Value(visible ? 0 : 8)).current;
  const contentOpacity = useRef(new Animated.Value(1)).current;
  const contentTranslateY = useRef(new Animated.Value(0)).current;
  const visualScale = useRef(new Animated.Value(1)).current;
  const visibleRef = useRef(visible);
  const stateKeyRef = useRef(`${variant}:${title}:${message ?? ''}`);
  const isDanger = displayState.variant === 'danger';

  useEffect(() => {
    const wasVisible = visibleRef.current;
    visibleRef.current = visible;

    if (visible === wasVisible) {
      return;
    }

    opacity.stopAnimation();
    cardScale.stopAnimation();
    cardTranslateY.stopAnimation();

    if (visible) {
      const nextState = { message, title, variant };
      const nextKey = `${variant}:${title}:${message ?? ''}`;
      stateKeyRef.current = nextKey;
      setDisplayState(nextState);
      setMounted(true);
      opacity.setValue(0);
      cardScale.setValue(0.96);
      cardTranslateY.setValue(8);
      contentOpacity.setValue(1);
      contentTranslateY.setValue(0);
      visualScale.setValue(1);
      Animated.parallel([
        Animated.timing(opacity, {
          duration: 160,
          easing: Easing.out(Easing.cubic),
          toValue: 1,
          useNativeDriver: SHOULD_USE_NATIVE_DRIVER,
        }),
        Animated.spring(cardScale, {
          damping: 18,
          mass: 0.75,
          stiffness: 190,
          toValue: 1,
          useNativeDriver: SHOULD_USE_NATIVE_DRIVER,
        }),
        Animated.timing(cardTranslateY, {
          duration: 180,
          easing: Easing.out(Easing.cubic),
          toValue: 0,
          useNativeDriver: SHOULD_USE_NATIVE_DRIVER,
        }),
      ]).start();
      return;
    }

    Animated.parallel([
      Animated.timing(opacity, {
        duration: 140,
        easing: Easing.in(Easing.cubic),
        toValue: 0,
        useNativeDriver: SHOULD_USE_NATIVE_DRIVER,
      }),
      Animated.timing(cardScale, {
        duration: 140,
        easing: Easing.in(Easing.cubic),
        toValue: 0.97,
        useNativeDriver: SHOULD_USE_NATIVE_DRIVER,
      }),
      Animated.timing(cardTranslateY, {
        duration: 140,
        easing: Easing.in(Easing.cubic),
        toValue: 6,
        useNativeDriver: SHOULD_USE_NATIVE_DRIVER,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        setMounted(false);
      }
    });
  }, [
    cardScale,
    cardTranslateY,
    contentOpacity,
    contentTranslateY,
    message,
    opacity,
    title,
    variant,
    visible,
    visualScale,
  ]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    const nextState = { message, title, variant };
    const nextKey = `${variant}:${title}:${message ?? ''}`;
    if (stateKeyRef.current === nextKey) {
      return;
    }

    stateKeyRef.current = nextKey;
    contentOpacity.stopAnimation();
    contentTranslateY.stopAnimation();
    visualScale.stopAnimation();

    Animated.parallel([
      Animated.timing(contentOpacity, {
        duration: 90,
        easing: Easing.in(Easing.cubic),
        toValue: 0,
        useNativeDriver: SHOULD_USE_NATIVE_DRIVER,
      }),
      Animated.timing(contentTranslateY, {
        duration: 90,
        easing: Easing.in(Easing.cubic),
        toValue: -6,
        useNativeDriver: SHOULD_USE_NATIVE_DRIVER,
      }),
      Animated.timing(visualScale, {
        duration: 90,
        easing: Easing.in(Easing.cubic),
        toValue: 0.94,
        useNativeDriver: SHOULD_USE_NATIVE_DRIVER,
      }),
    ]).start(({ finished }) => {
      if (!finished) {
        return;
      }

      setDisplayState(nextState);
      contentTranslateY.setValue(8);
      visualScale.setValue(0.94);
      Animated.parallel([
        Animated.timing(contentOpacity, {
          duration: 150,
          easing: Easing.out(Easing.cubic),
          toValue: 1,
          useNativeDriver: SHOULD_USE_NATIVE_DRIVER,
        }),
        Animated.timing(contentTranslateY, {
          duration: 150,
          easing: Easing.out(Easing.cubic),
          toValue: 0,
          useNativeDriver: SHOULD_USE_NATIVE_DRIVER,
        }),
        Animated.spring(visualScale, {
          damping: 14,
          mass: 0.7,
          stiffness: 210,
          toValue: 1,
          useNativeDriver: SHOULD_USE_NATIVE_DRIVER,
        }),
      ]).start();
    });
  }, [
    contentOpacity,
    contentTranslateY,
    message,
    title,
    variant,
    visible,
    visualScale,
  ]);

  if (!mounted) {
    return null;
  }

  return (
    <Modal animationType="none" transparent visible={mounted}>
      <Animated.View
        style={[styles.scrim, { backgroundColor: activeTheme.colors.scrim, opacity }]}
      >
        <Animated.View
          style={[
            styles.card,
            {
              backgroundColor: activeTheme.colors.surface,
              borderColor: activeTheme.colors.border,
              ...activeTheme.shadow.floating,
              transform: [{ translateY: cardTranslateY }, { scale: cardScale }],
            },
          ]}
        >
          <Animated.View
            style={[
              styles.visualWrap,
              {
                transform: [{ scale: visualScale }],
              },
            ]}
          >
            <View style={styles.visualSlot}>
              <StatusVisual variant={displayState.variant} />
            </View>
          </Animated.View>
          <Animated.View
            style={[
              styles.copy,
              {
                opacity: contentOpacity,
                transform: [{ translateY: contentTranslateY }],
              },
            ]}
          >
            <View style={styles.titleSlot}>
              <AppText
                adjustsFontSizeToFit
                minimumFontScale={0.88}
                numberOfLines={1}
                style={[styles.title, { color: activeTheme.colors.text }]}
              >
                {displayState.title}
              </AppText>
            </View>
            <View style={styles.messageSlot}>
              <AppText
                adjustsFontSizeToFit
                minimumFontScale={0.82}
                numberOfLines={1}
                style={[
                  styles.message,
                  { color: isDanger ? activeTheme.colors.danger : activeTheme.colors.textMuted },
                  !displayState.message ? styles.messageEmpty : null,
                ]}
              >
                {displayState.message ?? ' '}
              </AppText>
            </View>
          </Animated.View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  card: {
    alignItems: 'center',
    borderRadius: theme.radius.large,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.md,
    height: 112,
    maxWidth: 336,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    width: '100%',
  },
  copy: {
    alignItems: 'flex-start',
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  message: {
    fontSize: theme.typography.footnote,
    fontWeight: '700',
    lineHeight: 18,
    textAlign: 'left',
  },
  messageDanger: {},
  messageEmpty: {
    color: theme.colors.transparent,
  },
  messageSlot: {
    alignItems: 'flex-start',
    height: 18,
    justifyContent: 'center',
    width: '100%',
  },
  title: {
    fontSize: theme.typography.title3,
    fontWeight: '800',
    lineHeight: 24,
    textAlign: 'left',
  },
  titleSlot: {
    alignItems: 'flex-start',
    height: 26,
    justifyContent: 'center',
    width: '100%',
  },
  visualSlot: {
    alignItems: 'center',
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  visualWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
