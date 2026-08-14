import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AccountInvitePreviewResult } from '@/lib/live-data';

const inviteIntentMocks = vi.hoisted(() => ({
  clearPendingInviteIntentIfMatches: vi.fn(),
  writePendingInviteIntent: vi.fn(),
}));

vi.mock('@/lib/invite-intent', () => inviteIntentMocks);

import {
  createPendingAccountInviteTokenPreparationGuard,
  prepareCurrentPendingAccountInviteTokenForSignIn,
  preparePendingAccountInviteTokenForSignIn,
  reconcilePendingAccountInviteTokenAfterSignIn,
} from './account-invite-entry-pending-token';

const VALID_TOKEN = 'valid-account-invite-token';
const validPreview: AccountInvitePreviewResult = {
  inviteId: 'invite-id',
  deliveryId: 'delivery-id',
  status: 'pending_activation',
  deliveryStatus: 'issued',
  channel: 'remote',
  expiresAt: '2026-08-15T00:00:00.000Z',
  inviteExpiresAt: '2026-08-15T00:00:00.000Z',
  resolvedAt: null,
  inviterDisplayName: 'Ana',
  inviterAvatarPath: null,
  intendedRecipientPhoneMasked: null,
  reason: 'pending_activation',
};

function createDeferred<T>() {
  let resolvePromise!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

describe('pending account invite token preparation for sign-in', () => {
  beforeEach(() => {
    inviteIntentMocks.clearPendingInviteIntentIfMatches.mockReset().mockResolvedValue(true);
    inviteIntentMocks.writePendingInviteIntent.mockReset().mockResolvedValue(undefined);
  });

  it('continues without storage or validation when no token is available', async () => {
    const refetchPreview = vi.fn();

    await expect(
      preparePendingAccountInviteTokenForSignIn({
        pendingToken: null,
        preview: undefined,
        refetchPreview,
      }),
    ).resolves.toBe('absent');
    expect(refetchPreview).not.toHaveBeenCalled();
    expect(inviteIntentMocks.writePendingInviteIntent).not.toHaveBeenCalled();
    expect(inviteIntentMocks.clearPendingInviteIntentIfMatches).not.toHaveBeenCalled();
  });

  it('persists a confirmed valid token before sign-in continues', async () => {
    const refetchPreview = vi.fn();

    await expect(
      preparePendingAccountInviteTokenForSignIn({
        pendingToken: VALID_TOKEN,
        preview: validPreview,
        refetchPreview,
      }),
    ).resolves.toBe('remembered');
    expect(refetchPreview).not.toHaveBeenCalled();
    expect(inviteIntentMocks.writePendingInviteIntent).toHaveBeenCalledWith({
      type: 'account_invite',
      token: VALID_TOKEN,
      source: 'account_invite_auth',
    });
    expect(inviteIntentMocks.clearPendingInviteIntentIfMatches).not.toHaveBeenCalled();
  });

  it('ignores and clears an invalid token without blocking existing-user sign-in', async () => {
    await expect(
      preparePendingAccountInviteTokenForSignIn({
        pendingToken: 'invalid-account-invite-token',
        preview: { ...validPreview, status: 'unavailable', deliveryStatus: 'unavailable' },
        refetchPreview: vi.fn(),
      }),
    ).resolves.toBe('ignored');
    expect(inviteIntentMocks.clearPendingInviteIntentIfMatches).toHaveBeenCalledWith({
      type: 'account_invite',
      token: 'invalid-account-invite-token',
    });
    expect(inviteIntentMocks.writePendingInviteIntent).not.toHaveBeenCalled();
  });

  it('returns a current cleared-token ticket only after confirmed invalid cleanup', async () => {
    const guard = createPendingAccountInviteTokenPreparationGuard(VALID_TOKEN);
    const onIgnored = vi.fn();

    const attempt = await prepareCurrentPendingAccountInviteTokenForSignIn({
      guard,
      onIgnored,
      pendingToken: VALID_TOKEN,
      preview: { ...validPreview, status: 'unavailable', deliveryStatus: 'unavailable' },
      refetchPreview: vi.fn(),
    });

    expect(onIgnored).toHaveBeenCalledOnce();
    expect(attempt && guard.isCurrent(attempt)).toBe(true);
    expect(attempt?.token).toBeNull();
  });

  it('blocks on transport failure and preserves the token without touching storage', async () => {
    await expect(
      preparePendingAccountInviteTokenForSignIn({
        pendingToken: VALID_TOKEN,
        preview: undefined,
        refetchPreview: vi.fn().mockResolvedValue({
          data: undefined,
          error: new Error('network unavailable'),
        }),
      }),
    ).rejects.toThrow('No pudimos validar esta invitación. Revisa tu conexión e intenta de nuevo.');
    expect(inviteIntentMocks.clearPendingInviteIntentIfMatches).not.toHaveBeenCalled();
    expect(inviteIntentMocks.writePendingInviteIntent).not.toHaveBeenCalled();
  });

  it('blocks when confirmed-invalid token cleanup fails', async () => {
    inviteIntentMocks.clearPendingInviteIntentIfMatches.mockRejectedValueOnce(
      new Error('storage unavailable'),
    );

    await expect(
      preparePendingAccountInviteTokenForSignIn({
        pendingToken: VALID_TOKEN,
        preview: { ...validPreview, status: 'unavailable', deliveryStatus: 'unavailable' },
        refetchPreview: vi.fn(),
      }),
    ).rejects.toThrow('No pudimos limpiar la invitación anterior. Intenta de nuevo.');
    expect(inviteIntentMocks.writePendingInviteIntent).not.toHaveBeenCalled();
  });

  it('does not continue silently when a valid token cannot be persisted', async () => {
    inviteIntentMocks.writePendingInviteIntent.mockRejectedValueOnce(new Error('storage failed'));

    await expect(
      preparePendingAccountInviteTokenForSignIn({
        pendingToken: VALID_TOKEN,
        preview: validPreview,
        refetchPreview: vi.fn(),
      }),
    ).rejects.toThrow('storage failed');
  });

  it('does not clear or write stale token A after the current token changes to B', async () => {
    const guard = createPendingAccountInviteTokenPreparationGuard('token-a-valid-value');
    const onIgnored = vi.fn();
    const deferredRefetch = createDeferred<{ data: AccountInvitePreviewResult; error: null }>();
    const refetchPreview = vi.fn(() => deferredRefetch.promise);
    const preparation = prepareCurrentPendingAccountInviteTokenForSignIn({
      guard,
      onIgnored,
      pendingToken: 'token-a-valid-value',
      preview: undefined,
      refetchPreview,
    });

    guard.replaceToken('token-b-valid-value');
    deferredRefetch.resolve({
      data: { ...validPreview, status: 'unavailable', deliveryStatus: 'unavailable' },
      error: null,
    });

    await expect(preparation).resolves.toBeNull();
    expect(inviteIntentMocks.clearPendingInviteIntentIfMatches).not.toHaveBeenCalled();
    expect(inviteIntentMocks.writePendingInviteIntent).not.toHaveBeenCalled();
    expect(onIgnored).not.toHaveBeenCalled();
  });

  it('removes an in-flight remembered A with compare-and-clear when it becomes stale', async () => {
    const guard = createPendingAccountInviteTokenPreparationGuard('token-a-valid-value');
    const deferredWrite = createDeferred<void>();
    inviteIntentMocks.writePendingInviteIntent.mockImplementationOnce(() => deferredWrite.promise);
    const preparation = prepareCurrentPendingAccountInviteTokenForSignIn({
      guard,
      pendingToken: 'token-a-valid-value',
      preview: validPreview,
      refetchPreview: vi.fn(),
    });
    await vi.waitFor(() => expect(inviteIntentMocks.writePendingInviteIntent).toHaveBeenCalled());

    guard.replaceToken('token-b-valid-value');
    deferredWrite.resolve();

    await expect(preparation).resolves.toBeNull();
    expect(inviteIntentMocks.clearPendingInviteIntentIfMatches).toHaveBeenCalledWith({
      type: 'account_invite',
      token: 'token-a-valid-value',
    });
  });

  it('propagates stale remembered-token cleanup failure instead of leaving auth unblocked', async () => {
    const guard = createPendingAccountInviteTokenPreparationGuard('token-a-valid-value');
    const deferredWrite = createDeferred<void>();
    inviteIntentMocks.writePendingInviteIntent.mockImplementationOnce(() => deferredWrite.promise);
    inviteIntentMocks.clearPendingInviteIntentIfMatches.mockRejectedValueOnce(
      new Error('storage unavailable'),
    );
    const preparation = prepareCurrentPendingAccountInviteTokenForSignIn({
      guard,
      pendingToken: 'token-a-valid-value',
      preview: validPreview,
      refetchPreview: vi.fn(),
    });
    await vi.waitFor(() => expect(inviteIntentMocks.writePendingInviteIntent).toHaveBeenCalled());

    guard.replaceToken('token-b-valid-value');
    deferredWrite.resolve();

    await expect(preparation).rejects.toThrow(
      'No pudimos limpiar la invitación anterior. Intenta de nuevo.',
    );
  });

  it('reconciles B after token A changes while authentication is in flight', async () => {
    const tokenA = 'token-a-valid-value';
    const tokenB = 'token-b-valid-value';
    const guard = createPendingAccountInviteTokenPreparationGuard(tokenA);
    const authResult = createDeferred<void>();
    const storageOperations: string[] = [];
    let storedToken: string | null = null;
    inviteIntentMocks.writePendingInviteIntent.mockImplementation(
      async (input: { token: string }) => {
        storageOperations.push(`write:${input.token}`);
        storedToken = input.token;
      },
    );
    inviteIntentMocks.clearPendingInviteIntentIfMatches.mockImplementation(
      async (input: { token: string }) => {
        storageOperations.push(`clear:${input.token}`);
        if (storedToken !== input.token) return false;
        storedToken = null;
        return true;
      },
    );
    guard.updateLatestInput({
      pendingToken: tokenA,
      preview: validPreview,
      refetchPreview: vi.fn(),
    });
    const authenticatedAttempt = await prepareCurrentPendingAccountInviteTokenForSignIn({
      guard,
      pendingToken: tokenA,
      preview: validPreview,
      refetchPreview: vi.fn(),
    });
    expect(authenticatedAttempt).not.toBeNull();

    const authAndReconciliation = (async () => {
      await authResult.promise;
      return reconcilePendingAccountInviteTokenAfterSignIn({
        authenticatedAttempt: authenticatedAttempt!,
        guard,
      });
    })();
    guard.updateLatestInput({
      pendingToken: tokenB,
      preview: validPreview,
      refetchPreview: vi.fn(),
    });
    authResult.resolve();

    const reconciledAttempt = await authAndReconciliation;
    expect(guard.isCurrent(reconciledAttempt)).toBe(true);
    expect(reconciledAttempt.token).toBe(tokenB);
    expect(storedToken).toBe(tokenB);
    expect(storageOperations).toEqual([`write:${tokenA}`, `clear:${tokenA}`, `write:${tokenB}`]);
  });

  it('serializes deferred A and B writes so remembered B is the persisted token', async () => {
    const tokenA = 'token-a-valid-value';
    const tokenB = 'token-b-valid-value';
    const guard = createPendingAccountInviteTokenPreparationGuard(tokenA);
    const deferredWriteA = createDeferred<void>();
    const deferredWriteB = createDeferred<void>();
    let storedToken: string | null = null;
    inviteIntentMocks.writePendingInviteIntent.mockImplementation(
      async (input: { token: string }) => {
        await (input.token === tokenA ? deferredWriteA.promise : deferredWriteB.promise);
        storedToken = input.token;
      },
    );
    inviteIntentMocks.clearPendingInviteIntentIfMatches.mockImplementation(
      async (input: { token: string }) => {
        if (storedToken !== input.token) return false;
        storedToken = null;
        return true;
      },
    );

    const preparationA = prepareCurrentPendingAccountInviteTokenForSignIn({
      guard,
      pendingToken: tokenA,
      preview: validPreview,
      refetchPreview: vi.fn(),
    });
    await vi.waitFor(() =>
      expect(inviteIntentMocks.writePendingInviteIntent).toHaveBeenCalledTimes(1),
    );
    guard.replaceToken(tokenB);
    const preparationB = prepareCurrentPendingAccountInviteTokenForSignIn({
      guard,
      pendingToken: tokenB,
      preview: validPreview,
      refetchPreview: vi.fn(),
    });
    expect(inviteIntentMocks.writePendingInviteIntent).toHaveBeenCalledTimes(1);

    deferredWriteA.resolve();
    await expect(preparationA).resolves.toBeNull();
    await vi.waitFor(() =>
      expect(inviteIntentMocks.writePendingInviteIntent).toHaveBeenCalledTimes(2),
    );
    expect(storedToken).toBeNull();

    deferredWriteB.resolve();
    const preparedB = await preparationB;
    expect(preparedB && guard.isCurrent(preparedB)).toBe(true);
    expect(storedToken).toBe(tokenB);
  });
});
