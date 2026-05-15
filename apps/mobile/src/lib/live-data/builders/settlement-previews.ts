import type { ActiveSettlementPreviewDto } from '@happy-circles/application';
import type { SettlementParticipantRow, SettlementProposalRow } from '../types';
import {
  parseSettlementMovements,
  settlementProposalApprovalsPending,
  settlementProposalParticipantCount,
  settlementProposalParticipantAmount,
  settlementSavedMovementsCount,
} from './settlement-core';
import {
  buildSettlementParticipantLabels,
  normalizeSettlementDetailDecision,
  settlementParticipantLabel,
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
    const movements = parseSettlementMovements(proposal.movements_json);
    const personalMovements = movements.filter(
      (movement) =>
        movement.debtor_user_id === input.currentUserId ||
        movement.creditor_user_id === input.currentUserId,
    );
    const directCounterpartyUserIds = new Set(
      personalMovements.flatMap((movement) => [movement.debtor_user_id, movement.creditor_user_id]),
    );
    directCounterpartyUserIds.delete(input.currentUserId);
    const visibleParticipants = participants.filter(
      (participant) =>
        participant.participant_user_id === input.currentUserId ||
        directCounterpartyUserIds.has(participant.participant_user_id),
    );
    const participantUserIds = visibleParticipants.map(
      (participant) => participant.participant_user_id,
    );
    const participantLabel = (participantUserId: string) =>
      participantUserId === input.currentUserId || directCounterpartyUserIds.has(participantUserId)
        ? (settlementParticipantLabel({
            participantUserId,
            currentUserId: input.currentUserId,
            visibleCounterpartyUserIds: new Set([
              ...input.visibleCounterpartyUserIds,
              participantUserId,
            ]),
            names: input.names,
          }) ?? 'Persona')
        : 'Happy';
    const participantLabels = buildSettlementParticipantLabels({
      participantUserIds,
      currentUserId: input.currentUserId,
      visibleCounterpartyUserIds: new Set([
        ...input.visibleCounterpartyUserIds,
        ...participantUserIds,
      ]),
      names: input.names,
    });
    const approvalsPending = settlementProposalApprovalsPending(proposal, participants);
    const participantCount = settlementProposalParticipantCount(proposal, participants);
    const movementCount = personalMovements.length;
    const incomingMovement =
      personalMovements.find((movement) => movement.creditor_user_id === input.currentUserId) ??
      null;
    const outgoingMovement =
      personalMovements.find((movement) => movement.debtor_user_id === input.currentUserId) ?? null;
    const participantDecisions = visibleParticipants.map((participant, index) => ({
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
          : `Con ${summarizeSettlementParticipants(participantLabels)} faltan ${approvalsPending} ${approvalsPending === 1 ? 'aprobación' : 'aprobaciones'}.`,
      totalAmountMinor: settlementProposalParticipantAmount(proposal, input.currentUserId),
      personalAmountMinor: settlementProposalParticipantAmount(proposal, input.currentUserId),
      approvalsPending,
      movementCount,
      savedMovementsCount: settlementSavedMovementsCount(participantCount, movementCount),
      participantCount,
      participantUserIds,
      participantLabels,
      participantDecisions,
      incomingConnection: incomingMovement
        ? {
            amountMinor: incomingMovement.amount_minor,
            label: participantLabel(incomingMovement.debtor_user_id),
            userId: incomingMovement.debtor_user_id,
          }
        : null,
      outgoingConnection: outgoingMovement
        ? {
            amountMinor: outgoingMovement.amount_minor,
            label: participantLabel(outgoingMovement.creditor_user_id),
            userId: outgoingMovement.creditor_user_id,
          }
        : null,
    };
  });
}
