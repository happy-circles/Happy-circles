import { describe, expect, it } from 'vitest';
import type { PeopleTargetResolution } from '@/lib/live-data/types-runtime';
import {
  readImmediateInviteRequest,
  reconcileImmediateInviteRequest,
  rememberImmediateInviteRequest,
} from './immediate-invite-request';

const resolution: PeopleTargetResolution = {
  phoneE164: '+573001234567',
  status: 'pending_friendship',
  matchedUserId: 'ana',
  displayName: 'Ana',
  avatarPath: null,
  friendshipInviteId: 'invite',
  friendshipDirection: 'incoming',
  relationshipId: null,
  accountInviteId: null,
  accountInviteStatus: null,
};

describe('immediate request presentation', () => {
  it('can render the received request before snapshot refresh, scoped to the current account', () => {
    const seed = rememberImmediateInviteRequest('user-a', resolution, { alias: 'Mi amiga' });
    expect(seed?.item).toMatchObject({
      inviteId: 'invite',
      actorRole: 'recipient',
      actionState: 'requires_you_response',
      profileDisplayName: 'Mi amiga',
    });
    expect(readImmediateInviteRequest('user-b', 'invite')).toBeNull();
    expect(reconcileImmediateInviteRequest(seed, [], 0)).toBe(seed?.item);
    expect(seed?.item).not.toHaveProperty('deliveryToken');
  });

  it('replaces the pending fallback with server history and removes it when a newer snapshot omits it', () => {
    const seed = rememberImmediateInviteRequest('user-c', resolution)!;
    const history = { ...seed.item, actionState: 'history' as const, status: 'canceled' };
    expect(reconcileImmediateInviteRequest(seed, [history], seed.recordedAt - 1)).toBe(history);
    expect(reconcileImmediateInviteRequest(seed, [], seed.recordedAt + 1)).toBeNull();
  });

  it('does not invent actionable friendship direction or show an already terminal account access as pending', () => {
    expect(
      rememberImmediateInviteRequest('user-d', { ...resolution, friendshipDirection: null }),
    ).toBeNull();
    expect(
      rememberImmediateInviteRequest('user-d', {
        ...resolution,
        friendshipInviteId: null,
        accountInviteId: 'account',
        accountInviteStatus: 'canceled',
      }),
    ).toBeNull();
  });
});
