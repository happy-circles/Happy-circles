import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { PrimaryAction } from '@/components/primary-action';
import { ScreenShell } from '@/components/screen-shell';
import { StatusChip } from '@/components/status-chip';
import { theme } from '@/lib/theme';
import { useSession } from '@/providers/session-provider';

export function SignInScreen() {
  const { authMode, signInDemo, signInWithMagicLink } = useSession();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState(
    authMode === 'demo'
      ? 'El entorno no tiene Supabase configurado. Puedes entrar en modo demo.'
      : 'Usa magic link para entrar sin password.',
  );
  const [busy, setBusy] = useState(false);

  async function handleMagicLink() {
    setBusy(true);
    const result = await signInWithMagicLink(email);
    setMessage(result);
    setBusy(false);
  }

  async function handleDemo() {
    setBusy(true);
    await signInDemo();
    setBusy(false);
  }

  return (
    <ScreenShell
      title="Happy Circles"
      subtitle="Controla deudas personales con una interfaz simple, compacta y clara."
    >
      <View style={styles.heroCard}>
        <StatusChip label={authMode === 'demo' ? 'Demo' : 'Magic link'} tone="primary" />
        <Text style={styles.heroTitle}>Entra rapido y vuelve con Face ID despues</Text>
        <Text style={styles.heroBody}>
          La primera entrada usa correo. El desbloqueo biometrico queda como acceso rapido para el
          reingreso.
        </Text>
      </View>

      <View style={styles.formCard}>
        <Text style={styles.label}>Correo</Text>
        <TextInput
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          onChangeText={setEmail}
          placeholder="tu@correo.com"
          placeholderTextColor={theme.colors.muted}
          style={styles.input}
          value={email}
        />
        <PrimaryAction
          label={busy ? 'Procesando...' : authMode === 'demo' ? 'Entrar con correo' : 'Enviar magic link'}
          onPress={busy ? undefined : handleMagicLink}
        />
        <Text style={styles.message}>{message}</Text>
      </View>

      <PrimaryAction
        label={busy ? 'Procesando...' : 'Entrar al demo'}
        onPress={busy ? undefined : handleDemo}
        subtitle="Usa datos locales mientras terminas la integracion."
        variant="secondary"
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    backgroundColor: theme.colors.elevated,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.xlarge,
    borderWidth: 1,
    gap: theme.spacing.sm,
    padding: theme.spacing.lg,
    ...theme.shadow.card,
  },
  heroTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.title2,
    fontWeight: '800',
  },
  heroBody: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.callout,
    lineHeight: 22,
  },
  formCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.large,
    borderWidth: 1,
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
  },
  label: {
    color: theme.colors.text,
    fontSize: theme.typography.footnote,
    fontWeight: '700',
  },
  input: {
    backgroundColor: theme.colors.background,
    borderColor: theme.colors.hairline,
    borderRadius: theme.radius.medium,
    borderWidth: 1,
    color: theme.colors.text,
    fontSize: theme.typography.body,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  message: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
  },
});
