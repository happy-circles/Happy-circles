import type { PersonTimelineItemDto } from '@happy-circles/application';
import type {
  FriendshipInviteDeliveryRow,
  FriendshipInviteListItem,
  FriendshipInviteRow,
  FriendshipSummary,
  UserProfileRow,
} from '../types';
import { LIVE_DATA_CTA, LIVE_DATA_ROUTES } from '../presentation';
import { formatRelativeLabel } from '../utils/dates';
import { sortByNewest } from '../utils/sorting';
import {
  buildIntendedRecipientReference,
  channelLabel,
  inviteProfileFields,
  inviteProfileFromClaimant,
  inviteProfileFromIntendedRecipient,
  inviteProfileFromUser,
  inviteProfileHref,
  intendedInviteProfileFields,
  inviteTimelineEvent,
  parseFriendshipClaimantSnapshot,
  respondingInviteProfileFields,
  uniqueTimelineItemsById,
} from './invite-profiles';
import { groupBy } from '../utils/context';
import { sortHistoryItems } from '../utils/sorting';
import {
  friendshipInviteCurrentStatusTitle,
  inviteNamesMatch,
  isSpecificInviteName,
  relevantInviteTargetLabel,
} from './friendship-invite-labels';

export function getFriendshipActorRole(
  invite: FriendshipInviteRow,
  currentUserId: string,
): FriendshipInviteListItem['actorRole'] {
  if (invite.inviter_user_id === currentUserId) {
    return 'sender';
  }

  if (invite.target_user_id === currentUserId) {
    return 'recipient';
  }

  if (invite.claimant_user_id === currentUserId) {
    return 'claimant';
  }

  return 'none';
}

export function buildLatestDeliveryByInviteId(
  deliveries: readonly FriendshipInviteDeliveryRow[],
): ReadonlyMap<string, FriendshipInviteDeliveryRow> {
  const map = new Map<string, FriendshipInviteDeliveryRow>();

  for (const delivery of deliveries) {
    const current = map.get(delivery.invite_id);
    if (!current || delivery.created_at > current.created_at) {
      map.set(delivery.invite_id, delivery);
    }
  }

  return map;
}

export function inviteTerminalTone(status: string): PersonTimelineItemDto['tone'] {
  if (status === 'accepted') {
    return 'positive';
  }

  if (status === 'rejected' || status === 'expired' || status === 'canceled') {
    return 'negative';
  }

  return 'neutral';
}

