import type { ActiveSettlementPreviewDto } from '@happy-circles/application';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  Platform: {
    OS: 'web',
    select: (options: Record<string, unknown>) => options.web ?? options.default,
  },
}));

import {
  buildCircleProposalViewModels,
  buildCirclePersonalMetrics,
  circleMovementReductionLabel,
} from './circles-helpers';

const CURRENT_USER_ID = 'user-me';

function proposal(
  value: Partial<ActiveSettlementPreviewDto> & {
    readonly participantDecisions: ActiveSettlementPreviewDto['participantDecisions'];
    readonly proposalId: string;
  },
): ActiveSettlementPreviewDto {
  const { participantDecisions, proposalId, ...overrides } = value;

  return {
    approvalsPending: value.participantDecisions.filter(
      (participant) => participant.decision === 'pending',
    ).length,
    happyCircleCaseId: null,
    isCurrentVersion: true,
    movementCount: 1,
    participantCount: participantDecisions.length,
    participantDecisions,
    participantLabels: participantDecisions.map((participant) => participant.label),
    participantUserIds: participantDecisions.map((participant) => participant.userId),
    personalAmountMinor: 18000000,
    proposalId,
    replacedByProposalId: null,
    replacesProposalId: null,
    savedMovementsCount: 2,
    staleReason: null,
    status: 'pending_approvals',
    subtitle: 'Con Ana y Carlos',
    title: 'Happy Circle',
    totalAmountMinor: 18000000,
    versionNumber: null,
    ...overrides,
  };
}

function participant(
  userId: string,
  decision: 'approved' | 'pending' | 'rejected',
  label = userId,
): ActiveSettlementPreviewDto['participantDecisions'][number] {
  return { decision, label, userId };
}

