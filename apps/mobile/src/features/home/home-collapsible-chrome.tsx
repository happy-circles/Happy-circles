import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Link, useRouter } from 'expo-router';
import type { NativeScrollEvent, NativeSyntheticEvent, StyleProp, ViewStyle } from 'react-native';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import { AppAvatar } from '@/components/app-avatar';
import { AppText } from '@/components/app-text';
import { HeaderBrandTitle } from '@/components/header-brand-title';
import { HappyCirclesOuterSvg, resolveHappyCirclesPalette } from '@/components/happy-circles-glyph';
import { pushRoute } from '@/lib/navigation';
import { theme, type AppTheme } from '@/lib/theme';
import { useAppTheme } from '@/providers/theme-provider';

const HOME_CHROME_MORPH_START_Y = 2;
const HOME_CHROME_COMPACT_STATE_Y = 88;
const HOME_CHROME_EXPANDED_STATE_Y = 18;
const HOME_CHROME_COMPACT_PROGRESS = 0.82;
const HOME_CHROME_EXPANDED_PROGRESS = 0.18;
const HOME_CHROME_SCROLL_EXPAND_DISTANCE = 82;
const HOME_CHROME_SCROLL_COMPACT_DISTANCE = 112;
const HOME_CHROME_SCROLL_DIRECTION_THRESHOLD = 4;
const HOME_CHROME_SNAP_DELAY_MS = 90;
const HOME_CHROME_SNAP_DURATION_MS = 180;
const HOME_CHROME_CONTENT_MAX_WIDTH = 560;
const HOME_CHROME_PROFILE_BUTTON_SIZE = 48;
const HOME_CHROME_AVATAR_SIZE = 40;
const HOME_CHROME_PROFILE_CARD_AVATAR_INSET = theme.spacing.sm;
const HOME_CHROME_PROFILE_LEADING_OFFSET =
  HOME_CHROME_PROFILE_CARD_AVATAR_INSET -
  (HOME_CHROME_PROFILE_BUTTON_SIZE - HOME_CHROME_AVATAR_SIZE) / 2;
const HOME_CHROME_COMPACT_LOGO_SIZE = 78;
const HOME_CHROME_EXPANDED_LOGO_SIZE = 60;
const HOME_CHROME_EXPANDED_BRAND_WIDTH = 246;
const HOME_CHROME_EXPANDED_ACTION_SIZE = 60;
const HOME_CHROME_GLASS_COMPACT_SIZE = 92;
const HOME_CHROME_GLASS_COMPACT_RADIUS = HOME_CHROME_GLASS_COMPACT_SIZE / 2;
const HOME_CHROME_GLASS_EXPANDED_HEIGHT = 68;
const HOME_CHROME_FAB_COMPACT_SIZE = 58;
const HOME_CHROME_FAB_EXPANDED_WIDTH = 148;
const HOME_CHROME_FAB_RADIUS = HOME_CHROME_FAB_COMPACT_SIZE / 2;
const HOME_CHROME_TOP_GAP = theme.spacing.xs;

export const HOME_CHROME_EXPANDED_HEIGHT = 86;

type HomeChromeProgress = Animated.Value;
type HomeChromeScrollDirection = 'expand' | 'compact';

const shouldMountNativeGlass = Platform.OS === 'ios';
const hasNativeLiquidGlass = shouldMountNativeGlass && isLiquidGlassAvailable();

function resolveHomeLiquidGlassPlatformStyle(activeTheme: AppTheme) {
  return Platform.select({
    web: {
      WebkitBackdropFilter: 'blur(38px) saturate(220%)',
      backdropFilter: 'blur(38px) saturate(220%)',
      boxShadow: activeTheme.glass.homeWebShadow,
    },
    ios: {
      shadowColor: activeTheme.glass.homeShadowColor,
      shadowOffset: { width: 0, height: 16 },
      shadowOpacity: activeTheme.glass.homeShadowOpacity,
      shadowRadius: activeTheme.glass.homeShadowRadius,
    },
    default: {
      elevation: 9,
    },
  }) as object | undefined;
}