export function buildFriendshipInviteTimeline(input: {
  readonly invite: FriendshipInviteRow;
  readonly deliveries: readonly FriendshipInviteDeliveryRow[];
  readonly actorRole: FriendshipInviteListItem['actorRole'];
  readonly actionState: FriendshipInviteListItem['actionState'];
  readonly inviterName: string;
  readonly targetName: string;
  readonly claimantName: string;
  readonly intendedRecipientReference: string | null;
  readonly nowMs: number;
}): readonly PersonTimelineItemDto[] {
  const sourceLabel = input.actorRole === 'sender' ? 'Tu' : input.inviterName;
  const deliveryRows = [...input.deliveries].sort((left, right) =>
    left.created_at.localeCompare(right.created_at),
  );
  const claimedDelivery = [...deliveryRows].reverse().find((delivery) => delivery.claimed_at);
  const targetReference = relevantInviteTargetLabel({
    intendedRecipientReference: input.intendedRecipientReference,
    targetName: input.targetName,
  });
  const claimedByDifferentPerson =
    isSpecificInviteName(input.claimantName) &&
    isSpecificInviteName(targetReference) &&
    !inviteNamesMatch(input.claimantName, targetReference);
  const claimedEvent =
    claimedDelivery || input.invite.claimant_user_id
      ? inviteTimelineEvent({
          id: `${input.invite.id}:claimed`,
          title:
            claimedByDifferentPerson && input.actorRole !== 'claimant'
              ? `${input.claimantName} reclamo la invitacion enviada a ${targetReference}`
              : input.actorRole === 'claimant'
                ? 'Reclamaste la invitacion'
                : `${input.claimantName} reclamo la invitacion`,
          subtitle: claimedByDifferentPerson ? 'Requiere verificacion' : 'Solicitud reclamada',
          status:
            input.actionState === 'requires_you_review' ||
            input.actionState === 'waiting_sender_review'
              ? input.actionState
              : 'posted',
          sourceLabel: input.claimantName,
          detail: 'Invitacion de amistad',
          happenedAt: claimedDelivery?.claimed_at ?? input.invite.updated_at,
          originInviteId: input.invite.id,
          nowMs: input.nowMs,
        })
      : null;
  const currentStatusEvent =
    input.actionState !== 'history'
      ? inviteTimelineEvent({
          id: `${input.invite.id}:current:${input.actionState}`,
          title: friendshipInviteCurrentStatusTitle(input),
          subtitle:
            input.actionState === 'requires_you_review' ||
            input.actionState === 'waiting_sender_review'
              ? 'Por verificar'
              : 'Solicitud de amistad',
          status: input.actionState,
          sourceLabel,
          detail: 'Invitacion de amistad',
          happenedAt: input.invite.updated_at ?? input.invite.created_at,
          originInviteId: input.invite.id,
          nowMs: input.nowMs,
        })
      : null;
  const terminalEvent =
    input.actionState === 'history'
      ? inviteTimelineEvent({
          id: `${input.invite.id}:resolved`,
          title:
            input.invite.status === 'accepted'
              ? input.actorRole === 'sender'
                ? `Amistad conectada con ${input.claimantName !== 'Persona' ? input.claimantName : input.targetName}`
                : `Amistad conectada con ${input.inviterName}`
              : input.invite.status === 'rejected'
                ? 'La invitacion fue rechazada'
                : input.invite.status === 'expired'
                  ? 'La invitacion expiro'
                  : 'La invitacion fue cancelada',
          subtitle: claimedByDifferentPerson
            ? `${input.claimantName} reclamo la invitacion enviada a ${targetReference}`
            : 'Solicitud de amistad',
          status: input.invite.status,
          sourceLabel,
          detail: 'Invitacion de amistad',
          happenedAt: input.invite.resolved_at ?? input.invite.updated_at,
          originInviteId: input.invite.id,
          nowMs: input.nowMs,
          tone: inviteTerminalTone(input.invite.status),
        })
      : null;

  return uniqueTimelineItemsById([
    inviteTimelineEvent({
      id: `${input.invite.id}:created`,
      title:
        input.actorRole === 'sender'
          ? `Invitacion enviada a ${targetReference}`
          : `${input.inviterName} envio la invitacion`,
      subtitle: 'Solicitud de amistad',
      status: 'posted',
      sourceLabel,
      detail: 'Invitacion de amistad',
      happenedAt: input.invite.created_at,
      originInviteId: input.invite.id,
      nowMs: input.nowMs,
    }),
    claimedEvent,
    currentStatusEvent,
    terminalEvent,
  ]).sort((left, right) => Date.parse(left.happenedAt ?? '') - Date.parse(right.happenedAt ?? ''));
}

