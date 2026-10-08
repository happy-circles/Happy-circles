import type { InviteRequestItem } from '@/features/home/dashboard-helpers';
import type { PeopleTargetResolution } from '@/lib/live-data/types-runtime';

export interface ImmediateInviteRequest {
  readonly item: InviteRequestItem;
  readonly recordedAt: number;
}

// Only presentation data lives here; delivery tokens never enter this cache.
const requests = new Map<string, Map<string, ImmediateInviteRequest>>();

export function rememberImmediateInviteRequest(
  userId: string,
  resolution: PeopleTargetResolution,
  input: {
    readonly alias?: string;
    readonly phoneLabel?: string | null;
    readonly expiresAt?: string | null;
  } = {},
): ImmediateInviteRequest | null {
  const inviteId = resolution.friendshipInviteId ?? resolution.accountInviteId;
  if (!inviteId) return null;
  if (resolution.friendshipInviteId && !resolution.friendshipDirection) return null;
  if (resolution.accountInviteId && resolution.accountInviteStatus !== 'pending_activation')
    return null;
  const incoming = resolution.friendshipDirection === 'incoming';
  const name = input.alias?.trim() || resolution.displayName || resolution.phoneE164;
  const common = {
    id: inviteId,
    inviteId,
    title: resolution.friendshipInviteId ? 'Solicitud de amistad' : 'Acceso privado',
    subtitle: name,
    status: resolution.friendshipInviteId ? 'pending_recipient' : 'pending_activation',
    createdAt: '',
    happenedAtLabel: '',
    expiresAt: input.expiresAt ?? null,
    resolvedAt: null,
    intendedRecipientAlias: input.alias ?? null,
    intendedRecipientPhoneE164: resolution.phoneE164,
    intendedRecipientPhoneLabel: input.phoneLabel ?? null,
    counterpartyLabel: name,
    profileUserId: resolution.matchedUserId,
    profileHref: null,
    profileTimelineItems: [],
    profileDisplayName: name,
    profileAvatarUrl: null,
    profilePhoneLabel: resolution.phoneE164,
    profileEmailLabel: null,
    profileReferenceLabel: null,
    profileRoleLabel: null,
    intendedProfileDisplayName: name,
    intendedProfilePhoneLabel: resolution.phoneE164,
    respondingProfileDisplayName: null,
    respondingProfileAvatarUrl: null,
    respondingProfilePhoneLabel: null,
    respondingProfileEmailLabel: null,
  };
  const item: InviteRequestItem = resolution.friendshipInviteId
    ? {
        ...common,
        kind: 'friendship_invite',
        flow: 'internal',
        originChannel: 'internal',
        actorRole: incoming ? 'recipient' : 'sender',
        actionState: incoming ? 'requires_you_response' : 'waiting_other_side',
        claimantSnapshot: null,
        ctaLabel: incoming ? 'Responder' : 'Pendiente',
      }
    : {
        ...common,
        kind: 'account_invite',
        originChannel: 'remote',
        actorRole: 'inviter',
        actionState: 'pending_activation',
        activatedAt: null,
        activatedUserId: null,
        activatedUserDisplayName: null,
        activatedUserAvatarUrl: null,
        ctaLabel: 'Pendiente de abrir',
      };
  const seed = { item, recordedAt: Date.now() };
  const userRequests = requests.get(userId) ?? new Map<string, ImmediateInviteRequest>();
  userRequests.set(inviteId, seed);
  if (userRequests.size > 100) userRequests.delete(userRequests.keys().next().value!);
  requests.set(userId, userRequests);
  return seed;
}

export function readImmediateInviteRequest(userId: string, inviteId: string) {
  return requests.get(userId)?.get(inviteId) ?? null;
}

export function forgetImmediateInviteRequest(userId: string, inviteId: string) {
  requests.get(userId)?.delete(inviteId);
}

export function clearImmediateInviteRequestUser(userId: string) {
  requests.delete(userId);
}

export function reconcileImmediateInviteRequest(
  seed: ImmediateInviteRequest | null,
  items: readonly InviteRequestItem[],
  snapshotUpdatedAt: number,
) {
  if (!seed) return null;
  const current = items.find((item) => item.inviteId === seed.item.inviteId);
  if (current) return current;
  return snapshotUpdatedAt > seed.recordedAt ? null : seed.item;
}
