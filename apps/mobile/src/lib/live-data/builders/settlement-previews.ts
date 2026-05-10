import type { ActiveSettlementPreviewDto } from '@happy-circles/application';
import type { SettlementParticipantRow, SettlementProposalRow } from '../types';
import {
  parseSettlementMovements,
  settlementProposalParticipantAmount,
  settlementProposalTotalAmount,
  settlementSavedMovementsCount,
} from './settlement-core';
import {
  buildSettlementParticipantLabels,
  normalizeSettlementDetailDecision,
  summarizeSettlementParticipants,
} from './settlements-runtime';
import { isCurrentSettlementVersion } from './settlement-versions';

export function buildActiveSettlementPreviews(input: {
  readonly proposals: readonly SettlementProposalRow[];
  readonly participantsByProposalId: Map<string, SettlementParticipantRow[]>;
  readonly currentUserId: string;
  readonly visibleCounterpartyUserIds: ReadonlySet<string>;
  readonly names: Map<string, string>;
}): readonly ActiveSettlementPreviewDto[] {
  const activeProposalsByCase = new Map<string, SettlementProposalRow>();
  const activeProposals = input.proposals
    .filter((proposal) => proposal.status === 'pending_approvals' || proposal.status === 'approved')
    .filter((proposal) => proposal.replaced_by_proposal_id === null)
    .filter((proposal) =>
      (input.participantsByProposalId.get(proposal.id) ?? []).some(
        (participant) => participant.participant_user_id === input.currentUserId,
      ),
    )
    .sort((left, right) => {
      const leftPriority = left.status === 'approved' ? 0 : 1;
      const rightPriority = right.status === 'approved' ? 0 : 1;
      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }

      return Date.parse(right.updated_at) - Date.parse(left.updated_at);
    });

  for (const proposal of activeProposals) {
    const key = proposal.happy_circle_case_id ?? proposal.id;
    if (!activeProposalsByCase.has(key)) {
      activeProposalsByCase.set(key, proposal);
    }
  }

  return Array.from(activeProposalsByCase.values()).map((proposal) => {
    const participants = input.participantsByProposalId.get(proposal.id) ?? [];
    const participantUserIds = participants.map((participant) => participant.participant_user_id);
    const participantLabels = buildSettlementParticipantLabels({
      participantUserIds,
      currentUserId: input.currentUserId,
      visibleCounterpartyUserIds: input.visibleCounterpartyUserIds,
      names: input.names,
    });
    const approvalsPending = participants.filter(
      (participant) => participant.decision === 'pending',
    ).length;
    const movementCount = parseSettlementMovements(proposal.movements_json).length;
    const participantDecisions = participants.map((participant, index) => ({
      userId: participant.participant_user_id,
      label: participantLabels[index] ?? 'Persona',
      decision: normalizeSettlementDetailDecision(participant.decision),
    }));

    return {
      proposalId: proposal.id,
      happyCircleCaseId: proposal.happy_circle_case_id,
      versionNumber: proposal.version_number,
      isCurrentVersion: isCurrentSettlementVersion(proposal),
      replacesProposalId: proposal.replaces_proposal_id,
      replacedByProposalId: proposal.replaced_by_proposal_id,
      staleReason: proposal.stale_reason,
      status: proposal.status === 'approved' ? 'approved' : 'pending_approvals',
      title: proposal.status === 'approved' ? 'Happy Circle listo' : 'Happy Circle pendiente',
      subtitle:
        proposal.status === 'approved'
          ? `Con ${summarizeSettlementParticipants(participantLabels)} se completara automaticamente.`
          : `Con ${summarizeSettlementParticipants(participantLabels)} faltan ${approvalsPending} aprobacion${approvalsPending === 1 ? '' : 'es'}.`,
      totalAmountMinor: settlementProposalTotalAmount(proposal),
      personalAmountMinor: settlementProposalParticipantAmount(proposal, input.currentUserId),
      approvalsPending,
      movementCount,
      savedMovementsCount: settlementSavedMovementsCount(participants.length, movementCount),
      participantCount: participants.length,
      participantUserIds,
      participantLabels,
      participantDecisions,
    };
  });
}
