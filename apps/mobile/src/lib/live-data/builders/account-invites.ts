import type { PersonTimelineItemDto } from '@happy-circles/application';
import type {
  AccountInviteDeliveryRow,
  AccountInviteListItem,
  AccountInviteRow,
  AccountInviteSummary,
  UserProfileRow,
} from '../types';
import { LIVE_DATA_CTA, LIVE_DATA_ROUTES } from '../presentation';
import { formatRelativeLabel } from '../utils/dates';
import { groupBy } from '../utils/context';
import { sortByNewest, sortHistoryItems } from '../utils/sorting';
import { resolveAvatarUrl } from '../../avatar-url';
import {
  buildAccountIntendedRecipientReference,
  channelLabel,
  inviteProfileFields,
  inviteProfileFromIntendedRecipient,
  inviteProfileFromUser,
  inviteProfileHref,
  intendedInviteProfileFields,
  inviteTimelineEvent,
  inviteNamesMatch,
  inviteTerminalTone,
  isSpecificInviteName,
  relevantInviteTargetLabel,
  respondingInviteProfileFields,
  uniqueTimelineItemsById,
} from './invite-profiles';

export function normalizeAccountInviteChannel(
  value: string | null | undefined,
): AccountInviteListItem['originChannel'] {
  return value === 'qr' ? 'qr' : 'remote';
}

export function getAccountInviteActorRole(
  invite: AccountInviteRow,
  currentUserId: string,
): AccountInviteListItem['actorRole'] {
  if (invite.inviter_user_id === currentUserId) {
    return 'inviter';
  }

  if (invite.activated_user_id === currentUserId) {
    return 'activated';
  }

  return 'none';
}

export function buildLatestAccountDeliveryByInviteId(
  deliveries: readonly AccountInviteDeliveryRow[],
): ReadonlyMap<string, AccountInviteDeliveryRow> {
  const map = new Map<string, AccountInviteDeliveryRow>();

  for (const delivery of deliveries) {
    const current = map.get(delivery.invite_id);
    if (!current || delivery.created_at > current.created_at) {
      map.set(delivery.invite_id, delivery);
    }
  }

  return map;
}

export function accountInviteCurrentStatusTitle(input: {
  readonly actionState: AccountInviteListItem['actionState'];
  readonly inviterName: string;
  readonly targetName: string;
}): string {
  if (input.actionState === 'requires_you_review') {
    return `${input.targetName} espera tu validacion`;
  }

  if (input.actionState === 'waiting_sender_review') {
    return `Esperando validacion de ${input.inviterName}`;
  }

  return `Esperando activacion de ${input.targetName}`;
}

