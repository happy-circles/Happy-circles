import type { ActivityItemDto, PersonDetailDto, PersonTimelineItemDto } from '@happy-circles/application';
import type { Database } from '@happy-circles/shared';
import type {
  AccountInviteListItem,
  AccountInviteRow,
  FriendshipClaimantSnapshot,
  FriendshipInviteListItem,
  FriendshipInviteRow,
  InviteProfilePresentation,
  LivePersonDetailDto,
  TimelineEventDraft,
  UserProfileRow,
} from '../types';
import { resolveAvatarUrl } from '../../avatar-url';
import { LIVE_DATA_ROUTES } from '../presentation';
import { formatRelativeLabel } from '../utils/dates';
import { sortHistoryItems } from '../utils/sorting';

export function parseFriendshipClaimantSnapshot(
  value: Database['public']['Tables']['friendship_invites']['Row']['claimant_snapshot'],
): FriendshipClaimantSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const snapshot = value as Record<string, unknown>;
  return {
    displayName:
      typeof snapshot.displayName === 'string' && snapshot.displayName.trim().length > 0
        ? snapshot.displayName.trim()
        : 'Persona',
    avatarPath:
      typeof snapshot.avatarPath === 'string' && snapshot.avatarPath.trim().length > 0
        ? snapshot.avatarPath.trim()
        : null,
    maskedEmail:
      typeof snapshot.maskedEmail === 'string' && snapshot.maskedEmail.trim().length > 0
        ? snapshot.maskedEmail.trim()
        : null,
    maskedPhone:
      typeof snapshot.maskedPhone === 'string' && snapshot.maskedPhone.trim().length > 0
        ? snapshot.maskedPhone.trim()
        : null,
    emailConfirmed: snapshot.emailConfirmed === true,
    phonePresent: snapshot.phonePresent === true,
    phoneVerified: snapshot.phoneVerified === true,
    claimedAt:
      typeof snapshot.claimedAt === 'string' && snapshot.claimedAt.trim().length > 0
        ? snapshot.claimedAt.trim()
        : null,
  };
}

export function maskInvitePhone(value: string | null | undefined): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }

  const digits = value.replaceAll(/\D/g, '');
  if (digits.length < 4) {
    return null;
  }

  return `***${digits.slice(-4)}`;
}

export function buildIntendedRecipientReferenceFromParts(input: {
  readonly alias: string | null;
  readonly phoneE164: string | null;
}): string | null {
  const parts = [input.alias?.trim() || null, maskInvitePhone(input.phoneE164)].filter(Boolean);

  return parts.length > 0 ? parts.join(' | ') : null;
}

export function phoneLabelFromInviteParts(input: {
  readonly label: string | null;
  readonly phoneE164: string | null;
}): string | null {
  const label = input.label?.trim();
  if (label) {
    return label;
  }

  return maskInvitePhone(input.phoneE164);
}

export function inviteProfileFromUser(input: {
  readonly fallbackName?: string | null;
  readonly names: Map<string, string>;
  readonly profiles: Map<string, UserProfileRow>;
  readonly referenceLabel?: string | null;
  readonly roleLabel?: string | null;
  readonly userId: string;
}): InviteProfilePresentation {
  const profile = input.profiles.get(input.userId);
  const displayName =
    profile?.display_name?.trim() ||
    input.names.get(input.userId)?.trim() ||
    input.fallbackName?.trim() ||
    'Persona';

  return {
    displayName,
    avatarUrl: profile ? resolveAvatarUrl(profile.avatar_path, profile.updated_at) : null,
    phoneLabel: maskInvitePhone(profile?.phone_e164),
    emailLabel: null,
    referenceLabel: input.referenceLabel?.trim() || null,
    roleLabel: input.roleLabel?.trim() || null,
  };
}

export function inviteProfileFromIntendedRecipient(input: {
  readonly alias: string | null;
  readonly phoneE164: string | null;
  readonly phoneLabel: string | null;
  readonly roleLabel?: string | null;
}): InviteProfilePresentation {
  const displayName = input.alias?.trim() || 'Contacto invitado';
  const phoneLabel = phoneLabelFromInviteParts({
    label: input.phoneLabel,
    phoneE164: input.phoneE164,
  });

  return {
    displayName,
    avatarUrl: null,
    phoneLabel,
    emailLabel: null,
    referenceLabel:
      displayName !== 'Contacto invitado' && phoneLabel ? `${displayName} | ${phoneLabel}` : null,
    roleLabel: input.roleLabel?.trim() || null,
  };
}

