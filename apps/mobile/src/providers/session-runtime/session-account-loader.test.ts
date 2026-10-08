import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';
import type { TrustedDeviceRow, UserProfileRow } from '../session/types';

vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('@/lib/device-trust', () => ({
  getCurrentAppVersion: () => '1.0.0',
  getCurrentDeviceName: () => 'Phone',
  getOrCreateDeviceId: async () => 'device-a',
}));
vi.mock('@/lib/support-errors', () => ({
  readFunctionErrorDetails: async () => ({ message: 'Failed' }),
}));
vi.mock('./session-controller-helpers', () => ({
  resolveUserIdentities: async () => [{ provider: 'google' }],
}));
vi.mock('./session-edge-action', () => ({ trustCurrentSessionDevice: vi.fn() }));

import { loadSessionAccountState } from './session-account-loader';
import { trustCurrentSessionDevice } from './session-edge-action';

const sid = '11111111-1111-4111-8111-111111111111';
const nextSession = {
  access_token: `header.${Buffer.from(JSON.stringify({ sub: 'user-a', session_id: sid })).toString('base64url')}.signature`,
  user: {
    id: 'user-a',
    email: 'ana@example.com',
    email_confirmed_at: '2026-10-01',
    app_metadata: { provider: 'google' },
  },
} as Session;

function client(row: Partial<TrustedDeviceRow>, readUpdate?: () => Partial<TrustedDeviceRow>) {
  const currentDevice = {
    user_id: 'user-a',
    device_id: 'device-a',
    trust_state: 'pending',
    trusted_session_id: null,
    ...row,
  } as TrustedDeviceRow;
  const profile = {
    id: 'user-a',
    email: 'ana@example.com',
    display_name: 'Ana Gomez',
    phone_e164: '+573001234567',
    account_access_state: 'active',
  } as UserProfileRow;
  const query = {
    select: () => query,
    eq: () => query,
    neq: () => query,
    single: async () => ({ data: { ...currentDevice, ...readUpdate?.() }, error: null }),
    order: async () => ({ data: [currentDevice], error: null }),
  };
  return {
    rpc: vi.fn(async () => ({ data: profile, error: null })),
    functions: { invoke: vi.fn(async () => ({ error: null, data: {} })) },
    auth: { getUser: vi.fn(async () => ({ data: { user: nextSession.user }, error: null })) },
    from: vi.fn(() => query),
  } as unknown as Parameters<typeof loadSessionAccountState>[0]['client'];
}

