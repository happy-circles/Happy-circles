import type { PersonTimelineItemDto } from '@happy-circles/application';
import type { RelationshipHistoryRow } from '../types';
import { formatRelativeLabel } from '../utils/dates';
import { historyFlowLabelForCurrentUser } from '../utils/money-and-direction';

export function historyToneForRow(
  row: RelationshipHistoryRow,
  currentUserId: string,
): PersonTimelineItemDto['tone'] {
  if (row.status === 'rejected' || row.status === 'amended') {
    return 'neutral';
  }

  if (row.creditor_user_id === currentUserId) {
    return 'positive';
  }

  if (row.debtor_user_id === currentUserId) {
    return 'negative';
  }

  return 'neutral';
}

export function sourceTypeForRow(row: RelationshipHistoryRow): 'user' | 'system' {
  if (row.item_kind === 'ledger_transaction' && row.source_type === 'system') {
    return 'system';
  }

  return 'user';
}

export function isHistoryRowVisibleToCurrentUser(
  row: RelationshipHistoryRow,
  currentUserId: string,
  visibleRelationshipIds: ReadonlySet<string>,
): boolean {
  if (!visibleRelationshipIds.has(row.relationship_id)) {
    return false;
  }

  if (row.debtor_user_id === currentUserId || row.creditor_user_id === currentUserId) {
    return true;
  }

  if (row.item_kind === 'financial_request') {
    return row.creator_user_id === currentUserId || row.responder_user_id === currentUserId;
  }

  return false;
}

export function historyKindForTimeline(row: RelationshipHistoryRow): PersonTimelineItemDto['kind'] {
  if (row.item_kind === 'financial_request') {
    return 'request';
  }

  if (row.subtype === 'cycle_settlement') {
    return 'settlement';
  }

  return 'system';
}

export function buildHistoryTitle(
  row: RelationshipHistoryRow,
  counterpartyName: string,
  names: Map<string, string>,
): string {
  const movementFlow = buildMovementFlowLabel(row, names);

  if (row.item_kind === 'financial_request') {
    if (row.status === 'pending') {
      return `Propuesta pendiente con ${counterpartyName}`;
    }

    if (row.status === 'accepted') {
      return `Propuesta aceptada con ${counterpartyName}`;
    }

    if (row.status === 'amended') {
      return `${counterpartyName} propuso un nuevo monto`;
    }

    if (row.status === 'rejected') {
      return `${counterpartyName} no acepto la propuesta`;
    }

    return `Propuesta con ${counterpartyName}`;
  }

  if (
    row.subtype === 'balance_increase_acceptance' ||
    row.subtype === 'transaction_reversal_acceptance'
  ) {
    return movementFlow
      ? `Movimiento registrado: ${movementFlow}`
      : `Movimiento registrado con ${counterpartyName}`;
  }

  if (row.subtype === 'cycle_settlement') {
    return movementFlow
      ? `Happy Circle completado: ${movementFlow}`
      : `Happy Circle con ${counterpartyName}`;
  }

  return movementFlow
    ? `Movimiento confirmado: ${movementFlow}`
    : `Movimiento con ${counterpartyName}`;
}

export function buildMovementFlowLabel(
  row: RelationshipHistoryRow,
  names: Map<string, string>,
): string | null {
  if (!row.debtor_user_id || !row.creditor_user_id) {
    return null;
  }

  const debtor = names.get(row.debtor_user_id) ?? 'Deudor';
  const creditor = names.get(row.creditor_user_id) ?? 'Acreedor';
  return `${debtor} -> ${creditor}`;
}

function buildCycleSettlementStepTitle(
  row: RelationshipHistoryRow,
  currentUserId: string,
  names: Map<string, string>,
): string {
  const debtor = row.debtor_user_id ? (names.get(row.debtor_user_id) ?? 'Deudor') : null;
  const creditor = row.creditor_user_id ? (names.get(row.creditor_user_id) ?? 'Acreedor') : null;

  if (row.debtor_user_id === currentUserId && creditor) {
    return `Pagaste a ${creditor}`;
  }

  if (row.creditor_user_id === currentUserId && debtor) {
    return `${debtor} te pagó`;
  }

  return 'Movimiento de Circle aplicado';
}

export function buildTimelineStepTitle(
  row: RelationshipHistoryRow,
  currentUserId: string,
  counterpartyName: string,
  names: Map<string, string>,
): string {
  const creator =
    row.creator_user_id === currentUserId
      ? 'Tu'
      : row.creator_user_id
        ? (names.get(row.creator_user_id) ?? counterpartyName)
        : 'Sistema';
  const responder =
    row.responder_user_id === currentUserId
      ? 'Tu'
      : row.responder_user_id
        ? (names.get(row.responder_user_id) ?? counterpartyName)
        : 'La otra persona';

  if (row.item_kind === 'financial_request') {
    if (row.status === 'pending') {
      if (row.subtype === 'transaction_reversal') {
        return `${creator} propuso ajustar el movimiento`;
      }

      const flowLabel = historyFlowLabelForCurrentUser(row, currentUserId) ?? 'entrada';
      return `${creator} propuso una ${flowLabel}`;
    }

    if (row.status === 'accepted') {
      if (row.subtype === 'transaction_reversal') {
        return `${responder} acepto el ajuste`;
      }

      if (row.subtype === 'balance_increase') {
        return `${responder} acepto la propuesta`;
      }

      return `${responder} acepto el ajuste`;
    }

    if (row.status === 'amended') {
      return `${responder} propuso un nuevo monto`;
    }

    if (row.status === 'rejected') {
      return `${responder} no acepto la propuesta`;
    }
  }

  if (row.subtype === 'balance_increase_acceptance') {
    const flowLabel = historyFlowLabelForCurrentUser(row, currentUserId) ?? 'entrada';
    return sourceTypeForRow(row) === 'system'
      ? `Sistema registro la ${flowLabel}`
      : `${creator} registro la ${flowLabel}`;
  }

  if (row.subtype === 'transaction_reversal_acceptance') {
    return sourceTypeForRow(row) === 'system'
      ? 'Sistema aplico el ajuste'
      : `${creator} aplico el ajuste`;
  }

  if (row.subtype === 'cycle_settlement') {
    return buildCycleSettlementStepTitle(row, currentUserId, names);
  }

  return buildHistoryTitle(row, counterpartyName, names);
}

export function buildCycleSettlementImpactLabel(row: RelationshipHistoryRow): string | null {
  void row;
  return null;
}

export function buildHistorySubtitle(
  row: RelationshipHistoryRow,
  currentUserId: string,
  counterpartyName: string,
  names: Map<string, string>,
  nowMs: number,
): string {
  const isCycleSettlement = row.subtype === 'cycle_settlement';
  const pieces = [
    isCycleSettlement ? 'Happy Circle' : sourceTypeForRow(row) === 'system' ? 'Sistema' : 'Usuario',
  ];

  const movementFlow = buildMovementFlowLabel(row, names);
  if (movementFlow) {
    pieces.push(movementFlow);
  }

  const cycleImpact = buildCycleSettlementImpactLabel(row);
  if (cycleImpact) {
    pieces.push(cycleImpact);
  }

  if (row.description) {
    pieces.push(row.description);
  }

  pieces.push(formatRelativeLabel(row.happened_at, nowMs));
  return pieces.join(' | ');
}
