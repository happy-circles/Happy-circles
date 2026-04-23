import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import type {
  GestureResponderEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollViewProps,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Animated, Easing, ScrollView, StyleSheet, Text, View } from 'react-native';

import { HappyCirclesMotion } from '@/components/happy-circles-motion';
import { theme } from '@/lib/theme';

const PULL_TRIGGER_DISTANCE = 84;
const PULL_MAX_DISTANCE = 124;
const PULL_RELEASE_DISTANCE = 64;

export interface BrandedRefreshProps {
  readonly label?: string;
  readonly onRefresh: () => void | Promise<void>;
  readonly refreshing: boolean;
}

interface BrandedRefreshIndicatorProps {
  readonly label?: string;
  readonly pullDistance?: Animated.Value;
  readonly style?: StyleProp<ViewStyle>;
  readonly visible: boolean;
}

export interface BrandedRefreshScrollViewProps
  extends Omit<ScrollViewProps, 'refreshControl'> {
  readonly refresh?: BrandedRefreshProps;
  readonly refreshIndicatorStyle?: StyleProp<ViewStyle>;
}

export function BrandedRefreshIndicator({
  label = 'Sincronizando',
  pullDistance,
  style,
  visible,
}: BrandedRefreshIndicatorProps) {
  const animatedStyle = pullDistance
    ? {
        opacity: pullDistance.interpolate({
          inputRange: [0, 20, PULL_RELEASE_DISTANCE],
          outputRange: [0, 0.92, 1],
          extrapolate: 'clamp',
        }),
        transform: [
          {
            translateY: pullDistance.interpolate({
              inputRange: [0, PULL_TRIGGER_DISTANCE],
              outputRange: [-14, 0],
              extrapolate: 'clamp',
            }),
          },
          {
            scale: pullDistance.interpolate({
              inputRange: [0, PULL_TRIGGER_DISTANCE],
              outputRange: [0.9, 1],
              extrapolate: 'clamp',
            }),
          },
        ],
      }
    : null;

  if (!visible) {
    return null;
  }

  return (
    <Animated.View pointerEvents="none" style={[styles.indicatorWrap, animatedStyle, style]}>
      <View style={styles.indicator}>
        <HappyCirclesMotion size={64} variant="refresh" />
        <Text style={styles.indicatorText}>{label}</Text>
      </View>
    </Animated.View>
  );
}

export const BrandedRefreshScrollView = forwardRef<
  ScrollView,
  BrandedRefreshScrollViewProps
