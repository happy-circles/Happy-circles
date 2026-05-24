import { forwardRef, useCallback, useMemo, useRef, useState } from 'react';
import type {
  GestureResponderEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollViewProps,
} from 'react-native';
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { AppText } from '@/components/app-text';
import { theme } from '@/lib/theme';
import { useAppTheme } from '@/providers/theme-provider';

const DEFAULT_REFRESH_PROGRESS_OFFSET = theme.spacing.xl + theme.spacing.md;
const TRANSPARENT_REFRESH_COLOR = 'rgba(0, 0, 0, 0)';
const ANDROID_PULL_TRIGGER_DISTANCE = 72;
const ANDROID_PULL_MAX_DISTANCE = 104;
const ANDROID_PULL_RESISTANCE = 0.52;
const ANDROID_PULL_MIN_VISIBLE_DISTANCE = 4;
const ANDROID_PULL_INDICATOR_SIZE = 42;
const ANDROID_PULL_VERTICAL_DOMINANCE = 1.35;

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

function startRefresh(refresh: BrandedRefreshProps | undefined) {
  if (!refresh || refresh.refreshing) {
    return;
  }

  void Promise.resolve(refresh.onRefresh()).catch(() => undefined);
}

export function BrandedRefreshControl({ refresh }: { readonly refresh: BrandedRefreshProps }) {
  const activeTheme = useAppTheme();

  function handleRefresh() {
    startRefresh(refresh);
  }

  const progressViewOffset = refresh.progressViewOffset ?? DEFAULT_REFRESH_PROGRESS_OFFSET;
  const nativeIndicatorVisible = refresh.nativeIndicatorVisible !== false;

  return (
    <RefreshControl
      key={`refresh-control-${Math.round(progressViewOffset)}`}
      colors={
        nativeIndicatorVisible
          ? [
              activeTheme.colors.primary,
              activeTheme.colors.brandGreen,
              activeTheme.colors.brandCoral,
            ]
          : [TRANSPARENT_REFRESH_COLOR]
      }
      enabled
      onRefresh={handleRefresh}
      progressBackgroundColor={
        nativeIndicatorVisible ? activeTheme.colors.surface : TRANSPARENT_REFRESH_COLOR
      }
      progressViewOffset={progressViewOffset}
      refreshing={refresh.refreshing}
      tintColor={nativeIndicatorVisible ? activeTheme.colors.primary : TRANSPARENT_REFRESH_COLOR}
      title={
        Platform.OS === 'ios' && nativeIndicatorVisible
          ? (refresh.label ?? 'Sincronizando')
          : undefined
      }
      titleColor={nativeIndicatorVisible ? activeTheme.colors.textMuted : TRANSPARENT_REFRESH_COLOR}
    />
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
    const androidPullDistanceRef = useRef(0);
    const androidScrollYRef = useRef(0);
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
    // Android/Fabric can collapse ScrollView content when native RefreshControl is attached.
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
        const isVerticalPull =
          dragDistance > ANDROID_PULL_MIN_VISIBLE_DISTANCE &&
          dragDistance > horizontalDistance * ANDROID_PULL_VERTICAL_DOMINANCE;

        if (androidScrollYRef.current > 1 || !isVerticalPull) {
          setAndroidPullDistanceValue(0);
          return;
        }

        const resistedDistance = Math.min(
          ANDROID_PULL_MAX_DISTANCE,
          dragDistance * ANDROID_PULL_RESISTANCE,
        );

        setAndroidPullDistanceValue(
          resistedDistance > ANDROID_PULL_MIN_VISIBLE_DISTANCE ? resistedDistance : 0,
        );
      },
      [onTouchMove, refresh, setAndroidPullDistanceValue],
    );

    const finishAndroidPull = useCallback(() => {
      const shouldRefresh =
        Boolean(refresh) &&
        !refresh?.refreshing &&
        androidPullDistanceRef.current >= ANDROID_PULL_TRIGGER_DISTANCE;

      androidTouchStartXRef.current = null;
      androidTouchStartYRef.current = null;
      setAndroidPullDistanceValue(0);

      if (shouldRefresh) {
        startRefresh(refresh);
      }
    }, [refresh, setAndroidPullDistanceValue]);

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
        setAndroidPullDistanceValue(0);
      },
      [onTouchCancel, setAndroidPullDistanceValue],
    );

    if (Platform.OS === 'android') {
      const androidIndicatorProgress = refresh?.refreshing
        ? 1
        : Math.min(androidPullDistance / ANDROID_PULL_TRIGGER_DISTANCE, 1);
      const shouldShowAndroidIndicator =
        refreshEnabled && (androidPullDistance > 0 || refresh?.refreshing);
      const androidIndicatorTop = Math.max(
        theme.spacing.sm,
        (refresh?.progressViewOffset ?? DEFAULT_REFRESH_PROGRESS_OFFSET) -
          ANDROID_PULL_INDICATOR_SIZE / 2,
      );

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
            style={[styles.androidScrollView, fillViewport ? styles.innerScrollFill : null]}
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
                {refresh?.refreshing
                  ? 'Sincronizando'
                  : (refresh?.label ?? 'Suelta para actualizar')}
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
