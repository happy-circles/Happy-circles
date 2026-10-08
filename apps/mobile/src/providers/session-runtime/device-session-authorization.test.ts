import { describe, expect, it } from 'vitest';
import type { Session } from '@supabase/supabase-js';
import type { TrustedDeviceRow } from '../session/types';
import {
  canReuseStepUpProof,
  isDeviceSessionAuthorized,
  readAuthSessionIdentity,
} from './device-session-authorization';

const sessionId = '11111111-1111-4111-8111-111111111111';
function session(claims: unknown): Session {
  return {
    access_token: `header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`,
    user: { id: 'user-a' },
  } as Session;
}

describe('server device binding and local confirmation have separate lifetimes', () => {
  it('requires the trusted server row to match both account and current session', () => {
    const current = session({ sub: 'user-a', session_id: sessionId });
    const row = {
      user_id: 'user-a',
      trust_state: 'trusted',
      trusted_session_id: sessionId,
    } as TrustedDeviceRow;
    expect(isDeviceSessionAuthorized(row, current)).toBe(true);
    expect(
      isDeviceSessionAuthorized(
        { ...row, trusted_session_id: '22222222-2222-4222-8222-222222222222' },
        current,
      ),
    ).toBe(false);
    expect(isDeviceSessionAuthorized({ ...row, user_id: 'user-b' }, current)).toBe(false);
    expect(isDeviceSessionAuthorized({ ...row, trust_state: 'revoked' }, current)).toBe(false);
    expect(isDeviceSessionAuthorized({ ...row, revoked_at: '2026-10-07' }, current)).toBe(false);
    expect(isDeviceSessionAuthorized({ ...row, trusted_session_id: null }, current)).toBe(false);
  });

  it('does not infer trust or confirmation from malformed or mismatched identity claims', () => {
    expect(readAuthSessionIdentity(session({ sub: 'user-b', session_id: sessionId }))).toBeNull();
    expect(readAuthSessionIdentity(session({ sub: 'user-a', session_id: '' }))).toBeNull();
    expect(readAuthSessionIdentity(session({ sub: 'user-a' }))).toBeNull();
    expect(
      readAuthSessionIdentity({ ...session(null), access_token: 'bad.payload.signature' }),
    ).toBeNull();
  });

  it('expires only the sensitive-action proof, without expiring the matching device binding', () => {
    const current = session({ sub: 'user-a', session_id: sessionId });
    const proof = { userId: 'user-a', sessionId, expiresAt: 1000 };
    const row = {
      user_id: 'user-a',
      trust_state: 'trusted',
      trusted_session_id: sessionId,
    } as TrustedDeviceRow;
    expect(canReuseStepUpProof(proof, current, 999)).toBe(true);
    expect(canReuseStepUpProof(proof, current, 1000)).toBe(false);
    expect(isDeviceSessionAuthorized(row, current)).toBe(true);
    expect(
      canReuseStepUpProof(
        { ...proof, sessionId: '22222222-2222-4222-8222-222222222222' },
        current,
        999,
      ),
    ).toBe(false);
  });
});
