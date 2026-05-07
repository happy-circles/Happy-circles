import type { PersonTimelineItemDto } from '@happy-circles/application';

import type { FinancialRequestRow } from '../types';
import { formatRelativeLabel } from '../utils/dates';
import { requestDirectionForUser } from '../utils/money-and-direction';

export function userLabelForRequest(
  userId: string | null | undefined,
  currentUserId: string,
  counterpartyName: string,
  names: Map<string, string>,
  fallback: string,
): string {
  if (!userId) {
    return fallback;
  }

  return userId === currentUserId ? 'Tu' : (names.get(userId) ?? counterpartyName);
}

export function buildRequestFlowLabelFromRequest(
  request: FinancialRequestRow,
  currentUserId: string,
  counterpartyName: string,
  names: Map<string, string>,
): string {
  const creator = userLabelForRequest(
    request.creator_user_id,
    currentUserId,
    counterpartyName,
    names,
    'Persona',
  );
  const responder = userLabelForRequest(
    request.responder_user_id,
    currentUserId,
    counterpartyName,
    names,
    'La otra persona',
  );

  return `${creator} -> ${responder}`;
}

export function buildRequestCreatedTitle(
  request: FinancialRequestRow,
  currentUserId: string,
  counterpartyName: string,
  names: Map<string, string>,
): string {
  const creator = userLabelForRequest(
    request.creator_user_id,
    currentUserId,
    counterpartyName,
    names,
    'Persona',
  );

  if (request.parent_request_id) {
    return `${creator} propuso un nuevo monto`;
  }

  if (request.request_type === 'transaction_reversal') {
    return `${creator} propuso ajustar el movimiento`;
  }

  return `${creator} propuso una ${requestDirectionForUser(request, currentUserId) === 'owes_me' ? 'entrada' : 'salida'}`;
}

export function buildRequestResolutionTitle(
  request: FinancialRequestRow,
  currentUserId: string,
  counterpartyName: string,
  names: Map<string, string>,
): string | null {
  const responder = userLabelForRequest(
    request.responder_user_id,
    currentUserId,
    counterpartyName,
    names,
    'La otra persona',
  );

  if (request.status === 'accepted') {
    if (request.parent_request_id) {
      return `${responder} acepto el nuevo monto`;
    }

    if (request.request_type === 'transaction_reversal') {
      return `${responder} acepto el ajuste`;
    }

    return `${responder} acepto la propuesta`;
  }

  if (request.status === 'rejected') {
    if (request.parent_request_id) {
      return `${responder} no acepto el nuevo monto`;
    }

    if (request.request_type === 'transaction_reversal') {
      return `${responder} no acepto el ajuste`;
    }

    return `${responder} no acepto la propuesta`;
  }

  if (request.status === 'canceled') {
    return 'La propuesta fue cancelada';
  }

  if (request.status === 'expired') {
    return 'La propuesta expiro';
  }

  if (request.status === 'amended') {
    return `${responder} propuso un nuevo monto`;
  }

  return null;
}

export function requestToneForStatus(
  request: FinancialRequestRow,
  currentUserId: string,
  status: FinancialRequestRow['status'],
): PersonTimelineItemDto['tone'] {
  if (
    status === 'rejected' ||
    status === 'amended' ||
    status === 'canceled' ||
    status === 'expired'
  ) {
    return 'neutral';
  }

  if (request.creditor_user_id === currentUserId) {
    return 'positive';
  }

  if (request.debtor_user_id === currentUserId) {
    return 'negative';
  }

  return 'neutral';
}

export function buildRequestEventSubtitle(
  flowLabel: string,
  description: string | null,
  happenedAt: string,
  nowMs: number,
): string {
  return [flowLabel, description ?? 'Sin descripcion', formatRelativeLabel(happenedAt, nowMs)].join(
    ' | ',
  );
}
