import { forwardRef, useMemo } from 'react';
import type { ScrollViewProps } from 'react-native';
import { Platform, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { theme } from '@/lib/theme';
import { useAppTheme } from '@/providers/theme-provider';

const DEFAULT_REFRESH_PROGRESS_OFFSET = theme.spacing.xl + theme.spacing.md;
const TRANSPARENT_REFRESH_COLOR = 'rgba(0, 0, 0, 0)';

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

export function BrandedRefreshControl({ refresh }: { readonly refresh: BrandedRefreshProps }) {
  const activeTheme = useAppTheme();

  function handleRefresh() {
    if (refresh.refreshing) {
      return;
    }

    void Promise.resolve(refresh.onRefresh()).catch(() => undefined);
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
      contentInset,
      contentOffset,
      fillViewport = false,
      keyboardDismissMode,
      onScroll,
      refresh,
      scrollEventThrottle,
      showsVerticalScrollIndicator,
      style,
      ...props
    },
    ref,
  ) {
    const refreshEnabled = Boolean(refresh);

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
      refresh && Platform.OS !== 'web' ? <BrandedRefreshControl refresh={refresh} /> : undefined;

    return (
      <View style={[styles.scrollWrap, fillViewport ? styles.scrollWrapFill : null, style]}>
        <ScrollView
          {...props}
          alwaysBounceVertical={refreshEnabled ? true : alwaysBounceVertical}
          bounces={refreshEnabled ? true : bounces}
          contentInset={resolvedContentInset}
          contentOffset={resolvedContentOffset}
          keyboardDismissMode={
            keyboardDismissMode ?? (Platform.OS === 'ios' ? 'interactive' : 'on-drag')
          }
          onScroll={onScroll}
          ref={ref}
          refreshControl={nativeRefreshControl}
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
  },
  innerScroll: {
    flexShrink: 1,
  },
  innerScrollFill: {
    flex: 1,
  },
});