describe('circles helpers', () => {
  it('classifies a proposal as Por aprobar when the current user is pending', () => {
    const [item] = buildCircleProposalViewModels({
      currentUserId: CURRENT_USER_ID,
      proposals: [
        proposal({
          participantDecisions: [
            participant(CURRENT_USER_ID, 'pending', 'Samuel'),
            participant('user-ana', 'approved', 'Ana'),
          ],
          proposalId: 'proposal-1',
        }),
      ],
    });

    expect(item).toMatchObject({
      state: 'needs_me',
      statusLabel: 'Por aprobar',
    });
  });

  it('classifies a proposal as waiting when the current user approved and others are pending', () => {
    const [item] = buildCircleProposalViewModels({
      currentUserId: CURRENT_USER_ID,
      proposals: [
        proposal({
          participantDecisions: [
            participant(CURRENT_USER_ID, 'approved', 'Samuel'),
            participant('user-ana', 'pending', 'Ana María'),
          ],
          proposalId: 'proposal-1',
        }),
      ],
    });

    expect(item).toMatchObject({
      pendingParticipantLabels: ['Ana'],
      state: 'waiting',
      statusLabel: 'Esperando aprobaciones',
    });
  });

  it('classifies an approved proposal as ready to complete', () => {
    const [item] = buildCircleProposalViewModels({
      currentUserId: CURRENT_USER_ID,
      proposals: [
        proposal({
          participantDecisions: [
            participant(CURRENT_USER_ID, 'approved', 'Samuel'),
            participant('user-ana', 'approved', 'Ana'),
          ],
          proposalId: 'proposal-1',
          status: 'approved',
        }),
      ],
    });

    expect(item).toMatchObject({
      state: 'ready',
      statusLabel: 'Listo para completar',
    });
  });

  it('orders proposals by action priority before amount', () => {
    const items = buildCircleProposalViewModels({
      currentUserId: CURRENT_USER_ID,
      newCircleProposalIds: new Set(['new-proposal']),
      proposals: [
        proposal({
          participantDecisions: [
            participant(CURRENT_USER_ID, 'approved', 'Samuel'),
            participant('user-ana', 'pending', 'Ana'),
          ],
          proposalId: 'waiting-proposal',
          totalAmountMinor: 90000000,
        }),
        proposal({
          participantDecisions: [
            participant(CURRENT_USER_ID, 'approved', 'Samuel'),
            participant('user-ana', 'approved', 'Ana'),
          ],
          proposalId: 'ready-proposal',
          status: 'approved',
          totalAmountMinor: 100000000,
        }),
        proposal({
          participantDecisions: [
            participant(CURRENT_USER_ID, 'pending', 'Samuel'),
            participant('user-ana', 'approved', 'Ana'),
          ],
          proposalId: 'needs-me-proposal',
          totalAmountMinor: 1000000,
        }),
        proposal({
          participantDecisions: [
            participant(CURRENT_USER_ID, 'approved', 'Samuel'),
            participant('user-ana', 'pending', 'Ana'),
          ],
          proposalId: 'new-proposal',
          totalAmountMinor: 2000000,
        }),
      ],
    });

    expect(items.map((item) => item.proposal.proposalId)).toEqual([
      'needs-me-proposal',
      'new-proposal',
      'ready-proposal',
      'waiting-proposal',
    ]);
  });

  it('builds movement reduction labels from original to optimized movements', () => {
    expect(
      circleMovementReductionLabel(
        proposal({
          movementCount: 1,
          participantDecisions: [
            participant(CURRENT_USER_ID, 'approved', 'Samuel'),
            participant('user-ana', 'pending', 'Ana'),
          ],
          proposalId: 'proposal-1',
          savedMovementsCount: 2,
        }),
      ),
    ).toBe('3 movs -> 1');
  });

  it('builds personal header metrics from posted Circle transactions', () => {
    const metrics = buildCirclePersonalMetrics({
      currentUserId: CURRENT_USER_ID,
      historyItems: [
        {
          amountMinor: 3600000,
          category: 'cycle',
          happyCircleCaseId: 'case-1',
          id: 'ledger-1',
          kind: 'settlement',
          originSettlementProposalId: 'settlement-1',
          status: 'posted',
        },
        {
          amountMinor: 1200000,
          category: 'cycle',
          happyCircleCaseId: 'case-1',
          id: 'ledger-2',
          kind: 'settlement',
          originSettlementProposalId: 'settlement-1',
          status: 'posted',
        },
        {
          amountMinor: 900000,
          category: 'cycle',
          happyCircleCaseId: 'case-2',
          id: 'ledger-other',
          kind: 'settlement',
          originSettlementProposalId: 'settlement-other',
          status: 'rejected',
        },
        {
          amountMinor: 7200000,
          category: 'cycle',
          happyCircleCaseId: 'case-1',
          id: 'stale-proposal',
          kind: 'settlement',
          originSettlementProposalId: 'settlement-old',
          status: 'stale',
        },
      ],
      settlementsById: {
        'settlement-1': {
          happyCircleCaseId: 'case-1',
          id: 'settlement-1',
          participantDecisions: [participant(CURRENT_USER_ID, 'approved', 'Samuel')],
          personalAmountMinor: 1200000,
          personalSavedMovementsCount: 2,
          status: 'executed',
        },
      },
    });

    expect(metrics).toEqual({
      closedCircleCount: 1,
      ledgerAmountMinor: 3600000,
      savedTransactionCount: 2,
    });
  });

  it('does not count ledger-only legacy rows as closed without an executed settlement', () => {
    const metrics = buildCirclePersonalMetrics({
      currentUserId: CURRENT_USER_ID,
      historyItems: [
        {
          amountMinor: 500000,
          category: 'cycle',
          id: 'ledger-1',
          kind: 'settlement',
          originSettlementProposalId: 'legacy-settlement',
          status: 'posted',
        },
        {
          amountMinor: 500000,
          category: 'cycle',
          id: 'ledger-2',
          kind: 'settlement',
          originSettlementProposalId: 'legacy-settlement',
          status: 'posted',
        },
      ],
      settlementsById: {},
    });

    expect(metrics).toEqual({
      closedCircleCount: 0,
      ledgerAmountMinor: 0,
      savedTransactionCount: 0,
    });
  });

  it('does not count a replaced Circle as closed even if ledger rows exist in the same case', () => {
    const metrics = buildCirclePersonalMetrics({
      currentUserId: CURRENT_USER_ID,
      historyItems: [
        {
          amountMinor: 500000,
          category: 'cycle',
          happyCircleCaseId: 'case-1',
          id: 'ledger-1',
          kind: 'settlement',
          originSettlementProposalId: 'proposal-1',
          status: 'posted',
        },
        {
          amountMinor: 700000,
          category: 'cycle',
          happyCircleCaseId: 'case-1',
          id: 'stale',
          kind: 'settlement',
          originSettlementProposalId: 'proposal-2',
          status: 'stale',
        },
      ],
      settlementsById: {
        'proposal-2': {
          happyCircleCaseId: 'case-1',
          id: 'proposal-2',
          participantDecisions: [participant(CURRENT_USER_ID, 'approved', 'Samuel')],
          personalAmountMinor: 700000,
          personalSavedMovementsCount: 1,
          status: 'stale',
        },
      },
    });

    expect(metrics).toEqual({
      closedCircleCount: 0,
      ledgerAmountMinor: 0,
      savedTransactionCount: 0,
    });
  });

  it('does not count lifecycle-only Circle rows as closed metrics', () => {
    const metrics = buildCirclePersonalMetrics({
      currentUserId: CURRENT_USER_ID,
      historyItems: [
        {
          amountMinor: 5000000,
          category: 'cycle',
          happyCircleCaseId: 'case-1',
          id: 'rejected',
          kind: 'settlement',
          originSettlementProposalId: 'proposal-1',
          status: 'rejected',
        },
        {
          amountMinor: 7000000,
          category: 'cycle',
          happyCircleCaseId: 'case-1',
          id: 'stale',
          kind: 'settlement',
          originSettlementProposalId: 'proposal-2',
          status: 'stale',
        },
      ],
      settlementsById: {},
    });

    expect(metrics).toEqual({
      closedCircleCount: 0,
      ledgerAmountMinor: 0,
      savedTransactionCount: 0,
    });
  });
});
