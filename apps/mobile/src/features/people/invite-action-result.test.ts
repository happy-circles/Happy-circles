import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  Platform: {
    OS: 'web',
    select: (options: Record<string, unknown>) => options.web ?? options.default,
  },
}));
import { inviteActionResult } from './invite-action-result';
import { canResendInviteRequest } from '../home/dashboard-helpers';
import type { FriendshipInviteListItem } from '@/lib/live-data/types-runtime';

describe('invitation action results', () => {
  it('does not report acceptance when cancel or expiry won the race', () => {
    expect(inviteActionResult('canceled').connected).toBe(false);
    expect(inviteActionResult('canceled').message).toContain('cancelada');
    expect(inviteActionResult('expired').connected).toBe(false);
    expect(inviteActionResult('accepted').connected).toBe(true);
  });
  it.each(['canceled', 'rejected', 'expired'])('offers immediate resend after %s', (status) => {
    const item = {
      kind: 'friendship_invite',
      actorRole: 'sender',
      flow: 'internal',
      profileUserId: 'target',
      actionState: 'history',
      status,
    } as FriendshipInviteListItem;
    expect(canResendInviteRequest(item)).toBe(true);
    expect(canResendInviteRequest({ ...item, actorRole: 'recipient' })).toBe(false);
  });
});
