import type { Database } from '@happy-circles/shared';

import type { SettlementMovement, SettlementProposalRow } from '../types';

export function parseSettlementMovements(
  value: Database['public']['Tables']['settlement_proposals']['Row']['movements_json'],
) {
  if (!Array.isArray(value)) {
    return [] as SettlementMovement[];
  }

  return value.flatMap((entry) => {
    if (Array.isArray(entry) || typeof entry !== 'object' || entry === null) {
      return [];
    }

    const debtorUserId = entry['debtor_user_id'];
    const creditorUserId = entry['creditor_user_id'];
    const amountMinor = entry['amount_minor'];

    if (
      typeof debtorUserId === 'string' &&
      typeof creditorUserId === 'string' &&
      typeof amountMinor === 'number'
    ) {
      return [
        {
          debtor_user_id: debtorUserId,
          creditor_user_id: creditorUserId,
          amount_minor: amountMinor,
        },
      ];
    }

    return [];
  });
}

export function settlementProposalTotalAmount(proposal: SettlementProposalRow): number {
  return parseSettlementMovements(proposal.movements_json).reduce(
    (total, movement) => total + movement.amount_minor,
    0,
  );
}

export function settlementProposalParticipantAmount(
  proposal: SettlementProposalRow,
  participantUserId: string,
): number {
  return parseSettlementMovements(proposal.movements_json).reduce((total, movement) => {
    if (
      movement.debtor_user_id === participantUserId ||
      movement.creditor_user_id === participantUserId
    ) {
      return total + movement.amount_minor;
    }

    return total;
  }, 0);
}

export function settlementSavedMovementsCount(
  participantCount: number,
  movementCount: number,
): number {
  return Math.max(participantCount - movementCount, 0);
}