function LiquidGlassSurface({
  children,
  showGlow = true,
  style,
  tintColor,
}: {
  readonly children?: ReactNode;
  readonly showGlow?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly tintColor?: string;
}) {
  const activeTheme = useAppTheme();
  const resolvedTintColor = tintColor ?? activeTheme.glass.homeTint;

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, style]}>
      {shouldMountNativeGlass ? (
        <GlassView
          colorScheme={activeTheme.scheme}
          glassEffectStyle="regular"
          pointerEvents="none"
          style={styles.nativeLiquidGlass}
          tintColor={resolvedTintColor}
        />
      ) : null}
      {showGlow ? (
        <View
          pointerEvents="none"
          style={[
            styles.liquidGlassTopGlow,
            {
              backgroundColor: hasNativeLiquidGlass
                ? activeTheme.glass.homeNativeTopGlow
                : activeTheme.glass.homeTopGlow,
              opacity: hasNativeLiquidGlass
                ? activeTheme.glass.homeNativeTopGlowOpacity
                : activeTheme.glass.homeTopGlowOpacity,
            },
          ]}
        />
      ) : null}
      {children}
    </View>
  );
}

function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    let mounted = true;

    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) {
        setReducedMotion(enabled);
      }
    });

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReducedMotion,
    );

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reducedMotion;
}

function compactCountLabel(count: number) {
  return count > 99 ? '99+' : String(count);
}

function clampProgress(value: number) {
  return Math.min(1, Math.max(0, value));
}