export function inviteProfileFromClaimantSnapshot(
  snapshot: FriendshipClaimantSnapshot | null,
  roleLabel?: string | null,
): InviteProfilePresentation {
  return {
    displayName: snapshot?.displayName?.trim() || 'Persona',
    avatarUrl: resolveAvatarUrl(snapshot?.avatarPath ?? null),
    phoneLabel: snapshot?.maskedPhone ?? null,
    emailLabel: snapshot?.maskedEmail ?? null,
    referenceLabel: null,
    roleLabel: roleLabel?.trim() || null,
  };
}

export function inviteProfileFromClaimant(input: {
  readonly claimantUserId: string | null;
  readonly names: Map<string, string>;
  readonly profiles: Map<string, UserProfileRow>;
  readonly snapshot: FriendshipClaimantSnapshot | null;
}): InviteProfilePresentation {
  const snapshotProfile = inviteProfileFromClaimantSnapshot(input.snapshot, 'Perfil reclamado');

  if (!input.claimantUserId) {
    return snapshotProfile;
  }

  const userProfile = inviteProfileFromUser({
    fallbackName: input.snapshot?.displayName,
    names: input.names,
    profiles: input.profiles,
    roleLabel: 'Perfil reclamado',
    userId: input.claimantUserId,
  });

  return {
    displayName:
      userProfile.displayName !== 'Persona' ? userProfile.displayName : snapshotProfile.displayName,
    avatarUrl: userProfile.avatarUrl ?? snapshotProfile.avatarUrl,
    phoneLabel: snapshotProfile.phoneLabel ?? userProfile.phoneLabel,
    emailLabel: snapshotProfile.emailLabel ?? userProfile.emailLabel,
    referenceLabel: userProfile.referenceLabel ?? snapshotProfile.referenceLabel,
    roleLabel: userProfile.roleLabel ?? snapshotProfile.roleLabel,
  };
}

export function inviteProfileFields(profile: InviteProfilePresentation): {
  readonly profileDisplayName: string;
  readonly profileAvatarUrl: string | null;
  readonly profilePhoneLabel: string | null;
  readonly profileEmailLabel: string | null;
  readonly profileReferenceLabel: string | null;
  readonly profileRoleLabel: string | null;
} {
  return {
    profileDisplayName: profile.displayName,
    profileAvatarUrl: profile.avatarUrl,
    profilePhoneLabel: profile.phoneLabel,
    profileEmailLabel: profile.emailLabel,
    profileReferenceLabel: profile.referenceLabel,
    profileRoleLabel: profile.roleLabel,
  };
}

export function inviteProfileHref(
  profileUserId: string | null,
  inviteId: string,
  panel: 'pending' | 'history',
): string | null {
  return profileUserId
    ? LIVE_DATA_ROUTES.inviteProfile(profileUserId, panel, inviteId)
    : null;
}

export function intendedInviteProfileFields(profile: InviteProfilePresentation): {
  readonly intendedProfileDisplayName: string | null;
  readonly intendedProfilePhoneLabel: string | null;
} {
  return {
    intendedProfileDisplayName:
      profile.displayName === 'Contacto invitado' ? null : profile.displayName,
    intendedProfilePhoneLabel: profile.phoneLabel,
  };
}

export function respondingInviteProfileFields(profile: InviteProfilePresentation | null): {
  readonly respondingProfileDisplayName: string | null;
  readonly respondingProfileAvatarUrl: string | null;
  readonly respondingProfilePhoneLabel: string | null;
  readonly respondingProfileEmailLabel: string | null;
} {
  return {
    respondingProfileDisplayName:
      profile && profile.displayName !== 'Persona' ? profile.displayName : null,
    respondingProfileAvatarUrl: profile?.avatarUrl ?? null,
    respondingProfilePhoneLabel: profile?.phoneLabel ?? null,
    respondingProfileEmailLabel: profile?.emailLabel ?? null,
  };
}

