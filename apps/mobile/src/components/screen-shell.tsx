import type { PropsWithChildren, ReactNode, RefObject } from 'react';
import type { ScrollView, ScrollViewProps, StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';
import type { Edge } from 'react-native-safe-area-context';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  BrandedRefreshScrollView,
  type BrandedRefreshProps,
} from '@/components/branded-refresh-control';
import { theme } from '@/lib/theme';
import { AppText } from '@/components/app-text';

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
  readonly onScroll?: ScrollViewProps['onScroll'];
  readonly scrollEventThrottle?: ScrollViewProps['scrollEventThrottle'];
  readonly scrollViewRef?: RefObject<ScrollView | null>;
  readonly contentContainerStyle?: StyleProp<ViewStyle>;
  readonly contentWidthStyle?: StyleProp<ViewStyle>;
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
  onScroll,
  scrollEventThrottle,
  scrollViewRef,
  children,
  contentContainerStyle,
  contentWidthStyle,
}: ScreenShellProps) {
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
    <View style={[styles.hero, headerVariant === 'card' ? styles.heroCard : styles.heroPlain]}>
      {eyebrow ? (
        <View style={styles.eyebrowBadge}>
          <AppText style={styles.eyebrowText}>{eyebrow}</AppText>
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
      {subtitle ? <AppText style={styles.subtitle}>{subtitle}</AppText> : null}
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
    footer ? styles.contentWithFooter : null,
    footer ? { paddingBottom: SCREEN_SHELL_FOOTER_SCROLL_CLEARANCE + bottomInset } : null,
    contentContainerStyle,
  ];
  const footerStyle = [
    styles.footer,
    { paddingBottom: theme.spacing.lg + bottomInset },
    !footerDivider ? styles.footerNoDivider : null,
  ];

  return (
    <SafeAreaView edges={safeAreaEdges} style={styles.safeArea}>
      {shouldUseScroll ? (
        <BrandedRefreshScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={contentStyle}
          fillViewport
          keyboardShouldPersistTaps="handled"
          onScroll={onScroll}
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
        <View style={footerStyle}>
          <View style={styles.contentWidth}>{footer}</View>
        </View>
      ) : null}
      {overlay}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
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
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    borderColor: theme.colors.hairline,
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
    backgroundColor: theme.colors.surfaceSoft,
    borderRadius: theme.radius.small,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
  },
  eyebrowText: {
    color: theme.colors.textMuted,
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
    color: theme.colors.text,
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
    color: theme.colors.textMuted,
    fontSize: theme.typography.callout,
    lineHeight: 22,
    maxWidth: 470,
  },
  footer: {
    backgroundColor: theme.colors.background,
    borderTopColor: theme.colors.hairline,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingBottom: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
  },
  footerNoDivider: {
    borderTopWidth: 0,
  },
});
