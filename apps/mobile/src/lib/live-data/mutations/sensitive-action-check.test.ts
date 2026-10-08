import { describe, expect, it, vi } from 'vitest';

import {
  guardSensitiveMutationAction,
  isDeviceAuthorizationRequired,
  isIdentityConfirmationCancelled,
  runAuthorizedMutationAction,
  type SensitiveMutationSession,
} from './sensitive-action-check';

const readySession: SensitiveMutationSession = {
  userId: 'user-a',
  isEmailConfirmed: true,
  profileCompletionState: 'complete',
  isAuthorizedDeviceSession: true,
  isLocked: false,
};

describe('sensitive mutation account readiness', () => {
  it.each([
    [{ userId: null }, 'Inicia sesión'],
    [{ isEmailConfirmed: false }, 'Confirma tu correo'],
    [{ profileCompletionState: 'incomplete' }, 'Completa tu perfil'],
  ] as const)(
    'blocks an incomplete account before confirmation or sending (%j)',
    async (overrides, message) => {
      const confirmIdentity = vi.fn();
      const action = vi.fn();
      await expect(
        runAuthorizedMutationAction({
          actionLabel: 'registrar',
          readSession: () => ({ ...readySession, ...overrides }),
          confirmIdentity,
          action,
        }),
      ).rejects.toThrow(message);
      expect(confirmIdentity).not.toHaveBeenCalled();
      expect(action).not.toHaveBeenCalled();
    },
  );

  it('does not repeatedly ask biometrics or proof freshness for an authorized unlocked session', async () => {
    const confirmIdentity = vi.fn();
    await guardSensitiveMutationAction(readySession, 'registrar', confirmIdentity);
    await guardSensitiveMutationAction(readySession, 'aprobar', confirmIdentity);
    expect(confirmIdentity).not.toHaveBeenCalled();
  });

  it('confirms an unbound session inline before sending the initiating actor', async () => {
    const confirmIdentity = vi.fn().mockResolvedValue(true);
    const action = vi.fn().mockResolvedValue('sent');
    await expect(
      runAuthorizedMutationAction({
        actionLabel: 'registrar',
        readSession: () => ({ ...readySession, isAuthorizedDeviceSession: false }),
        confirmIdentity,
        action,
      }),
    ).resolves.toBe('sent');
    expect(confirmIdentity).toHaveBeenCalledExactlyOnceWith({
      actionLabel: 'registrar',
      purpose: 'device',
      force: false,
    });
    expect(action).toHaveBeenCalledExactlyOnceWith('user-a');
  });

  it('requires explicit sensitive confirmation for an authorized locked session', async () => {
    const confirmIdentity = vi.fn().mockResolvedValue(true);
    await guardSensitiveMutationAction(
      { ...readySession, isLocked: true },
      'aprobar',
      confirmIdentity,
    );
    expect(confirmIdentity).toHaveBeenCalledExactlyOnceWith({
      actionLabel: 'aprobar',
      purpose: 'sensitive',
      force: true,
    });
  });

  it('treats cancelled confirmation quietly and never sends', async () => {
    const confirmIdentity = vi.fn().mockResolvedValue(false);
    const action = vi.fn();
    const failure = await runAuthorizedMutationAction({
      actionLabel: 'registrar',
      readSession: () => ({ ...readySession, isAuthorizedDeviceSession: false }),
      confirmIdentity,
      action,
    }).catch((error: unknown) => error);
    expect(isIdentityConfirmationCancelled(failure)).toBe(true);
    expect(action).not.toHaveBeenCalled();
  });

  it('rejects an account switch during inline confirmation without sending', async () => {
    let session = { ...readySession, isAuthorizedDeviceSession: false };
    const confirmIdentity = vi.fn().mockImplementation(() => {
      session = { ...session, userId: 'user-b' };
      return Promise.resolve(true);
    });
    const action = vi.fn();
    await expect(
      runAuthorizedMutationAction({
        actionLabel: 'registrar',
        readSession: () => session,
        confirmIdentity,
        action,
      }),
    ).rejects.toThrow('La sesión cambió');
    expect(action).not.toHaveBeenCalled();
  });
});

