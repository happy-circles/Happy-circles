import type { parseSettlementMovements } from './settlement-core';
import { settlementParticipantLegAmount } from './settlement-core';

type SettlementMovementList = ReturnType<typeof parseSettlementMovements>;

export function personalMovementAmount(
  movements: readonly {
    readonly amountMinor: number;
    readonly creditorUserId: string;
    readonly debtorUserId: string;
  }[],
  currentUserId: string,
  options: { readonly context: string; readonly requireBalanced: boolean },
): number {
  const summary = movements.reduce(
    (totals, movement) => ({
      paidMinor:
        totals.paidMinor + (movement.debtorUserId === currentUserId ? movement.amountMinor : 0),
      receivedMinor:
        totals.receivedMinor +
        (movement.creditorUserId === currentUserId ? movement.amountMinor : 0),
    }),
    { paidMinor: 0, receivedMinor: 0 },
  );

  return settlementParticipantLegAmount(summary, options);
}

export function personalMovementCount(
  movements: readonly { readonly creditorUserId: string; readonly debtorUserId: string }[],
  currentUserId: string,
): number {
  return movements.filter(
    (movement) =>
      movement.debtorUserId === currentUserId || movement.creditorUserId === currentUserId,
  ).length;
}

function isReverseSettlementMovement(
  candidate: SettlementMovementList[number],
  movements: readonly SettlementMovementList[number][],
): boolean {
  return movements.some(
    (movement) =>
      movement.debtor_user_id === candidate.creditor_user_id &&
      movement.creditor_user_id === candidate.debtor_user_id,
  );
}

export function circleOriginalMovementsForDisplay(
  originalMovements: SettlementMovementList,
  settlementMovements: SettlementMovementList,
  isHappyCircleProposal: boolean,
): SettlementMovementList {
  if (!isHappyCircleProposal) {
    return originalMovements;
  }

  return originalMovements.filter((movement) =>
    isReverseSettlementMovement(movement, settlementMovements),
  );
}
