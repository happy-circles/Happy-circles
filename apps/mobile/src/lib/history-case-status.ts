import type { HistoryStatusTone } from './history-case-types';

export function historyStatusLabel(status: string): string {
  if (status === 'requires_you') {
    return 'Por responder';
  }

  if (status === 'requires_you_response') {
    return 'Por responder';
  }

  if (status === 'requires_you_review') {
    return 'Por verificar';
  }

  if (status === 'waiting_other_side') {
    return 'En espera';
  }

  if (status === 'waiting_sender_review') {
    return 'En validacion';
  }

  if (status === 'pending_claim') {
    return 'Pendiente';
  }

  if (status === 'pending_activation') {
    return 'Pendiente';
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
    return 'Monto modificado';
  }

  if (status === 'accepted') {
    return 'Aceptada';
  }

  if (status === 'rejected') {
    return 'Rechazada';
  }

  if (status === 'expired') {
    return 'Expirada';
  }

  if (status === 'canceled') {
    return 'Cancelada';
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
