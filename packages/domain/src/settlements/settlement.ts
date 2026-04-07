import type {
  ParticipantDecision,
  ProposalStatus,
  SettlementExecutionId,
  SettlementProposalId,
  UserId,
} from '@happy-circles/shared';

import { DomainError } from '../common/domain-error';
import type { CycleSettlementMovement } from '../graph/pair-net-edge';

export interface SettlementParticipant {
  readonly participantUserId: UserId;
  readonly decision: ParticipantDecision;
}

export interface SettlementProposal {
  readonly id: SettlementProposalId;
  readonly createdByUserId: UserId;
  readonly status: ProposalStatus;
  readonly graphSnapshotHash: string;
  readonly participantUserIds: readonly UserId[];
  readonly participants: readonly SettlementParticipant[];
  readonly movements: readonly CycleSettlementMovement[];
}

export interface SettlementExecution {
  readonly id: SettlementExecutionId;
  readonly proposalId: SettlementProposalId;
  readonly executedByUserId: UserId;
}

export function approveSettlementProposal(
  proposal: SettlementProposal,
  actorUserId: UserId,
): SettlementProposal {
  assertPendingProposal(proposal);

  const participants = proposal.participants.map((participant) =>
    participant.participantUserId === actorUserId
      ? { ...participant, decision: 'approved' as const }
      : participant,
  );

  const status = participants.every((participant) => participant.decision === 'approved')
    ? 'approved'
    : 'pending_approvals';

  return { ...proposal, participants, status };
}

export function rejectSettlementProposal(
  proposal: SettlementProposal,
  actorUserId: UserId,
): SettlementProposal {
  assertPendingProposal(proposal);

  return {
    ...proposal,
    participants: proposal.participants.map((participant) =>
      participant.participantUserId === actorUserId
        ? { ...participant, decision: 'rejected' as const }
        : participant,
    ),
    status: 'rejected',
  };
}

function assertPendingProposal(proposal: SettlementProposal): void {
  if (proposal.status !== 'pending_approvals' && proposal.status !== 'approved') {
    throw new DomainError(
      'settlement.invalid_status_transition',
      `Cannot update proposal ${proposal.id} in status ${proposal.status}.`,
    );
  }
}
