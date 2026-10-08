import type { PeopleOutreachResult, PeopleTargetResolution } from '../types-runtime';

export function friendshipOutreachOutcome(response: PeopleOutreachResult) {
  const result = response.result && !('deliveryToken' in response.result) ? response.result : null;
  return {
    created: result?.created ?? response.status === 'active_user',
    direction: response.friendshipDirection ?? result?.friendshipDirection ?? null,
    inviteId: response.inviteId ?? result?.inviteId ?? null,
    expiresAt: result?.expiresAt ?? null,
  };
}

/** The command already resolves the target and chooses the action atomically. */
export function contactResolutionForOutreach(
  phoneE164: string,
  response: PeopleOutreachResult,
  previous?: PeopleTargetResolution,
): PeopleTargetResolution {
  const friendship = friendshipOutreachOutcome(response);
  const account = response.kind === 'account_invite' ? response.result : null;
  const pendingFriendship = response.kind === 'friendship';
  return {
    phoneE164,
    status: pendingFriendship ? 'pending_friendship' : response.status,
    matchedUserId: response.matchedUserId,
    displayName: response.displayName,
    avatarPath:
      previous?.matchedUserId === response.matchedUserId ? (previous?.avatarPath ?? null) : null,
    relationshipId: response.relationshipId ?? null,
    friendshipInviteId: pendingFriendship ? friendship.inviteId : null,
    friendshipDirection: pendingFriendship ? friendship.direction : null,
    accountInviteId: account?.inviteId ?? null,
    accountInviteStatus: account?.status ?? null,
    discoveryWatchId: previous?.discoveryWatchId,
    discoverySessionId: previous?.discoverySessionId,
    availableActions: pendingFriendship
      ? ['open_request']
      : response.kind === 'already_related'
        ? []
        : ['invite'],
  };
}
