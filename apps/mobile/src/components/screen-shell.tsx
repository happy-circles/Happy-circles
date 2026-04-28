import type { PropsWithChildren, ReactNode, RefObject } from 'react';
import type { ScrollView, StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  BrandedRefreshScrollView,
  type BrandedRefreshProps,
} from '@/components/branded-refresh-control';
import { theme } from '@/lib/theme';

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
  readonly overlay?: ReactNode;
  readonly refresh?: BrandedRefreshProps;
  readonly scrollViewRef?: RefObject<ScrollView | null>;
  readonly contentContainerStyle?: StyleProp<ViewStyle>;
  readonly contentWidthStyle?: StyleProp<ViewStyle>;
}

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
  overlay,
  refresh,
  scrollViewRef,
  children,
  contentContainerStyle,
  contentWidthStyle,
}: ScreenShellProps) {
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

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <BrandedRefreshScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={[
          styles.content,
          contentMode === 'full' ? styles.contentFull : null,
          footer ? styles.contentWithFooter : null,
          contentContainerStyle,
        ]}
        keyboardShouldPersistTaps="handled"
        refresh={refresh}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.contentWidth,
            contentMode === 'full' ? styles.contentWidthFull : null,
            contentWidthStyle,
          ]}
        >
          <View
            style={[styles.hero, headerVariant === 'card' ? styles.heroCard : styles.heroPlain]}
          >
            {eyebrow ? (
              <View style={styles.eyebrowBadge}>
                <Text style={styles.eyebrowText}>{eyebrow}</Text>
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
                  <Text
                    style={[
                      styles.title,
                      titleAlign === 'center' ? styles.titleCentered : null,
                      resolvedTitleStyle,
                    ]}
                  >
                    {title}
                  </Text>
                  {headerSlot}
                </>
              )}
            </View>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
          {children}
        </View>
      </BrandedRefreshScrollView>
      {footer ? (
        <View style={styles.footer}>
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
  contentFull: {
    paddingBottom: 0,
    paddingHorizontal: theme.spacing.lg,
  },
  contentWithFooter: {
    paddingBottom: 140,
  },
  contentWidth: {
    alignSelf: 'center',
    flexGrow: 1,
    gap: theme.spacing.lg,
    maxWidth: 560,
    width: '100%',
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
    backgroundColor: 'rgba(247, 248, 251, 0.96)',
    borderTopColor: theme.colors.hairline,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingBottom: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
  },
});
