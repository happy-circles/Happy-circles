import type { HistoryStatusTone } from './history-case-types';
import { inviteStatusCopy, moneyStatusCopy } from './card-language';

export function historyStatusLabel(status: string): string {
  if (status === 'requires_you') {
    return moneyStatusCopy.requiresYou;
  }

  if (status === 'requires_you_response') {
    return inviteStatusCopy.requiresResponse;
  }

  if (status === 'requires_you_review') {
    return inviteStatusCopy.requiresReview;
  }

  if (status === 'waiting_other_side') {
    return moneyStatusCopy.waitingOtherSide;
  }

  if (status === 'waiting_sender_review') {
    return inviteStatusCopy.waitingSenderReview;
  }

  if (status === 'pending_claim') {
    return inviteStatusCopy.pendingClaim;
  }

  if (status === 'pending_activation') {
    return inviteStatusCopy.pendingActivation;
  }

  if (status === 'pending_approvals') {
    return 'Pendiente';
  }

  if (status === 'approved') {
    return 'Aprobado';
  }

  if (status === 'pending') {
    return 'Pendiente';
  }

  if (status === 'amended') {
    return moneyStatusCopy.amended;
  }

  if (status === 'accepted') {
    return inviteStatusCopy.accepted;
  }

  if (status === 'rejected') {
    return inviteStatusCopy.rejected;
  }

  if (status === 'expired') {
    return inviteStatusCopy.expired;
  }

  if (status === 'canceled') {
    return inviteStatusCopy.canceled;
  }

  if (status === 'stale') {
    return 'Reemplazada';
  }

  if (status === 'executed') {
    return 'Completado';
  }

  if (status === 'posted') {
    return 'Registrado';
  }

  return status;
}

export function historyStatusTone(status: string): HistoryStatusTone {
  if (
    status === 'requires_you' ||
    status === 'requires_you_response' ||
    status === 'requires_you_review' ||
    status === 'pending' ||
    status === 'amended'
  ) {
    return 'warning';
  }

  if (status === 'accepted' || status === 'posted' || status === 'executed') {
    return 'success';
  }

  if (status === 'rejected' || status === 'expired' || status === 'canceled') {
    return 'danger';
  }

  if (status === 'pending_approvals' || status === 'approved') {
    return 'primary';
  }

  return 'neutral';
}
