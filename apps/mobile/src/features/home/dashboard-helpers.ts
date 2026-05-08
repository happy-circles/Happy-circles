import type { Href } from 'expo-router';
import type { AccountInviteListItem, FriendshipInviteListItem } from '@/lib/live-data';
import { theme } from '@/lib/theme';
import type { BalanceFocus } from '@/features/balance/balance-helpers';

export type InviteRequestsTab = 'received' | 'sent' | 'history';
export type InviteRequestAction = 'accept' | 'reject' | 'approve' | 'cancel';
export type InviteRequestItem = FriendshipInviteListItem | AccountInviteListItem;
export type TransactionTargetPanel = 'pending' | 'history';
export type InviteCardIconName =
  | 'qr-code-outline'
  | 'key-outline'
  | 'send-outline'
  | 'link-outline'
  | 'person-add-outline';

export const INVITE_REQUEST_TABS: readonly InviteRequestsTab[] = ['received', 'sent', 'history'];

export function balanceFocusHref(focus: BalanceFocus): Href {
  if (focus === 'balance') {
    return '/transactions' as Href;
  }

  if (focus === 'people') {
    return '/people?filter=movements' as Href;
  }

  if (focus === 'categories') {
    return '/categories' as Href;
  }

  return '/circles' as Href;
}

export function sortInviteRequestItems(items: readonly InviteRequestItem[]): InviteRequestItem[] {
  return [...items].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
}

export function inviteHistoryTimestamp(item: InviteRequestItem): string {
  if (typeof item.happenedAt === 'string' && item.happenedAt.length > 0) {
    return item.happenedAt;
  }

  if (item.kind === 'friendship_invite' && item.resolvedAt) {
    return item.resolvedAt;
  }

  if (item.kind === 'account_invite') {
    return item.resolvedAt ?? item.activatedAt ?? item.createdAt;
  }

  return item.createdAt;
}

export function sortInviteHistoryItems(items: readonly InviteRequestItem[]): InviteRequestItem[] {
  return [...items].sort(
    (left, right) =>
      Date.parse(inviteHistoryTimestamp(right)) - Date.parse(inviteHistoryTimestamp(left)),
  );
}

export function isReceivedInvite(item: InviteRequestItem): boolean {
  if (item.actionState === 'requires_you_response' || item.actionState === 'requires_you_review') {
    return true;
  }

  if (item.kind === 'friendship_invite' && item.actionState === 'waiting_sender_review') {
    return item.actorRole === 'claimant';
  }

  if (item.kind === 'account_invite' && item.actionState === 'waiting_sender_review') {
    return item.actorRole === 'activated';
  }

  return false;
}

export function isSentInvite(item: InviteRequestItem): boolean {
  if (item.kind === 'friendship_invite') {
    return (
      item.actorRole === 'sender' &&
      (item.actionState === 'pending_claim' || item.actionState === 'waiting_other_side')
    );
  }

  return item.actorRole === 'inviter' && item.actionState === 'pending_activation';
}

export function isActiveQrInvite(item: InviteRequestItem): boolean {
  return (
    item.originChannel === 'qr' &&
    (item.actionState === 'pending_claim' || item.actionState === 'pending_activation')
  );
}

export function inviteHasLinkedPerson(item: InviteRequestItem): boolean {
  if (item.kind === 'friendship_invite') {
    return Boolean(
      item.profileUserId ||
      item.claimantSnapshot ||
      normalizedInviteName(item.respondingProfileDisplayName) ||
      normalizedInviteName(item.counterpartyLabel),
    );
  }

  return Boolean(
    item.activatedUserId ||
    item.profileUserId ||
    normalizedInviteName(item.activatedUserDisplayName) ||
    normalizedInviteName(item.respondingProfileDisplayName) ||
    normalizedInviteName(item.counterpartyLabel),
  );
}

export function isVisibleInviteHistory(item: InviteRequestItem): boolean {
  if (item.actionState !== 'history' || item.originChannel !== 'qr') {
    return true;
  }

  return inviteHasLinkedPerson(item);
}

export function inviteCardIcon(item: InviteRequestItem): InviteCardIconName {
  if (item.originChannel === 'qr') {
    return 'qr-code-outline';
  }

  if (item.kind === 'account_invite') {
    return 'key-outline';
  }

  if (item.originChannel === 'internal') {
    return 'send-outline';
  }

  if (item.originChannel === 'remote') {
    return 'link-outline';
  }

  return 'person-add-outline';
}

