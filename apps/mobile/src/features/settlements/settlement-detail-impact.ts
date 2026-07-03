import type { SettlementDetailMovementDto } from '@/lib/live-data';

export interface CircleImpactMovements {
  readonly incomingMovement: SettlementDetailMovementDto | null;
  readonly outgoingMovement: SettlementDetailMovementDto | null;
}

export function circleImpactMovementsForUser(input: {
  readonly currentUserId: string | null;
  readonly movements: readonly SettlementDetailMovementDto[];
}): CircleImpactMovements {
  if (!input.currentUserId) {
    return {
      incomingMovement: null,
      outgoingMovement: null,
    };
  }

  const incomingMovement =
    input.movements.find((movement) => movement.creditorUserId === input.currentUserId) ?? null;
  const outgoingMovement =
    input.movements.find((movement) => movement.debtorUserId === input.currentUserId) ?? null;

  return {
    incomingMovement,
    outgoingMovement,
  };
}
