import type {
  BiometricAuthResult,
  BiometricSupport,
  BiometricSupportRefreshResult,
} from '@/lib/security';
import type { SessionEdgeActionResult } from './session-edge-action';

export async function refreshBiometricSupportSnapshot(input: {
  readonly readSupport: () => Promise<BiometricSupport>;
  readonly previousSupport: () => BiometricSupport;
  readonly applySupport: (support: BiometricSupport) => void;
}): Promise<BiometricSupportRefreshResult> {
  try {
    const support = await input.readSupport();
    input.applySupport(support);
    return { ...support, error: null };
  } catch {
    return {
      ...input.previousSupport(),
      error: 'No pudimos consultar la biometría del teléfono. Inténtalo de nuevo.',
    };
  }
}

/** The server decides whether the current JWT has a usable authentication proof. */
export async function confirmDeviceWithReauthentication<T>(input: {
  readonly confirm: () => Promise<SessionEdgeActionResult<T>>;
  readonly reauthenticate?: () => Promise<string | null>;
}): Promise<SessionEdgeActionResult<T>> {
  const existingProof = await input.confirm();
  if (existingProof.ok || existingProof.code !== 'recent_auth_required' || !input.reauthenticate) {
    return existingProof;
  }

  const authenticationError = await input.reauthenticate();
  if (authenticationError) {
    return { ok: false, message: authenticationError };
  }
  return input.confirm();
}

export interface AccountReauthentication {
  readonly expectedUserId: string;
  readonly authenticate: () => Promise<{
    readonly userId: string | null;
    readonly error?: string;
    readonly message?: string;
  }>;
  readonly onAccountMismatch: () => Promise<void>;
}

export async function runAccountReauthentication(
  input: AccountReauthentication,
): Promise<BiometricAuthResult> {
  const authentication = await input.authenticate();
  if (!authentication.userId) {
    return {
      success: false,
      error: authentication.error ?? 'authentication_failed',
      message: authentication.message,
    };
  }
  if (authentication.userId !== input.expectedUserId) {
    await input.onAccountMismatch();
    return {
      success: false,
      error: 'account_mismatch',
      message: 'La validación abrió otra cuenta. Cerramos la sesión por seguridad.',
    };
  }
  return { success: true, error: null };
}

export async function runAccountStepUp(
  input: AccountReauthentication & {
    readonly confirmTrustedSession: () => Promise<SessionEdgeActionResult<unknown>>;
  },
): Promise<BiometricAuthResult> {
  const authentication = await runAccountReauthentication(input);
  if (!authentication.success) return authentication;

  // Reauthentication can create a new session. Bind the device to that verified
  // session before accepting the local step-up window.
  const proof = await input.confirmTrustedSession();
  if (!proof.ok) {
    return {
      success: false,
      error: proof.code ?? 'server_validation_failed',
      message: proof.message,
    };
  }
  return { success: true, error: null };
}

export interface NotificationEnableIntent {
  readonly id: number;
  readonly userId: string | null;
}

export function canCompleteNotificationEnable(input: {
  readonly intent: NotificationEnableIntent | null;
  readonly currentIntent: NotificationEnableIntent | null;
  readonly currentUserId: string | null;
  readonly permissionStatus: string;
}): boolean {
  return (
    input.permissionStatus === 'granted' &&
    input.intent !== null &&
    input.currentIntent?.id === input.intent.id &&
    input.intent.userId === input.currentUserId
  );
}

/** Consume the Settings request on its first return, including a declined permission. */
export async function finishNotificationEnableOnResume(input: {
  readonly intent: NotificationEnableIntent | null;
  readonly readCurrentIntent: () => NotificationEnableIntent | null;
  readonly currentUserId: () => string | null;
  readonly permissionStatus: string;
  readonly enable: (intent: NotificationEnableIntent) => Promise<void>;
  readonly consume: () => void;
}): Promise<void> {
  try {
    if (
      input.intent &&
      canCompleteNotificationEnable({
        intent: input.intent,
        currentIntent: input.readCurrentIntent(),
        currentUserId: input.currentUserId(),
        permissionStatus: input.permissionStatus,
      })
    ) {
      await input.enable(input.intent);
    }
  } catch {
    // The user can retry enabling reminders; a write failure is not another intent.
  } finally {
    if (input.intent && input.readCurrentIntent()?.id === input.intent.id) input.consume();
  }
}