export function inviteAccentColor(item: InviteRequestItem): string {
  if (isActiveQrInvite(item)) {
    return theme.colors.primary;
  }

  if (item.actionState === 'requires_you_response' || item.actionState === 'requires_you_review') {
    return theme.colors.warning;
  }

  if (item.actionState === 'history') {
    if (item.status === 'accepted') {
      return theme.colors.success;
    }

    if (item.status === 'rejected' || item.status === 'canceled') {
      return theme.colors.danger;
    }

    if (item.status === 'expired') {
      return theme.colors.warning;
    }
  }

  return theme.colors.primary;
}

export function inviteAccentBackgroundColor(item: InviteRequestItem): string {
  const accentColor = inviteAccentColor(item);

  if (accentColor === theme.colors.success) {
    return theme.colors.successSoft;
  }

  if (accentColor === theme.colors.warning) {
    return theme.colors.warningSoft;
  }

  if (accentColor === theme.colors.danger) {
    return theme.colors.dangerSoft;
  }

  return theme.colors.primaryGhost;
}

function formatRelativeLabel(value: string): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return 'recientemente';
  }

  const diffMs = Date.now() - timestamp;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) {
    return 'hace un momento';
  }

  if (diffMs < hour) {
    return `hace ${Math.max(1, Math.round(diffMs / minute))} min`;
  }

  if (diffMs < day) {
    return `hace ${Math.max(1, Math.round(diffMs / hour))} h`;
  }

  if (diffMs < 7 * day) {
    return `hace ${Math.max(1, Math.round(diffMs / day))} d`;
  }

  return new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'short',
  }).format(new Date(timestamp));
}

