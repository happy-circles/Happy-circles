import type {
  ActiveSettlementPreviewDto,
  BalanceSettlementMetricsDto,
} from '@happy-circles/application';

import type { SettlementParticipantRow, SettlementProposalRow } from '../types';
import type { AnalyticsRange } from '../utils/dates';
import { computeChangeRatio, dateMs, isWithinRange } from '../utils/dates';
import {
  parseSettlementMovements,
  settlementProposalParticipantCount,
  settlementProposalParticipantAmount,
  settlementSavedMovementsCount,
} from './settlement-core';

export function buildSettlementMetrics(input: {
  readonly proposals: readonly SettlementProposalRow[];
  readonly participantsByProposalId: Map<string, SettlementParticipantRow[]>;
  readonly currentUserId: string;
  readonly visibleCounterpartyUserIds: ReadonlySet<string>;
  readonly names: Map<string, string>;
  readonly activeProposal: ActiveSettlementPreviewDto | null;
  readonly activeProposals: readonly ActiveSettlementPreviewDto[];
  readonly range: AnalyticsRange;
}): BalanceSettlementMetricsDto {
  const participatedProposals = input.proposals.filter((proposal) =>
    (input.participantsByProposalId.get(proposal.id) ?? []).some(
      (participant) => participant.participant_user_id === input.currentUserId,
    ),
  );
  const relevantTimestamp = (proposal: SettlementProposalRow) =>
    dateMs(proposal.executed_at ?? proposal.updated_at ?? proposal.created_at);
  const currentExecuted = participatedProposals.filter((proposal) => {
    if (proposal.status !== 'executed') {
      return false;
    }
    const timeMs = relevantTimestamp(proposal);
    return (
      timeMs !== null && isWithinRange(timeMs, input.range.currentStartMs, input.range.currentEndMs)
    );
  });
  const previousExecuted = participatedProposals.filter((proposal) => {
    if (proposal.status !== 'executed') {
      return false;
    }
    const timeMs = relevantTimestamp(proposal);
    return (
      timeMs !== null &&
      isWithinRange(timeMs, input.range.previousStartMs, input.range.previousEndMs)
    );
  });
  const currentRelevant = participatedProposals.filter((proposal) => {
    const timeMs = relevantTimestamp(proposal);
    return (
      timeMs !== null && isWithinRange(timeMs, input.range.currentStartMs, input.range.currentEndMs)
    );
  });
  const sumProposalPersonal = (proposal: SettlementProposalRow) =>
    settlementProposalParticipantAmount(proposal, input.currentUserId);
  const sumMovementCount = (proposal: SettlementProposalRow) =>
    parseSettlementMovements(proposal.movements_json).length;

  const resolvedMinor = currentExecuted.reduce(
    (total, proposal) => total + sumProposalPersonal(proposal),
    0,
  );
  const previousResolvedMinor = previousExecuted.reduce(
    (total, proposal) => total + sumProposalPersonal(proposal),
    0,
  );
  const movementCount = currentExecuted.reduce(
    (total, proposal) => total + sumMovementCount(proposal),
    0,
  );
  const savedMovementsCount = currentExecuted.reduce((total, proposal) => {
    const participants = input.participantsByProposalId.get(proposal.id) ?? [];
    return (
      total +
      settlementSavedMovementsCount(
        settlementProposalParticipantCount(proposal, participants),
        sumMovementCount(proposal),
      )
    );
  }, 0);

  return {
    activeCount: participatedProposals.filter(
      (proposal) => proposal.status === 'pending_approvals' || proposal.status === 'approved',
    ).length,
    activeProposal: input.activeProposal,
    activeProposals: input.activeProposals,
    resolvedMinor,
    movementCount,
    savedMovementsCount,
    participatedCount: currentRelevant.length,
    previousResolvedMinor,
    changeRatio: computeChangeRatio(resolvedMinor, previousResolvedMinor),
  };
}
