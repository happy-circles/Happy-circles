const LEGACY_FALLBACK_ERROR = 'activation_device_not_trusted';

export interface AccountInviteActivationInput {
  readonly actorUserId: string;
  readonly currentDeviceId: string;
  readonly currentSessionId: string;
  readonly deliveryToken: string;
  readonly idempotencyKey: string;
}

export interface AccountInviteActivationRpcResult {
  readonly data: unknown;
  readonly error: unknown;
}

export interface AccountInviteActivationResult extends AccountInviteActivationRpcResult {
  readonly usedLegacyFallback: boolean;
}

export type InvokeAccountInviteActivationRpc = (
  parameters: Readonly<Record<string, string>>,
) => PromiseLike<AccountInviteActivationRpcResult>;

function readErrorMessage(error: unknown): string | null {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (typeof error !== 'object' || error === null || !('message' in error)) {
    return null;
  }

  const message = error.message;
  return typeof message === 'string' ? message : null;
}

export function normalizeAccountInviteActivationError(error: unknown): string | null {
  const message = readErrorMessage(error)?.trim().toLocaleLowerCase('en-US');
  return message && message.length > 0 ? message : null;
}

export function shouldUseLegacyAccountInviteActivation(error: unknown): boolean {
  return normalizeAccountInviteActivationError(error) === LEGACY_FALLBACK_ERROR;
}

export async function activateAccountInviteWithLegacyFallback(
  invokeRpc: InvokeAccountInviteActivationRpc,
  input: AccountInviteActivationInput,
  onLegacyFallback?: () => void,
): Promise<AccountInviteActivationResult> {
  const sharedParameters = {
    p_actor_user_id: input.actorUserId,
    p_current_device_id: input.currentDeviceId,
    p_delivery_token: input.deliveryToken,
    p_idempotency_key: input.idempotencyKey,
  } as const;
  const sessionBoundResult = await invokeRpc({
    ...sharedParameters,
    p_current_session_id: input.currentSessionId,
  });

  if (!shouldUseLegacyAccountInviteActivation(sessionBoundResult.error)) {
    return { ...sessionBoundResult, usedLegacyFallback: false };
  }

  onLegacyFallback?.();
  const legacyResult = await invokeRpc(sharedParameters);
  return { ...legacyResult, usedLegacyFallback: true };
}
