import type { PropsWithChildren, ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { theme } from '@/lib/theme';

export interface ScreenShellProps extends PropsWithChildren {
  readonly title: string;
  readonly subtitle?: string;
  readonly eyebrow?: string;
  readonly largeTitle?: boolean;
  readonly headerVariant?: 'card' | 'plain';
  readonly headerSlot?: ReactNode;
  readonly footer?: ReactNode;
  readonly contentContainerStyle?: StyleProp<ViewStyle>;
}

export function ScreenShell({
  title,
  subtitle,
  eyebrow,
  largeTitle = true,
  headerVariant = 'card',
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
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.contentWidth}>
          <View style={[styles.hero, headerVariant === 'card' ? styles.heroCard : styles.heroPlain]}>
            {eyebrow ? (
              <View style={styles.eyebrowBadge}>
                <Text style={styles.eyebrowText}>{eyebrow}</Text>
              </View>
            ) : null}
            <View style={styles.heroHeader}>
              <Text style={[styles.title, largeTitle ? styles.largeTitle : styles.compactTitle]}>{title}</Text>
              {headerSlot}
            </View>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
          {children}
        </View>
      </ScrollView>
      {footer ? (
        <View style={styles.footer}>
          <View style={styles.contentWidth}>{footer}</View>
        </View>
      ) : null}
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
    gap: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
  },
  contentWithFooter: {
    paddingBottom: 140,
  },
  contentWidth: {
    alignSelf: 'center',
    gap: theme.spacing.lg,
    maxWidth: 560,
    width: '100%',
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
  title: {
    color: theme.colors.text,
    flex: 1,
    fontWeight: '800',
  },
  largeTitle: {
    fontSize: theme.typography.largeTitle,
    letterSpacing: -1,
    lineHeight: 40,
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
