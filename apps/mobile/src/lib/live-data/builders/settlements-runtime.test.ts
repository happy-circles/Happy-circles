import { describe, expect, it } from 'vitest';
import type { SettlementParticipantRow, SettlementProposalRow } from '../types';
import {
  buildSettlementDetail,
  buildSettlementProposalHistoryTimelineItems,
} from './settlements-runtime';

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
  decisionSource: SettlementParticipantRow['decision_source'] = 'manual',
): SettlementParticipantRow {
  return row<SettlementParticipantRow>({
    approval_scope_hash: `${proposalId}:${userId}:scope`,
    carried_at: decisionSource === 'carried' ? '2026-05-05T11:30:00.000Z' : null,
    carried_from_participant_id:
      decisionSource === 'carried' ? `${proposalId}:${userId}:old` : null,
    created_at: '2026-05-03T12:00:00.000Z',
    decided_at: decision === 'pending' ? null : decidedAt,
    decision,
    decision_source: decisionSource,
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
        [CURRENT_USER_ID, 'Tú'],
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
      title: 'Aprobaste esta versión',
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
        [CURRENT_USER_ID, 'Tú'],
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

  it('exposes carried participant approvals in settlement detail DTOs', () => {
    const activeProposal = proposal({
      status: 'pending_approvals',
    });

    const detail = buildSettlementDetail(
      activeProposal,
      [
        participant(activeProposal.id, CURRENT_USER_ID, 'approved', undefined, 'carried'),
        participant(activeProposal.id, 'user-sofia', 'pending'),
      ],
      new Map([
        [CURRENT_USER_ID, 'TÃº'],
        ['user-sofia', 'Sofia'],
      ]),
      CURRENT_USER_ID,
      new Set(['user-sofia']),
    );

    expect(detail.participantDecisions).toEqual([
      expect.objectContaining({
        decision: 'approved',
        decisionSource: 'carried',
        userId: CURRENT_USER_ID,
      }),
      expect.objectContaining({
        decision: 'pending',
        decisionSource: 'manual',
        userId: 'user-sofia',
      }),
    ]);
  });

  it('keeps Circle detail original movements scoped to the executed cycle edges', () => {
    const activeProposal = proposal({
      graph_snapshot: [
        {
          amount_minor: 9000000,
          creditor_user_id: 'user-ana',
          debtor_user_id: CURRENT_USER_ID,
        },
        {
          amount_minor: 12000000,
          creditor_user_id: CURRENT_USER_ID,
          debtor_user_id: 'user-carlos',
        },
        {
          amount_minor: 30000000,
          creditor_user_id: CURRENT_USER_ID,
          debtor_user_id: 'user-sofia',
        },
      ],
      movements_json: [
        {
          amount_minor: 7000000,
          creditor_user_id: CURRENT_USER_ID,
          debtor_user_id: 'user-ana',
        },
        {
          amount_minor: 7000000,
          creditor_user_id: 'user-carlos',
          debtor_user_id: CURRENT_USER_ID,
        },
        {
          amount_minor: 7000000,
          creditor_user_id: 'user-ana',
          debtor_user_id: 'user-carlos',
        },
      ],
      status: 'pending_approvals',
    });

    const detail = buildSettlementDetail(
      activeProposal,
      [
        participant(activeProposal.id, CURRENT_USER_ID, 'pending'),
        participant(activeProposal.id, 'user-ana', 'pending'),
        participant(activeProposal.id, 'user-carlos', 'pending'),
        participant(activeProposal.id, 'user-sofia', 'pending'),
      ],
      new Map([
        [CURRENT_USER_ID, 'TÃº'],
        ['user-ana', 'Ana'],
        ['user-carlos', 'Carlos'],
        ['user-sofia', 'Sofia'],
      ]),
      CURRENT_USER_ID,
      new Set(['user-ana', 'user-carlos', 'user-sofia']),
    );

    expect(detail.personalAmountMinor).toBe(7000000);
    expect(
      detail.originalMovementDetails.map((movement) => [
        movement.debtorUserId,
        movement.creditorUserId,
        movement.amountMinor,
      ]),
    ).toEqual([
      [CURRENT_USER_ID, 'user-ana', 9000000],
      ['user-carlos', CURRENT_USER_ID, 12000000],
    ]);
    expect(detail.originalMovementDetails.map((movement) => movement.debtorLabel)).not.toContain(
      'Persona',
    );
    expect(detail.participantDecisions.map((participant) => participant.label).slice(1)).toEqual([
      'Ana',
      'Carlos',
    ]);
  });

  it('marks executed proposal impact as positive or negative for each direct counterparty', () => {
    const executedProposal = proposal({
      executed_at: '2026-05-05T11:00:00.000Z',
      movements_json: [
        {
          amount_minor: 5000000,
          creditor_user_id: CURRENT_USER_ID,
          debtor_user_id: 'user-ana',
        },
        {
          amount_minor: 5000000,
          creditor_user_id: 'user-carlos',
          debtor_user_id: CURRENT_USER_ID,
        },
      ],
      status: 'executed',
    });
    const participants = [
      participant(executedProposal.id, CURRENT_USER_ID, 'approved'),
      participant(executedProposal.id, 'user-ana', 'approved'),
      participant(executedProposal.id, 'user-carlos', 'approved'),
    ];
    const baseInput = {
      currentUserId: CURRENT_USER_ID,
      names: new Map([
        [CURRENT_USER_ID, 'Tú'],
        ['user-ana', 'Ana'],
        ['user-carlos', 'Carlos'],
      ]),
      nowMs: NOW,
      participantsByProposalId: new Map([[executedProposal.id, participants]]),
      proposals: [executedProposal],
    };

    expect(
      buildSettlementProposalHistoryTimelineItems({
        ...baseInput,
        counterpartyUserId: 'user-ana',
      })[0],
    ).toMatchObject({
      amountMinor: 5000000,
      status: 'executed',
      tone: 'positive',
    });
    expect(
      buildSettlementProposalHistoryTimelineItems({
        ...baseInput,
        counterpartyUserId: 'user-carlos',
      })[0],
    ).toMatchObject({
      amountMinor: 5000000,
      status: 'executed',
      tone: 'negative',
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
        [CURRENT_USER_ID, 'Tú'],
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
