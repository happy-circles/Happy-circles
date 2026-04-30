import { useState } from 'react';
import { useRouter } from 'expo-router';

import {
  IdentityFlowField,
  IdentityFlowForm,
  IdentityFlowIdentity,
  IdentityFlowLogoCopy,
  IdentityFlowMessageSlot,
  IdentityFlowPrimaryAction,
  IdentityFlowScreen,
  IdentityFlowSecondaryAction,
  IdentityFlowTextInput,
} from '@/components/identity-flow';
import { MessageBanner } from '@/components/message-banner';
import { beginHomeEntryHandoff } from '@/lib/home-entry-handoff';
import {
  triggerIdentityErrorHaptic,
  triggerIdentityImpactHaptic,
  triggerIdentitySuccessHaptic,
  triggerIdentityWarningHaptic,
} from '@/lib/identity-flow-haptics';
import { returnToRoute } from '@/lib/navigation';
import { useSession } from '@/providers/session-provider';

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

  const hasRecoverySession = session.status !== 'loading' && session.isSignedIn;

  async function handleSubmit() {
    if (busy) {
      return;
    }

    triggerIdentityImpactHaptic();
    const nextErrors = {
      password: password.length >= 8 ? undefined : 'Debe tener al menos 8 caracteres.',
      confirmPassword:
        confirmPassword === password ? undefined : 'Las contrasenas deben coincidir.',
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

      if (result === 'Clave actualizada.') {
        triggerIdentitySuccessHaptic();
        beginHomeEntryHandoff();
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
      : message === 'Clave actualizada.'
        ? 'success'
        : 'idle';

  return (
    <IdentityFlowScreen
      actions={
        <IdentityFlowSecondaryAction
          icon="mail-outline"
          label="Pedir otro enlace"
          onPress={() => returnToRoute(router, '/join?mode=recover')}
        />
      }
      identity={<IdentityFlowIdentity state={visualState} variant="status" />}
      identityPosition="center"
      message={
        <IdentityFlowLogoCopy
          subtitle={
            hasRecoverySession
              ? 'Elige una clave segura para tu cuenta.'
              : 'Pide un enlace nuevo para continuar.'
          }
          title={hasRecoverySession ? 'Restablece tu contrasena' : 'Enlace no disponible'}
        />
      }
    >
      <IdentityFlowMessageSlot>
        {!hasRecoverySession ? (
          <MessageBanner
            message="Este enlace ya no es valido o no se pudo abrir en la app. Pide uno nuevo desde Ingresar."
            tone="warning"
          />
        ) : message ? (
          <MessageBanner
            message={message}
            tone={message === 'Clave actualizada.' ? 'success' : 'neutral'}
          />
        ) : null}
      </IdentityFlowMessageSlot>

      <IdentityFlowForm>
        <IdentityFlowField
          error={errors.password ?? null}
          icon="lock-closed"
          label="Nueva contrasena"
          status={errors.password ? 'danger' : password.length >= 8 ? 'success' : 'idle'}
        >
          <IdentityFlowTextInput
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
            placeholder="Minimo 8 caracteres"
            secureTextEntry
            value={password}
          />
        </IdentityFlowField>

        <IdentityFlowField
          error={errors.confirmPassword ?? null}
          icon="shield-checkmark"
          label="Confirmar contrasena"
          status={
            errors.confirmPassword
              ? 'danger'
              : confirmPassword.length > 0 && confirmPassword === password
                ? 'success'
                : 'idle'
          }
        >
          <IdentityFlowTextInput
            autoCapitalize="none"
            autoComplete="new-password"
            onBlur={() =>
              setErrors((current) => ({
                ...current,
                confirmPassword:
                  confirmPassword.length > 0 && confirmPassword !== password
                    ? 'Las contrasenas deben coincidir.'
                    : undefined,
              }))
            }
            onChangeText={(value) => {
              setConfirmPassword(value);
              setErrors((current) => ({ ...current, confirmPassword: undefined }));
            }}
            placeholder="Repite la nueva clave"
            secureTextEntry
            value={confirmPassword}
          />
        </IdentityFlowField>
      </IdentityFlowForm>

      <IdentityFlowPrimaryAction
        disabled={!hasRecoverySession || busy}
        icon="checkmark"
        label={busy ? 'Actualizando...' : 'Guardar nueva clave'}
        loading={busy}
        onPress={busy || !hasRecoverySession ? undefined : () => void handleSubmit()}
      />
    </IdentityFlowScreen>
  );
}
