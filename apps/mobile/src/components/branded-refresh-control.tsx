import {
  forwardRef,
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  GestureResponderEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  RefreshControlProps,
  ScrollViewProps,
} from 'react-native';
import {
  ActivityIndicator,
  PanResponder,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import type { PanResponderGestureState } from 'react-native';

import { AppText } from '@/components/app-text';
import { triggerAppRefreshReadyHaptic } from '@/lib/app-haptics';
import { theme } from '@/lib/theme';
import { useAppTheme } from '@/providers/theme-provider';

const DEFAULT_REFRESH_PROGRESS_OFFSET = theme.spacing.xl + theme.spacing.md;
const TRANSPARENT_REFRESH_COLOR = 'rgba(0, 0, 0, 0)';
const ANDROID_PULL_TRIGGER_DISTANCE = 42;
const ANDROID_PULL_MAX_DISTANCE = 88;
const ANDROID_PULL_RESISTANCE = 0.78;
const ANDROID_PULL_MIN_VISIBLE_DISTANCE = 2;
const ANDROID_PULL_INDICATOR_SIZE = 42;
const ANDROID_PULL_VERTICAL_DOMINANCE = 1.05;
const ANDROID_PULL_FAST_TRIGGER_DISTANCE = 18;
const ANDROID_PULL_FAST_TRIGGER_VELOCITY = 0.38;
const ANDROID_PULL_CONTENT_MAX_OFFSET = 56;
const ANDROID_PULL_CONTENT_REFRESHING_OFFSET = 44;
const ANDROID_PULL_CONTENT_OFFSET_FACTOR = 0.55;

export interface BrandedRefreshProps {
  readonly label?: string;
  readonly nativeIndicatorVisible?: boolean;
  readonly nativeIndicatorTopInset?: number;
  readonly onRefresh: () => void | Promise<void>;
  readonly progressViewOffset?: number;
  readonly refreshing: boolean;
}

export interface BrandedRefreshScrollViewProps extends Omit<ScrollViewProps, 'refreshControl'> {
  readonly fillViewport?: boolean;
  readonly refresh?: BrandedRefreshProps;
}

export interface BrandedRefreshVirtualizedListProps {
  readonly onScroll?: ScrollViewProps['onScroll'];
  readonly onTouchCancel?: ScrollViewProps['onTouchCancel'];
  readonly onTouchEnd?: ScrollViewProps['onTouchEnd'];
  readonly onTouchMove?: ScrollViewProps['onTouchMove'];
  readonly onTouchStart?: ScrollViewProps['onTouchStart'];
  readonly refreshControl?: ReactElement<RefreshControlProps>;
  readonly scrollEventThrottle?: ScrollViewProps['scrollEventThrottle'];
}

export interface BrandedRefreshVirtualizedListContainerProps {
  readonly children: (props: BrandedRefreshVirtualizedListProps) => ReactNode;
  readonly refresh: BrandedRefreshProps;
}

function startRefresh(refresh: BrandedRefreshProps | undefined) {
  if (!refresh || refresh.refreshing) {
    return;
  }

  void Promise.resolve(refresh.onRefresh()).catch(() => undefined);
}

function androidRefreshLabel(refresh: BrandedRefreshProps, progress: number) {
  if (refresh.refreshing) {
    return refresh.label ?? 'Sincronizando';
  }

  return progress >= 1 ? 'Suelta para sincronizar' : 'Desliza para sincronizar';
}

function isAndroidPullGesture(horizontalDistance: number, dragDistance: number) {
  return (
    dragDistance > ANDROID_PULL_MIN_VISIBLE_DISTANCE &&
    dragDistance > horizontalDistance * ANDROID_PULL_VERTICAL_DOMINANCE
  );
}

function isAndroidFastPullGestureByMetrics(
  horizontalDistance: number,
  dragDistance: number,
  verticalVelocity: number,
) {
  return (
    dragDistance >= ANDROID_PULL_FAST_TRIGGER_DISTANCE &&
    verticalVelocity >= ANDROID_PULL_FAST_TRIGGER_VELOCITY &&
    dragDistance > horizontalDistance * 0.75
  );
}

function isAndroidFastPullGesture(gestureState: PanResponderGestureState) {
  return isAndroidFastPullGestureByMetrics(
    Math.abs(gestureState.dx),
    gestureState.dy,
    gestureState.vy,
  );
}

function measureAndroidTouchVelocity(
  lastMoveRef: { current: { readonly timestamp: number; readonly y: number } | null },
  nextY: number,
) {
  const now = Date.now();
  const lastMove = lastMoveRef.current;
  lastMoveRef.current = { timestamp: now, y: nextY };

  if (!lastMove) {
    return 0;
  }

  return (nextY - lastMove.y) / Math.max(1, now - lastMove.timestamp);
}

function getAndroidPullDistance(dragDistance: number) {
  const resistedDistance = Math.min(
    ANDROID_PULL_MAX_DISTANCE,
    dragDistance * ANDROID_PULL_RESISTANCE,
  );

  return resistedDistance > ANDROID_PULL_MIN_VISIBLE_DISTANCE ? resistedDistance : 0;
}

function getAndroidRefreshContentOffset(pullDistance: number, refreshing: boolean) {
  if (refreshing) {
    return ANDROID_PULL_CONTENT_REFRESHING_OFFSET;
  }

  return Math.min(
    ANDROID_PULL_CONTENT_MAX_OFFSET,
    Math.round(pullDistance * ANDROID_PULL_CONTENT_OFFSET_FACTOR),
  );
}

function updateAndroidThresholdHaptic(
  thresholdReachedRef: { current: boolean },
  nextDistance: number,
) {
  const thresholdReached = nextDistance >= ANDROID_PULL_TRIGGER_DISTANCE;

  if (thresholdReached && !thresholdReachedRef.current) {
    triggerAppRefreshReadyHaptic();
  }

  thresholdReachedRef.current = thresholdReached;
}

export function BrandedRefreshControl({ refresh }: { readonly refresh: BrandedRefreshProps }) {
  const activeTheme = useAppTheme();

  function handleRefresh() {
    startRefresh(refresh);
  }

  const progressViewOffset = refresh.progressViewOffset ?? DEFAULT_REFRESH_PROGRESS_OFFSET;
  const nativeIndicatorVisible = refresh.nativeIndicatorVisible !== false;
  const indicatorColors = nativeIndicatorVisible
    ? [activeTheme.colors.primary, activeTheme.colors.brandGreen, activeTheme.colors.brandCoral]
    : [TRANSPARENT_REFRESH_COLOR];
  const indicatorBackgroundColor = nativeIndicatorVisible
    ? activeTheme.colors.surface
    : TRANSPARENT_REFRESH_COLOR;
  const indicatorTextColor = nativeIndicatorVisible
    ? activeTheme.colors.textMuted
    : TRANSPARENT_REFRESH_COLOR;

  return (
    <RefreshControl
      key={`refresh-control-${Math.round(progressViewOffset)}`}
      colors={indicatorColors}
      enabled
      onRefresh={handleRefresh}
      progressBackgroundColor={indicatorBackgroundColor}
      progressViewOffset={progressViewOffset}
      refreshing={refresh.refreshing}
      tintColor={nativeIndicatorVisible ? activeTheme.colors.primary : TRANSPARENT_REFRESH_COLOR}
      title={
        Platform.OS === 'ios' && nativeIndicatorVisible
          ? (refresh.label ?? 'Sincronizando')
          : undefined
      }
      titleColor={indicatorTextColor}
    />
  );
}

export function BrandedRefreshVirtualizedListContainer({
  children,
  refresh,
}: BrandedRefreshVirtualizedListContainerProps) {
  const activeTheme = useAppTheme();
  const [androidPullDistance, setAndroidPullDistance] = useState(0);
  const androidFastPullCandidateRef = useRef(false);
  const androidLastTouchMoveRef = useRef<{ readonly timestamp: number; readonly y: number } | null>(
    null,
  );
  const androidPullDistanceRef = useRef(0);
  const androidRefreshActiveRef = useRef(false);
  const androidScrollYRef = useRef(0);
  const androidThresholdReachedRef = useRef(false);
  const androidTouchStartXRef = useRef<number | null>(null);
  const androidTouchStartYRef = useRef<number | null>(null);

  const setAndroidPullDistanceValue = useCallback((nextDistance: number) => {
    const roundedDistance = Math.max(0, Math.round(nextDistance));

    if (roundedDistance === androidPullDistanceRef.current) {
      return;
    }

    androidPullDistanceRef.current = roundedDistance;
    setAndroidPullDistance(roundedDistance);
  }, []);

  const handleAndroidScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    androidScrollYRef.current = Math.max(0, event.nativeEvent.contentOffset.y);
  }, []);

  const handleAndroidTouchStart = useCallback((event: GestureResponderEvent) => {
    androidFastPullCandidateRef.current = false;
    androidLastTouchMoveRef.current = {
      timestamp: Date.now(),
      y: event.nativeEvent.pageY,
    };
    androidTouchStartXRef.current = event.nativeEvent.pageX;
    androidTouchStartYRef.current = event.nativeEvent.pageY;
  }, []);

  const handleAndroidTouchMove = useCallback(
    (event: GestureResponderEvent) => {
      if (refresh.refreshing) {
        return;
      }

      const touchStartX = androidTouchStartXRef.current;
      const touchStartY = androidTouchStartYRef.current;

      if (touchStartX == null || touchStartY == null) {
        return;
      }

      const horizontalDistance = Math.abs(event.nativeEvent.pageX - touchStartX);
      const dragDistance = event.nativeEvent.pageY - touchStartY;
      const verticalVelocity = measureAndroidTouchVelocity(
        androidLastTouchMoveRef,
        event.nativeEvent.pageY,
      );
      const isPullGesture = isAndroidPullGesture(horizontalDistance, dragDistance);
      const isFastPullGesture = isAndroidFastPullGestureByMetrics(
        horizontalDistance,
        dragDistance,
        verticalVelocity,
      );

      if (androidScrollYRef.current > 1 || (!isPullGesture && !isFastPullGesture)) {
        androidThresholdReachedRef.current = false;
        setAndroidPullDistanceValue(0);
        return;
      }

      androidFastPullCandidateRef.current =
        androidFastPullCandidateRef.current || isFastPullGesture;
      const nextDistance = getAndroidPullDistance(dragDistance);

      updateAndroidThresholdHaptic(androidThresholdReachedRef, nextDistance);
      setAndroidPullDistanceValue(nextDistance);
    },
    [refresh.refreshing, setAndroidPullDistanceValue],
  );

  const handleAndroidPanMove = useCallback(
    (_event: GestureResponderEvent, gestureState: PanResponderGestureState) => {
      if (refresh.refreshing) {
        return;
      }

      const horizontalDistance = Math.abs(gestureState.dx);
      const dragDistance = gestureState.dy;
      const isPullGesture = isAndroidPullGesture(horizontalDistance, dragDistance);
      const isFastPullGesture = isAndroidFastPullGesture(gestureState);

      if (androidScrollYRef.current > 1 || (!isPullGesture && !isFastPullGesture)) {
        androidThresholdReachedRef.current = false;
        setAndroidPullDistanceValue(0);
        return;
      }

      androidFastPullCandidateRef.current =
        androidFastPullCandidateRef.current || isFastPullGesture;
      const nextDistance = getAndroidPullDistance(dragDistance);

      updateAndroidThresholdHaptic(androidThresholdReachedRef, nextDistance);
      setAndroidPullDistanceValue(nextDistance);
    },
    [refresh.refreshing, setAndroidPullDistanceValue],
  );

  const finishAndroidPull = useCallback(
    (gestureState?: PanResponderGestureState) => {
      const shouldFastRefresh =
        androidScrollYRef.current <= 1 &&
        (androidFastPullCandidateRef.current ||
          (gestureState != null && isAndroidFastPullGesture(gestureState)));
      const shouldRefresh =
        !refresh.refreshing &&
        (androidPullDistanceRef.current >= ANDROID_PULL_TRIGGER_DISTANCE || shouldFastRefresh);

      androidTouchStartXRef.current = null;
      androidTouchStartYRef.current = null;
      androidFastPullCandidateRef.current = false;
      androidLastTouchMoveRef.current = null;
      androidThresholdReachedRef.current = false;

      if (shouldRefresh) {
        setAndroidPullDistanceValue(ANDROID_PULL_TRIGGER_DISTANCE);
        startRefresh(refresh);
        return;
      }

      setAndroidPullDistanceValue(0);
    },
    [refresh, setAndroidPullDistanceValue],
  );

  const handleAndroidPanRelease = useCallback(
    (_event: GestureResponderEvent, gestureState: PanResponderGestureState) => {
      finishAndroidPull(gestureState);
    },
    [finishAndroidPull],
  );

  const handleAndroidTouchEnd = useCallback(() => {
    finishAndroidPull();
  }, [finishAndroidPull]);

  const handleAndroidTouchCancel = useCallback(() => {
    androidTouchStartXRef.current = null;
    androidTouchStartYRef.current = null;
    androidFastPullCandidateRef.current = false;
    androidLastTouchMoveRef.current = null;
    androidThresholdReachedRef.current = false;
    setAndroidPullDistanceValue(0);
  }, [setAndroidPullDistanceValue]);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }

    if (refresh.refreshing) {
      androidRefreshActiveRef.current = true;
      return;
    }

    if (androidRefreshActiveRef.current) {
      androidRefreshActiveRef.current = false;
      androidThresholdReachedRef.current = false;
      setAndroidPullDistanceValue(0);
    }
  }, [refresh.refreshing, setAndroidPullDistanceValue]);

  const androidPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_event, gestureState) =>
          Platform.OS === 'android' &&
          !refresh.refreshing &&
          androidScrollYRef.current <= 1 &&
          (isAndroidPullGesture(Math.abs(gestureState.dx), gestureState.dy) ||
            isAndroidFastPullGesture(gestureState)),
        onMoveShouldSetPanResponder: (_event, gestureState) =>
          Platform.OS === 'android' &&
          !refresh.refreshing &&
          androidScrollYRef.current <= 1 &&
          (isAndroidPullGesture(Math.abs(gestureState.dx), gestureState.dy) ||
            isAndroidFastPullGesture(gestureState)),
        onPanResponderMove: handleAndroidPanMove,
        onPanResponderRelease: handleAndroidPanRelease,
        onPanResponderTerminate: handleAndroidTouchCancel,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
      }),
    [handleAndroidPanMove, handleAndroidPanRelease, handleAndroidTouchCancel, refresh.refreshing],
  );

  if (Platform.OS === 'web') {
    return <>{children({})}</>;
  }

  if (Platform.OS !== 'android') {
    return <>{children({ refreshControl: <BrandedRefreshControl refresh={refresh} /> })}</>;
  }

  const androidIndicatorProgress = refresh.refreshing
    ? 1
    : Math.min(androidPullDistance / ANDROID_PULL_TRIGGER_DISTANCE, 1);
  const shouldShowAndroidIndicator = androidPullDistance > 0 || refresh.refreshing;
  const androidContentOffset = getAndroidRefreshContentOffset(
    androidPullDistance,
    refresh.refreshing,
  );
  const androidIndicatorTop = Math.max(
    theme.spacing.sm,
    (refresh.progressViewOffset ?? DEFAULT_REFRESH_PROGRESS_OFFSET) -
      ANDROID_PULL_INDICATOR_SIZE / 2,
  );

  return (
    <View
      {...androidPanResponder.panHandlers}
      collapsable={false}
      style={styles.virtualizedRefreshWrap}
    >
      <View
        style={[
          styles.androidRefreshContent,
          androidContentOffset > 0 ? { transform: [{ translateY: androidContentOffset }] } : null,
        ]}
      >
        {children({
          onScroll: handleAndroidScroll,
          onTouchCancel: handleAndroidTouchCancel,
          onTouchEnd: handleAndroidTouchEnd,
          onTouchMove: handleAndroidTouchMove,
          onTouchStart: handleAndroidTouchStart,
          scrollEventThrottle: 16,
        })}
      </View>
      {shouldShowAndroidIndicator ? (
        <View
          pointerEvents="none"
          style={[
            styles.androidRefreshIndicator,
            {
              backgroundColor: activeTheme.colors.floatingSurface,
              borderColor: activeTheme.colors.hairline,
              opacity: Math.max(0.42, androidIndicatorProgress),
              top: androidIndicatorTop,
              transform: [
                { translateY: refresh.refreshing ? 0 : -10 + androidIndicatorProgress * 10 },
                { scale: 0.92 + androidIndicatorProgress * 0.08 },
              ],
            },
          ]}
        >
          <ActivityIndicator animating color={activeTheme.colors.primary} size="small" />
          <AppText style={[styles.androidRefreshLabel, { color: activeTheme.colors.textMuted }]}>
            {androidRefreshLabel(refresh, androidIndicatorProgress)}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

export const BrandedRefreshScrollView = forwardRef<ScrollView, BrandedRefreshScrollViewProps>(
  function BrandedRefreshScrollView(
    {
      alwaysBounceVertical,
      bounces,
      children,
      contentContainerStyle,
      contentInset,
      contentOffset,
      fillViewport = false,
      keyboardDismissMode,
      onScroll,
      onTouchCancel,
      onTouchEnd,
      onTouchMove,
      onTouchStart,
      refresh,
      scrollEventThrottle,
      showsVerticalScrollIndicator,
      style,
      ...props
    },
    ref,
  ) {
    const activeTheme = useAppTheme();
    const refreshEnabled = Boolean(refresh);
    const [androidPullDistance, setAndroidPullDistance] = useState(0);
    const androidFastPullCandidateRef = useRef(false);
    const androidLastTouchMoveRef = useRef<{
      readonly timestamp: number;
      readonly y: number;
    } | null>(null);
    const androidPullDistanceRef = useRef(0);
    const androidRefreshActiveRef = useRef(false);
    const androidScrollYRef = useRef(0);
    const androidThresholdReachedRef = useRef(false);
    const androidTouchStartXRef = useRef<number | null>(null);
    const androidTouchStartYRef = useRef<number | null>(null);

    const iosNativeIndicatorTopInset =
      Platform.OS === 'ios' ? (refresh?.nativeIndicatorTopInset ?? 0) : 0;
    const resolvedContentInset = useMemo(
      () =>
        iosNativeIndicatorTopInset > 0
          ? {
              ...contentInset,
              top: (contentInset?.top ?? 0) + iosNativeIndicatorTopInset,
            }
          : contentInset,
      [contentInset, iosNativeIndicatorTopInset],
    );
    const resolvedContentOffset = useMemo(
      () =>
        iosNativeIndicatorTopInset > 0 && !contentOffset
          ? {
              x: 0,
              y: -iosNativeIndicatorTopInset,
            }
          : contentOffset,
      [contentOffset, iosNativeIndicatorTopInset],
    );
    const nativeRefreshControl =
      refresh && Platform.OS === 'ios' ? <BrandedRefreshControl refresh={refresh} /> : undefined;

    const setAndroidPullDistanceValue = useCallback((nextDistance: number) => {
      const roundedDistance = Math.max(0, Math.round(nextDistance));

      if (roundedDistance === androidPullDistanceRef.current) {
        return;
      }

      androidPullDistanceRef.current = roundedDistance;
      setAndroidPullDistance(roundedDistance);
    }, []);

    const handleAndroidScroll = useCallback(
      (event: NativeSyntheticEvent<NativeScrollEvent>) => {
        androidScrollYRef.current = Math.max(0, event.nativeEvent.contentOffset.y);
        onScroll?.(event);
      },
      [onScroll],
    );

    const handleAndroidTouchStart = useCallback(
      (event: GestureResponderEvent) => {
        androidFastPullCandidateRef.current = false;
        androidLastTouchMoveRef.current = {
          timestamp: Date.now(),
          y: event.nativeEvent.pageY,
        };
        androidTouchStartXRef.current = event.nativeEvent.pageX;
        androidTouchStartYRef.current = event.nativeEvent.pageY;
        onTouchStart?.(event);
      },
      [onTouchStart],
    );

    const handleAndroidTouchMove = useCallback(
      (event: GestureResponderEvent) => {
        onTouchMove?.(event);

        if (!refresh || refresh.refreshing) {
          return;
        }

        const touchStartX = androidTouchStartXRef.current;
        const touchStartY = androidTouchStartYRef.current;

        if (touchStartX == null || touchStartY == null) {
          return;
        }

        const horizontalDistance = Math.abs(event.nativeEvent.pageX - touchStartX);
        const dragDistance = event.nativeEvent.pageY - touchStartY;
        const verticalVelocity = measureAndroidTouchVelocity(
          androidLastTouchMoveRef,
          event.nativeEvent.pageY,
        );
        const isPullGesture = isAndroidPullGesture(horizontalDistance, dragDistance);
        const isFastPullGesture = isAndroidFastPullGestureByMetrics(
          horizontalDistance,
          dragDistance,
          verticalVelocity,
        );

        if (androidScrollYRef.current > 1 || (!isPullGesture && !isFastPullGesture)) {
          androidThresholdReachedRef.current = false;
          setAndroidPullDistanceValue(0);
          return;
        }

        androidFastPullCandidateRef.current =
          androidFastPullCandidateRef.current || isFastPullGesture;
        const nextDistance = getAndroidPullDistance(dragDistance);

        updateAndroidThresholdHaptic(androidThresholdReachedRef, nextDistance);
        setAndroidPullDistanceValue(nextDistance);
      },
      [onTouchMove, refresh, setAndroidPullDistanceValue],
    );

    const handleAndroidPanMove = useCallback(
      (_event: GestureResponderEvent, gestureState: PanResponderGestureState) => {
        if (!refresh || refresh.refreshing) {
          return;
        }

        const horizontalDistance = Math.abs(gestureState.dx);
        const dragDistance = gestureState.dy;
        const isPullGesture = isAndroidPullGesture(horizontalDistance, dragDistance);
        const isFastPullGesture = isAndroidFastPullGesture(gestureState);

        if (androidScrollYRef.current > 1 || (!isPullGesture && !isFastPullGesture)) {
          androidThresholdReachedRef.current = false;
          setAndroidPullDistanceValue(0);
          return;
        }

        androidFastPullCandidateRef.current =
          androidFastPullCandidateRef.current || isFastPullGesture;
        const nextDistance = getAndroidPullDistance(dragDistance);

        updateAndroidThresholdHaptic(androidThresholdReachedRef, nextDistance);
        setAndroidPullDistanceValue(nextDistance);
      },
      [refresh, setAndroidPullDistanceValue],
    );

    const finishAndroidPull = useCallback(
      (gestureState?: PanResponderGestureState) => {
        const shouldFastRefresh =
          androidScrollYRef.current <= 1 &&
          (androidFastPullCandidateRef.current ||
            (gestureState != null && isAndroidFastPullGesture(gestureState)));
        const shouldRefresh =
          Boolean(refresh) &&
          !refresh?.refreshing &&
          (androidPullDistanceRef.current >= ANDROID_PULL_TRIGGER_DISTANCE || shouldFastRefresh);

        androidTouchStartXRef.current = null;
        androidTouchStartYRef.current = null;
        androidFastPullCandidateRef.current = false;
        androidLastTouchMoveRef.current = null;
        androidThresholdReachedRef.current = false;

        if (shouldRefresh) {
          setAndroidPullDistanceValue(ANDROID_PULL_TRIGGER_DISTANCE);
          startRefresh(refresh);
          return;
        }

        setAndroidPullDistanceValue(0);
      },
      [refresh, setAndroidPullDistanceValue],
    );

    const handleAndroidPanRelease = useCallback(
      (_event: GestureResponderEvent, gestureState: PanResponderGestureState) => {
        finishAndroidPull(gestureState);
      },
      [finishAndroidPull],
    );

    const handleAndroidTouchEnd = useCallback(
      (event: GestureResponderEvent) => {
        onTouchEnd?.(event);
        finishAndroidPull();
      },
      [finishAndroidPull, onTouchEnd],
    );

    const handleAndroidTouchCancel = useCallback(
      (event: GestureResponderEvent) => {
        onTouchCancel?.(event);
        androidTouchStartXRef.current = null;
        androidTouchStartYRef.current = null;
        androidFastPullCandidateRef.current = false;
        androidLastTouchMoveRef.current = null;
        androidThresholdReachedRef.current = false;
        setAndroidPullDistanceValue(0);
      },
      [onTouchCancel, setAndroidPullDistanceValue],
    );

    useEffect(() => {
      if (Platform.OS !== 'android' || !refresh) {
        return;
      }

      if (refresh.refreshing) {
        androidRefreshActiveRef.current = true;
        return;
      }

      if (androidRefreshActiveRef.current) {
        androidRefreshActiveRef.current = false;
        androidThresholdReachedRef.current = false;
        setAndroidPullDistanceValue(0);
      }
    }, [refresh, refresh?.refreshing, setAndroidPullDistanceValue]);

    const androidPanResponder = useMemo(
      () =>
        PanResponder.create({
          onMoveShouldSetPanResponderCapture: (_event, gestureState) =>
            Platform.OS === 'android' &&
            Boolean(refresh) &&
            !refresh?.refreshing &&
            androidScrollYRef.current <= 1 &&
            (isAndroidPullGesture(Math.abs(gestureState.dx), gestureState.dy) ||
              isAndroidFastPullGesture(gestureState)),
          onMoveShouldSetPanResponder: (_event, gestureState) =>
            Platform.OS === 'android' &&
            Boolean(refresh) &&
            !refresh?.refreshing &&
            androidScrollYRef.current <= 1 &&
            (isAndroidPullGesture(Math.abs(gestureState.dx), gestureState.dy) ||
              isAndroidFastPullGesture(gestureState)),
          onPanResponderMove: handleAndroidPanMove,
          onPanResponderRelease: handleAndroidPanRelease,
          onPanResponderTerminate: handleAndroidTouchCancel,
          onPanResponderTerminationRequest: () => false,
          onShouldBlockNativeResponder: () => true,
        }),
      [
        handleAndroidPanMove,
        handleAndroidPanRelease,
        handleAndroidTouchCancel,
        refresh,
        refresh?.refreshing,
      ],
    );
    if (Platform.OS === 'android') {
      const androidIndicatorProgress = refresh?.refreshing
        ? 1
        : Math.min(androidPullDistance / ANDROID_PULL_TRIGGER_DISTANCE, 1);
      const shouldShowAndroidIndicator =
        refreshEnabled && (androidPullDistance > 0 || refresh?.refreshing);
      const androidContentOffset = getAndroidRefreshContentOffset(
        androidPullDistance,
        Boolean(refresh?.refreshing),
      );
      const androidIndicatorTop = Math.max(
        theme.spacing.sm,
        (refresh?.progressViewOffset ?? DEFAULT_REFRESH_PROGRESS_OFFSET) -
          ANDROID_PULL_INDICATOR_SIZE / 2,
      );

      return (
        <View
          {...androidPanResponder.panHandlers}
          collapsable={false}
          style={[styles.scrollWrap, fillViewport ? styles.scrollWrapFill : null, style]}
        >
          <ScrollView
            {...props}
            alwaysBounceVertical={refreshEnabled ? true : alwaysBounceVertical}
            bounces={refreshEnabled ? true : bounces}
            contentContainerStyle={contentContainerStyle}
            keyboardDismissMode={keyboardDismissMode ?? 'on-drag'}
            onScroll={handleAndroidScroll}
            onTouchCancel={handleAndroidTouchCancel}
            onTouchEnd={handleAndroidTouchEnd}
            onTouchMove={handleAndroidTouchMove}
            onTouchStart={handleAndroidTouchStart}
            ref={ref}
            removeClippedSubviews={false}
            scrollEventThrottle={
              scrollEventThrottle ?? (refreshEnabled || onScroll ? 16 : undefined)
            }
            showsVerticalScrollIndicator={showsVerticalScrollIndicator ?? false}
            style={[
              styles.androidScrollView,
              fillViewport ? styles.innerScrollFill : null,
              androidContentOffset > 0
                ? { transform: [{ translateY: androidContentOffset }] }
                : null,
            ]}
          >
            {children}
          </ScrollView>
          {shouldShowAndroidIndicator ? (
            <View
              pointerEvents="none"
              style={[
                styles.androidRefreshIndicator,
                {
                  backgroundColor: activeTheme.colors.floatingSurface,
                  borderColor: activeTheme.colors.hairline,
                  opacity: Math.max(0.42, androidIndicatorProgress),
                  top: androidIndicatorTop,
                  transform: [
                    { translateY: refresh?.refreshing ? 0 : -10 + androidIndicatorProgress * 10 },
                    { scale: 0.92 + androidIndicatorProgress * 0.08 },
                  ],
                },
              ]}
            >
              <ActivityIndicator animating color={activeTheme.colors.primary} size="small" />
              <AppText
                style={[styles.androidRefreshLabel, { color: activeTheme.colors.textMuted }]}
              >
                {refresh ? androidRefreshLabel(refresh, androidIndicatorProgress) : null}
              </AppText>
            </View>
          ) : null}
        </View>
      );
    }

    return (
      <View
        collapsable={false}
        style={[styles.scrollWrap, fillViewport ? styles.scrollWrapFill : null, style]}
      >
        <ScrollView
          {...props}
          alwaysBounceVertical={refreshEnabled ? true : alwaysBounceVertical}
          bounces={refreshEnabled ? true : bounces}
          contentContainerStyle={contentContainerStyle}
          contentInset={resolvedContentInset}
          contentOffset={resolvedContentOffset}
          keyboardDismissMode={
            keyboardDismissMode ?? (Platform.OS === 'ios' ? 'interactive' : 'on-drag')
          }
          onScroll={onScroll}
          ref={ref}
          refreshControl={nativeRefreshControl}
          removeClippedSubviews={false}
          scrollEventThrottle={scrollEventThrottle ?? (refreshEnabled || onScroll ? 16 : undefined)}
          showsVerticalScrollIndicator={showsVerticalScrollIndicator ?? false}
          style={[styles.innerScroll, fillViewport ? styles.innerScrollFill : null]}
        >
          {children}
        </ScrollView>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  scrollWrap: {
    flexShrink: 1,
    overflow: 'visible',
    position: 'relative',
  },
  scrollWrapFill: {
    flex: 1,
    minHeight: 0,
  },
  innerScroll: {
    flexShrink: 1,
  },
  innerScrollFill: {
    flex: 1,
    minHeight: 0,
  },
  androidScrollView: {
    flexShrink: 1,
  },
  androidRefreshContent: {
    flex: 1,
    minHeight: 0,
  },
  virtualizedRefreshWrap: {
    flex: 1,
    minHeight: 0,
    overflow: 'visible',
    position: 'relative',
  },
  androidRefreshIndicator: {
    alignItems: 'center',
    alignSelf: 'center',
    borderRadius: theme.radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 6,
    flexDirection: 'row',
    gap: theme.spacing.xs,
    minHeight: ANDROID_PULL_INDICATOR_SIZE,
    paddingHorizontal: theme.spacing.md,
    position: 'absolute',
    zIndex: 4,
  },
  androidRefreshLabel: {
    fontSize: theme.typography.caption,
    fontWeight: '700',
    lineHeight: 16,
  },
});