export function useCollapsibleHomeChrome(scrollTopInset = 0) {
  const reducedMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;
  const progressValueRef = useRef(0);
  const [isCompact, setIsCompact] = useState(false);
  const isCompactRef = useRef(false);
  const lastYRef = useRef(0);
  const lastDirectionRef = useRef<HomeChromeScrollDirection | null>(null);
  const snapAnimationRef = useRef<Animated.CompositeAnimation | null>(null);
  const snapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateCompactState = useCallback((nextProgress: number) => {
    if (!isCompactRef.current && nextProgress >= HOME_CHROME_COMPACT_PROGRESS) {
      isCompactRef.current = true;
      setIsCompact(true);
      return;
    }

    if (isCompactRef.current && nextProgress <= HOME_CHROME_EXPANDED_PROGRESS) {
      isCompactRef.current = false;
      setIsCompact(false);
    }
  }, []);

  const setProgressValue = useCallback(
    (nextProgress: number) => {
      const clampedProgress = clampProgress(nextProgress);
      progressValueRef.current = clampedProgress;
      updateCompactState(clampedProgress);
      progress.setValue(clampedProgress);
    },
    [progress, updateCompactState],
  );

  const clearQueuedSnap = useCallback(() => {
    if (snapTimeoutRef.current === null) {
      return;
    }

    clearTimeout(snapTimeoutRef.current);
    snapTimeoutRef.current = null;
  }, []);

  const stopSnapAnimation = useCallback(() => {
    if (snapAnimationRef.current === null) {
      return;
    }

    snapAnimationRef.current.stop();
    snapAnimationRef.current = null;
  }, []);

  const animateToSettledProgress = useCallback(
    (nextProgress: number) => {
      const clampedProgress = clampProgress(nextProgress);

      clearQueuedSnap();
      stopSnapAnimation();

      if (reducedMotion || Math.abs(progressValueRef.current - clampedProgress) < 0.01) {
        setProgressValue(clampedProgress);
        return;
      }

      const animation = Animated.timing(progress, {
        duration: HOME_CHROME_SNAP_DURATION_MS,
        easing: Easing.out(Easing.cubic),
        toValue: clampedProgress,
        useNativeDriver: false,
      });

      snapAnimationRef.current = animation;
      animation.start(({ finished }) => {
        if (snapAnimationRef.current === animation) {
          snapAnimationRef.current = null;
        }

        if (finished) {
          setProgressValue(clampedProgress);
        }
      });
    },
    [clearQueuedSnap, progress, reducedMotion, setProgressValue, stopSnapAnimation],
  );

  const settleToLastDirection = useCallback(() => {
    const direction = lastDirectionRef.current;
    lastDirectionRef.current = null;

    if (direction === 'compact') {
      animateToSettledProgress(1);
      return;
    }

    if (direction === 'expand') {
      animateToSettledProgress(0);
      return;
    }

    animateToSettledProgress(isCompactRef.current ? 1 : 0);
  }, [animateToSettledProgress]);

  const queueSnapToLastDirection = useCallback(() => {
    clearQueuedSnap();
    snapTimeoutRef.current = setTimeout(() => {
      snapTimeoutRef.current = null;
      settleToLastDirection();
    }, HOME_CHROME_SNAP_DELAY_MS);
  }, [clearQueuedSnap, settleToLastDirection]);

  useEffect(() => {
    setProgressValue(isCompactRef.current ? 1 : 0);
  }, [reducedMotion, setProgressValue]);

  useEffect(() => {
    const listenerId = progress.addListener(({ value }) => {
      const clampedProgress = clampProgress(value);
      progressValueRef.current = clampedProgress;
      updateCompactState(clampedProgress);
    });

    return () => {
      progress.removeListener(listenerId);
    };
  }, [progress, updateCompactState]);

  useEffect(() => {
    return () => {
      clearQueuedSnap();
      stopSnapAnimation();
    };
  }, [clearQueuedSnap, stopSnapAnimation]);

  const onScrollBeginDrag = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      clearQueuedSnap();
      stopSnapAnimation();
      lastDirectionRef.current = null;
      lastYRef.current = Math.max(0, event.nativeEvent.contentOffset.y + scrollTopInset);
    },
    [clearQueuedSnap, scrollTopInset, stopSnapAnimation],
  );

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = Math.max(0, event.nativeEvent.contentOffset.y + scrollTopInset);
      const delta = y - lastYRef.current;
      lastYRef.current = y;
      const meaningfulDirection = Math.abs(delta) >= HOME_CHROME_SCROLL_DIRECTION_THRESHOLD;

      if (meaningfulDirection) {
        clearQueuedSnap();
        stopSnapAnimation();
        lastDirectionRef.current = delta > 0 ? 'compact' : 'expand';
      }

      if (reducedMotion) {
        if (y <= HOME_CHROME_EXPANDED_STATE_Y || delta < 0) {
          setProgressValue(0);
          return;
        }

        if (y >= HOME_CHROME_COMPACT_STATE_Y || delta > 0) {
          setProgressValue(1);
        }
        return;
      }

      if (y <= HOME_CHROME_MORPH_START_Y) {
        lastDirectionRef.current = 'expand';
        setProgressValue(0);
        return;
      }

      if (delta < 0) {
        setProgressValue(
          progressValueRef.current - Math.abs(delta) / HOME_CHROME_SCROLL_EXPAND_DISTANCE,
        );
        return;
      }

      if (delta > 0) {
        setProgressValue(progressValueRef.current + delta / HOME_CHROME_SCROLL_COMPACT_DISTANCE);
      }
    },
    [clearQueuedSnap, reducedMotion, scrollTopInset, setProgressValue, stopSnapAnimation],
  );

  return {
    isCompact,
    onMomentumScrollEnd: queueSnapToLastDirection,
    onScroll,
    onScrollBeginDrag,
    onScrollEndDrag: queueSnapToLastDirection,
    progress,
  };
}

function HomeCompactAvatarFrame({ progress }: { readonly progress: HomeChromeProgress }) {
  const maskId = useMemo(() => `home-compact-brand-${Math.random().toString(36).slice(2)}`, []);
  const palette = resolveHappyCirclesPalette('brand');
  const opacity = progress.interpolate({
    inputRange: [0, 0.34, 1],
    outputRange: [0, 0.42, 1],
  });
  const rotate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '-45deg'],
  });
  const scale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.9, 1],
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.compactAvatarFrame,
        {
          opacity,
          transform: [{ rotate }, { scale }],
        },
      ]}
    >
      <HappyCirclesOuterSvg
        maskId={maskId}
        palette={palette}
        size={HOME_CHROME_COMPACT_LOGO_SIZE}
      />
    </Animated.View>
  );
}

