import { forwardRef } from 'react';
import type { ScrollViewProps } from 'react-native';
import { Platform, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { theme } from '@/lib/theme';

const REFRESH_PROGRESS_OFFSET = theme.spacing.xl + theme.spacing.md;

export interface BrandedRefreshProps {
  readonly label?: string;
  readonly onRefresh: () => void | Promise<void>;
  readonly refreshing: boolean;
}

export interface BrandedRefreshScrollViewProps
  extends Omit<ScrollViewProps, 'refreshControl'> {
  readonly fillViewport?: boolean;
  readonly refresh?: BrandedRefreshProps;
}

export const BrandedRefreshScrollView = forwardRef<
  ScrollView,
  BrandedRefreshScrollViewProps
>(function BrandedRefreshScrollView(
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

  const nativeRefreshControl = refresh ? (
    <RefreshControl
      colors={[theme.colors.primary, theme.colors.brandGreen, theme.colors.brandCoral]}
      enabled
      onRefresh={handleRefresh}
      progressBackgroundColor={theme.colors.surface}
      progressViewOffset={REFRESH_PROGRESS_OFFSET}
      refreshing={refresh.refreshing}
      tintColor={theme.colors.primary}
      title={Platform.OS === 'ios' ? (refresh.label ?? 'Sincronizando') : undefined}
      titleColor={theme.colors.textMuted}
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
});

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
