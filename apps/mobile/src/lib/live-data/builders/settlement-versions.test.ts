import { describe, expect, it } from 'vitest';
import type { SettlementParticipantRow, SettlementProposalRow } from '../types';
import { buildSettlementVersionTimeline } from './settlement-versions';

const NOW = '2026-05-05T12:00:00.000Z';
const CURRENT_USER_ID = 'user-a';

function row<T>(value: Partial<T>): T {
  return value as T;
}

function cycleMovements(amountMinor: number) {
  return [
    {
      debtor_user_id: 'user-b',
      creditor_user_id: 'user-a',
      amount_minor: amountMinor,
    },
    {
      debtor_user_id: 'user-a',
      creditor_user_id: 'user-b',
      amount_minor: amountMinor,
    },
  ];
}

function proposal(value: Partial<SettlementProposalRow>): SettlementProposalRow {
  return row<SettlementProposalRow>({
    id: 'settlement-v1',
    created_by_user_id: 'user-a',
    status: 'pending_approvals',
    graph_snapshot_hash: 'graph-hash-1',
    graph_snapshot: {},
    movements_json: cycleMovements(2500),
    result_hash: null,
    anchor_user_low_id: 'user-a',
    anchor_user_high_id: 'user-b',
    currency_code: 'COP',
    source_graph_cycle_job_id: null,
    happy_circle_case_id: 'case-1',
    version_number: 1,
    replaces_proposal_id: null,
    replaced_by_proposal_id: null,
    stale_reason: null,
    created_at: NOW,
    updated_at: NOW,
    executed_at: null,
    ...value,
  });
}

function participant(
  proposalId: string,
  userId: string,
  decision: SettlementParticipantRow['decision'] = 'pending',
): SettlementParticipantRow {
  return row<SettlementParticipantRow>({
    id: `${proposalId}:${userId}`,
    settlement_proposal_id: proposalId,
    participant_user_id: userId,
    decision,
    decided_at: decision === 'pending' ? null : NOW,
    created_at: NOW,
  });
}

function participantsByProposalId(
  proposals: readonly SettlementProposalRow[],
): Map<string, SettlementParticipantRow[]> {
  return new Map(
    proposals.map((item) => [
      item.id,
      [participant(item.id, 'user-a'), participant(item.id, 'user-b')],
    ]),
  );
}

describe('buildSettlementVersionTimeline', () => {
  it('collapses consecutive technical versions with the same visible result', () => {
    const proposals = [
      proposal({
        id: 'settlement-v1',
        status: 'stale',
        version_number: 1,
        result_hash: 'result-hash-1',
        replaced_by_proposal_id: 'settlement-v2',
        stale_reason: 'balance_changed',
      }),
      proposal({
        id: 'settlement-v2',
        status: 'stale',
        version_number: 2,
        result_hash: 'result-hash-2',
        replaces_proposal_id: 'settlement-v1',
        replaced_by_proposal_id: 'settlement-v3',
        stale_reason: 'balance_changed',
        created_at: '2026-05-05T12:01:00.000Z',
        updated_at: '2026-05-05T12:01:00.000Z',
      }),
      proposal({
        id: 'settlement-v3',
        status: 'pending_approvals',
        version_number: 3,
        result_hash: 'result-hash-2',
        replaces_proposal_id: 'settlement-v2',
        graph_snapshot_hash: 'graph-hash-3',
        created_at: '2026-05-05T12:02:00.000Z',
        updated_at: '2026-05-05T12:02:00.000Z',
      }),
    ];

    const timeline = buildSettlementVersionTimeline({
      proposal: proposals[2],
      allProposals: proposals,
      participantsByProposalId: participantsByProposalId(proposals),
      currentUserId: CURRENT_USER_ID,
    });

    expect(timeline).toMatchObject([
      {
        proposalId: 'settlement-v1',
        versionNumber: 1,
        displayVersionNumber: 1,
        amountMinor: 2500,
        title: 'Versión 1',
      },
      {
        proposalId: 'settlement-v3',
        versionNumber: 3,
        displayVersionNumber: 2,
        amountMinor: 2500,
        title: 'Versión 2',
        status: 'pending_approvals',
        replacesProposalId: 'settlement-v2',
        isCurrent: true,
      },
    ]);
  });

  it('keeps separate visible versions when the payment result changes', () => {
    const proposals = [
      proposal({
        id: 'settlement-v1',
        status: 'stale',
        version_number: 1,
        result_hash: 'result-hash-1',
        replaced_by_proposal_id: 'settlement-v2',
        stale_reason: 'balance_changed',
      }),
      proposal({
        id: 'settlement-v2',
        status: 'pending_approvals',
        version_number: 2,
        result_hash: 'result-hash-2',
        replaces_proposal_id: 'settlement-v1',
        movements_json: cycleMovements(3000),
      }),
    ];

    const timeline = buildSettlementVersionTimeline({
      proposal: proposals[1],
      allProposals: proposals,
      participantsByProposalId: participantsByProposalId(proposals),
      currentUserId: CURRENT_USER_ID,
    });

    expect(
      timeline.map((item) => [item.proposalId, item.displayVersionNumber, item.amountMinor]),
    ).toEqual([
      ['settlement-v1', 1, 2500],
      ['settlement-v2', 2, 3000],
    ]);
  });

  it('keeps separate visible versions when the participant set changes', () => {
    const proposals = [
      proposal({
        id: 'settlement-v1',
        status: 'stale',
        version_number: 1,
        result_hash: 'result-hash-users-a-b',
        replaced_by_proposal_id: 'settlement-v2',
        stale_reason: 'participant_set_changed',
      }),
      proposal({
        id: 'settlement-v2',
        status: 'pending_approvals',
        version_number: 2,
        result_hash: 'result-hash-users-a-b-c',
        replaces_proposal_id: 'settlement-v1',
      }),
    ];
    const participants = participantsByProposalId(proposals);
    participants.set('settlement-v2', [
      participant('settlement-v2', 'user-a'),
      participant('settlement-v2', 'user-b'),
      participant('settlement-v2', 'user-c'),
    ]);

    const timeline = buildSettlementVersionTimeline({
      proposal: proposals[1],
      allProposals: proposals,
      participantsByProposalId: participants,
      currentUserId: CURRENT_USER_ID,
    });

    expect(timeline.map((item) => [item.proposalId, item.displayVersionNumber])).toEqual([
      ['settlement-v1', 1],
      ['settlement-v2', 2],
    ]);
  });
});
