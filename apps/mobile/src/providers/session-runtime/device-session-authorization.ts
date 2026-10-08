import type { Session } from '@supabase/supabase-js';
import type { TrustedDeviceRow } from '../session/types';

export interface AuthSessionIdentity {
  readonly userId: string;
  readonly sessionId: string;
}

function readClaims(session: Session | null): Record<string, unknown> | null {
  if (!session) return null;
  try {
    const payload = session.access_token.split('.')[1];
    if (!payload || !/^[A-Za-z0-9_-]+$/.test(payload)) return null;
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let bits = 0;
    let value = 0;
    let decoded = '';
    for (const character of payload.replace(/-/g, '+').replace(/_/g, '/')) {
      value = (value << 6) | alphabet.indexOf(character);
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        decoded += String.fromCharCode((value >> bits) & 255);
      }
    }
    const claims: unknown = JSON.parse(decoded);
    if (typeof claims !== 'object' || claims === null) return null;
    return claims as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Reads identity for comparing server records; this does not validate a JWT. */
export function readAuthSessionIdentity(session: Session | null): AuthSessionIdentity | null {
  const claims = readClaims(session);
  const sessionId = claims?.session_id;
  if (
    !session ||
    typeof sessionId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId) ||
    claims?.sub !== session.user.id
  )
    return null;
  return { userId: session.user.id, sessionId };
}

/** A request hint only. The endpoint must verify the JWT and proof timestamp. */
export function hasAuthenticationAfterRevocation(
  session: Session,
  revokedAt: string | null,
): boolean {
  if (!readAuthSessionIdentity(session) || !revokedAt) return false;
  const revokedTime = Date.parse(revokedAt);
  const amr = readClaims(session)?.amr;
  return (
    Number.isFinite(revokedTime) &&
    Array.isArray(amr) &&
    amr.some((proof: unknown) => {
      if (!proof || typeof proof !== 'object') return false;
      const candidate = proof as { readonly method?: unknown; readonly timestamp?: unknown };
      return (
        ['password', 'oauth', 'otp'].includes(String(candidate.method)) &&
        typeof candidate.timestamp === 'number' &&
        Number.isFinite(candidate.timestamp) &&
        candidate.timestamp * 1000 > revokedTime
      );
    })
  );
}

export function isSameAuthSession(
  left: AuthSessionIdentity | null,
  right: AuthSessionIdentity | null,
): boolean {
  return Boolean(
    left && right && left.userId === right.userId && left.sessionId === right.sessionId,
  );
}

export function isDeviceSessionAuthorized(
  row: TrustedDeviceRow | null,
  session: Session | null,
): boolean {
  const identity = readAuthSessionIdentity(session);
  return Boolean(
    identity &&
    row?.user_id === identity.userId &&
    row.trust_state === 'trusted' &&
    row.revoked_at == null &&
    row.trusted_session_id === identity.sessionId,
  );
}

export interface StepUpProof extends AuthSessionIdentity {
  readonly expiresAt: number;
}

export function canReuseStepUpProof(
  proof: StepUpProof | null,
  session: Session | null,
  now: number,
): boolean {
  return Boolean(
    proof && proof.expiresAt > now && isSameAuthSession(proof, readAuthSessionIdentity(session)),
  );
}
