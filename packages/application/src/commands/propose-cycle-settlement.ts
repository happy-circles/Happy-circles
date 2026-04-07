import type { CycleSettlementDraft } from '@happy-circles/domain';
import { detectCycleSettlementDrafts } from '@happy-circles/domain';

import type { SettlementRepository } from '../ports';

export async function proposeCycleSettlementCommand(
  deps: { readonly settlements: SettlementRepository },
  maxCycles = 5,
): Promise<readonly CycleSettlementDraft[]> {
  const edges = await deps.settlements.listAuthoritativeEdges();
  return detectCycleSettlementDrafts(edges, maxCycles);
}
