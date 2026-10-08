import { describe, expect, it, vi } from 'vitest';
import {
  canCompleteNotificationEnable,
  confirmDeviceWithReauthentication,
  runAccountStepUp,
  refreshBiometricSupportSnapshot,
  finishNotificationEnableOnResume,
} from './session-security-actions';
import { withSessionOperationTimeout } from './session-operation';

describe('server authentication for device confirmation', () => {
  it('reuses a fresh social session without asking for a password or OAuth again', async () => {
    const confirm = vi.fn().mockResolvedValue({ ok: true, data: { trustState: 'trusted' } });
    const reauthenticate = vi.fn();
    expect(await confirmDeviceWithReauthentication({ confirm, reauthenticate })).toEqual({
      ok: true,
      data: { trustState: 'trusted' },
    });
    expect(reauthenticate).not.toHaveBeenCalled();
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it('reauthenticates only when the server explicitly requires recent auth', async () => {
    const confirm = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        code: 'recent_auth_required',
        message: 'Confirma identidad',
      })
      .mockResolvedValueOnce({ ok: true, data: null });
    const reauthenticate = vi.fn().mockResolvedValue(null);
    expect((await confirmDeviceWithReauthentication({ confirm, reauthenticate })).ok).toBe(true);
    expect(reauthenticate).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it('returns connection errors instead of launching another authentication flow', async () => {
    const confirm = vi.fn().mockResolvedValue({ ok: false, message: 'Sin conexión' });
    const reauthenticate = vi.fn();
    expect(await confirmDeviceWithReauthentication({ confirm, reauthenticate })).toEqual({
      ok: false,
      message: 'Sin conexión',
    });
    expect(reauthenticate).not.toHaveBeenCalled();
  });

  it('does not retry trust when account authentication was cancelled', async () => {
    const confirm = vi.fn().mockResolvedValue({
      ok: false,
      code: 'recent_auth_required',
      message: 'Confirma identidad',
    });
    const result = await confirmDeviceWithReauthentication({
      confirm,
      reauthenticate: async () => 'Cancelaste Google.',
    });
    expect(result).toEqual({ ok: false, message: 'Cancelaste Google.' });
    expect(confirm).toHaveBeenCalledTimes(1);
  });
});

describe('account step-up', () => {
  it('accepts the same account only after its current session is trusted by the server', async () => {
    const confirmTrustedSession = vi.fn().mockResolvedValue({ ok: true, data: null });
    const onAccountMismatch = vi.fn();
    const result = await runAccountStepUp({
      expectedUserId: 'account-a',
      authenticate: async () => ({ userId: 'account-a' }),
      confirmTrustedSession,
      onAccountMismatch,
    });
    expect(result.success).toBe(true);
    expect(confirmTrustedSession).toHaveBeenCalledTimes(1);
    expect(onAccountMismatch).not.toHaveBeenCalled();
  });

  it('signs out a different account and never trusts it', async () => {
    const confirmTrustedSession = vi.fn();
    const onAccountMismatch = vi.fn();
    const result = await runAccountStepUp({
      expectedUserId: 'account-a',
      authenticate: async () => ({ userId: 'account-b' }),
      confirmTrustedSession,
      onAccountMismatch,
    });
    expect(result.error).toBe('account_mismatch');
    expect(onAccountMismatch).toHaveBeenCalledTimes(1);
    expect(confirmTrustedSession).not.toHaveBeenCalled();
  });

  it('does not grant a local validation window when server proof fails', async () => {
    const result = await runAccountStepUp({
      expectedUserId: 'account-a',
      authenticate: async () => ({ userId: 'account-a' }),
      confirmTrustedSession: async () => ({
        ok: false,
        code: 'recent_auth_required',
        message: 'La validación venció',
      }),
      onAccountMismatch: async () => undefined,
    });
    expect(result).toEqual({
      success: false,
      error: 'recent_auth_required',
      message: 'La validación venció',
    });
  });
});

describe('notification enable after Settings', () => {
  const intent = { id: 1, userId: 'account-a' };
  it('requires a pending user request, even when OS permission is granted', () => {
    expect(
      canCompleteNotificationEnable({
        intent: null,
        currentIntent: null,
        currentUserId: 'account-a',
        permissionStatus: 'granted',
      }),
    ).toBe(false);
    expect(
      canCompleteNotificationEnable({
        intent,
        currentIntent: intent,
        currentUserId: 'account-a',
        permissionStatus: 'granted',
      }),
    ).toBe(true);
  });

  it('does not undo a later choice to disable reminders or apply it to another account', () => {
    expect(
      canCompleteNotificationEnable({
        intent,
        currentIntent: null,
        currentUserId: 'account-a',
        permissionStatus: 'granted',
      }),
    ).toBe(false);
    expect(
      canCompleteNotificationEnable({
        intent,
        currentIntent: intent,
        currentUserId: 'account-b',
        permissionStatus: 'granted',
      }),
    ).toBe(false);
    expect(
      canCompleteNotificationEnable({
        intent,
        currentIntent: intent,
        currentUserId: 'account-a',
        permissionStatus: 'denied',
      }),
    ).toBe(false);
  });

  it('consumes an abandoned Settings request on the first return instead of enabling later', async () => {
    let pending: typeof intent | null = intent;
    const enable = vi.fn().mockResolvedValue(undefined);
    await finishNotificationEnableOnResume({
      intent: pending,
      readCurrentIntent: () => pending,
      currentUserId: () => 'account-a',
      permissionStatus: 'denied',
      enable,
      consume: () => {
        pending = null;
      },
    });
    expect(pending).toBeNull();
    await finishNotificationEnableOnResume({
      intent: pending,
      readCurrentIntent: () => pending,
      currentUserId: () => 'account-a',
      permissionStatus: 'granted',
      enable,
      consume: () => {
        pending = null;
      },
    });
    expect(enable).not.toHaveBeenCalled();
  });

  it('enables a still-pending request once and consumes it even if persistence rejects', async () => {
    let pending: typeof intent | null = intent;
    const enable = vi.fn().mockRejectedValue(new Error('storage unavailable'));
    await expect(
      finishNotificationEnableOnResume({
        intent: pending,
        readCurrentIntent: () => pending,
        currentUserId: () => 'account-a',
        permissionStatus: 'granted',
        enable,
        consume: () => {
          pending = null;
        },
      }),
    ).resolves.toBeUndefined();
    expect(enable).toHaveBeenCalledTimes(1);
    expect(pending).toBeNull();
  });
});

describe('refreshing the biometric status', () => {
  it('preserves a known supported phone on timeout and resolves a recoverable error', async () => {
    vi.useFakeTimers();
    const applySupport = vi.fn();
    const request = refreshBiometricSupportSnapshot({
      readSupport: () =>
        withSessionOperationTimeout('biometric-support', new Promise<never>(() => undefined), 100),
      previousSupport: () => ({ available: true, label: 'huella' }),
      applySupport,
    });
    await vi.advanceTimersByTimeAsync(100);
    const result = await request;
    expect(result.available).toBe(true);
    expect(result.error).toContain('No pudimos consultar');
    expect(applySupport).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });

  it('recovers from a rejected native query and applies a subsequent successful reading', async () => {
    let support = { available: false, label: 'biometría' };
    const applySupport = vi.fn((next: { available: boolean; label: string }) => {
      support = next;
    });
    const failed = await refreshBiometricSupportSnapshot({
      readSupport: async () => {
        throw new Error('native failure');
      },
      previousSupport: () => support,
      applySupport,
    });
    expect(failed.error).toContain('Inténtalo de nuevo');
    expect(applySupport).not.toHaveBeenCalled();
    const recovered = await refreshBiometricSupportSnapshot({
      readSupport: async () => ({ available: true, label: 'Face ID' }),
      previousSupport: () => support,
      applySupport,
    });
    expect(recovered).toEqual({ available: true, label: 'Face ID', error: null });
    expect(support).toEqual({ available: true, label: 'Face ID' });
  });
});
