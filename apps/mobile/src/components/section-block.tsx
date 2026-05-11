import type { PropsWithChildren, ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';

import { theme } from '@/lib/theme';
import { AppText } from '@/components/app-text';

export interface SectionBlockProps extends PropsWithChildren {
  readonly title: string;
  readonly subtitle?: string;
  readonly action?: ReactNode;
  readonly contentStyle?: StyleProp<ViewStyle>;
  readonly headerStyle?: StyleProp<ViewStyle>;
  readonly style?: StyleProp<ViewStyle>;
}

export function SectionBlock({
  title,
  subtitle,
  action,
  children,
  contentStyle,
  headerStyle,
  style,
}: SectionBlockProps) {
  return (
    <View style={[styles.section, style]}>
      <View style={[styles.header, headerStyle]}>
        <View style={styles.textWrap}>
          <AppText style={styles.title}>{title}</AppText>
          {subtitle ? <AppText style={styles.subtitle}>{subtitle}</AppText> : null}
        </View>
        {action}
      </View>
      <View style={[styles.content, contentStyle]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: theme.spacing.md,
  },
  header: {
    alignItems: 'center',
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
    fontWeight: '800',
    letterSpacing: 0,
    lineHeight: 24,
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