>(function BrandedRefreshScrollView(
  {
    alwaysBounceVertical,
    bounces,
    children,
    contentContainerStyle,
    onScroll,
    onScrollEndDrag,
    onTouchCancel,
    onTouchEnd,
    onTouchMove,
    onTouchStart,
    overScrollMode,
    refresh,
    refreshIndicatorStyle,
    scrollEventThrottle,
    showsVerticalScrollIndicator,
    style,
    ...props
  },
  ref,
) {
  const pullDistance = useRef(new Animated.Value(0)).current;
  const scrollYRef = useRef(0);
  const startYRef = useRef<number | null>(null);
  const startScrollYRef = useRef(0);
  const latestPullRef = useRef(0);
  const releaseHandledRef = useRef(false);
  const thresholdHapticFiredRef = useRef(false);
  const refreshingRef = useRef(Boolean(refresh?.refreshing));
  const [pulling, setPulling] = useState(false);

  const refreshEnabled = Boolean(refresh);
  const visible = pulling || Boolean(refresh?.refreshing);

  const triggerThresholdHaptic = useCallback(() => {
    void Haptics.selectionAsync().catch(() => undefined);
  }, []);

  const triggerRefreshHaptic = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  }, []);

  const closePull = useCallback(() => {
    latestPullRef.current = 0;
    thresholdHapticFiredRef.current = false;
    Animated.timing(pullDistance, {
      duration: 210,
      easing: Easing.out(Easing.cubic),
      toValue: 0,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !refreshingRef.current) {
        setPulling(false);
      }
    });
  }, [pullDistance]);

  const openPull = useCallback(
    (distance: number) => {
      latestPullRef.current = distance;
      if (distance >= PULL_TRIGGER_DISTANCE && !thresholdHapticFiredRef.current) {
        thresholdHapticFiredRef.current = true;
        triggerThresholdHaptic();
      } else if (distance < PULL_TRIGGER_DISTANCE - 18) {
        thresholdHapticFiredRef.current = false;
      }

      if (distance > 6) {
        setPulling(true);
      }
      pullDistance.setValue(distance);
    },
    [pullDistance, triggerThresholdHaptic],
  );

  useEffect(() => {
    refreshingRef.current = Boolean(refresh?.refreshing);

    if (refresh?.refreshing) {
      setPulling(true);
      Animated.spring(pullDistance, {
        damping: 16,
        mass: 0.8,
        stiffness: 170,
        toValue: PULL_RELEASE_DISTANCE,
        useNativeDriver: true,
      }).start();
      return;
    }

    if (startYRef.current === null) {
      closePull();
    }
  }, [closePull, pullDistance, refresh?.refreshing]);

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const nextY = event.nativeEvent.contentOffset.y;
    scrollYRef.current = nextY;

    if (refresh && !refresh.refreshing && nextY < 0) {
      openPull(Math.min(PULL_MAX_DISTANCE, Math.abs(nextY) * 0.9));
    }

    onScroll?.(event);
  }

  function handleTouchStart(event: GestureResponderEvent) {
    startYRef.current = event.nativeEvent.pageY;
    startScrollYRef.current = scrollYRef.current;
    releaseHandledRef.current = false;
    thresholdHapticFiredRef.current = false;
    onTouchStart?.(event);
  }

  function handleTouchMove(event: GestureResponderEvent) {
    if (refresh && !refresh.refreshing && startYRef.current !== null) {
      const deltaY = event.nativeEvent.pageY - startYRef.current;
      const startedAtTop = startScrollYRef.current <= 2;

      if (startedAtTop && deltaY > 0) {
        openPull(Math.min(PULL_MAX_DISTANCE, deltaY * 0.72));
      }
    }

    onTouchMove?.(event);
  }

  function finishPull(shouldTriggerRefresh: boolean) {
    if (releaseHandledRef.current) {
      return;
    }

    releaseHandledRef.current = true;

    const nextShouldRefresh =
      shouldTriggerRefresh &&
      Boolean(refresh) &&
      !refresh?.refreshing &&
      latestPullRef.current >= PULL_TRIGGER_DISTANCE;

    startYRef.current = null;
    startScrollYRef.current = 0;

    if (nextShouldRefresh && refresh) {
      setPulling(true);
      triggerRefreshHaptic();
      Animated.spring(pullDistance, {
        damping: 16,
        mass: 0.8,
        stiffness: 170,
        toValue: PULL_RELEASE_DISTANCE,
        useNativeDriver: true,
      }).start();
      void refresh.onRefresh();
    } else if (!refresh?.refreshing) {
      closePull();
    }
  }

  function handleTouchEnd(event: GestureResponderEvent) {
    finishPull(true);
    onTouchEnd?.(event);
  }

  function handleTouchCancel(event: GestureResponderEvent) {
    finishPull(false);
    onTouchCancel?.(event);
  }

  function handleScrollEndDrag(event: NativeSyntheticEvent<NativeScrollEvent>) {
    finishPull(true);
    onScrollEndDrag?.(event);
  }

  return (
    <View style={[styles.scrollWrap, style]}>
      <ScrollView
        {...props}
        alwaysBounceVertical={refreshEnabled ? true : alwaysBounceVertical}
        bounces={refreshEnabled ? true : bounces}
        contentContainerStyle={contentContainerStyle}
        onScroll={handleScroll}
        onScrollEndDrag={handleScrollEndDrag}
        onTouchCancel={handleTouchCancel}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchMove}
        onTouchStart={handleTouchStart}
        overScrollMode={refreshEnabled ? 'always' : overScrollMode}
        ref={ref}
        scrollEventThrottle={scrollEventThrottle ?? 16}
        showsVerticalScrollIndicator={showsVerticalScrollIndicator ?? false}
        style={styles.innerScroll}
      >
        {children}
      </ScrollView>
      <BrandedRefreshIndicator
        label={refresh?.label}
        pullDistance={pullDistance}
        style={refreshIndicatorStyle}
        visible={visible}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  scrollWrap: {
    flexShrink: 1,
  },
  innerScroll: {
    flexShrink: 1,
  },
  indicatorWrap: {
    alignItems: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: theme.spacing.md,
    zIndex: 30,
  },
  indicator: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    borderColor: theme.colors.hairline,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    ...theme.shadow.card,
  },
  indicatorText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    fontWeight: '800',
  },
});
