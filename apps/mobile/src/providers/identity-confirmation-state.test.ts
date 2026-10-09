import { describe, expect, it } from 'vitest';

import {
  availableIdentityConfirmationMethods,
  canReuseIdentityConfirmation,
  IdentityConfirmationRequests,
  IdentityConfirmationUnavailableError,
} from './identity-confirmation-state';

const sensitiveAction = { actionLabel: 'aprobar este movimiento', purpose: 'sensitive' } as const;
const available = {
  purpose: 'sensitive' as const,
  isAuthorizedDeviceSession: true,
  biometricAvailable: true,
  hasGoogle: true,
  hasApple: true,
  appleSignInAvailable: true,
  hasPassword: true,
};

describe('identity confirmation methods', () => {
  it('offers only account methods usable on this phone', () => {
    expect(
      availableIdentityConfirmationMethods({
        ...available,
        appleSignInAvailable: false,
        hasPassword: false,
      }),
    ).toEqual(['biometric', 'google']);
  });

  it('does not use local biometrics to establish server device trust', () => {
    expect(availableIdentityConfirmationMethods({ ...available, purpose: 'device' })).toEqual([
      'google',
      'apple',
      'password',
    ]);
    expect(
      availableIdentityConfirmationMethods({ ...available, isAuthorizedDeviceSession: false }),
    ).not.toContain('biometric');
  });

  it('does not offer a new password or an unlinked provider as confirmation', () => {
    expect(
      availableIdentityConfirmationMethods({
        ...available,
        biometricAvailable: false,
        hasGoogle: false,
        hasApple: false,
        hasPassword: false,
      }),
    ).toEqual([]);
  });
});

describe('identity confirmation proofs', () => {
  const proof = { isAuthorizedDeviceSession: true, isLocked: false, stepUpFreshUntil: 2_000 };

  it('requires fresh proof for a sensitive action and honors forced confirmation', () => {
    expect(canReuseIdentityConfirmation(sensitiveAction, proof, 1_000)).toBe(true);
    expect(canReuseIdentityConfirmation(sensitiveAction, proof, 2_000)).toBe(false);
    expect(canReuseIdentityConfirmation({ ...sensitiveAction, force: true }, proof, 1_000)).toBe(
      false,
    );
  });

  it('does not accept a trusted device row without this session or a locked app', () => {
    expect(
      canReuseIdentityConfirmation(
        sensitiveAction,
        { ...proof, isAuthorizedDeviceSession: false },
        1_000,
      ),
    ).toBe(false);
    expect(canReuseIdentityConfirmation(sensitiveAction, { ...proof, isLocked: true }, 1_000)).toBe(
      false,
    );
  });

  it('reuses an unlocked authorized device session without inventing sensitive proof', () => {
    const state = { ...proof, stepUpFreshUntil: null };
    expect(
      canReuseIdentityConfirmation({ ...sensitiveAction, purpose: 'device' }, state, 1_000),
    ).toBe(true);
    expect(canReuseIdentityConfirmation(sensitiveAction, state, 1_000)).toBe(false);
  });
});

describe('identity confirmation request lifecycle', () => {
  it('lets only one action own a confirmation and settles it once', async () => {
    const requests = new IdentityConfirmationRequests();
    const first = requests.begin('user-a', sensitiveAction)!;
    expect(requests.begin('user-a', sensitiveAction)).toBeNull();
    expect(requests.finish(first.request, 'user-a', true)).toBe(true);
    expect(requests.finish(first.request, 'user-a', false)).toBe(false);
    await expect(first.promise).resolves.toBe(true);
  });

  it('settles cancellation immediately and ignores a late authentication result', async () => {
    const requests = new IdentityConfirmationRequests();
    const first = requests.begin('user-a', sensitiveAction)!;
    requests.cancel();
    await expect(first.promise).resolves.toBe(false);
    expect(requests.finish(first.request, 'user-a', true)).toBe(false);
  });

  it('prevents an old result from confirming a new request after cancellation', async () => {
    const requests = new IdentityConfirmationRequests();
    const first = requests.begin('user-a', sensitiveAction)!;
    requests.cancel();
    const next = requests.begin('user-a', sensitiveAction)!;
    expect(requests.finish(first.request, 'user-a', true)).toBe(false);
    expect(requests.isCurrent(next.request, 'user-a')).toBe(true);
    requests.finish(next.request, 'user-a', false);
    await expect(next.promise).resolves.toBe(false);
  });

  it('never confirms an action for an account different from its requester', async () => {
    const requests = new IdentityConfirmationRequests();
    const first = requests.begin('user-a', sensitiveAction)!;
    expect(requests.isCurrent(first.request, 'user-b')).toBe(false);
    requests.finish(first.request, 'user-b', true);
    await expect(first.promise).rejects.toMatchObject({ code: 'auth_required' });
    expect(requests.begin(null, sensitiveAction)).toBeNull();
  });

  it('reports infrastructure failures distinctly from explicit cancellation and ignores late results', async () => {
    const requests = new IdentityConfirmationRequests();
    const first = requests.begin('user-a', sensitiveAction)!;
    const failure = new IdentityConfirmationUnavailableError();
    expect(requests.fail(failure, first.request)).toBe(true);
    await expect(first.promise).rejects.toBe(failure);
    const next = requests.begin('user-a', sensitiveAction)!;
    expect(requests.fail(failure, first.request)).toBe(false);
    expect(requests.finish(first.request, 'user-a', true)).toBe(false);
    requests.cancel();
    await expect(next.promise).resolves.toBe(false);
  });
});