function splitSubtitle(value: string): string[] {
  return value
    .split('|')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function isRelativeInviteLabel(value: string): boolean {
  const normalized = value.trim().toLocaleLowerCase('es-CO');

  return (
    normalized === 'reciente' ||
    normalized === 'recientemente' ||
    normalized === 'hoy' ||
    normalized === 'ayer' ||
    normalized === 'hace un momento' ||
    /^hace \d+ (min|h|d)$/.test(normalized) ||
    /^\d{1,2} [a-z.]+$/.test(normalized)
  );
}

export function normalizedInviteName(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = trimmed.toLocaleLowerCase('es-CO');
  if (
    isRelativeInviteLabel(trimmed) ||
    normalized === 'persona' ||
    normalized === 'tu' ||
    normalized === 'usuario' ||
    normalized === 'sistema' ||
    normalized === 'contacto invitado' ||
    normalized === 'tu contacto' ||
    normalized === 'solicitud enviada' ||
    normalized === 'invitacion' ||
    normalized === 'invitacion cancelada' ||
    normalized === 'invitacion de acceso' ||
    normalized === 'qr temporal activo' ||
    normalized === 'conexion creada' ||
    normalized === 'esta invitacion vencio' ||
    normalized === 'la invitacion vencio' ||
    normalized === 'este acceso vencio'
  ) {
    return null;
  }

  return trimmed;
}

function firstInviteName(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const normalized = normalizedInviteName(value);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function inviteNameFromReference(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.includes('@') || /^\+?\d[\d\s().-]+$/.test(trimmed)) {
    return null;
  }

  const cleaned = trimmed
    .replace(/^Pensada para\s+/i, '')
    .replace(/^Contacto\s+/i, '')
    .trim();

  if (
    cleaned.includes('@') ||
    isRelativeInviteLabel(cleaned) ||
    /^\+?\d[\d\s().-]+$/.test(cleaned) ||
    /^(vence|por verificar|solicitud pendiente|responde esta solicitud|ya )\b/i.test(cleaned)
  ) {
    return null;
  }

  return normalizedInviteName(cleaned);
}

export function shouldShowRespondingInviteProfile(item: InviteRequestItem): boolean {
  if (item.kind === 'friendship_invite') {
    return (
      item.actorRole === 'sender' &&
      item.flow === 'external' &&
      item.actionState !== 'pending_claim'
    );
  }

  return item.actorRole === 'inviter' && Boolean(item.activatedUserId);
}

function fallbackInviteMechanismLabel(item: InviteRequestItem): string | null {
  if (item.actionState !== 'history' || item.originChannel !== 'qr') {
    return null;
  }

  if (item.status === 'canceled') {
    return 'QR cancelado';
  }

  if (item.status === 'expired') {
    return 'QR vencido';
  }

  if (item.status === 'rejected') {
    return 'QR rechazado';
  }

  return null;
}

export function displayNameForInvite(item: InviteRequestItem): string {
  const subtitleNames = splitSubtitle(item.subtitle).map(inviteNameFromReference);

  if (isActiveQrInvite(item)) {
    return 'QR activo';
  }

  if (shouldShowRespondingInviteProfile(item)) {
    const respondingName = firstInviteName(
      item.respondingProfileDisplayName,
      item.kind === 'friendship_invite' ? item.claimantSnapshot?.displayName : null,
      item.counterpartyLabel,
      ...subtitleNames,
    );
    if (respondingName) {
      return respondingName;
    }
  }

  if (item.kind === 'account_invite') {
    const accountName =
      item.actorRole === 'inviter'
        ? firstInviteName(
            item.activatedUserDisplayName,
            item.respondingProfileDisplayName,
            item.intendedRecipientAlias,
            item.intendedProfileDisplayName,
            item.counterpartyLabel,
            item.profileDisplayName,
            ...subtitleNames,
          )
        : firstInviteName(
            item.counterpartyLabel,
            item.profileDisplayName,
            item.activatedUserDisplayName,
            item.intendedRecipientAlias,
            ...subtitleNames,
          );

    if (accountName) {
      return accountName;
    }
  }

  const patterns = [
    /^(.+) quiere conectar contigo$/i,
    /^Esperando a (.+)$/i,
    /^Verifica a (.+)$/i,
    /^(.+) reclamo la invitacion para .+$/i,
    /^Invitacion lista para (.+)$/i,
    /^QR temporal para (.+)$/i,
    /^Esperando validacion de (.+)$/i,
    /^(.+) acepto tu invitacion$/i,
    /^Confirmaste a (.+)$/i,
    /^Amistad conectada con (.+)$/i,
    /^Aceptaste la invitacion de (.+)$/i,
    /^(.+) rechazo tu invitacion$/i,
    /^Rechazaste a (.+)$/i,
    /^Rechazaste la invitacion de (.+)$/i,
    /^Acceso privado para (.+)$/i,
    /^(.+) activo el acceso privado$/i,
    /^(.+) confirmo tu acceso$/i,
    /^(.+) rechazo este acceso$/i,
    /^El acceso para (.+) vencio$/i,
  ];

  for (const pattern of patterns) {
    const match = item.title.match(pattern);
    if (match?.[1]) {
      const matchedName = normalizedInviteName(match[1]);
      if (matchedName) {
        return matchedName;
      }
    }
  }

  const friendshipName =
    item.actorRole === 'sender'
      ? firstInviteName(
          item.intendedRecipientAlias,
          item.intendedProfileDisplayName,
          item.counterpartyLabel,
          item.profileDisplayName,
          ...subtitleNames,
        )
      : firstInviteName(
          item.counterpartyLabel,
          item.profileDisplayName,
          item.intendedRecipientAlias,
          ...subtitleNames,
        );

  if (friendshipName) {
    return friendshipName;
  }

  return (
    fallbackInviteMechanismLabel(item) ??
    normalizedInviteName(item.title) ??
    statusLabelForInvite(item)
  );
}

export function inviteRequestMeta(item: InviteRequestItem): string {
  const timestamp = item.happenedAtLabel ?? formatRelativeLabel(inviteHistoryTimestamp(item));

  if (isActiveQrInvite(item)) {
    return `Enviada ${timestamp}`;
  }

  return `${statusLabelForInvite(item)} ${timestamp}`;
}

export function statusLabelForInvite(item: InviteRequestItem): string {
  if (item.actionState === 'history') {
    if (item.status === 'accepted') {
      return 'Aceptada';
    }

    if (item.status === 'rejected') {
      return 'Rechazada';
    }

    if (item.status === 'expired') {
      return 'Expirada';
    }

    if (item.status === 'canceled') {
      return 'Cancelada';
    }

    return 'Historico';
  }

  if (item.actionState === 'requires_you_response') {
    return 'Por responder';
  }

  if (item.actionState === 'requires_you_review') {
    return 'Por verificar';
  }

  if (item.actionState === 'pending_claim') {
    return 'Pendiente de abrir';
  }

  if (item.actionState === 'pending_activation') {
    return 'Pendiente de activar';
  }

  if (item.actionState === 'waiting_sender_review') {
    return 'Esperando validacion';
  }

  if (item.actionState === 'waiting_other_side') {
    return 'Esperando respuesta';
  }

  return 'En seguimiento';
}

export function inviteRequestEmptyTitle(tab: InviteRequestsTab): string {
  if (tab === 'received') {
    return 'Sin solicitudes recibidas';
  }

  if (tab === 'sent') {
    return 'Sin solicitudes enviadas';
  }

  return 'Sin historial';
}

export function inviteRequestEmptyDescription(tab: InviteRequestsTab): string {
  if (tab === 'received') {
    return 'Cuando alguien quiera conectar contigo, aparecera aqui.';
  }

  if (tab === 'history') {
    return 'Las solicitudes resueltas y vencidas apareceran aqui.';
  }

  return 'Las invitaciones que envies quedaran en esta pestana.';
}
