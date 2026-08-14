import type { Session } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  reportClientErrorSafe: vi.fn(),
  traceAuthDebugEvent: vi.fn(),
}));

vi.mock('@/lib/config', () => ({
  appConfig: { appWebOrigin: 'https://app.example.com' },
}));
vi.mock('@/lib/support-errors', () => ({
  reportClientErrorSafe: mocks.reportClientErrorSafe,
}));
vi.mock('./auth-debug', () => ({
  traceAuthDebugEvent: mocks.traceAuthDebugEvent,
}));

import { applyAuthSessionFromUrl } from './session-callback';

const session = { user: { id: 'user-1' } } as Session;

function createClient() {
  return {
    auth: {
      exchangeCodeForSession: vi.fn().mockResolvedValue({
        data: { session },
        error: null,
      }),
      setSession: vi.fn().mockResolvedValue({
        data: { session },
        error: null,
      }),
    },
  };
}

describe('applyAuthSessionFromUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ignores callbacks outside the configured app origins and routes', async () => {
    const client = createClient();

    await expect(
      applyAuthSessionFromUrl({
        client,
        onPasswordRecoverySession: vi.fn(),
        url: 'https://attacker.example/reset-password?code=stolen',
      }),
    ).resolves.toBe(false);

    expect(client.auth.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(client.auth.setSession).not.toHaveBeenCalled();
  });

  it('exchanges a recovery code and marks the resulting session as recovery', async () => {
    const client = createClient();
    const onPasswordRecoverySession = vi.fn();

    await expect(
      applyAuthSessionFromUrl({
        client,
        onPasswordRecoverySession,
        url: 'https://app.example.com/reset-password?code=recovery-code&type=recovery',
      }),
    ).resolves.toBe(true);

    expect(client.auth.exchangeCodeForSession).toHaveBeenCalledWith('recovery-code');
    expect(onPasswordRecoverySession).toHaveBeenCalledWith(session);
  });

  it('applies token callbacks from an approved app route', async () => {
    const client = createClient();

    await expect(
      applyAuthSessionFromUrl({
        client,
        onPasswordRecoverySession: vi.fn(),
        url: 'happycircles://setup-account#access_token=access&refresh_token=refresh',
      }),
    ).resolves.toBe(true);

    expect(client.auth.setSession).toHaveBeenCalledWith({
      access_token: 'access',
      refresh_token: 'refresh',
    });
  });

  it('reports provider errors and leaves the callback retryable', async () => {
    const client = createClient();
    client.auth.exchangeCodeForSession.mockResolvedValueOnce({
      data: { session: null },
      error: { message: 'exchange failed' },
    });

    await expect(
      applyAuthSessionFromUrl({
        client,
        onPasswordRecoverySession: vi.fn(),
        url: 'happycircles://join?code=retryable-code',
      }),
    ).resolves.toBe(false);

    expect(mocks.reportClientErrorSafe).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: 'auth_callback_exchange_code_for_session',
        fatal: false,
      }),
    );
  });
});
