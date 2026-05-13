import { describe, expect, it } from 'vitest';
import type { SettlementParticipantRow, SettlementProposalRow } from '../types';
import { buildSettlementProposalHistoryTimelineItems } from './settlements-runtime';

const NOW = Date.parse('2026-05-05T12:00:00.000Z');
const CURRENT_USER_ID = 'user-me';

function row<T>(value: Partial<T>): T {
  return value as T;
}

function proposal(value: Partial<SettlementProposalRow>): SettlementProposalRow {
  return row<SettlementProposalRow>({
    anchor_user_high_id: 'user-sofia',
    anchor_user_low_id: CURRENT_USER_ID,
    created_at: '2026-05-03T12:00:00.000Z',
    created_by_user_id: CURRENT_USER_ID,
    currency_code: 'COP',
    executed_at: null,
    graph_snapshot: {},
    graph_snapshot_hash: 'graph-hash',
    happy_circle_case_id: 'case-1',
    id: 'proposal-1',
    movements_json: [
      {
        amount_minor: 5000000,
        creditor_user_id: CURRENT_USER_ID,
        debtor_user_id: 'user-sofia',
      },
      {
        amount_minor: 5000000,
        creditor_user_id: 'user-sofia',
        debtor_user_id: CURRENT_USER_ID,
      },
    ],
    replaced_by_proposal_id: null,
    replaces_proposal_id: null,
    result_hash: 'result-hash',
    source_graph_cycle_job_id: null,
    stale_reason: null,
    status: 'stale',
    updated_at: '2026-05-05T12:00:00.000Z',
    version_number: 1,
    ...value,
  });
}

function participant(
  proposalId: string,
  userId: string,
  decision: SettlementParticipantRow['decision'],
  decidedAt = '2026-05-04T12:00:00.000Z',
): SettlementParticipantRow {
  return row<SettlementParticipantRow>({
    created_at: '2026-05-03T12:00:00.000Z',
    decided_at: decision === 'pending' ? null : decidedAt,
    decision,
    id: `${proposalId}:${userId}`,
    participant_user_id: userId,
    settlement_proposal_id: proposalId,
  });
}

describe('buildSettlementProposalHistoryTimelineItems', () => {
  it('keeps an approved stale Circle as an approval event, not as a closure', () => {
    const staleProposal = proposal({
      replaced_by_proposal_id: 'proposal-2',
      stale_reason: 'balance_changed',
      status: 'stale',
    });

    const [item] = buildSettlementProposalHistoryTimelineItems({
      counterpartyUserId: 'user-sofia',
      currentUserId: CURRENT_USER_ID,
      names: new Map([
        [CURRENT_USER_ID, 'Tu'],
        ['user-sofia', 'Sofia'],
      ]),
      nowMs: NOW,
      participantsByProposalId: new Map([
        [
          staleProposal.id,
          [
            participant(staleProposal.id, CURRENT_USER_ID, 'approved'),
            participant(staleProposal.id, 'user-sofia', 'pending'),
          ],
        ],
      ]),
      proposals: [staleProposal],
    });

    expect(item?.detail).toContain('Luego fue reemplazada');
    expect(item).toMatchObject({
      happenedAt: '2026-05-04T12:00:00.000Z',
      status: 'stale',
      title: 'Tu aprobaste esta version',
    });
  });

  it('emits executed proposals as the explicit Circle closure marker', () => {
    const executedProposal = proposal({
      executed_at: '2026-05-05T11:00:00.000Z',
      status: 'executed',
    });

    const [item] = buildSettlementProposalHistoryTimelineItems({
      counterpartyUserId: 'user-sofia',
      currentUserId: CURRENT_USER_ID,
      names: new Map([
        [CURRENT_USER_ID, 'Tu'],
        ['user-sofia', 'Sofia'],
      ]),
      nowMs: NOW,
      participantsByProposalId: new Map([
        [
          executedProposal.id,
          [
            participant(executedProposal.id, CURRENT_USER_ID, 'approved'),
            participant(executedProposal.id, 'user-sofia', 'approved'),
          ],
        ],
      ]),
      proposals: [executedProposal],
    });

    expect(item).toMatchObject({
      amountMinor: 5000000,
      happenedAt: '2026-05-05T11:00:00.000Z',
      status: 'executed',
      title: 'Circle cerrado',
    });
  });

  it('omits proposal history for counterparties without a direct Circle movement', () => {
    const executedProposal = proposal({
      executed_at: '2026-05-05T11:00:00.000Z',
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
      status: 'executed',
    });
    const participants = [
      participant(executedProposal.id, CURRENT_USER_ID, 'approved'),
      participant(executedProposal.id, 'user-ana', 'approved'),
      participant(executedProposal.id, 'user-carlos', 'approved'),
      participant(executedProposal.id, 'user-sofia', 'approved'),
    ];
    const baseInput = {
      currentUserId: CURRENT_USER_ID,
      names: new Map([
        [CURRENT_USER_ID, 'Tu'],
        ['user-ana', 'Ana'],
        ['user-carlos', 'Carlos'],
        ['user-sofia', 'Sofia'],
      ]),
      nowMs: NOW,
      participantsByProposalId: new Map([[executedProposal.id, participants]]),
      proposals: [executedProposal],
    };

    expect(
      buildSettlementProposalHistoryTimelineItems({
        ...baseInput,
        counterpartyUserId: 'user-sofia',
      }),
    ).toEqual([]);
    expect(
      buildSettlementProposalHistoryTimelineItems({
        ...baseInput,
        counterpartyUserId: 'user-ana',
      })[0],
    ).toMatchObject({
      amountMinor: 5000000,
      status: 'executed',
    });
  });
});