export function buildFriendshipInviteItems(input: {
  readonly invites: readonly FriendshipInviteRow[];
  readonly deliveries: readonly FriendshipInviteDeliveryRow[];
  readonly names: Map<string, string>;
  readonly profiles: Map<string, UserProfileRow>;
  readonly currentUserId: string;
  readonly nowMs: number;
}): {
  readonly pendingItems: readonly FriendshipInviteListItem[];
  readonly historyItems: readonly FriendshipInviteListItem[];
  readonly summary: FriendshipSummary;
} {
  const latestDeliveryByInviteId = buildLatestDeliveryByInviteId(input.deliveries);
  const deliveriesByInviteId = groupBy(input.deliveries, (delivery) => delivery.invite_id);
  const pendingItems: FriendshipInviteListItem[] = [];
  const historyItems: FriendshipInviteListItem[] = [];

  for (const invite of input.invites) {
    const latestDelivery = latestDeliveryByInviteId.get(invite.id);
    const claimantUserId = invite.claimant_user_id ?? latestDelivery?.claimed_by_user_id ?? null;
    let actorRole = getFriendshipActorRole(invite, input.currentUserId);
    if (actorRole === 'none' && claimantUserId === input.currentUserId) {
      actorRole = 'claimant';
    }

    if (actorRole === 'none') {
      continue;
    }

    const claimantSnapshot = parseFriendshipClaimantSnapshot(invite.claimant_snapshot);
    const intendedRecipientProfile = inviteProfileFromIntendedRecipient({
      alias: invite.intended_recipient_alias,
      phoneE164: invite.intended_recipient_phone_e164,
      phoneLabel: invite.intended_recipient_phone_label,
      roleLabel: 'Contacto invitado',
    });
    const inviterProfile = inviteProfileFromUser({
      names: input.names,
      profiles: input.profiles,
      roleLabel: actorRole === 'recipient' ? 'Te envio una solicitud' : 'Contacto de confianza',
      userId: invite.inviter_user_id,
    });
    const targetProfile = invite.target_user_id
      ? inviteProfileFromUser({
          fallbackName: invite.intended_recipient_alias,
          names: input.names,
          profiles: input.profiles,
          referenceLabel: intendedRecipientProfile.referenceLabel,
          roleLabel: 'Solicitud enviada',
          userId: invite.target_user_id,
        })
      : intendedRecipientProfile;
    const claimantProfile = inviteProfileFromClaimant({
      claimantUserId,
      names: input.names,
      profiles: input.profiles,
      snapshot: claimantSnapshot,
    });
    const visibleProfile =
      actorRole === 'sender'
        ? invite.status === 'pending_sender_review' ||
          (invite.flow === 'external' && invite.status !== 'pending_claim')
          ? claimantProfile
          : targetProfile
        : inviterProfile;
    const visibleProfileUserId =
      actorRole === 'sender'
        ? invite.status === 'pending_sender_review' ||
          (invite.flow === 'external' && invite.status !== 'pending_claim')
          ? claimantUserId
          : invite.target_user_id
        : invite.inviter_user_id;
    const respondingProfile =
      invite.flow === 'external' && (claimantUserId || claimantSnapshot) ? claimantProfile : null;
    const inviterName =
      invite.inviter_user_id === input.currentUserId ? 'Tu' : inviterProfile.displayName;
    const targetName = invite.target_user_id
      ? targetProfile.displayName
      : (invite.intended_recipient_alias ?? intendedRecipientProfile.displayName);
    const claimantName = claimantProfile.displayName;
    const intendedRecipientReference = buildIntendedRecipientReference(invite);
    const pieces = [channelLabel(latestDelivery?.channel ?? invite.origin_channel)];
    if (invite.expires_at) {
      pieces.push(`vence ${formatRelativeLabel(invite.expires_at, input.nowMs)}`);
    }

    let title = 'Invitacion';
    let subtitle = pieces.join(' | ');
    let actionState: FriendshipInviteListItem['actionState'] = 'history';
    let status = invite.status;

    if (invite.status === 'pending_recipient') {
      if (actorRole === 'recipient') {
        title = `${inviterName} quiere conectar contigo`;
        subtitle = 'Responde esta solicitud';
        actionState = 'requires_you_response';
        status = 'requires_you_response';
      } else {
        title = `Esperando a ${targetName}`;
        subtitle = 'Solicitud pendiente';
        actionState = 'waiting_other_side';
        status = 'waiting_other_side';
      }
    } else if (invite.status === 'pending_claim') {
      title =
        latestDelivery?.channel === 'qr'
          ? invite.intended_recipient_alias
            ? `QR temporal para ${invite.intended_recipient_alias}`
            : 'QR temporal activo'
          : `Invitacion lista para ${invite.intended_recipient_alias ?? 'tu contacto'}`;
      subtitle = [
        intendedRecipientReference,
        latestDelivery?.expires_at
          ? `vence ${formatRelativeLabel(latestDelivery.expires_at, input.nowMs)}`
          : null,
      ]
        .filter(Boolean)
        .join(' | ');
      actionState = 'pending_claim';
      status = 'pending_claim';
    } else if (invite.status === 'pending_sender_review') {
      if (actorRole === 'sender') {
        title = `${claimantName} reclamo la invitacion para ${targetName}`;
        subtitle = [
          intendedRecipientReference ? `Pensada para ${intendedRecipientReference}` : null,
          'Por verificar',
        ]
          .filter(Boolean)
          .join(' | ');
        actionState = 'requires_you_review';
        status = 'requires_you_review';
      } else {
        title = `Esperando validacion de ${inviterName}`;
        subtitle = 'Ya reclamaste esta invitacion';
        actionState = 'waiting_sender_review';
        status = 'waiting_sender_review';
      }
    } else {
      const happenedAt = invite.resolved_at ?? invite.updated_at ?? invite.created_at;
      const autoAcceptedByPhoneMatch =
        invite.resolution_reason === 'claim_phone_match_auto_accepted' &&
        invite.flow === 'external';
      title =
        invite.status === 'accepted'
          ? actorRole === 'sender'
            ? invite.flow === 'external'
              ? autoAcceptedByPhoneMatch
                ? `${claimantName} acepto tu invitacion`
                : `Confirmaste a ${claimantName}`
              : `${targetName} acepto tu invitacion`
            : actorRole === 'claimant'
              ? autoAcceptedByPhoneMatch
                ? 'Conexion creada'
                : `${inviterName} confirmo esta conexion`
              : `Aceptaste la invitacion de ${inviterName}`
          : invite.status === 'rejected'
            ? actorRole === 'sender'
              ? invite.flow === 'external'
                ? `Rechazaste a ${claimantName}`
                : `${targetName} rechazo tu invitacion`
              : actorRole === 'claimant'
                ? `${inviterName} rechazo esta conexion`
                : `Rechazaste la invitacion de ${inviterName}`
            : invite.status === 'expired'
              ? actorRole === 'sender'
                ? 'La invitacion vencio'
                : 'Esta invitacion vencio'
              : 'Invitacion cancelada';
      subtitle = [
        actorRole === 'sender' ? intendedRecipientReference : null,
        formatRelativeLabel(happenedAt, input.nowMs),
      ]
        .filter(Boolean)
        .join(' | ');
      historyItems.push({
        id: invite.id,
        inviteId: invite.id,
        kind: 'friendship_invite',
        flow: invite.flow as FriendshipInviteListItem['flow'],
        actorRole,
        originChannel: invite.origin_channel as FriendshipInviteListItem['originChannel'],
        actionState: 'history',
        title,
        subtitle,
        status: invite.status,
        ctaLabel: LIVE_DATA_CTA.view,
        href: LIVE_DATA_ROUTES.activity,
        sourceType: 'user',
        createdAt: invite.created_at,
        happenedAt,
        happenedAtLabel: formatRelativeLabel(happenedAt, input.nowMs),
        counterpartyLabel:
          actorRole === 'sender'
            ? invite.flow === 'external'
              ? claimantProfile.displayName !== 'Persona'
                ? claimantProfile.displayName
                : (invite.intended_recipient_alias ?? undefined)
              : targetName
            : inviterName !== 'Tu'
              ? inviterName
              : undefined,
        expiresAt: invite.expires_at,
        resolvedAt: invite.resolved_at,
        claimantSnapshot,
        intendedRecipientAlias: invite.intended_recipient_alias,
        intendedRecipientPhoneE164: invite.intended_recipient_phone_e164,
        intendedRecipientPhoneLabel: invite.intended_recipient_phone_label,
        profileUserId: visibleProfileUserId,
        profileHref: inviteProfileHref(visibleProfileUserId, invite.id, 'history'),
        profileTimelineItems: buildFriendshipInviteTimeline({
          invite,
          deliveries: deliveriesByInviteId.get(invite.id) ?? [],
          actorRole,
          actionState: 'history',
          inviterName,
          targetName,
          claimantName,
          intendedRecipientReference,
          nowMs: input.nowMs,
        }),
        ...inviteProfileFields(visibleProfile),
        ...intendedInviteProfileFields(targetProfile),
        ...respondingInviteProfileFields(respondingProfile),
      });
      continue;
    }

    pendingItems.push({
      id: invite.id,
      inviteId: invite.id,
      kind: 'friendship_invite',
      flow: invite.flow as FriendshipInviteListItem['flow'],
      actorRole,
      originChannel: invite.origin_channel as FriendshipInviteListItem['originChannel'],
      actionState,
      title,
      subtitle,
      status,
      ctaLabel:
        actionState === 'requires_you_response'
          ? LIVE_DATA_CTA.respond
          : actionState === 'requires_you_review'
            ? LIVE_DATA_CTA.verify
            : actionState === 'pending_claim'
              ? latestDelivery?.channel === 'qr'
                ? LIVE_DATA_CTA.qrActive
                : LIVE_DATA_CTA.share
              : LIVE_DATA_CTA.view,
      href: LIVE_DATA_ROUTES.activity,
      createdAt: invite.created_at,
      expiresAt: invite.expires_at,
      resolvedAt: invite.resolved_at,
      claimantSnapshot,
      counterpartyLabel:
        actorRole === 'sender' &&
        invite.flow === 'external' &&
        claimantProfile.displayName !== 'Persona'
          ? claimantProfile.displayName
          : undefined,
      intendedRecipientAlias: invite.intended_recipient_alias,
      intendedRecipientPhoneE164: invite.intended_recipient_phone_e164,
      intendedRecipientPhoneLabel: invite.intended_recipient_phone_label,
      profileUserId: visibleProfileUserId,
      profileHref: inviteProfileHref(visibleProfileUserId, invite.id, 'pending'),
      profileTimelineItems: buildFriendshipInviteTimeline({
        invite,
        deliveries: deliveriesByInviteId.get(invite.id) ?? [],
        actorRole,
        actionState,
        inviterName,
        targetName,
        claimantName,
        intendedRecipientReference,
        nowMs: input.nowMs,
      }),
      ...inviteProfileFields(visibleProfile),
      ...intendedInviteProfileFields(targetProfile),
      ...respondingInviteProfileFields(respondingProfile),
    });
  }

  return {
    pendingItems: sortByNewest(pendingItems),
    historyItems: sortHistoryItems(historyItems),
    summary: {
      requiresResponseCount: pendingItems.filter(
        (item) => item.actionState === 'requires_you_response',
      ).length,
      requiresReviewCount: pendingItems.filter((item) => item.actionState === 'requires_you_review')
        .length,
      waitingSenderReviewCount: pendingItems.filter(
        (item) => item.actionState === 'waiting_sender_review',
      ).length,
      sentOutsideCount: pendingItems.filter((item) => item.actionState === 'pending_claim').length,
      historyCount: historyItems.length,
    },
  };
}
