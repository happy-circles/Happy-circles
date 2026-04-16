import { useState } from 'react';
import { useRouter } from 'expo-router';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppTextInput } from '@/components/app-text-input';
import { BrandMark } from '@/components/brand-mark';
import { FieldBlock } from '@/components/field-block';
import { MessageBanner } from '@/components/message-banner';
import { PrimaryAction } from '@/components/primary-action';
import { theme } from '@/lib/theme';
import { useSession } from '@/providers/session-provider';

export function ResetPasswordScreen() {
  const router = useRouter();
  const session = useSession();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const hasRecoverySession = session.status !== 'loading' && session.isSignedIn;

  async function handleSubmit() {
    if (busy) {
      return;
    }

    setBusy(true);
    setMessage(null);

    try {
      const result = await session.updatePassword({
        password,
        confirmPassword,
      });

      setMessage(result);

      if (result === 'Clave actualizada.') {
        router.replace('/home');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 24 : 0}
        style={styles.keyboardShell}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.panel}>
            <View style={styles.brandWrap}>
              <BrandMark orientation="stacked" size="lg" />
            </View>

            <View style={styles.header}>
              <Text style={styles.title}>Nueva contrasena</Text>
              <Text style={styles.subtitle}>
                Define una clave nueva para volver a entrar con correo y contrasena.
              </Text>
            </View>

            {!hasRecoverySession ? (
              <MessageBanner
                message="Este enlace ya no es valido o no se pudo abrir en la app. Pide uno nuevo desde Ingresar."
                tone="warning"
              />
            ) : null}

            {message ? (
              <MessageBanner
                message={message}
                tone={message === 'Clave actualizada.' ? 'success' : 'neutral'}
              />
            ) : null}

            <View style={styles.formArea}>
              <FieldBlock label="Nueva contrasena">
                <AppTextInput
                  autoCapitalize="none"
                  autoComplete="new-password"
                  chrome="glass"
                  onChangeText={setPassword}
                  placeholder="Minimo 8 caracteres"
                  placeholderTextColor={theme.colors.muted}
                  secureTextEntry
                  value={password}
                />
              </FieldBlock>

              <FieldBlock label="Confirmar contrasena">
                <AppTextInput
                  autoCapitalize="none"
                  autoComplete="new-password"
                  chrome="glass"
                  onChangeText={setConfirmPassword}
                  placeholder="Repite la nueva clave"
                  placeholderTextColor={theme.colors.muted}
                  secureTextEntry
                  value={confirmPassword}
                />
              </FieldBlock>

              <PrimaryAction
                disabled={!hasRecoverySession}
                label={busy ? 'Actualizando...' : 'Guardar nueva clave'}
                onPress={busy || !hasRecoverySession ? undefined : () => void handleSubmit()}
              />

              <PrimaryAction
                compact
                href="/sign-in?mode=recover"
                label="Pedir otro enlace"
                variant="ghost"
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  keyboardShell: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: theme.spacing.lg,
  },
  panel: {
    alignSelf: 'center',
    gap: theme.spacing.lg,
    maxWidth: 460,
    width: '100%',
  },
  brandWrap: {
    alignItems: 'center',
  },
  header: {
    gap: theme.spacing.xs,
  },
  title: {
    color: theme.colors.text,
    fontSize: theme.typography.title1,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.callout,
    lineHeight: 22,
    textAlign: 'center',
  },
  formArea: {
    gap: theme.spacing.md,
  },
});