function HomeActivityButton({ count }: { readonly count: number }) {
  const activeTheme = useAppTheme();
  const router = useRouter();
  const hasAttention = count > 0;
  const pulse = useRef(new Animated.Value(0)).current;
  const badgeScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.14],
  });

  useEffect(() => {
    pulse.stopAnimation();
    pulse.setValue(0);

    if (!hasAttention) {
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          duration: 720,
          easing: Easing.inOut(Easing.quad),
          toValue: 1,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(pulse, {
          duration: 720,
          easing: Easing.inOut(Easing.quad),
          toValue: 0,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]),
    );

    loop.start();
    return () => {
      loop.stop();
    };
  }, [hasAttention, pulse]);

  const openActivity = useCallback(() => {
    pushRoute(router, '/activity');
  }, [router]);

  return (
    <Pressable
      accessibilityLabel={
        hasAttention ? `${compactCountLabel(count)} notificaciones no vistas` : 'Actividad'
      }
      accessibilityRole="button"
      hitSlop={{ bottom: 24, left: 24, right: 24, top: 24 }}
      onPress={openActivity}
      style={styles.activityHitArea}
    >
      {({ pressed }) => (
        <View
          style={[
            styles.activityButton,
            {
              backgroundColor: hasAttention
                ? activeTheme.colors.primarySoft
                : activeTheme.colors.surface,
              borderColor: hasAttention
                ? activeTheme.colors.primaryGhost
                : activeTheme.colors.hairline,
            },
            activeTheme.shadow.card,
            pressed ? styles.pressed : null,
          ]}
        >
          <Ionicons
            color={hasAttention ? activeTheme.colors.primary : activeTheme.colors.text}
            name={hasAttention ? 'notifications' : 'notifications-outline'}
            size={24}
          />
          {hasAttention ? (
            <Animated.View
              style={[
                styles.activityBadge,
                {
                  backgroundColor: activeTheme.colors.danger,
                  borderColor: activeTheme.colors.surface,
                  transform: [{ scale: badgeScale }],
                },
              ]}
            >
              <AppText style={[styles.activityBadgeText, { color: activeTheme.colors.white }]}>
                {compactCountLabel(count)}
              </AppText>
            </Animated.View>
          ) : null}
        </View>
      )}
    </Pressable>
  );
}

