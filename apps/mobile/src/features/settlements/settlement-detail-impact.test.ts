import { describe, expect, it } from 'vitest';

import type { SettlementDetailMovementDto } from '@/lib/live-data';
import { circleImpactMovementsForUser } from './settlement-detail-impact';

function movement(value: Partial<SettlementDetailMovementDto>): SettlementDetailMovementDto {
  return {
    amountMinor: 7000000,
    creditorLabel: 'Creditor',
    creditorUserId: 'creditor',
    debtorLabel: 'Debtor',
    debtorUserId: 'debtor',
    id: 'movement',
    ...value,
  };
}

describe('circleImpactMovementsForUser', () => {
  it('uses the final Circle movement direction for Te pagan and Pagas', () => {
    const currentUserId = 'user-me';
    const incoming = movement({
      creditorLabel: 'Tu',
      creditorUserId: currentUserId,
      debtorLabel: 'Ana',
      debtorUserId: 'user-ana',
      id: 'incoming',
    });
    const outgoing = movement({
      creditorLabel: 'Carlos',
      creditorUserId: 'user-carlos',
      debtorLabel: 'Tu',
      debtorUserId: currentUserId,
      id: 'outgoing',
    });

    const result = circleImpactMovementsForUser({
      currentUserId,
      movements: [incoming, outgoing],
    });

    expect(result.incomingMovement).toBe(incoming);
    expect(result.outgoingMovement).toBe(outgoing);
  });
});
