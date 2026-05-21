import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { BrandVerificationLockup } from '@/components/brand-verification-lockup';
import { theme } from '@/lib/theme';
import { useAppTheme } from '@/providers/theme-provider';

export function SessionLoadingScreen({
  message = 'Sincronizando tu acceso',
}: {
  readonly message?: string;
}) {
  const activeTheme = useAppTheme();

  return (
    <View style={[styles.root, { backgroundColor: activeTheme.colors.background }]}>
      <BrandVerificationLockup state="loading" />
      <AppText style={[styles.message, { color: activeTheme.colors.textMuted }]}>{message}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    flex: 1,
    gap: theme.spacing.md,
    justifyContent: 'center',
    padding: theme.spacing.xl,
  },
  message: {
    fontSize: theme.typography.callout,
    fontWeight: '700',
    lineHeight: 22,
    textAlign: 'center',
  },
});
