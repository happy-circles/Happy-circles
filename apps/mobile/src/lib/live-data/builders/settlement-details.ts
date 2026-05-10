import type { SettlementDetailDto } from '../types';
import type { SettlementParticipantRow, SettlementProposalRow } from '../types-runtime';
import { buildSettlementDetail } from './settlements-runtime';

export function buildSettlementDetailsById(input: {
  readonly proposals: readonly SettlementProposalRow[];
  readonly participantsByProposalId: Map<string, SettlementParticipantRow[]>;
  readonly names: Map<string, string>;
  readonly currentUserId: string;
  readonly visibleCounterpartyUserIds: ReadonlySet<string>;
}): Readonly<Record<string, SettlementDetailDto>> {
  return Object.fromEntries(
    input.proposals.map((proposal) => [
      proposal.id,
      buildSettlementDetail(
        proposal,
        input.participantsByProposalId.get(proposal.id) ?? [],
        input.names,
        input.currentUserId,
        input.visibleCounterpartyUserIds,
        input.proposals,
        input.participantsByProposalId,
      ),
    ]),
  );
}
