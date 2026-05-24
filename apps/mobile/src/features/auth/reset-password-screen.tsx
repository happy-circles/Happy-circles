import { useState } from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import {
  IdentityFlowField,
  IdentityFlowForm,
  IdentityFlowIdentity,
  IdentityFlowLogoCopy,
  IdentityFlowMessageSlot,
  IdentityFlowPasswordInput,
  IdentityFlowPrimaryAction,
  IdentityFlowScreen,
  IdentityFlowSecondaryAction,
} from '@/components/identity-flow';
import { MessageBanner } from '@/components/message-banner';
import { beginHomeEntryHandoffAfterScrollReset } from '@/lib/home-entry-handoff';
import {
  triggerIdentityErrorHaptic,
  triggerIdentityImpactHaptic,
  triggerIdentitySuccessHaptic,
  triggerIdentityWarningHaptic,
} from '@/lib/identity-flow-haptics';
import { returnToRoute } from '@/lib/navigation';
import { theme } from '@/lib/theme';
import { useSession } from '@/providers/session-provider';

const RESET_PASSWORD_KEYBOARD_ACTION_CLEARANCE = 148;

export function ResetPasswordScreen() {
  const router = useRouter();
  const session = useSession();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<{
    readonly password?: string;
    readonly confirmPassword?: string;
  }>({});
  const [busy, setBusy] = useState(false);

  const hasRecoverySession = session.status !== 'loading' && session.isPasswordRecoverySession;

  async function handleSubmit() {
    if (busy) {
      return;
    }

    triggerIdentityImpactHaptic();
    const nextErrors = {
      password: password.length >= 8 ? undefined : 'Debe tener al menos 8 caracteres.',
      confirmPassword:
        confirmPassword === password ? undefined : 'Las contraseñas deben coincidir.',
    };

    if (nextErrors.password || nextErrors.confirmPassword) {
      setErrors(nextErrors);
      triggerIdentityWarningHaptic();
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

      if (result === 'Contraseña actualizada.') {
        triggerIdentitySuccessHaptic();
        await beginHomeEntryHandoffAfterScrollReset();
        returnToRoute(router, '/home');
        return;
      }

      triggerIdentityErrorHaptic();
    } finally {
      setBusy(false);
    }
  }

  const visualState = !hasRecoverySession
    ? 'error'
    : busy
      ? 'loading'
      : message === 'Contraseña actualizada.'
        ? 'success'
        : 'idle';
  const resetPasswordActions = (
    <>
      {hasRecoverySession ? (
        <IdentityFlowPrimaryAction
          disabled={busy}
          icon="checkmark"
          label={busy ? 'Actualizando...' : 'Guardar nueva contraseña'}
          loading={busy}
          onPress={busy ? undefined : () => void handleSubmit()}
        />
      ) : null}
      <IdentityFlowSecondaryAction
        icon="mail-outline"
        label="Pedir otro enlace"
        onPress={() => returnToRoute(router, '/join?mode=recover')}
      />
    </>
  );

  return (
    <IdentityFlowScreen
      actions={resetPasswordActions}
      bodyStyle={styles.body}
      contentTransitionKey={
        hasRecoverySession ? 'reset-password:form' : 'reset-password:unavailable'
      }
      identity={<IdentityFlowIdentity state={visualState} variant="status" />}
      identityCenterLayout="balanced"
      identityPosition="top"
      keyboardActionClearance={
        hasRecoverySession ? RESET_PASSWORD_KEYBOARD_ACTION_CLEARANCE : undefined
      }
      message={
        <IdentityFlowLogoCopy
          subtitle={
            hasRecoverySession
              ? 'Elige una contraseña segura para tu cuenta.'
              : 'Pide un enlace nuevo para continuar.'
          }
          title={hasRecoverySession ? 'Restablece tu contraseña' : 'Enlace no disponible'}
        />
      }
      scrollEnabled
      transitionScrollPolicy="preserve"
    >
      <View style={styles.main}>
        <IdentityFlowMessageSlot>
          {!hasRecoverySession ? (
            <MessageBanner
              message="Este enlace ya no es válido o no se pudo abrir en la app. Pide uno nuevo desde Ingresar."
              tone="warning"
            />
          ) : message ? (
            <MessageBanner
              message={message}
              tone={message === 'Contraseña actualizada.' ? 'success' : 'neutral'}
            />
          ) : null}
        </IdentityFlowMessageSlot>

        {hasRecoverySession ? (
          <IdentityFlowForm style={styles.form}>
            <View style={styles.fields}>
              <IdentityFlowField
                error={errors.password ?? null}
                icon="lock-closed"
                label="Nueva contraseña"
                status={errors.password ? 'danger' : password.length >= 8 ? 'success' : 'idle'}
              >
                <IdentityFlowPasswordInput
                  autoCapitalize="none"
                  autoComplete="new-password"
                  onBlur={() =>
                    setErrors((current) => ({
                      ...current,
                      password:
                        password.length > 0 && password.length < 8
                          ? 'Debe tener al menos 8 caracteres.'
                          : undefined,
                    }))
                  }
                  onChangeText={(value) => {
                    setPassword(value);
                    setErrors((current) => ({ ...current, password: undefined }));
                  }}
                  placeholder="Mínimo 8 caracteres"
                  value={password}
                />
              </IdentityFlowField>

              <IdentityFlowField
                error={errors.confirmPassword ?? null}
                icon="shield-checkmark"
                label="Confirmar contraseña"
                status={
                  errors.confirmPassword
                    ? 'danger'
                    : confirmPassword.length > 0 && confirmPassword === password
                      ? 'success'
                      : 'idle'
                }
              >
                <IdentityFlowPasswordInput
                  autoCapitalize="none"
                  autoComplete="new-password"
                  onBlur={() =>
                    setErrors((current) => ({
                      ...current,
                      confirmPassword:
                        confirmPassword.length > 0 && confirmPassword !== password
                          ? 'Las contraseñas deben coincidir.'
                          : undefined,
                    }))
                  }
                  onChangeText={(value) => {
                    setConfirmPassword(value);
                    setErrors((current) => ({ ...current, confirmPassword: undefined }));
                  }}
                  placeholder="Repite la nueva contraseña"
                  value={confirmPassword}
                />
              </IdentityFlowField>
            </View>

          </IdentityFlowForm>
        ) : null}
      </View>
    </IdentityFlowScreen>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
  },
  main: {
    gap: theme.spacing.sm,
    width: '100%',
  },
  form: {
    gap: theme.spacing.md,
  },
  fields: {
    gap: theme.spacing.md,
    width: '100%',
  },
});