export function buildIntendedRecipientReference(invite: FriendshipInviteRow): string | null {
  return buildIntendedRecipientReferenceFromParts({
    alias: invite.intended_recipient_alias,
    phoneE164: invite.intended_recipient_phone_e164,
  });
}

export function buildAccountIntendedRecipientReference(invite: AccountInviteRow): string | null {
  return buildIntendedRecipientReferenceFromParts({
    alias: invite.intended_recipient_alias,
    phoneE164: invite.intended_recipient_phone_e164,
  });
}

export function channelLabel(channel: string | null | undefined) {
  if (channel === 'internal') {
    return 'Interna';
  }

  if (channel === 'qr') {
    return 'QR';
  }

  return 'Remota';
}

export function inviteTerminalTone(status: string): PersonTimelineItemDto['tone'] {
  if (status === 'accepted') {
    return 'positive';
  }

  if (status === 'rejected' || status === 'expired' || status === 'canceled') {
    return 'neutral';
  }

  return 'neutral';
}

export function isSpecificInviteName(value: string | null | undefined): boolean {
  const normalized = value?.trim().toLocaleLowerCase('es-CO');
  return Boolean(
    normalized &&
      normalized !== 'persona' &&
      normalized !== 'contacto invitado' &&
      normalized !== 'tu contacto' &&
      normalized !== 'tu',
  );
}

export function inviteNamesMatch(left: string | null | undefined, right: string | null | undefined) {
  return left?.trim().toLocaleLowerCase('es-CO') === right?.trim().toLocaleLowerCase('es-CO');
}

export function relevantInviteTargetLabel(input: {
  readonly intendedRecipientReference: string | null;
  readonly targetName: string;
}): string {
  if (isSpecificInviteName(input.targetName)) {
    return input.targetName;
  }

  const [referenceName] = input.intendedRecipientReference
    ?.split('|')
    .map((part) => part.trim())
    .filter(Boolean) ?? [null];

  return referenceName ?? input.targetName;
}

export function inviteTimelineEvent(input: {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly status: string;
  readonly sourceLabel: string;
  readonly detail: 'Invitacion de amistad' | 'Acceso privado';
  readonly happenedAt: string | null | undefined;
  readonly originInviteId: string;
  readonly nowMs: number;
  readonly tone?: PersonTimelineItemDto['tone'];
}): PersonTimelineItemDto | null {
  if (!input.happenedAt) {
    return null;
  }

  return {
    id: input.id,
    title: input.title,
    subtitle: input.subtitle,
    amountMinor: 0,
    tone: input.tone ?? 'neutral',
    kind: 'system',
    status: input.status,
    sourceType: 'user',
    sourceLabel: input.sourceLabel,
    detail: input.detail,
    happenedAt: input.happenedAt,
    happenedAtLabel: formatRelativeLabel(input.happenedAt, input.nowMs),
    originRequestId: input.originInviteId,
  };
}

export function uniqueTimelineItemsById(
  items: readonly (PersonTimelineItemDto | null)[],
): PersonTimelineItemDto[] {
  const seenIds = new Set<string>();
  const uniqueItems: PersonTimelineItemDto[] = [];

  for (const item of items) {
    if (!item || seenIds.has(item.id)) {
      continue;
    }

    seenIds.add(item.id);
    uniqueItems.push(item);
  }

  return uniqueItems;
}


export type VisibleInviteProfileItem = FriendshipInviteListItem | AccountInviteListItem;

export function inviteProfileItemTimestamp(item: ActivityItemDto): string {
  const createdAt = (item as { readonly createdAt?: unknown }).createdAt;
  if (typeof createdAt === 'string' && createdAt.length > 0) {
    return createdAt;
  }

  return item.happenedAt ?? '';
}

export function sortInviteProfilePendingItems(items: readonly ActivityItemDto[]): ActivityItemDto[] {
  return [...items].sort(
    (left, right) =>
      Date.parse(inviteProfileItemTimestamp(right)) - Date.parse(inviteProfileItemTimestamp(left)),
  );
}

