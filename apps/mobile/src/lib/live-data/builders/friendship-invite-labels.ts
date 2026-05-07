import type { FriendshipInviteListItem } from '../types';

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

export function inviteNamesMatch(
  left: string | null | undefined,
  right: string | null | undefined,
) {
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

export function friendshipInviteCurrentStatusTitle(input: {
  readonly actionState: FriendshipInviteListItem['actionState'];
  readonly actorRole: FriendshipInviteListItem['actorRole'];
  readonly claimantName: string;
  readonly inviterName: string;
  readonly targetName: string;
}): string {
  if (input.actionState === 'requires_you_response') {
    return 'Pendiente de tu respuesta';
  }

  if (input.actionState === 'requires_you_review') {
    return `${input.claimantName} espera tu validacion`;
  }

  if (input.actionState === 'waiting_sender_review') {
    return `Esperando validacion de ${input.inviterName}`;
  }

  if (input.actionState === 'pending_claim') {
    return `Esperando a ${input.targetName}`;
  }

  return input.actorRole === 'sender'
    ? `Esperando respuesta de ${input.targetName}`
    : 'Solicitud enviada';
}