describe('automatic device authorization during login and restore', () => {
  beforeEach(() => {
    vi.mocked(trustCurrentSessionDevice).mockReset().mockResolvedValue({ ok: true, data: null });
  });

  it('tries the snapshot JWT but keeps a denied account usable for contextual recovery', async () => {
    const accountClient = client({});
    vi.mocked(trustCurrentSessionDevice).mockResolvedValue({
      ok: false,
      code: 'recent_auth_required',
      message: 'Confirm identity',
    });
    const loaded = await loadSessionAccountState({
      client: accountClient,
      nextSession,
      setLoadingStage: vi.fn(),
    });
    expect(trustCurrentSessionDevice).toHaveBeenCalledWith(
      accountClient,
      'device-a',
      nextSession.access_token,
    );
    expect(loaded.accountAccessState).toBe('active');
    expect(loaded.profileCompletionState).toBe('complete');
    expect(loaded.isAuthorizedDeviceSession).toBe(false);
  });

  it('reads the binding from the server row instead of fabricating trust from an ok response', async () => {
    const pending = await loadSessionAccountState({
      client: client({}),
      nextSession,
      setLoadingStage: vi.fn(),
    });
    expect(pending.isAuthorizedDeviceSession).toBe(false);
    const authorized = await loadSessionAccountState({
      client: client({ trust_state: 'trusted', trusted_session_id: sid }),
      nextSession,
      setLoadingStage: vi.fn(),
    });
    expect(authorized.isAuthorizedDeviceSession).toBe(true);
  });

  it('keeps persisted device trust separate from authorization of a different session', async () => {
    const loaded = await loadSessionAccountState({
      client: client({
        trust_state: 'trusted',
        trusted_session_id: '22222222-2222-4222-8222-222222222222',
      }),
      nextSession,
      setLoadingStage: vi.fn(),
    });
    expect(loaded.deviceTrustState).toBe('trusted');
    expect(loaded.isAuthorizedDeviceSession).toBe(false);
  });

  it('skips the trust network request when the server row already binds the current session', async () => {
    const loaded = await loadSessionAccountState({
      client: client({ trust_state: 'trusted', trusted_session_id: sid, revoked_at: null }),
      nextSession,
      setLoadingStage: vi.fn(),
    });
    expect(loaded.isAuthorizedDeviceSession).toBe(true);
    expect(trustCurrentSessionDevice).not.toHaveBeenCalled();
  });

  it('does not undo an explicit revocation through automatic authorization', async () => {
    const restoredSession = {
      ...nextSession,
      access_token: `header.${Buffer.from(JSON.stringify({ sub: 'user-a', session_id: sid, amr: [{ method: 'password', timestamp: 1_700_000_000 }] })).toString('base64url')}.signature`,
    };
    const loaded = await loadSessionAccountState({
      client: client({ trust_state: 'revoked', revoked_at: '2026-10-07' }),
      nextSession: restoredSession,
      setLoadingStage: vi.fn(),
    });
    expect(loaded.isAuthorizedDeviceSession).toBe(false);
    expect(trustCurrentSessionDevice).not.toHaveBeenCalled();
  });

  it('tries a deliberate new login after revocation but still requires a server-approved row', async () => {
    const loaded = await loadSessionAccountState({
      client: client({ trust_state: 'revoked', revoked_at: '2026-10-07' }),
      nextSession,
      setLoadingStage: vi.fn(),
      allowRevokedAuthorization: true,
    });
    expect(trustCurrentSessionDevice).toHaveBeenCalledTimes(1);
    expect(loaded.isAuthorizedDeviceSession).toBe(false);
  });

  it('uses a later auth proof as a request hint without granting trust when the server refuses it', async () => {
    const proofSession = {
      ...nextSession,
      access_token: `header.${Buffer.from(JSON.stringify({ sub: 'user-a', session_id: sid, amr: [{ method: 'oauth', timestamp: 1_800_000_000 }] })).toString('base64url')}.signature`,
    };
    vi.mocked(trustCurrentSessionDevice).mockResolvedValue({
      ok: false,
      code: 'recent_auth_required',
      message: 'Expired',
    });
    const loaded = await loadSessionAccountState({
      client: client({ trust_state: 'revoked', revoked_at: '2026-10-07' }),
      nextSession: proofSession,
      setLoadingStage: vi.fn(),
    });
    expect(trustCurrentSessionDevice).toHaveBeenCalledTimes(1);
    expect(loaded.isAuthorizedDeviceSession).toBe(false);
  });

  it('authorizes a deliberate login after revocation only when the reread row contains its new binding', async () => {
    let serverApproved = false;
    const accountClient = client({ trust_state: 'revoked', revoked_at: '2026-10-07' }, () =>
      serverApproved ? { trust_state: 'trusted', trusted_session_id: sid, revoked_at: null } : {},
    );
    vi.mocked(trustCurrentSessionDevice).mockImplementation(async () => {
      serverApproved = true;
      return { ok: true, data: null };
    });
    const loaded = await loadSessionAccountState({
      client: accountClient,
      nextSession,
      setLoadingStage: vi.fn(),
      allowRevokedAuthorization: true,
    });
    expect(loaded.isAuthorizedDeviceSession).toBe(true);
    expect(trustCurrentSessionDevice).toHaveBeenCalledTimes(1);
  });

  it('continues loading account data after an automatic authorization timeout', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(trustCurrentSessionDevice).mockImplementation(() => new Promise(() => undefined));
      const pending = loadSessionAccountState({
        client: client({}),
        nextSession,
        setLoadingStage: vi.fn(),
      });
      await vi.advanceTimersByTimeAsync(8_000);
      expect((await pending).accountAccessState).toBe('active');
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
