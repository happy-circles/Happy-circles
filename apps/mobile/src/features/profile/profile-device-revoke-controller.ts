import { useRef, useState } from 'react';

import type { AppTextInputRef } from '@/components/app-text-input';
import {
  triggerAppSuccessHaptic as triggerSuccessHaptic,
  triggerAppWarningHaptic as triggerWarningHaptic,
} from '@/lib/app-haptics';
import type { SessionContextValue, TrustedDeviceAuthMethod } from '@/providers/session/types';

type ProfileActionRunner = (
  actionKey: string,
  action: () => Promise<string>,
  options?: { readonly showMessage?: boolean },
) => Promise<string>;

export function useProfileDeviceRevokeController(input: {
  readonly busy: boolean;
  readonly revokeTrustedDevice: SessionContextValue['revokeTrustedDevice'];
  readonly runAction: ProfileActionRunner;
  readonly showActionMessage: (message: string) => void;
}) {
  const passwordInputRef = useRef<AppTextInputRef | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  function open(nextDeviceId: string) {
    triggerWarningHaptic();
    setDeviceId(nextDeviceId);
    setPassword('');
    setError(null);
  }

  function close() {
    if (input.busy) {
      return;
    }

    setDeviceId(null);
    setPassword('');
    setError(null);
  }

  function handlePasswordChange(nextPassword: string) {
    setPassword(nextPassword);
    setError(null);
  }

  async function confirm(method: TrustedDeviceAuthMethod) {
    if (!deviceId) {
      return;
    }
    if (method === 'password' && !password.trim()) {
      setError('Escribe tu contraseña actual.');
      passwordInputRef.current?.focus();
      return;
    }

    const result = await input.runAction(
      `revoke-${deviceId}`,
      () =>
        input.revokeTrustedDevice(
          deviceId,
          method === 'password' ? { method, password } : { method },
        ),
      { showMessage: false },
    );
    if (result === 'Dispositivo revocado.' || result.startsWith('Este dispositivo fue revocado')) {
      close();
      input.showActionMessage(result);
      triggerSuccessHaptic();
      return;
    }

    setError(result);
    triggerWarningHaptic();
  }

  return {
    close,
    confirm,
    deviceId,
    error,
    handlePasswordChange,
    open,
    password,
    passwordInputRef,
  };
}
