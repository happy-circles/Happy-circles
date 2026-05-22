import type { PropsWithChildren, ReactNode, RefObject } from 'react';
import type { ScrollView, ScrollViewProps, StyleProp, ViewStyle } from 'react-native';
import { Animated, StyleSheet, View } from 'react-native';
import type { Edge } from 'react-native-safe-area-context';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  BrandedRefreshScrollView,
  type BrandedRefreshProps,
} from '@/components/branded-refresh-control';
import { theme } from '@/lib/theme';
import { AppText } from '@/components/app-text';
import { useAppTheme } from '@/providers/theme-provider';

export interface ScreenShellProps extends PropsWithChildren {
  readonly title: string;
  readonly subtitle?: string;
  readonly eyebrow?: string;
  readonly largeTitle?: boolean;
  readonly titleSize?: 'largeTitle' | 'title1' | 'title2';
  readonly titleAlign?: 'left' | 'center';
  readonly headerVariant?: 'card' | 'plain';
  readonly headerLeading?: ReactNode;
  readonly headerTitle?: ReactNode;
  readonly headerSlot?: ReactNode;
  readonly contentMode?: 'contained' | 'full';
  readonly footer?: ReactNode;
  readonly footerDivider?: boolean;
  readonly headerVisible?: boolean;
  readonly overlay?: ReactNode;
  readonly refresh?: BrandedRefreshProps;
  readonly safeAreaEdges?: Edge[];
  readonly scrollEnabled?: boolean;
  readonly onMomentumScrollEnd?: ScrollViewProps['onMomentumScrollEnd'];
  readonly onScroll?: ScrollViewProps['onScroll'];
  readonly onScrollBeginDrag?: ScrollViewProps['onScrollBeginDrag'];
  readonly onScrollEndDrag?: ScrollViewProps['onScrollEndDrag'];
  readonly scrollEventThrottle?: ScrollViewProps['scrollEventThrottle'];
  readonly scrollViewRef?: RefObject<ScrollView | null>;
  readonly contentContainerStyle?: StyleProp<ViewStyle>;
  readonly contentWidthStyle?: StyleProp<ViewStyle>;
  readonly footerContainerStyle?: StyleProp<ViewStyle>;
}

const SCREEN_SHELL_FOOTER_SCROLL_CLEARANCE = 140;