export function buildAccountInviteTimeline(input: {
  readonly invite: AccountInviteRow;
  readonly deliveries: readonly AccountInviteDeliveryRow[];
  readonly actorRole: AccountInviteListItem['actorRole'];
  readonly actionState: AccountInviteListItem['actionState'];
  readonly inviterName: string;
  readonly targetName: string;
  readonly intendedRecipientReference: string | null;
  readonly nowMs: number;
}): readonly PersonTimelineItemDto[] {
  const sourceLabel = input.actorRole === 'inviter' ? 'Tu' : input.inviterName;
  const deliveryRows = [...input.deliveries].sort((left, right) =>
    left.created_at.localeCompare(right.created_at),
  );
  const activationDelivery = [...deliveryRows]
    .reverse()
    .find((delivery) => delivery.activation_completed_at);
  const targetReference = relevantInviteTargetLabel({
    intendedRecipientReference: input.intendedRecipientReference,
    targetName: input.targetName,
  });
  const activatedByDifferentPerson =
    isSpecificInviteName(input.targetName) &&
    isSpecificInviteName(targetReference) &&
    !inviteNamesMatch(input.targetName, targetReference);
  const activationEvent =
    activationDelivery || input.invite.activated_user_id || input.invite.activated_at
      ? inviteTimelineEvent({
          id: `${input.invite.id}:activated`,
          title:
            activatedByDifferentPerson && input.actorRole !== 'activated'
              ? `${input.targetName} activo el acceso enviado a ${targetReference}`
              : input.actorRole === 'activated'
                ? 'Activaste el acceso privado'
                : `${input.targetName} activo el acceso privado`,
          subtitle: activatedByDifferentPerson ? 'Requiere verificacion' : 'Acceso privado',
          status:
            input.actionState === 'requires_you_review' ||
            input.actionState === 'waiting_sender_review'
              ? input.actionState
              : 'posted',
          sourceLabel: input.targetName,
          detail: 'Acceso privado',
          happenedAt:
            activationDelivery?.activation_completed_at ??
            input.invite.activated_at ??
            input.invite.updated_at,
          originInviteId: input.invite.id,
          nowMs: input.nowMs,
        })
      : null;
  const currentStatusEvent =
    input.actionState !== 'history'
      ? inviteTimelineEvent({
          id: `${input.invite.id}:current:${input.actionState}`,
          title: accountInviteCurrentStatusTitle(input),
          subtitle:
            input.actionState === 'requires_you_review' ||
            input.actionState === 'waiting_sender_review'
              ? 'Por verificar'
              : 'Acceso privado',
          status: input.actionState,
          sourceLabel,
          detail: 'Acceso privado',
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
              ? input.actorRole === 'inviter'
                ? `Acceso confirmado para ${input.targetName}`
                : `Acceso confirmado por ${input.inviterName}`
              : input.invite.status === 'rejected'
                ? 'El acceso fue rechazado'
                : input.invite.status === 'expired'
                  ? 'El acceso expiro'
                  : 'El acceso fue cancelado',
          subtitle: activatedByDifferentPerson
            ? `${input.targetName} activo el acceso enviado a ${targetReference}`
            : 'Acceso privado',
          status: input.invite.status,
          sourceLabel,
          detail: 'Acceso privado',
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
        input.actorRole === 'inviter'
          ? `Acceso privado enviado a ${targetReference}`
          : `${input.inviterName} te envio un acceso privado`,
      subtitle: 'Acceso privado',
      status: 'posted',
      sourceLabel,
      detail: 'Acceso privado',
      happenedAt: input.invite.created_at,
      originInviteId: input.invite.id,
      nowMs: input.nowMs,
    }),
    activationEvent,
    currentStatusEvent,
    terminalEvent,
  ]).sort((left, right) => Date.parse(left.happenedAt ?? '') - Date.parse(right.happenedAt ?? ''));
}

