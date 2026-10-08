import { describe, expect, it, vi } from 'vitest';

import {
  findCurrentDeviceRecord,
  requireAuthenticationAfterDeviceRevocation,
  requireAuthorizedDeviceSession,
} from '../../supabase/functions/_shared/authorized-device-session';
import type {
  AuthorizedDeviceReadClient,
  TrustedDeviceSessionRecord,
} from '../../supabase/functions/_shared/authorized-device-session';

const identity = {
  actorUserId: 'user-1',
  claims: {
    session_id: 'session-1',
    // An old login remains authorized when the server session registration is current.
    amr: [{ method: 'password', timestamp: 1 }],
    user_metadata: { deviceAuthorized: true },
  },
};
const row = {
  user_id: 'user-1',
  device_id: 'device-1',
  trusted_session_id: 'session-1',
  trust_state: 'trusted',
  trusted_at: '2026-10-07T10:00:00Z',
  revoked_at: null,
};

function reader(data: unknown, error: unknown = null) {
  const filters: [string, unknown][] = [];
  const query = {
    eq: vi.fn((column: string, value: string) => {
      filters.push([column, value]);
      return query;
    }),
    is: vi.fn((column: string, value: null) => {
      filters.push([column, value]);
      return query;
    }),
    limit: vi.fn(() => query),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
  };
  const select = vi.fn(() => query);
  const from = vi.fn(() => ({ select }));
  const client: AuthorizedDeviceReadClient = { from };
  return { client, filters, from, query };
}

describe('server device session authorization', () => {
  it('allows a registered session after the authentication proof ages, without a body device ID', async () => {
    const read = reader(row);
    await expect(requireAuthorizedDeviceSession(read.client, identity)).resolves.toBeUndefined();
    expect(read.from).toHaveBeenCalledWith('trusted_devices');
    expect(read.filters).toEqual([
      ['user_id', 'user-1'],
      ['trusted_session_id', 'session-1'],
      ['trust_state', 'trusted'],
      ['revoked_at', null],
    ]);
  });

  it.each([
    null,
    { ...row, trust_state: 'pending' },
    { ...row, trust_state: 'revoked' },
    { ...row, revoked_at: '2026-10-07T10:01:00Z' },
    { ...row, user_id: 'other-user' },
    { ...row, trusted_session_id: 'other-session' },
    { ...row, trusted_session_id: null },
    { trust_state: 'trusted' },
  ])('rejects missing, revoked, legacy, or mismatched authorization: %j', async (data) => {
    const read = reader(data);
    await expect(requireAuthorizedDeviceSession(read.client, identity)).rejects.toThrow(
      'device_authorization_required',
    );
  });

  it.each([undefined, null, '', ' ', 123])(
    'requires a verified session claim: %j',
    async (sessionId) => {
      const read = reader(row);
      await expect(
        requireAuthorizedDeviceSession(read.client, {
          ...identity,
          claims: { ...identity.claims, session_id: sessionId },
        }),
      ).rejects.toThrow('device_authorization_required');
      expect(read.from).not.toHaveBeenCalled();
    },
  );

  it('propagates lookup failures instead of treating unavailable verification as an authorization', async () => {
    const error = new Error('database unavailable');
    const read = reader(null, error);
    await expect(requireAuthorizedDeviceSession(read.client, identity)).rejects.toBe(error);
  });

  it('loads only the actor device before deciding whether trust creation is necessary', async () => {
    const read = reader(row);
    const device = await findCurrentDeviceRecord(read.client, identity, 'device-1');
    expect(device).toMatchObject({
      userId: 'user-1',
      deviceId: 'device-1',
      sessionId: 'session-1',
    });
    expect(read.filters).toEqual([
      ['user_id', 'user-1'],
      ['device_id', 'device-1'],
    ]);
    expect(await findCurrentDeviceRecord(reader(row).client, identity, 'other-device')).toBeNull();
    expect(
      await findCurrentDeviceRecord(
        reader({ ...row, user_id: 'other-user' }).client,
        identity,
        'device-1',
      ),
    ).toBeNull();
  });
});

describe('reauthorization after revocation', () => {
  const revokedDevice: TrustedDeviceSessionRecord = {
    userId: 'user-1',
    deviceId: 'device-1',
    sessionId: null,
    trustState: 'revoked',
    trustedAt: null,
    revokedAt: '2026-10-07T10:01:00Z',
  };

  it.each(['2026-10-07T10:00:59Z', '2026-10-07T10:01:00Z', 'invalid'])(
    'rejects a proof that does not establish authentication after revocation: %s',
    (authenticatedAt) => {
      expect(() =>
        requireAuthenticationAfterDeviceRevocation(revokedDevice, authenticatedAt),
      ).toThrow('recent_auth_required');
    },
  );

  it('accepts a fresh authentication after revocation', () => {
    expect(() =>
      requireAuthenticationAfterDeviceRevocation(revokedDevice, '2026-10-07T10:01:01Z'),
    ).not.toThrow();
  });

  it('fails closed when the revocation timestamp is missing or malformed', () => {
    for (const revokedAt of [null, 'invalid']) {
      expect(() =>
        requireAuthenticationAfterDeviceRevocation(
          { ...revokedDevice, revokedAt },
          '2026-10-07T10:01:01Z',
        ),
      ).toThrow('recent_auth_required');
    }
  });

  it('does not add a revocation restriction to a new or pending device', () => {
    expect(() =>
      requireAuthenticationAfterDeviceRevocation(null, '2026-10-07T10:00:00Z'),
    ).not.toThrow();
    expect(() =>
      requireAuthenticationAfterDeviceRevocation(
        { ...revokedDevice, trustState: 'pending', revokedAt: null },
        '2026-10-07T10:00:00Z',
      ),
    ).not.toThrow();
  });
});
