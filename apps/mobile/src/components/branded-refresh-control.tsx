import { forwardRef } from 'react';
import type { ScrollViewProps } from 'react-native';
import { Platform, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { theme } from '@/lib/theme';

const DEFAULT_REFRESH_PROGRESS_OFFSET = theme.spacing.xl + theme.spacing.md;
const TRANSPARENT_REFRESH_COLOR = 'rgba(0, 0, 0, 0)';

export interface BrandedRefreshProps {
  readonly label?: string;
  readonly nativeIndicatorVisible?: boolean;
  readonly onRefresh: () => void | Promise<void>;
  readonly progressViewOffset?: number;
  readonly refreshing: boolean;
}

export interface BrandedRefreshScrollViewProps extends Omit<ScrollViewProps, 'refreshControl'> {
  readonly fillViewport?: boolean;
  readonly refresh?: BrandedRefreshProps;
}

export const BrandedRefreshScrollView = forwardRef<ScrollView, BrandedRefreshScrollViewProps>(
  function BrandedRefreshScrollView(
    {
      alwaysBounceVertical,
      bounces,
      children,
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

    function handleRefresh() {
      if (!refresh || refresh.refreshing) {
        return;
      }

      void Promise.resolve(refresh.onRefresh()).catch(() => undefined);
    }

    const progressViewOffset = refresh?.progressViewOffset ?? DEFAULT_REFRESH_PROGRESS_OFFSET;
    const nativeIndicatorVisible = refresh?.nativeIndicatorVisible !== false;
    const nativeRefreshControl = refresh ? (
      <RefreshControl
        key={`refresh-control-${Math.round(progressViewOffset)}`}
        colors={
          nativeIndicatorVisible
            ? [theme.colors.primary, theme.colors.brandGreen, theme.colors.brandCoral]
            : [TRANSPARENT_REFRESH_COLOR]
        }
        enabled
        onRefresh={handleRefresh}
        progressBackgroundColor={
          nativeIndicatorVisible ? theme.colors.surface : TRANSPARENT_REFRESH_COLOR
        }
        progressViewOffset={progressViewOffset}
        refreshing={refresh.refreshing}
        tintColor={nativeIndicatorVisible ? theme.colors.primary : TRANSPARENT_REFRESH_COLOR}
        title={
          Platform.OS === 'ios' && nativeIndicatorVisible
            ? (refresh.label ?? 'Sincronizando')
            : undefined
        }
        titleColor={nativeIndicatorVisible ? theme.colors.textMuted : TRANSPARENT_REFRESH_COLOR}
      />
    ) : undefined;

    return (
      <View style={[styles.scrollWrap, fillViewport ? styles.scrollWrapFill : null, style]}>
        <ScrollView
          {...props}
          alwaysBounceVertical={refreshEnabled ? true : alwaysBounceVertical}
          bounces={refreshEnabled ? true : bounces}
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
