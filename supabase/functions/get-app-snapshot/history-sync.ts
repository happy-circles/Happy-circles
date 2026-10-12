export interface HistorySyncRequest {
  readonly protocol: 1;
  readonly cursor: string | null;
  readonly pageSize: number;
}

/** An absent opt-in preserves the existing {} request contract. */
export function parseHistorySyncRequest(body: Record<string, unknown>): HistorySyncRequest | null {
  if (body.historySync === undefined) return null;
  const value = body.historySync;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('invalid history sync request');
  }
  const request = value as Record<string, unknown>;
  if (request.protocol !== 1 || !('cursor' in request)) {
    throw new Error('invalid history sync protocol');
  }
  const cursor = request.cursor;
  if (
    cursor !== null &&
    (typeof cursor !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9]{1,19}$/.test(cursor) ||
      BigInt(cursor.split(':')[1]) > 9223372036854775807n)
  ) {
    throw new Error('invalid history sync cursor');
  }
  const pageSize = request.pageSize ?? 250;
  if (
    typeof pageSize !== 'number' ||
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 500
  ) {
    throw new Error('invalid history sync page size');
  }
  return { protocol: 1, cursor, pageSize };
}

/** Base pending invites remain dynamic when their live status expires by clock. */
export function withEffectiveInviteStatus<T extends Record<string, unknown>>(
  rows: readonly T[],
  nowMs: number,
): T[] {
  return rows.map((row) => {
    const expiresAt = typeof row.expires_at === 'string' ? Date.parse(row.expires_at) : NaN;
    return Number.isFinite(expiresAt) && expiresAt <= nowMs ? { ...row, status: 'expired' } : row;
  });
}
