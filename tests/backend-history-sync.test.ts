import { describe, expect, it } from 'vitest';
import {
  parseHistorySyncRequest,
  withEffectiveInviteStatus,
} from '../supabase/functions/get-app-snapshot/history-sync';

describe('backend history sync request', () => {
  it('keeps the legacy request and validates opt-in without rounding revisions', () => {
    expect(parseHistorySyncRequest({})).toBeNull();
    expect(parseHistorySyncRequest({ historySync: { protocol: 1, cursor: null } })).toEqual({
      protocol: 1,
      cursor: null,
      pageSize: 250,
    });
    const cursor = '00000000-0000-4000-8000-000000000001:9007199254740993';
    expect(
      parseHistorySyncRequest({ historySync: { protocol: 1, cursor, pageSize: 500 } })?.cursor,
    ).toBe(cursor);
  });

  it.each([
    null,
    [],
    {},
    { protocol: 2, cursor: null },
    { protocol: 1 },
    { protocol: 1, cursor: 'bad' },
    { protocol: 1, cursor: 4 },
    { protocol: 1, cursor: '00000000-0000-4000-8000-000000000001:9223372036854775808' },
    { protocol: 1, cursor: null, pageSize: 0 },
    { protocol: 1, cursor: null, pageSize: 501 },
    { protocol: 1, cursor: null, pageSize: 1.2 },
    { protocol: 1, cursor: null, pageSize: '20' },
  ])('rejects invalid protocol, cursor or page size %#', (historySync) => {
    expect(() => parseHistorySyncRequest({ historySync })).toThrow(/invalid history sync/);
  });

  it('keeps time-expired base pending invites in the dynamic result', () => {
    const nowMs = Date.parse('2026-10-11T12:00:00Z');
    const rows = [
      { id: 'old', status: 'pending_claim', expires_at: '2026-10-10T12:00:00Z' },
      { id: 'new', status: 'pending_claim', expires_at: '2026-10-12T12:00:00Z' },
    ];
    expect(withEffectiveInviteStatus(rows, nowMs).map((row) => row.status)).toEqual([
      'expired',
      'pending_claim',
    ]);
    expect(rows[0].status).toBe('pending_claim');
  });
});
