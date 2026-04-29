import { StyleSheet, Text, View } from 'react-native';

import {
  BrandVerificationMark,
  type BrandVerificationState,
} from '@/components/brand-verification-lockup';
import { theme } from '@/lib/theme';

export function InviteTokenStatus({
  state,
  subtitle,
  title,
}: {
  readonly state: BrandVerificationState;
  readonly subtitle: string;
  readonly title: string;
}) {
  return (
    <View style={styles.root}>
      <BrandVerificationMark showOuterInIdle size={116} state={state} />
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.lg,
  },
  copy: {
    alignItems: 'center',
    gap: theme.spacing.xs,
    maxWidth: 380,
  },
  title: {
    color: theme.colors.text,
    fontSize: theme.typography.title2,
    fontWeight: '800',
    lineHeight: 28,
    textAlign: 'center',
  },
  subtitle: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.callout,
    fontWeight: '600',
    lineHeight: 21,
    textAlign: 'center',
  },
});
