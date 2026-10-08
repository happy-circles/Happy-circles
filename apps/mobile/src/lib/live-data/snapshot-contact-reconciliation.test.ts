import { describe, expect, it } from 'vitest';
import type { ContactSnapshot } from './snapshot-contact-reconciliation';
import { contactTargetsForSnapshotDiff } from './snapshot-contact-reconciliation';
import { rememberImmediateInviteRequest } from '@/features/people/immediate-invite-request';
import type {
  PeopleTargetResolution,
  FriendshipInviteListItem,
  AccountInviteListItem,
} from './types-runtime';

function snapshot(overrides: Partial<ContactSnapshot> = {}): ContactSnapshot {
  return {
    people: [],
    peopleById: {},
    friendshipPendingItems: [],
    friendshipHistoryItems: [],
    accountInvitePendingItems: [],
    accountInviteHistoryItems: [],
    ...overrides,
  };
}
const person = {
  userId: 'ana',
  displayName: 'Ana',
  netAmountMinor: 0,
  direction: 'settled' as const,
  pendingCount: 0,
  lastActivityLabel: 'Sin movimientos',
};
const resolution: PeopleTargetResolution = {
  phoneE164: '+573001234567',
  status: 'pending_friendship',
  matchedUserId: 'ana',
  displayName: 'Ana',
  avatarPath: null,
  relationshipId: null,
  friendshipInviteId: 'new-incoming',
  friendshipDirection: 'incoming',
  accountInviteId: null,
  accountInviteStatus: null,
};

function friendship(): FriendshipInviteListItem {
  const seed = rememberImmediateInviteRequest('actor', resolution)!;
  if (seed.item.kind !== 'friendship_invite') throw new Error('Expected friendship fixture');
  return seed.item;
}

function account(): AccountInviteListItem {
  const seed = rememberImmediateInviteRequest('actor', {
    ...resolution,
    status: 'no_account',
    matchedUserId: null,
    friendshipInviteId: null,
    friendshipDirection: null,
    accountInviteId: 'account',
    accountInviteStatus: 'pending_activation',
  })!;
  if (seed.item.kind !== 'account_invite') throw new Error('Expected account fixture');
  return seed.item;
}

describe('snapshot to selective contact reconciliation', () => {
  it('finds the new relationship by counterparty even when its relation UUID was never cached', () => {
    expect(
      contactTargetsForSnapshotDiff(snapshot(), snapshot({ people: [person] }), 'actor'),
    ).toEqual([{ matchedUserId: 'ana' }]);
    expect(
      contactTargetsForSnapshotDiff(snapshot({ people: [person] }), snapshot(), 'actor'),
    ).toEqual([{ matchedUserId: 'ana' }]);
  });

  it('identifies a previously unknown incoming request by counterparty and its canonical profile phone', () => {
    const incoming = { ...friendship(), intendedRecipientPhoneE164: '+573009999999' };
    const targets = contactTargetsForSnapshotDiff(
      snapshot(),
      snapshot({ friendshipPendingItems: [incoming] }),
      'actor',
    );
    expect(targets).toEqual(
      expect.arrayContaining([
        { matchedUserId: 'ana' },
        { inviteId: 'new-incoming' },
        { phoneE164: resolution.phoneE164 },
      ]),
    );
    // The incoming invitation's intended phone belongs to the actor, not the other contact.
    expect(targets).not.toContainEqual({ phoneE164: '+573009999999' });
  });

  it('finds a no-account remote invite by its explicitly submitted phone when no matched user exists', () => {
    const targets = contactTargetsForSnapshotDiff(
      snapshot(),
      snapshot({ accountInvitePendingItems: [account()] }),
      'actor',
    );
    expect(targets).toEqual(
      expect.arrayContaining([{ inviteId: 'account' }, { phoneE164: resolution.phoneE164 }]),
    );
    expect(
      targets.every((target) => target.inviteId || target.phoneE164 || target.matchedUserId),
    ).toBe(true);
  });

  it('handles pending acceptance, direction changes and disappearance without sweeping other contacts', () => {
    const pending = friendship();
    const before = snapshot({ friendshipPendingItems: [pending] });
    const after = snapshot({
      friendshipHistoryItems: [{ ...pending, status: 'accepted', actionState: 'history' }],
    });
    expect(contactTargetsForSnapshotDiff(before, after, 'actor')).toContainEqual({
      inviteId: 'new-incoming',
    });
    expect(contactTargetsForSnapshotDiff(before, snapshot(), 'actor')).toContainEqual({
      matchedUserId: 'ana',
    });
    expect(
      contactTargetsForSnapshotDiff(
        before,
        snapshot({
          friendshipPendingItems: [
            { ...pending, actorRole: 'sender', actionState: 'waiting_other_side' },
          ],
        }),
        'actor',
      ),
    ).toContainEqual({ inviteId: 'new-incoming' });
  });

  it('ignores financial/presentation updates and history eviction, avoiding refresh feedback loops', () => {
    const history = { ...friendship(), status: 'accepted', actionState: 'history' as const };
    const before = snapshot({ people: [person], friendshipHistoryItems: [history] });
    const after = snapshot({
      people: [{ ...person, netAmountMinor: 10000, pendingCount: 1, lastActivityLabel: 'Ahora' }],
      friendshipHistoryItems: [
        { ...history, happenedAtLabel: 'hace un minuto', title: 'Otro texto' },
      ],
    });
    expect(contactTargetsForSnapshotDiff(before, after, 'actor')).toEqual([]);
    expect(contactTargetsForSnapshotDiff(before, snapshot({ people: [person] }), 'actor')).toEqual(
      [],
    );
    expect(contactTargetsForSnapshotDiff(after, after, 'actor')).toEqual([]);
  });

  it('does not manufacture phone numbers from masked labels or invalidate the actor identity', () => {
    const item = { ...friendship(), profileUserId: 'actor', profilePhoneLabel: '***4567' };
    expect(
      contactTargetsForSnapshotDiff(
        snapshot(),
        snapshot({ friendshipPendingItems: [item] }),
        'actor',
      ),
    ).toEqual([{ inviteId: 'new-incoming' }]);
  });
});
