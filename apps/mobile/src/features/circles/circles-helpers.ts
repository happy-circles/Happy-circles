import type { ActiveSettlementPreviewDto } from '@happy-circles/application';

import { circleStatusCopy } from '@/lib/card-language';
import {
  circleHistoryGroupKey,
  isCircleExecutedProposal,
  isCircleLedgerPosted,
} from '@/lib/cycle-activity';

export type CircleStatusFilter = 'all' | 'needs_me' | 'new' | 'ready' | 'waiting';
export type CircleProposalState = Exclude<CircleStatusFilter, 'all'>;

interface CircleMetricSettlement {
  readonly happyCircleCaseId: string | null;
  readonly id: string;
  readonly participantDecisions: readonly { readonly userId: string }[];
  readonly personalAmountMinor: number;
  readonly personalSavedMovementsCount: number;
  readonly status: string;
}

interface CircleLedgerItem {
  readonly amountMinor?: number;
  readonly category?: string;
  readonly happyCircleCaseId?: string | null;
  readonly id: string;
  readonly kind: string;
  readonly originSettlementProposalId?: string | null;
  readonly status: string;
}

export interface CirclePersonalMetrics {
  readonly closedCircleCount: number;
  readonly ledgerAmountMinor: number;
  readonly savedTransactionCount: number;
}

export interface CircleProposalViewModel {
  readonly approvalLabel: string;
  readonly approvedCount: number;
  readonly movementReductionLabel: string;
  readonly participantLabel: string;
  readonly pendingParticipantLabels: readonly string[];
  readonly priority: number;
  readonly proposal: ActiveSettlementPreviewDto;
  readonly state: CircleProposalState;
  readonly statusLabel: string;
}

export interface CircleStatusCounts {
  readonly all: number;
  readonly needs_me: number;
  readonly new: number;
  readonly ready: number;
  readonly waiting: number;
}

const STATE_PRIORITY: Readonly<Record<CircleProposalState, number>> = {
  needs_me: 0,
  new: 1,
  ready: 2,
  waiting: 3,
};

function firstName(label: string): string {
  return label.trim().split(/\s+/)[0] ?? label;
}

function participantDisplayLabel(
  participant: ActiveSettlementPreviewDto['participantDecisions'][number],
  currentUserId: string | null | undefined,
): string {
  return currentUserId && participant.userId === currentUserId ? 'Tú' : firstName(participant.label);
}

export function buildCirclePersonalMetrics(
  input: {
    readonly currentUserId: string | null | undefined;
    readonly historyItems: readonly CircleLedgerItem[];
    readonly settlementsById: Readonly<Record<string, CircleMetricSettlement>>;
  },
): CirclePersonalMetrics {
  if (!input.currentUserId) {
    return {
      closedCircleCount: 0,
      ledgerAmountMinor: 0,
      savedTransactionCount: 0,
    };
  }

  const circleGroups = new Map<string, CircleLedgerItem[]>();

  for (const item of input.historyItems) {
    if (!item.originSettlementProposalId && !item.happyCircleCaseId) {
      continue;
    }

    const key = circleHistoryGroupKey(item);
    const group = circleGroups.get(key);
    if (group) {
      group.push(item);
    } else {
      circleGroups.set(key, [item]);
    }
  }

  return Array.from(circleGroups.values()).reduce<CirclePersonalMetrics>(
    (metrics, items) => {
      const settlement = settlementForLedgerItems(items, input.settlementsById);
      const isClosed =
        settlement?.status === 'executed' || items.some((item) => isCircleExecutedProposal(item));

      if (!isClosed) {
        return metrics;
      }

      const ledgerItems = items.filter(isCircleLedgerPosted);

      return {
        closedCircleCount: metrics.closedCircleCount + 1,
        ledgerAmountMinor:
          metrics.ledgerAmountMinor +
          (personalLedgerAmountMinor(ledgerItems) || settlement?.personalAmountMinor || 0),
        savedTransactionCount:
          metrics.savedTransactionCount + (settlement?.personalSavedMovementsCount ?? 0),
      };
    },
    {
      closedCircleCount: 0,
      ledgerAmountMinor: 0,
      savedTransactionCount: 0,
    },
  );
}

function settlementForLedgerItems(
  ledgerItems: readonly CircleLedgerItem[],
  settlementsById: Readonly<Record<string, CircleMetricSettlement>>,
): CircleMetricSettlement | undefined {
  for (const item of ledgerItems) {
    if (item.originSettlementProposalId && settlementsById[item.originSettlementProposalId]) {
      return settlementsById[item.originSettlementProposalId];
    }
  }

  const happyCircleCaseId = ledgerItems.find((item) => item.happyCircleCaseId)?.happyCircleCaseId;
  return Object.values(settlementsById).find(
    (settlement) => settlement.happyCircleCaseId === happyCircleCaseId,
  );
}

