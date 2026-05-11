import { describe, expect, it } from 'vitest';

import {
  circleAmountIsReal,
  circleHistoryGroupKey,
  cycleActivityKind,
  isCircleLedgerPosted,
  isCircleLifecycleOnly,
} from './cycle-activity';

function item(value: {
  readonly id?: string;
  readonly category?: string | null;
  readonly kind?: string;
  readonly status?: string;
  readonly originSettlementProposalId?: string | null;
  readonly happyCircleCaseId?: string | null;
}) {
  return {
    category: 'cycle',
    id: 'item-1',
    kind: 'settlement',
    status: 'posted',
    ...value,
  };
}

describe('cycle activity classification', () => {
  it('classifies pending and approved Circle proposals as active proposals', () => {
    expect(
      cycleActivityKind(item({ kind: 'settlement_proposal', status: 'pending_approvals' })),
    ).toBe('active_proposal');
    expect(cycleActivityKind(item({ kind: 'settlement_proposal', status: 'approved' }))).toBe(
      'active_proposal',
    );
  });

  it('classifies rejected and stale Circle proposals as lifecycle-only', () => {
    const rejected = item({ kind: 'settlement', status: 'rejected' });
    const stale = item({ kind: 'settlement', status: 'stale' });

    expect(cycleActivityKind(rejected)).toBe('lifecycle_rejected');
    expect(cycleActivityKind(stale)).toBe('lifecycle_replaced');
    expect(isCircleLifecycleOnly(rejected)).toBe(true);
    expect(isCircleLifecycleOnly(stale)).toBe(true);
    expect(circleAmountIsReal(rejected)).toBe(false);
    expect(circleAmountIsReal(stale)).toBe(false);
  });

  it('classifies posted settlement rows as real ledger activity', () => {
    const ledger = item({
      kind: 'settlement',
      originSettlementProposalId: 'proposal-1',
      status: 'posted',
    });

    expect(cycleActivityKind(ledger)).toBe('ledger_posted');
    expect(isCircleLedgerPosted(ledger)).toBe(true);
    expect(circleAmountIsReal(ledger)).toBe(true);
  });

  it('classifies executed proposal metadata as closed but not posted ledger activity', () => {
    const executedProposal = item({
      kind: 'settlement_proposal',
      originSettlementProposalId: 'proposal-1',
      status: 'executed',
    });

    expect(cycleActivityKind(executedProposal)).toBe('executed_proposal');
    expect(isCircleLedgerPosted(executedProposal)).toBe(false);
    expect(circleAmountIsReal(executedProposal)).toBe(false);
  });

  it('groups by Happy Circle case before falling back to the proposal id', () => {
    expect(
      circleHistoryGroupKey(
        item({
          happyCircleCaseId: 'case-1',
          originSettlementProposalId: 'proposal-1',
        }),
      ),
    ).toBe('happy_circle_case:case-1');
    expect(circleHistoryGroupKey(item({ originSettlementProposalId: 'proposal-1' }))).toBe(
      'settlement:proposal-1',
    );
  });
});
