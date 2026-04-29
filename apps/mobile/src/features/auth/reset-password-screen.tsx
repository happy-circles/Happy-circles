import { useState } from 'react';
import { useRouter } from 'expo-router';

import {
  IdentityFlowActions,
  IdentityFlowField,
  IdentityFlowForm,
  IdentityFlowIdentity,
  IdentityFlowMessageSlot,
  IdentityFlowScreen,
  IdentityFlowTextInput,
} from '@/components/identity-flow';
import { MessageBanner } from '@/components/message-banner';
import {
  triggerIdentityErrorHaptic,
  triggerIdentityImpactHaptic,
  triggerIdentitySuccessHaptic,
} from '@/lib/identity-flow-haptics';
import { returnToRoute } from '@/lib/navigation';
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

    triggerIdentityImpactHaptic();
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
        <IdentityFlowActions
          disabled={!hasRecoverySession || busy}
          loading={busy}
          onPrimaryPress={busy || !hasRecoverySession ? undefined : () => void handleSubmit()}
          primaryLabel={busy ? 'Actualizando...' : 'Guardar nueva clave'}
          primaryIcon="checkmark"
          secondaryIcon="mail-outline"
          secondaryLabel="Pedir otro enlace"
          onSecondaryPress={() => returnToRoute(router, '/sign-in?mode=recover')}
        />
      }
      identity={<IdentityFlowIdentity state={visualState} variant="status" />}
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
        <IdentityFlowField icon="lock-closed" label="Nueva contrasena">
          <IdentityFlowTextInput
            autoCapitalize="none"
            autoComplete="new-password"
            onChangeText={setPassword}
            placeholder="Minimo 8 caracteres"
            secureTextEntry
            value={password}
          />
        </IdentityFlowField>

        <IdentityFlowField icon="shield-checkmark" label="Confirmar contrasena">
          <IdentityFlowTextInput
            autoCapitalize="none"
            autoComplete="new-password"
            onChangeText={setConfirmPassword}
            placeholder="Repite la nueva clave"
            secureTextEntry
            value={confirmPassword}
          />
        </IdentityFlowField>
      </IdentityFlowForm>
    </IdentityFlowScreen>
  );
}