function personalLedgerAmountMinor(ledgerItems: readonly CircleLedgerItem[]): number {
  return ledgerItems.reduce(
    (maxAmount, item) => Math.max(maxAmount, item.amountMinor ?? 0),
    0,
  );
}

export function circleApprovedCount(proposal: ActiveSettlementPreviewDto): number {
  return proposal.participantDecisions.filter((participant) => participant.decision === 'approved')
    .length;
}

export function circleMovementReductionLabel(proposal: ActiveSettlementPreviewDto): string {
  const optimizedCount = Math.max(0, proposal.movementCount);
  const originalCount = Math.max(optimizedCount, optimizedCount + proposal.savedMovementsCount);

  return `${originalCount} movs -> ${optimizedCount}`;
}

export function resolveCircleProposalState({
  currentUserId,
  isNew,
  proposal,
}: {
  readonly currentUserId: string | null | undefined;
  readonly isNew: boolean;
  readonly proposal: ActiveSettlementPreviewDto;
}): CircleProposalState {
  if (proposal.status === 'approved') {
    return 'ready';
  }

  const myDecision = currentUserId
    ? proposal.participantDecisions.find((participant) => participant.userId === currentUserId)
        ?.decision
    : null;

  if (myDecision === 'pending') {
    return 'needs_me';
  }

  if (isNew) {
    return 'new';
  }

  return 'waiting';
}

export function circleStateLabel(state: CircleProposalState): string {
  if (state === 'needs_me') {
    return circleStatusCopy.requiresYou;
  }

  if (state === 'new') {
    return 'Nuevo';
  }

  if (state === 'ready') {
    return circleStatusCopy.approved;
  }

  return circleStatusCopy.waitingOthers;
}

export function circleParticipantSummary(
  proposal: ActiveSettlementPreviewDto,
  currentUserId: string | null | undefined,
): string {
  const labels = proposal.participantDecisions.map((participant) =>
    participantDisplayLabel(participant, currentUserId),
  );

  if (labels.length === 0) {
    return proposal.title || 'Happy Circle';
  }

  if (labels.length <= 3) {
    return labels.join(' · ');
  }

  return `${labels.slice(0, 3).join(' · ')} · +${labels.length - 3}`;
}

export function buildCircleProposalViewModels({
  currentUserId,
  newCircleProposalIds,
  proposals,
}: {
  readonly currentUserId: string | null | undefined;
  readonly newCircleProposalIds?: ReadonlySet<string>;
  readonly proposals: readonly ActiveSettlementPreviewDto[];
}): readonly CircleProposalViewModel[] {
  return proposals
    .map((proposal) => {
      const state = resolveCircleProposalState({
        currentUserId,
        isNew: Boolean(newCircleProposalIds?.has(proposal.proposalId)),
        proposal,
      });
      const approvedCount = circleApprovedCount(proposal);
      const pendingParticipantLabels = proposal.participantDecisions
        .filter((participant) => participant.decision === 'pending')
        .map((participant) => participantDisplayLabel(participant, currentUserId));

      return {
        approvalLabel: `${approvedCount}/${proposal.participantCount} aprobaciones`,
        approvedCount,
        movementReductionLabel: circleMovementReductionLabel(proposal),
        participantLabel: circleParticipantSummary(proposal, currentUserId),
        pendingParticipantLabels,
        priority: STATE_PRIORITY[state],
        proposal,
        state,
        statusLabel: circleStateLabel(state),
      };
    })
    .sort((left, right) => {
      const priorityDiff = left.priority - right.priority;
      if (priorityDiff !== 0) {
        return priorityDiff;
      }

      return right.proposal.personalAmountMinor - left.proposal.personalAmountMinor;
    });
}

export function circleStatusCounts(
  items: readonly Pick<CircleProposalViewModel, 'state'>[],
): CircleStatusCounts {
  return items.reduce<CircleStatusCounts>(
    (counts, item) => ({
      ...counts,
      [item.state]: counts[item.state] + 1,
      all: counts.all + 1,
    }),
    { all: 0, needs_me: 0, new: 0, ready: 0, waiting: 0 },
  );
}

export function filterCircleProposalViewModels(
  items: readonly CircleProposalViewModel[],
  filter: CircleStatusFilter,
): readonly CircleProposalViewModel[] {
  return filter === 'all' ? items : items.filter((item) => item.state === filter);
}
