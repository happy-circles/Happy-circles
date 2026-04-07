import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ScreenShell } from '@/components/screen-shell';
import { theme } from '@/lib/theme';

export function AuthScreen() {
  return (
    <ScreenShell
      title="Happy Circles"
      subtitle="Deudas confirmadas, ledger auditable y cierres de circulo explicables."
    >
      <View style={styles.panel}>
        <Text style={styles.label}>Acceso v1</Text>
        <Text style={styles.body}>
          La base ya contempla email + password y magic link en Supabase Auth.
        </Text>
      </View>
      <Link href="/home" asChild>
        <Pressable style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Entrar al demo navegable</Text>
        </Pressable>
      </Link>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.medium,
    borderWidth: 1,
    gap: theme.spacing.sm,
    padding: theme.spacing.lg,
  },
  label: {
    color: theme.colors.accent,
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  body: {
    color: theme.colors.text,
    fontSize: 16,
    lineHeight: 24,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.medium,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
