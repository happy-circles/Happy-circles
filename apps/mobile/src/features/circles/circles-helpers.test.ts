import type { ActiveSettlementPreviewDto } from '@happy-circles/application';
import { describe, expect, it } from 'vitest';

import {
  buildCircleProposalViewModels,
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

  it('classifies a proposal as Esperando when the current user approved and others are pending', () => {
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
      statusLabel: 'Esperando',
    });
  });

  it('classifies an approved proposal as Listo', () => {
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
      statusLabel: 'Listo',
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
});
