interface VerifiedDeviceSessionIdentity {
  readonly actorUserId: string;
  readonly claims: Record<string, unknown>;
}

interface DeviceReadResult {
  readonly data: unknown;
  readonly error: unknown;
}

interface DeviceReadQuery {
  eq(column: string, value: string): DeviceReadQuery;
  is(column: string, value: null): DeviceReadQuery;
  limit(count: number): DeviceReadQuery;
  maybeSingle(): PromiseLike<DeviceReadResult>;
}

export interface AuthorizedDeviceReadClient {
  from(relation: 'trusted_devices'): {
    select(columns: string): DeviceReadQuery;
  };
}

export interface TrustedDeviceSessionRecord {
  readonly userId: string;
  readonly deviceId: string;
  readonly sessionId: string | null;
  readonly trustState: 'pending' | 'trusted' | 'revoked';
  readonly trustedAt: string | null;
  readonly revokedAt: string | null;
}

const DEVICE_COLUMNS = 'user_id,device_id,trusted_session_id,trust_state,trusted_at,revoked_at';

function readSessionId(identity: VerifiedDeviceSessionIdentity): string | null {
  const sessionId = identity.claims.session_id;
  return typeof sessionId === 'string' && sessionId.trim() ? sessionId.trim() : null;
}

function readDeviceRecord(value: unknown): TrustedDeviceSessionRecord | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.user_id !== 'string' ||
    typeof row.device_id !== 'string' ||
    typeof row.trust_state !== 'string' ||
    !['pending', 'trusted', 'revoked'].includes(row.trust_state) ||
    (row.trusted_session_id !== null && typeof row.trusted_session_id !== 'string') ||
    (row.trusted_at !== null && typeof row.trusted_at !== 'string') ||
    (row.revoked_at !== null && typeof row.revoked_at !== 'string')
  ) {
    return null;
  }
  return {
    userId: row.user_id,
    deviceId: row.device_id,
    sessionId: row.trusted_session_id as string | null,
    trustState: row.trust_state as TrustedDeviceSessionRecord['trustState'],
    trustedAt: row.trusted_at as string | null,
    revokedAt: row.revoked_at as string | null,
  };
}

export function isDeviceSessionAuthorized(
  device: TrustedDeviceSessionRecord,
  identity: VerifiedDeviceSessionIdentity,
): boolean {
  const sessionId = readSessionId(identity);
  return (
    sessionId !== null &&
    device.userId === identity.actorUserId &&
    device.sessionId === sessionId &&
    device.trustState === 'trusted' &&
    device.revokedAt === null
  );
}

/** Read with the verified user's JWT so the existing self-only SELECT policy applies. */
export async function findCurrentDeviceRecord(
  client: AuthorizedDeviceReadClient,
  identity: VerifiedDeviceSessionIdentity,
  deviceId: string,
): Promise<TrustedDeviceSessionRecord | null> {
  const { data, error } = await client
    .from('trusted_devices')
    .select(DEVICE_COLUMNS)
    .eq('user_id', identity.actorUserId)
    .eq('device_id', deviceId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const device = readDeviceRecord(data);
  return device?.userId === identity.actorUserId && device.deviceId === deviceId ? device : null;
}

/** Normal mutations require a server authorization, not a five-minute authentication proof. */
export async function requireAuthorizedDeviceSession(
  client: AuthorizedDeviceReadClient,
  identity: VerifiedDeviceSessionIdentity,
): Promise<void> {
  const sessionId = readSessionId(identity);
  if (!sessionId) throw new Error('device_authorization_required');

  const { data, error } = await client
    .from('trusted_devices')
    .select(DEVICE_COLUMNS)
    .eq('user_id', identity.actorUserId)
    .eq('trusted_session_id', sessionId)
    .eq('trust_state', 'trusted')
    .is('revoked_at', null)
    .limit(1)
    .maybeSingle();
  if (error) throw error;

  const device = readDeviceRecord(data);
  if (!device || !isDeviceSessionAuthorized(device, identity)) {
    throw new Error('device_authorization_required');
  }
}

/** A still-recent login from before revocation cannot restore the revoked device. */
export function requireAuthenticationAfterDeviceRevocation(
  device: TrustedDeviceSessionRecord | null,
  authenticatedAt: string,
): void {
  if (!device || (device.trustState !== 'revoked' && device.revokedAt === null)) return;
  const revokedAt = device.revokedAt === null ? NaN : Date.parse(device.revokedAt);
  const proofAt = Date.parse(authenticatedAt);
  if (!Number.isFinite(revokedAt) || !Number.isFinite(proofAt) || proofAt <= revokedAt) {
    throw new Error('recent_auth_required');
  }
}
