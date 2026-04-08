import type { PropsWithChildren, ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/lib/theme';

export interface ScreenShellProps extends PropsWithChildren {
  readonly title: string;
  readonly subtitle?: string;
  readonly largeTitle?: boolean;
  readonly headerSlot?: ReactNode;
  readonly footer?: ReactNode;
  readonly contentContainerStyle?: StyleProp<ViewStyle>;
}

export function ScreenShell({
  title,
  subtitle,
  largeTitle = true,
  headerSlot,
  footer,
  children,
  contentContainerStyle,
}: ScreenShellProps) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, footer ? styles.contentWithFooter : null, contentContainerStyle]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.heroHeader}>
            <Text style={[styles.title, largeTitle ? styles.largeTitle : styles.compactTitle]}>{title}</Text>
            {headerSlot}
          </View>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {children}
      </ScrollView>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
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
    gap: theme.spacing.md,
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
  contentWithFooter: {
    paddingBottom: 140,
  },
  hero: {
    gap: theme.spacing.xs,
    paddingBottom: theme.spacing.xs,
    paddingTop: theme.spacing.xs,
  },
  heroHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  title: {
    color: theme.colors.text,
    flex: 1,
    fontWeight: '800',
  },
  largeTitle: {
    fontSize: theme.typography.largeTitle,
    lineHeight: 40,
  },
  compactTitle: {
    fontSize: theme.typography.title2,
    lineHeight: 28,
  },
  subtitle: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.callout,
    lineHeight: 22,
  },
  footer: {
    backgroundColor: theme.colors.background,
    borderTopColor: theme.colors.hairline,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingBottom: theme.spacing.lg,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
  },
});