export function HomeCollapsibleChrome({
  avatarLabel,
  avatarUrl,
  notificationCount,
  progress,
  topInset,
}: {
  readonly avatarLabel: string;
  readonly avatarUrl: string | null;
  readonly isCompact: boolean;
  readonly notificationCount: number;
  readonly progress: HomeChromeProgress;
  readonly topInset: number;
}) {
  const activeTheme = useAppTheme();
  const { width } = useWindowDimensions();
  const liquidGlassPlatformStyle = resolveHomeLiquidGlassPlatformStyle(activeTheme);
  const contentWidth = Math.min(
    HOME_CHROME_CONTENT_MAX_WIDTH,
    Math.max(0, width - theme.spacing.lg * 2),
  );
  const contentLeft = (width - contentWidth) / 2;
  const expandedContentGap = contentWidth < 380 ? theme.spacing.xs : theme.spacing.md;
  const expandedActionTrailingOffset =
    contentWidth < 380 ? theme.spacing.xxs : HOME_CHROME_PROFILE_LEADING_OFFSET;
  const expandedBrandMaxWidth = Math.min(
    HOME_CHROME_EXPANDED_BRAND_WIDTH,
    Math.max(
      HOME_CHROME_EXPANDED_LOGO_SIZE,
      contentWidth -
        HOME_CHROME_PROFILE_BUTTON_SIZE -
        HOME_CHROME_PROFILE_LEADING_OFFSET -
        HOME_CHROME_EXPANDED_ACTION_SIZE -
        expandedActionTrailingOffset -
        expandedContentGap * 2,
    ),
  );
  const rowCenterY = topInset + HOME_CHROME_TOP_GAP + HOME_CHROME_EXPANDED_LOGO_SIZE / 2;
  const profileCenterX =
    contentLeft + HOME_CHROME_PROFILE_LEADING_OFFSET + HOME_CHROME_PROFILE_BUTTON_SIZE / 2;
  const glassExpandedTop = rowCenterY - HOME_CHROME_GLASS_EXPANDED_HEIGHT / 2;
  const glassCompactLeft = profileCenterX - HOME_CHROME_GLASS_COMPACT_SIZE / 2;
  const glassCompactTop = rowCenterY - HOME_CHROME_GLASS_COMPACT_SIZE / 2;
  const glassLeft = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [contentLeft, glassCompactLeft],
  });
  const glassTop = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [glassExpandedTop, glassCompactTop],
  });
  const glassWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [contentWidth, HOME_CHROME_GLASS_COMPACT_SIZE],
  });
  const glassHeight = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [HOME_CHROME_GLASS_EXPANDED_HEIGHT, HOME_CHROME_GLASS_COMPACT_SIZE],
  });
  const glassRadius = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [HOME_CHROME_GLASS_EXPANDED_HEIGHT / 2, HOME_CHROME_GLASS_COMPACT_RADIUS],
  });
  const expandedBrandOpacity = progress.interpolate({
    inputRange: [0, 0.18, 0.62, 1],
    outputRange: [1, 1, 0, 0],
  });
  const expandedBrandClipWidth = progress.interpolate({
    inputRange: [0, 0.04, 0.62, 1],
    outputRange: [expandedBrandMaxWidth, expandedBrandMaxWidth, 0, 0],
  });
  const expandedBrandScale = progress.interpolate({
    inputRange: [0, 0.24, 1],
    outputRange: [1, 0.98, 0.98],
  });
  const expandedBrandTranslateX = progress.interpolate({
    inputRange: [0, 0.24, 1],
    outputRange: [0, -3, -3],
  });
  const expandedBrandTranslateY = progress.interpolate({
    inputRange: [0, 0.24, 1],
    outputRange: [0, -1, -1],
  });
  const actionOpacity = progress.interpolate({
    inputRange: [0, 0.08, 1],
    outputRange: [1, 0, 0],
  });
  const actionScale = progress.interpolate({
    inputRange: [0, 0.16, 1],
    outputRange: [1, 0.9, 0.9],
  });
  const actionTranslateX = progress.interpolate({
    inputRange: [0, 0.16, 1],
    outputRange: [0, -10, -10],
  });
  const actionTranslateY = progress.interpolate({
    inputRange: [0, 0.16, 1],
    outputRange: [0, -2, -2],
  });

  return (
    <View
      pointerEvents="box-none"
      style={[styles.chromeRoot, { height: topInset + HOME_CHROME_EXPANDED_HEIGHT }]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.liquidGlass,
          liquidGlassPlatformStyle,
          {
            backgroundColor: hasNativeLiquidGlass
              ? activeTheme.glass.homeNativeBackground
              : activeTheme.glass.homeBackground,
            borderColor: activeTheme.glass.homeBorder,
            borderRadius: glassRadius,
            height: glassHeight,
            left: glassLeft,
            top: glassTop,
            width: glassWidth,
          },
        ]}
      >
        <LiquidGlassSurface />
      </Animated.View>
      <Animated.View
        pointerEvents="box-none"
        style={[
          styles.expandedBar,
          {
            height: topInset + HOME_CHROME_EXPANDED_HEIGHT,
            paddingTop: topInset + HOME_CHROME_TOP_GAP,
          },
        ]}
      >
        <View
          pointerEvents="box-none"
          style={[styles.expandedContent, { gap: expandedContentGap }]}
        >
          <View style={styles.profileCluster}>
            <Link href="/profile" asChild>
              <Pressable
                accessibilityLabel="Abrir perfil"
                accessibilityRole="button"
                style={({ pressed }) => [styles.profileButton, pressed ? styles.pressed : null]}
              >
                <View style={styles.profileVisual}>
                  <HomeCompactAvatarFrame progress={progress} />
                  <View style={styles.avatarAnchor}>
                    <AppAvatar
                      imageUrl={avatarUrl}
                      label={avatarLabel}
                      size={HOME_CHROME_AVATAR_SIZE}
                    />
                  </View>
                </View>
              </Pressable>
            </Link>
          </View>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.expandedBrand,
              {
                opacity: expandedBrandOpacity,
                width: expandedBrandMaxWidth,
                transform: [
                  { translateX: expandedBrandTranslateX },
                  { translateY: expandedBrandTranslateY },
                  { scale: expandedBrandScale },
                ],
              },
            ]}
          >
            <Animated.View style={[styles.expandedBrandClip, { width: expandedBrandClipWidth }]}>
              <View style={[styles.expandedBrandContent, { width: expandedBrandMaxWidth }]}>
                <HeaderBrandTitle logoSize={60} titleSize={22} />
              </View>
            </Animated.View>
          </Animated.View>
          <Animated.View
            pointerEvents="box-none"
            style={[
              styles.expandedAction,
              {
                marginRight: expandedActionTrailingOffset,
                opacity: actionOpacity,
                transform: [
                  { translateX: actionTranslateX },
                  { translateY: actionTranslateY },
                  { scale: actionScale },
                ],
              },
            ]}
          >
            <HomeActivityButton count={notificationCount} />
          </Animated.View>
        </View>
      </Animated.View>
    </View>
  );
}

