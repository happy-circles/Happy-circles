import type { PropsWithChildren, ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { theme } from '@/lib/theme';
import { AppText } from '@/components/app-text';

export interface SectionBlockProps extends PropsWithChildren {
  readonly title: string;
  readonly subtitle?: string;
  readonly action?: ReactNode;
}

export function SectionBlock({ title, subtitle, action, children }: SectionBlockProps) {
  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View style={styles.textWrap}>
          <AppText style={styles.title}>{title}</AppText>
          {subtitle ? <AppText style={styles.subtitle}>{subtitle}</AppText> : null}
        </View>
        {action}
      </View>
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: theme.spacing.sm,
  },
  header: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  textWrap: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: theme.colors.text,
    fontSize: theme.typography.title3,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  subtitle: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
  },
  content: {
    gap: theme.spacing.sm,
  },
});
