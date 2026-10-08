import { describe, expect, it, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';
import type { StepUpProof } from './device-session-authorization';
import { readAuthSessionIdentity } from './device-session-authorization';
import { createSessionAuthorizationActions } from './session-authorization-actions';
import type { SessionEdgeActionResult } from './session-edge-action';

const oldSid = '11111111-1111-4111-8111-111111111111';
const newSid = '22222222-2222-4222-8222-222222222222';
function session(userId = 'user-a', sessionId = oldSid): Session {
  return {
    access_token: `header.${Buffer.from(JSON.stringify({ sub: userId, session_id: sessionId })).toString('base64url')}.signature`,
    user: { id: userId, email: `${userId}@example.com` },
  } as Session;
}

function harness(isAuthorized = false) {
  const runtime = {
    session: session() as Session | null,
    deviceId: 'device-a',
    isAuthorized,
    linkedMethods: {
      hasGoogle: true,
      hasApple: false,
      hasEmailPassword: false,
      hasPhone: false,
      providers: ['google'],
    },
    proof: null as StepUpProof | null,
  };
  const readSession = vi.fn(async () => runtime.session);
  const confirm = vi
    .fn<(session: Session, deviceId: string) => Promise<SessionEdgeActionResult<unknown>>>()
    .mockResolvedValue({ ok: true, data: null });
  const refresh = vi.fn(async () => {
    runtime.isAuthorized = true;
  });
  const authenticate = vi.fn(async () => ({ userId: 'user-a' }));
  const authenticateBiometrics = vi.fn(async () => ({ success: true, error: null }));
  const onProof = vi.fn(() => {
    const identity = readAuthSessionIdentity(runtime.session);
    runtime.proof = identity ? { ...identity, expiresAt: Date.now() + 300_000 } : null;
  });
  const onAccountMismatch = vi.fn(async () => {
    runtime.session = null;
    runtime.isAuthorized = false;
  });
  const actions = createSessionAuthorizationActions({
    readRuntime: () => runtime,
    readSession,
    adoptSession: (nextSession) => {
      runtime.session = nextSession;
    },
    confirm,
    refresh,
    authenticate,
    authenticateBiometrics,
    wait: async () => undefined,
    onAccountMismatch,
    onAuthorizationFailure: (code) => {
      if (code) runtime.isAuthorized = false;
    },
    onProof,
    onUnlock: vi.fn(),
    isMounted: () => true,
    errorMessage: () => 'No pudimos validar la cuenta. Inténtalo de nuevo.',
  });
  return {
    runtime,
    actions,
    readSession,
    confirm,
    refresh,
    authenticate,
    authenticateBiometrics,
    onProof,
    onAccountMismatch,
  };
}

describe('current device session authorization', () => {
  it('waits for server approval and reloads its row without prompting or renewing sensitive proof', async () => {
    const state = harness();
    let resolve!: (value: { ok: true; data: null }) => void;
    state.confirm.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const pending = state.actions.authorizeCurrentDeviceSession();
    await vi.waitFor(() => expect(state.confirm).toHaveBeenCalledTimes(1));
    expect(state.runtime.isAuthorized).toBe(false);
    expect(state.refresh).not.toHaveBeenCalled();
    resolve({ ok: true, data: null });
    expect(await pending).toEqual({ success: true, error: null });
    expect(state.refresh).toHaveBeenCalledTimes(1);
    expect(state.authenticate).not.toHaveBeenCalled();
    expect(state.onProof).not.toHaveBeenCalled();
  });

  it('keeps server failure code and message without opening an account provider', async () => {
    const state = harness();
    state.confirm.mockResolvedValueOnce({
      ok: false,
      code: 'recent_auth_required',
      message: 'Confirma tu cuenta',
    } as never);
    expect(await state.actions.authorizeCurrentDeviceSession()).toEqual({
      success: false,
      error: 'recent_auth_required',
      message: 'Confirma tu cuenta',
    });
    expect(state.runtime.session?.user.id).toBe('user-a');
    expect(state.refresh).not.toHaveBeenCalled();
    expect(state.authenticate).not.toHaveBeenCalled();
    expect(state.onProof).not.toHaveBeenCalled();
  });

  it('rebinds a phone with an old trusted session instead of reporting a local success', async () => {
    const state = harness(false);
    state.runtime.session = session('user-a', newSid);
    expect(await state.actions.trustCurrentDevice()).toBe('Este teléfono ahora es confiable.');
    expect(state.confirm.mock.calls[0]?.[0].access_token).toBe(state.runtime.session.access_token);
    expect(state.confirm).toHaveBeenCalledTimes(1);
    expect(state.onProof).not.toHaveBeenCalled();
  });

  it('discards a late approval after the account or session changed', async () => {
    const state = harness();
    let resolve!: (value: { ok: true; data: null }) => void;
    state.confirm.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const pending = state.actions.authorizeCurrentDeviceSession();
    await vi.waitFor(() => expect(state.confirm).toHaveBeenCalledTimes(1));
    state.runtime.session = session('user-b', newSid);
    resolve({ ok: true, data: null });
    expect((await pending).error).toBe('session_changed');
    expect(state.refresh).not.toHaveBeenCalled();
    expect(state.onProof).not.toHaveBeenCalled();
  });

  it('recovers from a rejected request without an unhandled rejection or false trust', async () => {
    const state = harness();
    state.confirm.mockRejectedValueOnce(new Error('timeout'));
    expect(await state.actions.authorizeCurrentDeviceSession()).toEqual({
      success: false,
      error: 'server_validation_failed',
      message: 'No pudimos validar la cuenta. Inténtalo de nuevo.',
    });
    expect(state.runtime.isAuthorized).toBe(false);
    expect(state.onProof).not.toHaveBeenCalled();
  });

  it('honors explicit Google recovery even when a previously loaded binding was revoked', async () => {
    const state = harness(true);
    state.confirm.mockResolvedValueOnce({
      ok: false,
      code: 'recent_auth_required',
      message: 'Confirma tu cuenta',
    });
    expect((await state.actions.authorizeCurrentDeviceSession()).success).toBe(false);
    expect(state.runtime.isAuthorized).toBe(false);
    // Even a stale cached true value cannot bypass the requested method.
    state.runtime.isAuthorized = true;
    expect(await state.actions.trustCurrentDevice({ method: 'google' })).toBe(
      'Este teléfono ahora es confiable.',
    );
    expect(state.authenticate).toHaveBeenCalledTimes(1);
    expect(state.confirm).toHaveBeenCalledTimes(2);
    expect(state.onProof).toHaveBeenCalledTimes(1);
  });
});

describe('confirmation can continue the pending sensitive action', () => {
  it('uses the newly authenticated Google session and immediately reuses its bound proof', async () => {
    const state = harness();
    state.authenticate.mockImplementationOnce(async () => {
      state.runtime.session = session('user-a', newSid);
      return { userId: 'user-a' };
    });
    expect((await state.actions.stepUpAuth({ method: 'google', force: true })).success).toBe(true);
    expect(state.confirm.mock.calls[0]?.[0].access_token).toBe(state.runtime.session?.access_token);
    expect(state.onProof).toHaveBeenCalledTimes(1);
    expect((await state.actions.stepUpAuth()).success).toBe(true);
    expect(state.authenticate).toHaveBeenCalledTimes(1);
    expect(state.authenticateBiometrics).not.toHaveBeenCalled();
  });

  it('never grants proof to a different account returned by the provider', async () => {
    const state = harness();
    state.authenticate.mockResolvedValueOnce({ userId: 'user-b' });
    expect((await state.actions.stepUpAuth({ method: 'google', force: true })).error).toBe(
      'account_mismatch',
    );
    expect(state.onAccountMismatch).toHaveBeenCalledTimes(1);
    expect(state.confirm).not.toHaveBeenCalled();
    expect(state.onProof).not.toHaveBeenCalled();
  });

  it('does not treat a social account as having a synthetic password', async () => {
    const state = harness(true);
    expect(
      (await state.actions.stepUpAuth({ method: 'password', password: 'provided' })).error,
    ).toBe('password_unavailable');
    expect(state.authenticate).not.toHaveBeenCalled();
    expect(state.onProof).not.toHaveBeenCalled();
  });

  it('refuses to reuse a confirmation from another session of the same account', async () => {
    const state = harness(true);
    state.runtime.proof = { userId: 'user-a', sessionId: oldSid, expiresAt: Date.now() + 300_000 };
    state.runtime.session = session('user-a', newSid);
    expect((await state.actions.stepUpAuth()).success).toBe(true);
    expect(state.authenticateBiometrics).toHaveBeenCalledTimes(1);
  });

  it('discards a native result after a new session appeared', async () => {
    const state = harness(true);
    state.authenticateBiometrics.mockImplementationOnce(async () => {
      state.runtime.session = session('user-a', newSid);
      return { success: true, error: null };
    });
    expect((await state.actions.stepUpAuth(true)).error).toBe('session_changed');
    expect(state.onProof).not.toHaveBeenCalled();
  });
});
