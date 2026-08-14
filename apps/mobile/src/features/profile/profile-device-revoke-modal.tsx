import { Ionicons } from '@expo/vector-icons';
import type { RefObject } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, View } from 'react-native';

import { AppText } from '@/components/app-text';
import type { AppTextInputRef } from '@/components/app-text-input';
import { PasswordTextInput } from '@/components/password-text-input';
import { PrimaryAction } from '@/components/primary-action';
import { theme, type AppTheme } from '@/lib/theme';
import type { TrustedDeviceAuthMethod } from '@/providers/session/types';
import { styles } from './profile-screen-runtime.styles';

interface ProfileDeviceRevokeModalProps {
  readonly activeTheme: AppTheme;
  readonly busy: boolean;
  readonly deviceId: string | null;
  readonly error: string | null;
  readonly hasApple: boolean;
  readonly hasGoogle: boolean;
  readonly hasPassword: boolean;
  readonly inputRef: RefObject<AppTextInputRef | null>;
  readonly onClose: () => void;
  readonly onPasswordChange: (password: string) => void;
  readonly onSubmit: (method: TrustedDeviceAuthMethod) => void;
  readonly password: string;
}

export function ProfileDeviceRevokeModal({
  activeTheme,
  busy,
  deviceId,
  error,
  hasApple,
  hasGoogle,
  hasPassword,
  inputRef,
  onClose,
  onPasswordChange,
  onSubmit,
  password,
}: ProfileDeviceRevokeModalProps) {
  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={deviceId !== null}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.stepUpModalRoot}
      >
        <Pressable
          accessibilityLabel="Descartar revocación"
          disabled={busy}
          onPress={onClose}
          style={styles.stepUpModalBackdrop}
        />
        <View
          accessibilityRole="alert"
          accessibilityViewIsModal
          style={[styles.stepUpDialog, { backgroundColor: activeTheme.colors.surface }]}
        >
          <View style={styles.stepUpDialogHeader}>
            <View
              style={[styles.stepUpDialogIcon, { backgroundColor: activeTheme.colors.dangerSoft }]}
            >
              <Ionicons color={activeTheme.colors.danger} name="shield-outline" size={22} />
            </View>
            <View style={styles.stepUpDialogCopy}>
              <AppText style={[styles.stepUpDialogTitle, { color: activeTheme.colors.text }]}>
                Validar antes de revocar
              </AppText>
              <AppText style={[styles.stepUpDialogBody, { color: activeTheme.colors.textMuted }]}>
                Confirma tu identidad. La biometría local no reemplaza esta validación de cuenta.
              </AppText>
            </View>
          </View>

          {hasPassword ? (
            <PasswordTextInput
              autoCapitalize="none"
              onChangeText={onPasswordChange}
              onSubmitEditing={() => onSubmit('password')}
              placeholder="Contraseña"
              placeholderTextColor={theme.colors.muted}
              ref={inputRef}
              returnKeyType="done"
              style={styles.input}
              value={password}
            />
          ) : null}

          {error ? (
            <AppText style={[styles.stepUpDialogError, { color: activeTheme.colors.danger }]}>
              {error}
            </AppText>
          ) : null}

          {!hasPassword && !hasGoogle && !hasApple ? (
            <AppText style={[styles.stepUpDialogError, { color: activeTheme.colors.danger }]}>
              Agrega una contraseña, Google o Apple antes de revocar otro dispositivo.
            </AppText>
          ) : null}

          <View style={styles.stepUpDialogActions}>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={onClose}
              style={({ pressed }) => [
                styles.stepUpDismissButton,
                { borderColor: activeTheme.colors.border },
                pressed && !busy ? styles.rowPressed : null,
                busy ? styles.disabledButton : null,
              ]}
            >
              <AppText style={[styles.stepUpDismissButtonText, { color: activeTheme.colors.text }]}>
                Descartar
              </AppText>
            </Pressable>
            {hasGoogle ? (
              <PrimaryAction
                compact
                disabled={busy}
                fullWidth={false}
                icon="logo-google"
                label="Google"
                onPress={() => onSubmit('google')}
                variant="secondary"
              />
            ) : null}
            {hasApple ? (
              <PrimaryAction
                compact
                disabled={busy}
                fullWidth={false}
                icon="logo-apple"
                label="Apple"
                onPress={() => onSubmit('apple')}
                variant="secondary"
              />
            ) : null}
            {hasPassword ? (
              <PrimaryAction
                compact
                disabled={busy || !password.trim()}
                fullWidth={false}
                label="Validar y revocar"
                loading={busy}
                onPress={() => onSubmit('password')}
              />
            ) : null}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