export function HomeRegisterFab({
  bottomInset,
  progress,
}: {
  readonly bottomInset: number;
  readonly isCompact: boolean;
  readonly progress: HomeChromeProgress;
}) {
  const activeTheme = useAppTheme();
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const contentWidth = Math.min(
    HOME_CHROME_CONTENT_MAX_WIDTH,
    Math.max(0, windowWidth - theme.spacing.lg * 2),
  );
  const contentRight = Math.max(theme.spacing.lg, (windowWidth - contentWidth) / 2);
  const width = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [HOME_CHROME_FAB_EXPANDED_WIDTH, HOME_CHROME_FAB_COMPACT_SIZE],
  });
  const labelOpacity = progress.interpolate({
    inputRange: [0, 0.08, 1],
    outputRange: [1, 0, 0],
  });
  const labelWidth = progress.interpolate({
    inputRange: [0, 0.16, 1],
    outputRange: [72, 0, 0],
  });
  const labelMarginLeft = progress.interpolate({
    inputRange: [0, 0.16, 1],
    outputRange: [8, 0, 0],
  });

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.fabWrap,
        {
          bottom: 24 + bottomInset,
          height: HOME_CHROME_FAB_COMPACT_SIZE,
          right: contentRight,
          width,
        },
      ]}
    >
      <Pressable
        accessibilityLabel="Registrar movimiento"
        accessibilityRole="button"
        onPress={() => pushRoute(router, '/register')}
        style={({ pressed }) => [
          styles.fab,
          activeTheme.shadow.card,
          {
            backgroundColor: activeTheme.colors.elevated,
            borderColor: activeTheme.colors.border,
          },
          pressed ? styles.pressed : null,
        ]}
      >
        <View style={[styles.fabIconHalo, { backgroundColor: activeTheme.colors.primaryGhost }]}>
          <Ionicons color={activeTheme.colors.primary} name="add" size={24} />
        </View>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.fabLabelWrap,
            {
              marginLeft: labelMarginLeft,
              opacity: labelOpacity,
              width: labelWidth,
            },
          ]}
        >
          <AppText
            numberOfLines={1}
            style={[styles.fabLabel, { color: activeTheme.colors.primaryStrong }]}
          >
            Registro
          </AppText>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  chromeRoot: {
    elevation: 40,
    left: 0,
    pointerEvents: 'box-none',
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 40,
  },
  liquidGlass: {
    borderWidth: 1.25,
    overflow: 'hidden',
    position: 'absolute',
    zIndex: 1,
  },
  nativeLiquidGlass: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: theme.radius.pill,
  },
  liquidGlassTopGlow: {
    borderRadius: theme.radius.pill,
    height: 8,
    left: 14,
    position: 'absolute',
    right: 14,
    top: 5,
  },
  expandedBar: {
    elevation: 41,
    left: 0,
    paddingHorizontal: theme.spacing.lg,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 2,
  },
  expandedContent: {
    alignItems: 'center',
    alignSelf: 'center',
    flexDirection: 'row',
    gap: theme.spacing.md,
    justifyContent: 'space-between',
    maxWidth: 560,
    width: '100%',
  },
  profileButton: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    height: HOME_CHROME_PROFILE_BUTTON_SIZE,
    justifyContent: 'center',
    overflow: 'visible',
    position: 'relative',
    width: HOME_CHROME_PROFILE_BUTTON_SIZE,
    zIndex: 2,
  },
  profileCluster: {
    height: HOME_CHROME_PROFILE_BUTTON_SIZE,
    marginLeft: HOME_CHROME_PROFILE_LEADING_OFFSET,
    position: 'relative',
    width: HOME_CHROME_PROFILE_BUTTON_SIZE,
    zIndex: 4,
  },
  profileVisual: {
    alignItems: 'center',
    height: HOME_CHROME_COMPACT_LOGO_SIZE,
    justifyContent: 'center',
    left: -(HOME_CHROME_COMPACT_LOGO_SIZE - HOME_CHROME_PROFILE_BUTTON_SIZE) / 2,
    position: 'absolute',
    top: -(HOME_CHROME_COMPACT_LOGO_SIZE - HOME_CHROME_PROFILE_BUTTON_SIZE) / 2,
    width: HOME_CHROME_COMPACT_LOGO_SIZE,
  },
  compactAvatarFrame: {
    height: HOME_CHROME_COMPACT_LOGO_SIZE,
    left: 0,
    position: 'absolute',
    top: 0,
    width: HOME_CHROME_COMPACT_LOGO_SIZE,
    zIndex: 1,
  },
  avatarAnchor: {
    position: 'relative',
    zIndex: 3,
  },
  expandedBrand: {
    alignItems: 'flex-start',
    flexShrink: 0,
    width: HOME_CHROME_EXPANDED_BRAND_WIDTH,
  },
  expandedBrandClip: {
    overflow: 'hidden',
  },
  expandedBrandContent: {
    width: HOME_CHROME_EXPANDED_BRAND_WIDTH,
  },
  expandedAction: {
    alignItems: 'center',
    height: HOME_CHROME_EXPANDED_ACTION_SIZE,
    justifyContent: 'center',
    marginRight: HOME_CHROME_PROFILE_LEADING_OFFSET,
    width: HOME_CHROME_EXPANDED_ACTION_SIZE,
  },
  activityHitArea: {
    alignItems: 'center',
    height: HOME_CHROME_EXPANDED_ACTION_SIZE,
    justifyContent: 'center',
    width: HOME_CHROME_EXPANDED_ACTION_SIZE,
  },
  activityButton: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  activityBadge: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    borderWidth: 2,
    height: 19,
    justifyContent: 'center',
    minWidth: 19,
    paddingHorizontal: 5,
    position: 'absolute',
    right: -4,
    top: -4,
  },
  activityBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 12,
  },
  fabWrap: {
    alignItems: 'center',
    borderRadius: HOME_CHROME_FAB_RADIUS,
    height: HOME_CHROME_FAB_COMPACT_SIZE,
    justifyContent: 'center',
    maxHeight: HOME_CHROME_FAB_COMPACT_SIZE,
    maxWidth: HOME_CHROME_FAB_EXPANDED_WIDTH,
    minHeight: HOME_CHROME_FAB_COMPACT_SIZE,
    minWidth: HOME_CHROME_FAB_COMPACT_SIZE,
    position: 'absolute',
    zIndex: 42,
  },
  fab: {
    alignItems: 'center',
    borderRadius: HOME_CHROME_FAB_RADIUS,
    borderWidth: 1,
    flexDirection: 'row',
    height: HOME_CHROME_FAB_COMPACT_SIZE,
    justifyContent: 'center',
    maxHeight: HOME_CHROME_FAB_COMPACT_SIZE,
    maxWidth: HOME_CHROME_FAB_EXPANDED_WIDTH,
    minHeight: HOME_CHROME_FAB_COMPACT_SIZE,
    minWidth: HOME_CHROME_FAB_COMPACT_SIZE,
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
    zIndex: 1,
  },
  fabIconHalo: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  fabLabelWrap: {
    overflow: 'hidden',
  },
  fabLabel: {
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 17,
  },
  pressed: {
    opacity: 0.68,
  },
});
