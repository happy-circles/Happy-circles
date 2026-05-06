import type { PersonCardDto } from '@happy-circles/application';
import type { FinancialRequestRow, OpenDebtRow, RelationshipHistoryRow } from '../types';

export function deriveDirection(
  currentUserId: string,
  edge: OpenDebtRow | undefined,
): PersonCardDto['direction'] {
  if (edge) {
    return edge.creditor_user_id === currentUserId ? 'owes_me' : 'i_owe';
  }

  return 'settled';
}

export function requestDirectionForUser(
  request: Pick<FinancialRequestRow, 'creditor_user_id' | 'debtor_user_id'>,
  currentUserId: string,
): 'i_owe' | 'owes_me' {
  return request.creditor_user_id === currentUserId ? 'owes_me' : 'i_owe';
}

export function historyFlowLabelForCurrentUser(
  row: Pick<RelationshipHistoryRow, 'creditor_user_id' | 'debtor_user_id'>,
  currentUserId: string,
): 'entrada' | 'salida' | null {
  if (row.creditor_user_id === currentUserId) {
    return 'entrada';
  }

  if (row.debtor_user_id === currentUserId) {
    return 'salida';
  }

  return null;
}
