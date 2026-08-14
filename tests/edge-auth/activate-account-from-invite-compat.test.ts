import { describe, expect, it, vi } from 'vitest';

import {
  activateAccountInviteWithLegacyFallback,
  normalizeAccountInviteActivationError,
  shouldUseLegacyAccountInviteActivation,
  type AccountInviteActivationInput,
  type AccountInviteActivationRpcResult,
} from '../../supabase/functions/activate-account-from-invite/compat';

const input: AccountInviteActivationInput = {
  actorUserId: 'actor-user-id',
  currentDeviceId: 'current-device-id',
  currentSessionId: 'current-session-id',
  deliveryToken: 'delivery-token',
  idempotencyKey: 'idempotency-key',
};

function success(data: unknown): AccountInviteActivationRpcResult {
  return { data, error: null };
}

describe('activate-account-from-invite compatibility', () => {
  it('uses the session-bound RPC without a legacy retry when it succeeds', async () => {
    const invokeRpc = vi.fn().mockResolvedValue(success({ status: 'activated' }));

    const result = await activateAccountInviteWithLegacyFallback(invokeRpc, input);

    expect(result).toEqual({
      data: { status: 'activated' },
      error: null,
      usedLegacyFallback: false,
    });
    expect(invokeRpc).toHaveBeenCalledTimes(1);
    expect(invokeRpc).toHaveBeenCalledWith({
      p_actor_user_id: input.actorUserId,
      p_current_device_id: input.currentDeviceId,
      p_current_session_id: input.currentSessionId,
      p_delivery_token: input.deliveryToken,
      p_idempotency_key: input.idempotencyKey,
    });
  });

  it('retries the four-argument RPC once for exactly activation_device_not_trusted', async () => {
    const onLegacyFallback = vi.fn();
    const invokeRpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: null,
        error: { message: '  ACTIVATION_DEVICE_NOT_TRUSTED  ' },
      })
      .mockResolvedValueOnce(success({ status: 'activated_legacy' }));

    const result = await activateAccountInviteWithLegacyFallback(
      invokeRpc,
      input,
      onLegacyFallback,
    );

    expect(result).toEqual({
      data: { status: 'activated_legacy' },
      error: null,
      usedLegacyFallback: true,
    });
    expect(onLegacyFallback).toHaveBeenCalledOnce();
    expect(invokeRpc).toHaveBeenCalledTimes(2);
    expect(invokeRpc).toHaveBeenNthCalledWith(2, {
      p_actor_user_id: input.actorUserId,
      p_current_device_id: input.currentDeviceId,
      p_delivery_token: input.deliveryToken,
      p_idempotency_key: input.idempotencyKey,
    });
  });

  it.each([
    { message: 'recent_auth_required' },
    { message: 'activation_device_not_trusted: extra detail' },
    { message: 'wrapped activation_device_not_trusted' },
    { code: 'activation_device_not_trusted' },
    new Error('account_invite_already_used'),
    null,
  ])('does not fall back for any other error shape: %#', async (error) => {
    const invokeRpc = vi.fn().mockResolvedValue({ data: null, error });
    const onLegacyFallback = vi.fn();

    const result = await activateAccountInviteWithLegacyFallback(
      invokeRpc,
      input,
      onLegacyFallback,
    );

    expect(result).toEqual({ data: null, error, usedLegacyFallback: false });
    expect(invokeRpc).toHaveBeenCalledOnce();
    expect(onLegacyFallback).not.toHaveBeenCalled();
  });

  it('returns a failed legacy attempt without entering a retry loop', async () => {
    const legacyError = { message: 'activation_device_not_trusted' };
    const invokeRpc = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: legacyError })
      .mockResolvedValueOnce({ data: null, error: legacyError });

    const result = await activateAccountInviteWithLegacyFallback(invokeRpc, input);

    expect(result).toEqual({ data: null, error: legacyError, usedLegacyFallback: true });
    expect(invokeRpc).toHaveBeenCalledTimes(2);
  });

  it('normalizes only a message string for the compatibility decision', () => {
    expect(normalizeAccountInviteActivationError(new Error(' Device_Not_Trusted '))).toBe(
      'device_not_trusted',
    );
    expect(shouldUseLegacyAccountInviteActivation(' ACTIVATION_DEVICE_NOT_TRUSTED ')).toBe(true);
    expect(shouldUseLegacyAccountInviteActivation({ code: 'activation_device_not_trusted' })).toBe(
      false,
    );
  });
});
