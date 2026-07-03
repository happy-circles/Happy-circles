import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  Platform: {
    OS: 'web',
    select: (options: Record<string, unknown>) => options.web ?? options.default,
  },
}));

import type {
  ActionableItem,
  RelationshipRow,
  SettlementParticipantRow,
  SettlementProposalRow,
} from '../types';
import { buildPeopleState } from './people';

const CURRENT_USER_ID = 'user-me';
const NOW = Date.parse('2026-05-05T12:00:00.000Z');

function row<T>(value: Partial<T>): T {
  return value as T;
}

function relationship(id: string): RelationshipRow {
  return row<RelationshipRow>({ id });
}

function participant(
  proposalId: string,
  userId: string,
  decision: SettlementParticipantRow['decision'] = 'pending',
): SettlementParticipantRow {
  return row<SettlementParticipantRow>({
    id: `${proposalId}:${userId}`,
    participant_user_id: userId,
    settlement_proposal_id: proposalId,
    decision,
  });
}

function proposal(value: Partial<SettlementProposalRow>): SettlementProposalRow {
  return row<SettlementProposalRow>({
    created_at: '2026-05-04T12:00:00.000Z',
    executed_at: null,
    happy_circle_case_id: 'case-1',
    id: 'proposal-1',
    movements_json: [],
    replaced_by_proposal_id: null,
    replaces_proposal_id: null,
    stale_reason: null,
    status: 'pending_approvals',
    updated_at: '2026-05-04T12:00:00.000Z',
    ...value,
  });
}

function pendingSettlement(value: Partial<ActionableItem>): ActionableItem {
  return {
    category: 'cycle',
    createdAt: '2026-05-04T12:00:00.000Z',
    ctaLabel: 'Revisar',
    href: '/settlements/proposal-1',
    id: 'proposal-1',
    kind: 'settlement_proposal',
    originSettlementProposalId: 'proposal-1',
    participantUserIds: [CURRENT_USER_ID, 'user-ana', 'user-carlos', 'user-sofia'],
    status: 'pending_approvals',
    subtitle: 'Circle pendiente',
    title: 'Happy Circle encontrado',
    ...value,
  };
}

describe('buildPeopleState', () => {
  it('attaches pending Circles only to direct counterparties', () => {
    const settlementProposal = proposal({
      movements_json: [
        {
          amount_minor: 5000000,
          creditor_user_id: 'user-ana',
          debtor_user_id: CURRENT_USER_ID,
        },
        {
          amount_minor: 5000000,
          creditor_user_id: CURRENT_USER_ID,
          debtor_user_id: 'user-carlos',
        },
        {
          amount_minor: 5000000,
          creditor_user_id: 'user-carlos',
          debtor_user_id: 'user-sofia',
        },
        {
          amount_minor: 5000000,
          creditor_user_id: 'user-sofia',
          debtor_user_id: 'user-ana',
        },
      ],
    });

    const state = buildPeopleState({
      accountInviteHistoryItems: [],
      accountInvitePendingItems: [],
      currentUserId: CURRENT_USER_ID,
      financialRequestsById: new Map(),
      friendshipHistoryItems: [],
      friendshipPendingItems: [],
      historyByRelationshipId: new Map(),
      names: new Map([
        [CURRENT_USER_ID, 'Tú'],
        ['user-ana', 'Ana'],
        ['user-carlos', 'Carlos'],
        ['user-sofia', 'Sofia'],
      ]),
      nowMs: NOW,
      openDebtsByRelationshipId: new Map(),
      pendingSettlements: [pendingSettlement({ amountMinor: 5000000 })],
      profiles: new Map(),
      relationshipsByCounterpartyId: new Map([
        ['user-ana', relationship('rel-ana')],
        ['user-sofia', relationship('rel-sofia')],
      ]),
      requestsByRelationshipId: new Map(),
      settlementParticipantsByProposalId: new Map([
        [
          settlementProposal.id,
          [
            participant(settlementProposal.id, CURRENT_USER_ID),
            participant(settlementProposal.id, 'user-ana'),
            participant(settlementProposal.id, 'user-carlos'),
            participant(settlementProposal.id, 'user-sofia'),
          ],
        ],
      ]),
      settlementProposals: [settlementProposal],
      visibleCounterpartyUserIds: new Set(['user-ana', 'user-sofia']),
    });

    expect(state.peopleById['user-ana']?.pendingCount).toBe(1);
    expect(state.peopleById['user-ana']?.pendingItems[0]).toMatchObject({
      amountMinor: 5000000,
      originSettlementProposalId: 'proposal-1',
    });
    expect(state.peopleById['user-sofia']?.pendingCount).toBe(0);
    expect(state.peopleById['user-sofia']?.pendingItems).toEqual([]);
  });
});
