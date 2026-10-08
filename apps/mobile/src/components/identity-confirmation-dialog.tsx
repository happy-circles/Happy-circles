import { Ionicons } from '@expo/vector-icons';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { AppText } from '@/components/app-text';
import { PasswordTextInput } from '@/components/password-text-input';
import { theme } from '@/lib/theme';
import type { IdentityConfirmationMethod } from '@/providers/identity-confirmation-state';
import { useAppTheme } from '@/providers/theme-provider';

interface IdentityConfirmationDialogProps {
  readonly actionLabel: string;
  readonly biometricLabel: string;
  readonly busyMethod: IdentityConfirmationMethod | 'session' | null;
  readonly error: string | null;
  readonly methods: readonly IdentityConfirmationMethod[];
  readonly onClose: () => void;
  readonly onDismiss: () => void;
  readonly onPasswordChange: (password: string) => void;
  readonly onSubmit: (method: IdentityConfirmationMethod) => void;
  readonly password: string;
  readonly visible: boolean;
}

function methodLabel(method: IdentityConfirmationMethod, biometricLabel: string): string {
  if (method === 'biometric') return `Usar ${biometricLabel}`;
  if (method === 'google') return 'Continuar con Google';
  if (method === 'apple') return 'Continuar con Apple';
  return 'Confirmar contraseña';
}

export function IdentityConfirmationDialog({
  actionLabel,
  biometricLabel,
  busyMethod,
  error,
  methods,
  onClose,
  onDismiss,
  onPasswordChange,
  onSubmit,
  password,
  visible,
}: IdentityConfirmationDialogProps) {
  const activeTheme = useAppTheme();
  const busy = busyMethod !== null;

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      onDismiss={onDismiss}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.root}
      >
        <Pressable
          accessibilityLabel="Cancelar confirmación"
          accessibilityRole="button"
          onPress={onClose}
          style={[styles.backdrop, { backgroundColor: activeTheme.colors.overlay }]}
        />
        <View
          accessibilityViewIsModal
          style={[styles.dialog, { backgroundColor: activeTheme.colors.surface }]}
        >
          <View style={styles.header}>
            <Ionicons
              color={activeTheme.colors.primary}
              name="shield-checkmark-outline"
              size={26}
            />
            <AppText
              accessibilityRole="header"
              style={[styles.title, { color: activeTheme.colors.text }]}
            >
              Confirma para {actionLabel}
            </AppText>
          </View>
          <AppText style={[styles.body, { color: activeTheme.colors.textMuted }]}>
            Usa un método de tu cuenta. Tu borrador permanece en esta pantalla.
          </AppText>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            style={styles.scroll}
            contentContainerStyle={styles.methods}
          >
            {busyMethod === 'session' ? (
              <AppText
                accessibilityLiveRegion="polite"
                style={{ color: activeTheme.colors.textMuted }}
              >
                Comprobando esta sesión…
              </AppText>
            ) : null}
            {methods.map((method) => {
              const disabled = busy || (method === 'password' && !password.trim());
              return (
                <View key={method} style={styles.method}>
                  {method === 'password' ? (
                    <PasswordTextInput
                      accessibilityLabel="Tu contraseña actual"
                      autoCapitalize="none"
                      autoComplete="current-password"
                      editable={!busy}
                      onChangeText={onPasswordChange}
                      onSubmitEditing={() => onSubmit('password')}
                      placeholder="Tu contraseña actual"
                      returnKeyType="done"
                      value={password}
                    />
                  ) : null}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled, busy: busyMethod === method }}
                    disabled={disabled}
                    onPress={() => onSubmit(method)}
                    style={({ pressed }) => [
                      styles.button,
                      { backgroundColor: activeTheme.colors.primarySoft },
                      disabled ? styles.disabled : null,
                      pressed ? styles.pressed : null,
                    ]}
                  >
                    <AppText style={[styles.buttonLabel, { color: activeTheme.colors.text }]}>
                      {busyMethod === method ? 'Confirmando…' : methodLabel(method, biometricLabel)}
                    </AppText>
                  </Pressable>
                </View>
              );
            })}
            {methods.length === 0 && !busy ? (
              <AppText style={[styles.body, { color: activeTheme.colors.textMuted }]}>
                No hay un método de esta cuenta disponible en este teléfono. Vuelve a iniciar sesión
                con un método vinculado para recuperar el acceso.
              </AppText>
            ) : null}
            {error ? (
              <AppText
                accessibilityLiveRegion="polite"
                style={{ color: activeTheme.colors.danger }}
              >
                {error}
              </AppText>
            ) : null}
          </ScrollView>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={[styles.button, { borderColor: activeTheme.colors.border, borderWidth: 1 }]}
          >
            <AppText style={[styles.buttonLabel, { color: activeTheme.colors.text }]}>
              Ahora no
            </AppText>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: theme.spacing.lg },
  backdrop: { ...StyleSheet.absoluteFillObject },
  dialog: {
    borderRadius: theme.radius.large,
    gap: theme.spacing.md,
    maxHeight: '88%',
    maxWidth: 440,
    padding: theme.spacing.lg,
    width: '100%',
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  title: { flex: 1, fontSize: theme.typography.title3, fontWeight: '700' },
  body: { fontSize: theme.typography.body, lineHeight: 22 },
  scroll: { flexGrow: 0 },
  methods: { gap: theme.spacing.md },
  method: { gap: theme.spacing.sm },
  button: {
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.medium,
  },
  buttonLabel: { fontSize: theme.typography.body, fontWeight: '700' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
});