export function buildAccountInviteItems(input: {
  readonly invites: readonly AccountInviteRow[];
  readonly deliveries: readonly AccountInviteDeliveryRow[];
  readonly names: Map<string, string>;
  readonly profiles: Map<string, UserProfileRow>;
  readonly currentUserId: string;
  readonly nowMs: number;
}): {
  readonly pendingItems: readonly AccountInviteListItem[];
  readonly historyItems: readonly AccountInviteListItem[];
  readonly summary: AccountInviteSummary;
} {
  const latestDeliveryByInviteId = buildLatestAccountDeliveryByInviteId(input.deliveries);
  const deliveriesByInviteId = groupBy(input.deliveries, (delivery) => delivery.invite_id);
  const pendingItems: AccountInviteListItem[] = [];
  const historyItems: AccountInviteListItem[] = [];

  for (const invite of input.invites) {
    const actorRole = getAccountInviteActorRole(invite, input.currentUserId);
    if (actorRole === 'none') {
      continue;
    }

    const latestDelivery = latestDeliveryByInviteId.get(invite.id);
    const originChannel = normalizeAccountInviteChannel(latestDelivery?.channel);
    const intendedRecipientProfile = inviteProfileFromIntendedRecipient({
      alias: invite.intended_recipient_alias,
      phoneE164: invite.intended_recipient_phone_e164,
      phoneLabel: invite.intended_recipient_phone_label,
      roleLabel: 'Acceso enviado',
    });
    const inviterProfile = inviteProfileFromUser({
      names: input.names,
      profiles: input.profiles,
      roleLabel: actorRole === 'activated' ? 'Te envio un acceso privado' : 'Contacto de confianza',
      userId: invite.inviter_user_id,
    });
    const inviterName =
      invite.inviter_user_id === input.currentUserId ? 'Tu' : inviterProfile.displayName;
    const activatedUserProfile = invite.activated_user_id
      ? input.profiles.get(invite.activated_user_id)
      : undefined;
    const activatedUserDisplayName = invite.activated_user_id
      ? (input.names.get(invite.activated_user_id) ?? 'Persona')
      : null;
    const activatedUserAvatarUrl = activatedUserProfile
      ? resolveAvatarUrl(activatedUserProfile.avatar_path, activatedUserProfile.updated_at)
      : null;
    const activatedInviteProfile = invite.activated_user_id
      ? inviteProfileFromUser({
          fallbackName: invite.intended_recipient_alias,
          names: input.names,
          profiles: input.profiles,
          referenceLabel: intendedRecipientProfile.referenceLabel,
          roleLabel: 'Cuenta activada',
          userId: invite.activated_user_id,
        })
      : intendedRecipientProfile;
    const visibleProfile = actorRole === 'inviter' ? activatedInviteProfile : inviterProfile;
    const visibleProfileUserId =
      actorRole === 'inviter' ? invite.activated_user_id : invite.inviter_user_id;
    const respondingProfile = invite.activated_user_id ? activatedInviteProfile : null;
    const intendedRecipientReference = buildAccountIntendedRecipientReference(invite);
    const targetName =
      activatedUserDisplayName ??
      (activatedInviteProfile.displayName === 'Contacto invitado'
        ? 'tu contacto'
        : activatedInviteProfile.displayName);
    const expiryLabel = invite.expires_at
      ? `vence ${formatRelativeLabel(invite.expires_at, input.nowMs)}`
      : null;
    let title = 'Invitacion de acceso';
    let subtitle = [intendedRecipientReference, expiryLabel].filter(Boolean).join(' | ');
    let actionState: AccountInviteListItem['actionState'] = 'history';
    let status = invite.status;
    let ctaLabel: AccountInviteListItem['ctaLabel'] = LIVE_DATA_CTA.view;

    if (invite.status === 'pending_activation') {
      if (actorRole !== 'inviter') {
        continue;
      }

      title = `Acceso privado para ${targetName}`;
      actionState = 'pending_activation';
      status = 'pending_activation';
      ctaLabel = originChannel === 'qr' ? LIVE_DATA_CTA.qrActive : LIVE_DATA_CTA.share;
    } else if (invite.status === 'pending_inviter_review') {
      if (actorRole === 'inviter') {
        title = `${targetName} activo el acceso privado`;
        subtitle = [
          intendedRecipientReference ? `Pensada para ${intendedRecipientReference}` : null,
          'Por verificar',
        ]
          .filter(Boolean)
          .join(' | ');
        actionState = 'requires_you_review';
        status = 'requires_you_review';
        ctaLabel = LIVE_DATA_CTA.verify;
      } else {
        title = `Esperando validacion de ${inviterName}`;
        subtitle = 'Ya activaste este acceso';
        actionState = 'waiting_sender_review';
        status = 'waiting_sender_review';
      }
    } else {
      const happenedAt = invite.resolved_at ?? invite.updated_at ?? invite.created_at;
      const autoAcceptedByPhoneMatch =
        invite.resolution_reason === 'activation_phone_match_auto_accepted';
      title =
        invite.status === 'accepted'
          ? actorRole === 'inviter'
            ? autoAcceptedByPhoneMatch
              ? `${targetName} activo el acceso privado`
              : `Confirmaste a ${targetName}`
            : `${inviterName} confirmo tu acceso`
          : invite.status === 'rejected'
            ? actorRole === 'inviter'
              ? `Rechazaste a ${targetName}`
              : `${inviterName} rechazo este acceso`
            : invite.status === 'expired'
              ? actorRole === 'inviter'
                ? `El acceso para ${targetName} vencio`
                : 'Este acceso vencio'
              : 'Invitacion de acceso cancelada';
      subtitle = [
        actorRole === 'inviter' ? intendedRecipientReference : null,
        formatRelativeLabel(happenedAt, input.nowMs),
      ]
        .filter(Boolean)
        .join(' | ');
      historyItems.push({
        id: invite.id,
        inviteId: invite.id,
        kind: 'account_invite',
        actorRole,
        originChannel,
        actionState: 'history',
        title,
        subtitle,
        status: invite.status,
        ctaLabel: LIVE_DATA_CTA.view,
        href: LIVE_DATA_ROUTES.friendshipActivity,
        sourceType: 'user',
        createdAt: invite.created_at,
        happenedAt,
        happenedAtLabel: formatRelativeLabel(happenedAt, input.nowMs),
        counterpartyLabel: actorRole === 'inviter' ? targetName : inviterName,
        expiresAt: invite.expires_at,
        activatedAt: invite.activated_at,
        resolvedAt: invite.resolved_at,
        intendedRecipientAlias: invite.intended_recipient_alias,
        intendedRecipientPhoneE164: invite.intended_recipient_phone_e164,
        intendedRecipientPhoneLabel: invite.intended_recipient_phone_label,
        activatedUserId: invite.activated_user_id,
        activatedUserDisplayName,
        activatedUserAvatarUrl,
        profileUserId: visibleProfileUserId,
        profileHref: inviteProfileHref(visibleProfileUserId, invite.id, 'history'),
        profileTimelineItems: buildAccountInviteTimeline({
          invite,
          deliveries: deliveriesByInviteId.get(invite.id) ?? [],
          actorRole,
          actionState: 'history',
          inviterName,
          targetName,
          intendedRecipientReference,
          nowMs: input.nowMs,
        }),
        ...inviteProfileFields(visibleProfile),
        ...intendedInviteProfileFields(intendedRecipientProfile),
        ...respondingInviteProfileFields(respondingProfile),
      });
      continue;
    }

    pendingItems.push({
      id: invite.id,
      inviteId: invite.id,
      kind: 'account_invite',
      actorRole,
      originChannel,
      actionState,
      title,
      subtitle,
      status,
      ctaLabel,
      href: LIVE_DATA_ROUTES.friendshipActivity,
      sourceType: 'user',
      createdAt: invite.created_at,
      counterpartyLabel: actorRole === 'inviter' ? targetName : inviterName,
      expiresAt: invite.expires_at,
      activatedAt: invite.activated_at,
      resolvedAt: invite.resolved_at,
      intendedRecipientAlias: invite.intended_recipient_alias,
      intendedRecipientPhoneE164: invite.intended_recipient_phone_e164,
      intendedRecipientPhoneLabel: invite.intended_recipient_phone_label,
      activatedUserId: invite.activated_user_id,
      activatedUserDisplayName,
      activatedUserAvatarUrl,
      profileUserId: visibleProfileUserId,
      profileHref: inviteProfileHref(visibleProfileUserId, invite.id, 'pending'),
      profileTimelineItems: buildAccountInviteTimeline({
        invite,
        deliveries: deliveriesByInviteId.get(invite.id) ?? [],
        actorRole,
        actionState,
        inviterName,
        targetName,
        intendedRecipientReference,
        nowMs: input.nowMs,
      }),
      ...inviteProfileFields(visibleProfile),
      ...intendedInviteProfileFields(intendedRecipientProfile),
      ...respondingInviteProfileFields(respondingProfile),
    });
  }

  return {
    pendingItems: sortByNewest(pendingItems),
    historyItems: sortHistoryItems(historyItems),
    summary: {
      requiresReviewCount: pendingItems.filter((item) => item.actionState === 'requires_you_review')
        .length,
      pendingActivationCount: pendingItems.filter(
        (item) => item.actionState === 'pending_activation',
      ).length,
      waitingInviterReviewCount: pendingItems.filter(
        (item) => item.actionState === 'waiting_sender_review',
      ).length,
      historyCount: historyItems.length,
    },
  };
}
