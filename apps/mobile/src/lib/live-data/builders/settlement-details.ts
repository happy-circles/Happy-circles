import type { SettlementDetailDto } from '../types';
import type {
  HappyCircleScoreEventRow,
  SettlementParticipantRow,
  SettlementProposalRow,
} from '../types-runtime';
import { buildSettlementDetail } from './settlements-runtime';

export function buildSettlementDetailsById(input: {
  readonly proposals: readonly SettlementProposalRow[];
  readonly participantsByProposalId: Map<string, SettlementParticipantRow[]>;
  readonly happyCircleScoreEvents?: readonly HappyCircleScoreEventRow[];
  readonly names: Map<string, string>;
  readonly currentUserId: string;
  readonly visibleCounterpartyUserIds: ReadonlySet<string>;
}): Readonly<Record<string, SettlementDetailDto>> {
  const scoreEventsByProposalId = new Map(
    (input.happyCircleScoreEvents ?? [])
      .filter((event) => event.user_id === input.currentUserId)
      .map((event) => [event.settlement_proposal_id, event]),
  );

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
        scoreEventsByProposalId.get(proposal.id) ?? null,
      ),
    ]),
  );
}