export function inviteProfileDisplayName(
  userId: string,
  item: VisibleInviteProfileItem,
  names: Map<string, string>,
  profiles: Map<string, UserProfileRow>,
): string {
  const profileName = profiles.get(userId)?.display_name?.trim();
  if (profileName) {
    return profileName;
  }

  const knownName = names.get(userId)?.trim();
  if (knownName && knownName !== 'Tu') {
    return knownName;
  }

  if (item.profileDisplayName && item.profileDisplayName !== 'Persona') {
    return item.profileDisplayName;
  }

  return item.counterpartyLabel ?? 'Persona';
}

export function inviteProfileAvatarUrl(
  userId: string,
  item: VisibleInviteProfileItem,
  profiles: Map<string, UserProfileRow>,
): string | null {
  const profile = profiles.get(userId);
  return profile
    ? resolveAvatarUrl(profile.avatar_path, profile.updated_at)
    : item.profileAvatarUrl;
}

export function groupInviteProfileItems<T extends VisibleInviteProfileItem>(
  items: readonly T[],
): Map<string, T[]> {
  const groupedItems = new Map<string, T[]>();

  for (const item of items) {
    if (!item.profileUserId) {
      continue;
    }

    const existingItems = groupedItems.get(item.profileUserId);
    if (existingItems) {
      existingItems.push(item);
    } else {
      groupedItems.set(item.profileUserId, [item]);
    }
  }

  return groupedItems;
}

export function upsertInviteProfilePeople(input: {
  readonly peopleById: Record<string, LivePersonDetailDto>;
  readonly pendingItems: readonly VisibleInviteProfileItem[];
  readonly historyItems: readonly VisibleInviteProfileItem[];
  readonly names: Map<string, string>;
  readonly profiles: Map<string, UserProfileRow>;
}) {
  const pendingByUserId = groupInviteProfileItems(input.pendingItems);
  const historyByUserId = groupInviteProfileItems(input.historyItems);
  const profileUserIds = new Set([...pendingByUserId.keys(), ...historyByUserId.keys()]);

  for (const userId of profileUserIds) {
    const pendingItems = (pendingByUserId.get(userId) ?? []).map((item) => ({
      ...item,
      href: item.profileHref ?? item.href,
    }));
    const historyItems = historyByUserId.get(userId) ?? [];
    const anchorItem = pendingItems[0] ?? historyItems[0];
    if (!anchorItem) {
      continue;
    }

    const existingPerson = input.peopleById[userId];
    const displayName =
      existingPerson?.displayName ??
      inviteProfileDisplayName(userId, anchorItem, input.names, input.profiles);
    const avatarUrl =
      existingPerson?.avatarUrl ?? inviteProfileAvatarUrl(userId, anchorItem, input.profiles);
    const nextPendingItems = sortInviteProfilePendingItems([
      ...pendingItems,
      ...(existingPerson?.pendingItems ?? []),
    ]);
    const inviteTimelineItems = [...pendingItems, ...historyItems].flatMap(
      (item) => item.profileTimelineItems,
    );
    const nextTimeline = sortHistoryItems([
      ...inviteTimelineItems,
      ...(existingPerson?.timeline ?? []),
    ]);
    const pendingLabel = `${nextPendingItems.length} pendiente${
      nextPendingItems.length > 1 ? 's' : ''
    }`;
    const supportText =
      nextPendingItems.length > 0
        ? `Tienes ${pendingLabel} con ${displayName}.`
        : (existingPerson?.supportText ?? `Sin movimientos registrados con ${displayName}.`);
    const netAmountMinor = existingPerson?.netAmountMinor ?? 0;
    const headline =
      nextPendingItems.length > 0 && netAmountMinor === 0
        ? `${pendingLabel} por resolver con ${displayName}`
        : (existingPerson?.headline ?? `Con ${displayName} estan al dia`);

    input.peopleById[userId] = {
      userId,
      displayName,
      avatarUrl,
      direction: existingPerson?.direction ?? 'settled',
      netAmountMinor,
      pendingCount: nextPendingItems.length,
      headline,
      supportText,
      pendingItems: nextPendingItems,
      pendingRequest: existingPerson?.pendingRequest,
      timeline: nextTimeline,
      relationshipStatus: existingPerson?.relationshipStatus ?? 'pending_invite',
    };
  }
}
