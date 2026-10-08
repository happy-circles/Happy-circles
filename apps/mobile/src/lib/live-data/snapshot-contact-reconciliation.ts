import type { ContactResolutionTarget } from '@/lib/contact-resolution-state';
import type { AppSnapshot } from './snapshot-types';
import type { AccountInviteListItem, FriendshipInviteListItem } from './types-runtime';

export type ContactSnapshot = Pick<
  AppSnapshot,
  | 'people'
  | 'peopleById'
  | 'friendshipPendingItems'
  | 'friendshipHistoryItems'
  | 'accountInvitePendingItems'
  | 'accountInviteHistoryItems'
>;

type InviteState = {
  readonly item: FriendshipInviteListItem | AccountInviteListItem;
  readonly pending: boolean;
  readonly fingerprint: string;
};

function relationshipStates(snapshot: ContactSnapshot | undefined) {
  const states = new Map<string, string>();
  for (const person of snapshot?.people ?? []) states.set(person.userId, 'active');
  for (const person of Object.values(snapshot?.peopleById ?? {})) {
    if (person.relationshipStatus === 'active') states.set(person.userId, 'active');
    else if (person.relationshipStatus === 'pending_invite') states.delete(person.userId);
  }
  return states;
}

function inviteStates(snapshot: ContactSnapshot | undefined) {
  const states = new Map<string, InviteState>();
  const groups = [
    { items: snapshot?.friendshipHistoryItems ?? [], pending: false },
    { items: snapshot?.accountInviteHistoryItems ?? [], pending: false },
    { items: snapshot?.friendshipPendingItems ?? [], pending: true },
    { items: snapshot?.accountInvitePendingItems ?? [], pending: true },
  ];
  for (const { items, pending } of groups) {
    for (const item of items) {
      states.set(item.inviteId, {
        item,
        pending,
        fingerprint: JSON.stringify([
          item.kind,
          item.status,
          item.actionState,
          item.actorRole,
          item.profileUserId,
          item.intendedRecipientPhoneE164,
          item.profilePhoneLabel,
          item.kind === 'account_invite' ? item.activatedUserId : null,
        ]),
      });
    }
  }
  return states;
}

/** Compare explicit relationships/requests, never the device's entire address book. */
export function contactTargetsForSnapshotDiff(
  before: ContactSnapshot | undefined,
  after: ContactSnapshot,
  actorUserId: string,
): readonly ContactResolutionTarget[] {
  if (before === after) return [];
  const targets = new Map<string, ContactResolutionTarget>();
  const addUser = (userId: string | null | undefined) => {
    if (userId && userId !== actorUserId) targets.set(`user:${userId}`, { matchedUserId: userId });
  };
  const addPhone = (phone: string | null | undefined) => {
    // Presentation/masked labels must never be guessed into a different number.
    if (phone && /^\+[1-9]\d{7,14}$/.test(phone))
      targets.set(`phone:${phone}`, { phoneE164: phone });
  };
  const oldRelationships = relationshipStates(before);
  const newRelationships = relationshipStates(after);
  for (const userId of new Set([...oldRelationships.keys(), ...newRelationships.keys()])) {
    if (oldRelationships.get(userId) !== newRelationships.get(userId)) addUser(userId);
  }
  const addInvite = ({ item }: InviteState) => {
    targets.set(`invite:${item.inviteId}`, { inviteId: item.inviteId });
    addUser(item.profileUserId);
    if (item.actorRole === 'sender' || item.actorRole === 'inviter')
      addPhone(item.intendedRecipientPhoneE164);
    addPhone(item.profilePhoneLabel);
  };
  const oldInvites = inviteStates(before);
  const newInvites = inviteStates(after);
  for (const inviteId of new Set([...oldInvites.keys(), ...newInvites.keys()])) {
    const previous = oldInvites.get(inviteId);
    const current = newInvites.get(inviteId);
    if (previous?.fingerprint === current?.fingerprint) continue;
    // History is bounded. Falling outside its window is not a new contact event.
    if (!current && previous && !previous.pending) continue;
    if (previous) addInvite(previous);
    if (current) addInvite(current);
  }
  return [...targets.values()];
}
