import type { PropsWithChildren } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/lib/theme';

export interface ScreenShellProps extends PropsWithChildren {
  readonly title: string;
  readonly subtitle?: string;
}

export function ScreenShell({ title, subtitle, children }: ScreenShellProps) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {children}
      </ScrollView>
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
  },
  hero: {
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.sm,
  },
  title: {
    color: theme.colors.text,
    fontSize: 32,
    fontWeight: '800',
  },
  subtitle: {
    color: theme.colors.textMuted,
    fontSize: 16,
    lineHeight: 22,
  },
});
