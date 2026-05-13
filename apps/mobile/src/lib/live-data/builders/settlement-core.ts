import type { Database } from '@happy-circles/shared';

import type { SettlementMovement, SettlementProposalRow } from '../types';

export interface SettlementParticipantMovementSummary {
  readonly paidMinor: number;
  readonly receivedMinor: number;
}

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

export function settlementParticipantMovementSummary(
  movements: readonly SettlementMovement[],
  participantUserId: string,
): SettlementParticipantMovementSummary {
  return movements.reduce(
    (totals, movement) => ({
      paidMinor:
        totals.paidMinor +
        (movement.debtor_user_id === participantUserId ? movement.amount_minor : 0),
      receivedMinor:
        totals.receivedMinor +
        (movement.creditor_user_id === participantUserId ? movement.amount_minor : 0),
    }),
    { paidMinor: 0, receivedMinor: 0 },
  );
}

export function settlementParticipantLegAmount(
  summary: SettlementParticipantMovementSummary,
  options: { readonly context: string; readonly requireBalanced: boolean },
): number {
  const hasPayAndReceive = summary.paidMinor > 0 && summary.receivedMinor > 0;
  const shouldValidateBalance = options.requireBalanced || hasPayAndReceive;

  if (
    shouldValidateBalance &&
    (summary.paidMinor !== summary.receivedMinor || (options.requireBalanced && !hasPayAndReceive))
  ) {
    throw new Error(
      `${options.context}: Happy Circle participant amount mismatch ` +
        `(paidMinor=${summary.paidMinor}, receivedMinor=${summary.receivedMinor})`,
    );
  }

  return summary.paidMinor || summary.receivedMinor;
}

export function settlementProposalParticipantAmount(
  proposal: SettlementProposalRow,
  participantUserId: string,
): number {
  const movements = parseSettlementMovements(proposal.movements_json);
  const summary = settlementParticipantMovementSummary(movements, participantUserId);

  return settlementParticipantLegAmount(summary, {
    context: `Settlement proposal ${proposal.id} participant ${participantUserId}`,
    requireBalanced:
      proposal.happy_circle_case_id !== null || proposal.source_graph_cycle_job_id !== null,
  });
}

export function settlementProposalCounterpartyImpactAmount(
  proposal: SettlementProposalRow,
  currentUserId: string,
  counterpartyUserId: string,
): number {
  const movements = parseSettlementMovements(proposal.movements_json);
  const summary = movements.reduce(
    (totals, movement) => ({
      paidMinor:
        totals.paidMinor +
        (movement.debtor_user_id === currentUserId &&
        movement.creditor_user_id === counterpartyUserId
          ? movement.amount_minor
          : 0),
      receivedMinor:
        totals.receivedMinor +
        (movement.creditor_user_id === currentUserId &&
        movement.debtor_user_id === counterpartyUserId
          ? movement.amount_minor
          : 0),
    }),
    { paidMinor: 0, receivedMinor: 0 },
  );

  return Math.max(summary.paidMinor, summary.receivedMinor);
}

export function settlementSavedMovementsCount(
  participantCount: number,
  movementCount: number,
): number {
  return Math.max(participantCount - movementCount, 0);
}
