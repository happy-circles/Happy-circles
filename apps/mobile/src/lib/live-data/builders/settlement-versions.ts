import type {
  SettlementParticipantRow,
  SettlementProposalRow,
  SettlementVersionTimelineItemDto,
} from '../types';
import {
  settlementProposalApprovalsPending,
  settlementProposalParticipantAmount,
} from './settlement-core';

function settlementVersionTitle(versionNumber: number | null): string {
  return versionNumber ? `Versión ${versionNumber}` : 'Versión';
}

export function staleReasonDetail(reason: string | null): string {
  if (reason === 'participant_set_changed') {
    return 'Cambio de participantes.';
  }
  if (reason === 'related_execution_changed_balance') {
    return 'Otra ejecucion cambio saldos.';
  }
  if (reason === 'reserved_capacity_lost') {
    return 'El monto reservado ya no esta disponible.';
  }

  return 'Saldos nuevos.';
}

export function isCurrentSettlementVersion(proposal: SettlementProposalRow): boolean {
  return proposal.replaced_by_proposal_id === null;
}

function settlementVersionDetail(input: {
  readonly proposal: SettlementProposalRow;
  readonly approvalsPending: number;
}): string {
  if (input.proposal.status === 'pending_approvals') {
    return `Faltan ${input.approvalsPending} ${input.approvalsPending === 1 ? 'aprobación' : 'aprobaciones'}.`;
  }
  if (input.proposal.status === 'approved') {
    return 'Aprobada.';
  }
  if (input.proposal.status === 'executed') {
    return 'Movimientos registrados.';
  }
  if (input.proposal.status === 'rejected') {
    return 'No se aplicó.';
  }
  if (input.proposal.status === 'stale') {
    return staleReasonDetail(input.proposal.stale_reason);
  }
  if (input.proposal.status === 'expired') {
    return 'Expiro sin cambios.';
  }

  const status: string = input.proposal.status;
  return `Estado: ${status}.`;
}

function sortSettlementProposalsByVersion(
  proposals: readonly SettlementProposalRow[],
): SettlementProposalRow[] {
  return [...proposals].sort((left, right) => {
    const leftVersion = left.version_number ?? Number.MAX_SAFE_INTEGER;
    const rightVersion = right.version_number ?? Number.MAX_SAFE_INTEGER;
    if (leftVersion !== rightVersion) {
      return leftVersion - rightVersion;
    }

    return Date.parse(left.created_at) - Date.parse(right.created_at);
  });
}

function isSameVisibleSettlementResult(
  previous: SettlementProposalRow,
  next: SettlementProposalRow,
): boolean {
  return Boolean(
    previous.result_hash && next.result_hash && previous.result_hash === next.result_hash,
  );
}

function buildVisibleSettlementVersionGroups(
  proposals: readonly SettlementProposalRow[],
): readonly {
  readonly displayVersionNumber: number;
  readonly proposal: SettlementProposalRow;
}[] {
  const groups: SettlementProposalRow[][] = [];

  for (const proposal of sortSettlementProposalsByVersion(proposals)) {
    const currentGroup = groups[groups.length - 1];
    const previousProposal = currentGroup?.[currentGroup.length - 1];

    if (
      currentGroup &&
      previousProposal &&
      isSameVisibleSettlementResult(previousProposal, proposal)
    ) {
      currentGroup.push(proposal);
      continue;
    }

    groups.push([proposal]);
  }

  return groups.map((group, index) => ({
    displayVersionNumber: index + 1,
    proposal: group[group.length - 1],
  }));
}

function participantIdSet(participants: readonly SettlementParticipantRow[]): ReadonlySet<string> {
  return new Set(participants.map((participant) => participant.participant_user_id));
}

function countAddedParticipants(
  previousParticipants: readonly SettlementParticipantRow[],
  currentParticipants: readonly SettlementParticipantRow[],
): number {
  const previousIds = participantIdSet(previousParticipants);

  return currentParticipants.filter(
    (participant) => !previousIds.has(participant.participant_user_id),
  ).length;
}

function countRemovedParticipants(
  previousParticipants: readonly SettlementParticipantRow[],
  currentParticipants: readonly SettlementParticipantRow[],
): number {
  const currentIds = participantIdSet(currentParticipants);

  return previousParticipants.filter(
    (participant) => !currentIds.has(participant.participant_user_id),
  ).length;
}

function countCarriedApprovals(participants: readonly SettlementParticipantRow[]): number {
  return participants.filter(
    (participant) =>
      participant.decision === 'approved' && participant.decision_source === 'carried',
  ).length;
}

export function buildSettlementVersionTimeline(input: {
  readonly proposal: SettlementProposalRow;
  readonly allProposals: readonly SettlementProposalRow[];
  readonly participantsByProposalId: Map<string, SettlementParticipantRow[]>;
  readonly currentUserId: string;
}): readonly SettlementVersionTimelineItemDto[] {
  const caseProposals = input.proposal.happy_circle_case_id
    ? input.allProposals.filter(
        (candidate) => candidate.happy_circle_case_id === input.proposal.happy_circle_case_id,
      )
    : [input.proposal];
  const uniqueById = new Map<string, SettlementProposalRow>();

  for (const proposal of caseProposals) {
    uniqueById.set(proposal.id, proposal);
  }

  const visibleGroups = buildVisibleSettlementVersionGroups(Array.from(uniqueById.values()));

  return visibleGroups.map(({ displayVersionNumber, proposal }, index) => {
    const previousProposal = visibleGroups[index - 1]?.proposal ?? null;
    const previousParticipants = previousProposal
      ? (input.participantsByProposalId.get(previousProposal.id) ?? [])
      : [];
    const participants = input.participantsByProposalId.get(proposal.id) ?? [];
    const approvalsPending = settlementProposalApprovalsPending(proposal, participants);
    const isCurrent = isCurrentSettlementVersion(proposal);
    const amountMinor = settlementProposalParticipantAmount(proposal, input.currentUserId);
    const previousAmountMinor = previousProposal
      ? settlementProposalParticipantAmount(previousProposal, input.currentUserId)
      : undefined;
    const addedParticipantCount = previousProposal
      ? countAddedParticipants(previousParticipants, participants)
      : undefined;
    const removedParticipantCount = previousProposal
      ? countRemovedParticipants(previousParticipants, participants)
      : undefined;
    const carriedApprovalCount = countCarriedApprovals(participants);

    return {
      proposalId: proposal.id,
      versionNumber: proposal.version_number,
      displayVersionNumber,
      status: proposal.status,
      title: settlementVersionTitle(displayVersionNumber),
      detail: settlementVersionDetail({ proposal, approvalsPending }),
      amountMinor,
      previousAmountMinor,
      amountChanged:
        typeof previousAmountMinor === 'number' ? previousAmountMinor !== amountMinor : undefined,
      addedParticipantCount,
      removedParticipantCount,
      carriedApprovalCount,
      createdAt: proposal.created_at,
      updatedAt: proposal.updated_at,
      isCurrent,
      replacesProposalId: proposal.replaces_proposal_id,
      replacedByProposalId: proposal.replaced_by_proposal_id,
      staleReason: proposal.stale_reason,
    };
  });
}