describe('sensitive mutation authorization recovery', () => {
  const authorizationRequired = Object.assign(new Error('Authorization required'), {
    code: 'device_authorization_required',
  });

  it('recognizes only the definitive structured authorization error', () => {
    expect(isDeviceAuthorizationRequired(authorizationRequired)).toBe(true);
    expect(isDeviceAuthorizationRequired(new Error('device_authorization_required'))).toBe(false);
    expect(isDeviceAuthorizationRequired({ code: 'request_timeout' })).toBe(false);
    expect(isDeviceAuthorizationRequired(null)).toBe(false);
  });

  it('retries the same callback exactly once after server-required device confirmation', async () => {
    const confirmIdentity = vi.fn().mockResolvedValue(true);
    const action = vi
      .fn()
      .mockRejectedValueOnce(authorizationRequired)
      .mockResolvedValueOnce('sent');
    await expect(
      runAuthorizedMutationAction({
        actionLabel: 'registrar',
        readSession: () => readySession,
        confirmIdentity,
        action,
      }),
    ).resolves.toBe('sent');
    expect(action.mock.calls).toEqual([['user-a'], ['user-a']]);
    expect(confirmIdentity).toHaveBeenCalledExactlyOnceWith({
      actionLabel: 'registrar',
      purpose: 'device',
      force: true,
    });
  });

  it('does not keep retrying a second authorization rejection', async () => {
    const confirmIdentity = vi.fn().mockResolvedValue(true);
    const action = vi.fn().mockRejectedValue(authorizationRequired);
    await expect(
      runAuthorizedMutationAction({
        actionLabel: 'registrar',
        readSession: () => readySession,
        confirmIdentity,
        action,
      }),
    ).rejects.toBe(authorizationRequired);
    expect(action).toHaveBeenCalledTimes(2);
    expect(confirmIdentity).toHaveBeenCalledOnce();
  });

  it('cancellation after a definitive rejection prevents retry', async () => {
    const confirmIdentity = vi.fn().mockResolvedValue(false);
    const action = vi.fn().mockRejectedValue(authorizationRequired);
    const failure = await runAuthorizedMutationAction({
      actionLabel: 'registrar',
      readSession: () => readySession,
      confirmIdentity,
      action,
    }).catch((error: unknown) => error);
    expect(isIdentityConfirmationCancelled(failure)).toBe(true);
    expect(action).toHaveBeenCalledOnce();
  });

  it('an account switch during server-required confirmation prevents retry', async () => {
    let session = readySession;
    const confirmIdentity = vi.fn().mockImplementation(() => {
      session = { ...session, userId: 'user-b' };
      return Promise.resolve(true);
    });
    const action = vi.fn().mockRejectedValue(authorizationRequired);
    await expect(
      runAuthorizedMutationAction({
        actionLabel: 'registrar',
        readSession: () => session,
        confirmIdentity,
        action,
      }),
    ).rejects.toThrow('La sesión cambió');
    expect(action).toHaveBeenCalledOnce();
  });

  it.each([
    new Error('Network request failed'),
    { code: 'request_timeout' },
    { code: 'validation_failed' },
  ])('does not retry an ambiguous or unrelated failure (%j)', async (failure) => {
    const confirmIdentity = vi.fn();
    const action = vi.fn().mockRejectedValue(failure);
    await expect(
      runAuthorizedMutationAction({
        actionLabel: 'registrar',
        readSession: () => readySession,
        confirmIdentity,
        action,
      }),
    ).rejects.toBe(failure);
    expect(action).toHaveBeenCalledOnce();
    expect(confirmIdentity).not.toHaveBeenCalled();
  });
});