export function ScreenShell({
  title,
  subtitle,
  eyebrow,
  largeTitle = true,
  titleSize,
  titleAlign = 'left',
  headerVariant = 'card',
  headerLeading,
  headerTitle,
  headerSlot,
  contentMode = 'contained',
  footer,
  footerDivider = true,
  headerVisible = true,
  overlay,
  refresh,
  safeAreaEdges = ['top', 'left', 'right'],
  scrollEnabled = true,
  onMomentumScrollEnd,
  onScroll,
  onScrollBeginDrag,
  onScrollEndDrag,
  scrollEventThrottle,
  scrollViewRef,
  children,
  contentContainerStyle,
  contentWidthStyle,
  footerContainerStyle,
}: ScreenShellProps) {
  const activeTheme = useAppTheme();
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(0, insets.bottom);
  const shouldUseScroll = scrollEnabled || Boolean(refresh);
  const resolvedTitleStyle =
    titleSize === 'largeTitle'
      ? styles.largeTitle
      : titleSize === 'title1'
        ? styles.title1
        : titleSize === 'title2'
          ? styles.compactTitle
          : largeTitle
            ? styles.largeTitle
            : styles.compactTitle;

  const headerNode = headerVisible ? (
    <View
      style={[
        styles.hero,
        headerVariant === 'card'
          ? [
              styles.heroCard,
              {
                backgroundColor: activeTheme.colors.floatingSurface,
                borderColor: activeTheme.colors.hairline,
              },
            ]
          : styles.heroPlain,
      ]}
    >
      {eyebrow ? (
        <View style={[styles.eyebrowBadge, { backgroundColor: activeTheme.colors.surfaceSoft }]}>
          <AppText style={[styles.eyebrowText, { color: activeTheme.colors.textMuted }]}>
            {eyebrow}
          </AppText>
        </View>
      ) : null}
      <View style={[styles.heroHeader, headerTitle ? styles.heroHeaderCentered : null]}>
        {headerTitle ? (
          <>
            {headerLeading}
            <View style={styles.headerTitleNode}>{headerTitle}</View>
            {headerSlot}
          </>
        ) : (
          <>
            {headerLeading}
            <AppText
              style={[
                styles.title,
                { color: activeTheme.colors.text },
                titleAlign === 'center' ? styles.titleCentered : null,
                resolvedTitleStyle,
              ]}
            >
              {title}
            </AppText>
            {headerSlot}
          </>
        )}
      </View>
      {subtitle ? (
        <AppText style={[styles.subtitle, { color: activeTheme.colors.textMuted }]}>
          {subtitle}
        </AppText>
      ) : null}
    </View>
  ) : null;

  const contentWidthStyles = [
    styles.contentWidth,
    !shouldUseScroll ? styles.contentWidthFixed : null,
    contentMode === 'full' ? styles.contentWidthFull : null,
    contentWidthStyle,
  ];
  const scrollBody = (
    <View style={contentWidthStyles}>
      {headerNode}
      {children}
    </View>
  );

  const contentStyle = [
    styles.content,
    !shouldUseScroll ? styles.contentFixed : null,
    contentMode === 'full' ? styles.contentFull : null,
    contentContainerStyle,
    // Footer clearance must win over screen-specific padding so fixed footers
    // cannot cover the last actionable controls on short screens.
    footer ? styles.contentWithFooter : null,
    footer ? { paddingBottom: SCREEN_SHELL_FOOTER_SCROLL_CLEARANCE + bottomInset } : null,
  ];
  const footerStyle = [
    styles.footer,
    {
      backgroundColor: activeTheme.colors.background,
      borderTopColor: activeTheme.colors.hairline,
    },
    { paddingBottom: theme.spacing.lg + bottomInset },
    !footerDivider ? styles.footerNoDivider : null,
    footerContainerStyle,
  ];

  return (
    <SafeAreaView
      edges={safeAreaEdges}
      style={[styles.safeArea, { backgroundColor: activeTheme.colors.background }]}
    >
      {shouldUseScroll ? (
        <BrandedRefreshScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={contentStyle}
          fillViewport
          keyboardShouldPersistTaps="handled"
          onMomentumScrollEnd={onMomentumScrollEnd}
          onScroll={onScroll}
          onScrollBeginDrag={onScrollBeginDrag}
          onScrollEndDrag={onScrollEndDrag}
          refresh={refresh}
          scrollEventThrottle={scrollEventThrottle}
          scrollEnabled={scrollEnabled}
          showsVerticalScrollIndicator={false}
        >
          {scrollBody}
        </BrandedRefreshScrollView>
      ) : (
        <View style={contentStyle}>{scrollBody}</View>
      )}
      {footer ? (
        <Animated.View style={footerStyle}>
          <View style={styles.contentWidth}>{footer}</View>
        </Animated.View>
      ) : null}
      {overlay}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    gap: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
  },
  contentFixed: {
    flex: 1,
  },
  contentFull: {
    paddingBottom: 0,
    paddingHorizontal: theme.spacing.lg,
  },
  contentWithFooter: {
    paddingBottom: SCREEN_SHELL_FOOTER_SCROLL_CLEARANCE,
  },
  contentWidth: {
    alignSelf: 'center',
    flexGrow: 1,
    gap: theme.spacing.lg,
    maxWidth: 560,
    width: '100%',
  },
  contentWidthFixed: {
    flex: 1,
  },
  contentWidthFull: {
    maxWidth: '100%',
  },
  hero: {
    gap: theme.spacing.sm,
  },
  heroCard: {
    borderRadius: theme.radius.large,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.lg,
  },
  heroPlain: {
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.xxs,
  },
  eyebrowBadge: {
    alignSelf: 'flex-start',
    borderRadius: theme.radius.small,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
  },
  eyebrowText: {
    fontSize: theme.typography.caption,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  heroHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.md,
    justifyContent: 'space-between',
  },
  heroHeaderCentered: {
    justifyContent: 'center',
  },
  headerTitleNode: {
    alignItems: 'center',
    flex: 1,
  },
  title: {
    flex: 1,
    fontWeight: '800',
  },
  titleCentered: {
    textAlign: 'center',
  },
  largeTitle: {
    fontSize: theme.typography.largeTitle,
    letterSpacing: -1,
    lineHeight: 40,
  },
  title1: {
    fontSize: theme.typography.title1,
    letterSpacing: -0.8,
    lineHeight: 34,
  },
  compactTitle: {
    fontSize: theme.typography.title2,
    letterSpacing: -0.5,
    lineHeight: 28,
  },
  subtitle: {
    fontSize: theme.typography.callout,
    lineHeight: 22,
    maxWidth: 470,
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingBottom: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
  },
  footerNoDivider: {
    borderTopWidth: 0,
  },
});
