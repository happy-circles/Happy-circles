import { Ionicons } from '@expo/vector-icons';
import type { RefObject } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, View } from 'react-native';

import { AppText } from '@/components/app-text';
import type { AppTextInputRef } from '@/components/app-text-input';
import { PasswordTextInput } from '@/components/password-text-input';
import { PrimaryAction } from '@/components/primary-action';
import { theme } from '@/lib/theme';
import { styles } from './profile-screen-runtime.styles';

export type SocialStepUpTarget = 'apple' | 'google';

interface ProfileSocialStepUpModalProps {
  readonly activeTheme: {
    readonly colors: {
      readonly border: string;
      readonly danger: string;
      readonly primary: string;
      readonly primarySoft: string;
      readonly surface: string;
      readonly text: string;
      readonly textMuted: string;
    };
  };
  readonly biometricLabel: string;
  readonly busyAction: string | null;
  readonly inputRef: RefObject<AppTextInputRef | null>;
  readonly onClose: () => void;
  readonly onPasswordChange: (nextPassword: string) => void;
  readonly onSubmit: (target: SocialStepUpTarget, password: string) => void;
  readonly password: string;
  readonly socialStepUpBusyAction: string | null;
  readonly socialStepUpError: string | null;
  readonly socialStepUpProviderLabel: string;
  readonly socialStepUpTarget: SocialStepUpTarget | null;
}

export function ProfileSocialStepUpModal({
  activeTheme,
  biometricLabel,
  busyAction,
  inputRef,
  onClose,
  onPasswordChange,
  onSubmit,
  password,
  socialStepUpBusyAction,
  socialStepUpError,
  socialStepUpProviderLabel,
  socialStepUpTarget,
}: ProfileSocialStepUpModalProps) {
  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={socialStepUpTarget !== null}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.stepUpModalRoot}
      >
        <Pressable
          accessibilityLabel="Descartar validación"
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
              style={[styles.stepUpDialogIcon, { backgroundColor: activeTheme.colors.primarySoft }]}
            >
              <Ionicons color={activeTheme.colors.primary} name="lock-closed" size={22} />
            </View>
            <View style={styles.stepUpDialogCopy}>
              <AppText style={[styles.stepUpDialogTitle, { color: activeTheme.colors.text }]}>
                Confirmar con contraseña
              </AppText>
              <AppText style={[styles.stepUpDialogBody, { color: activeTheme.colors.textMuted }]}>
                Este dispositivo no puede usar {biometricLabel}. Valida tu identidad para añadir{' '}
                {socialStepUpProviderLabel} Auth.
              </AppText>
            </View>
          </View>

          <PasswordTextInput
            autoCapitalize="none"
            onChangeText={onPasswordChange}
            onSubmitEditing={() =>
              socialStepUpTarget ? onSubmit(socialStepUpTarget, password) : undefined
            }
            placeholder="Contraseña"
            placeholderTextColor={theme.colors.muted}
            ref={inputRef}
            returnKeyType="done"
            style={styles.input}
            value={password}
          />

          {socialStepUpError ? (
            <AppText style={[styles.stepUpDialogError, { color: activeTheme.colors.danger }]}>
              {socialStepUpError}
            </AppText>
          ) : null}

          <View style={styles.stepUpDialogActions}>
            <Pressable
              accessibilityRole="button"
              disabled={busyAction !== null}
              onPress={onClose}
              style={({ pressed }) => [
                styles.stepUpDismissButton,
                { borderColor: activeTheme.colors.border },
                pressed && busyAction === null ? styles.rowPressed : null,
                busyAction !== null ? styles.disabledButton : null,
              ]}
            >
              <AppText style={[styles.stepUpDismissButtonText, { color: activeTheme.colors.text }]}>
                Descartar
              </AppText>
            </Pressable>
            <PrimaryAction
              compact
              disabled={busyAction !== null || socialStepUpTarget === null}
              fullWidth={false}
              label={
                busyAction === socialStepUpBusyAction
                  ? 'Validando...'
                  : `Añadir ${socialStepUpProviderLabel} Auth`
              }
              onPress={() =>
                socialStepUpTarget ? onSubmit(socialStepUpTarget, password) : undefined
              }
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
