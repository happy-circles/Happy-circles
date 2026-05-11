export type CycleActivityKind =
  | 'active_proposal'
  | 'executed_proposal'
  | 'lifecycle_rejected'
  | 'lifecycle_replaced'
  | 'ledger_posted'
  | 'unknown_cycle';

export interface CycleActivityItemLike {
  readonly id: string;
  readonly category?: string | null;
  readonly kind: string;
  readonly status: string;
  readonly originSettlementProposalId?: string | null;
  readonly happyCircleCaseId?: string | null;
}

const ACTIVE_CIRCLE_STATUSES = new Set([
  'pending',
  'pending_approvals',
  'requires_you',
  'waiting_other_side',
  'approved',
]);

const REJECTED_CIRCLE_STATUSES = new Set(['rejected', 'expired', 'canceled']);

export function isCircleActivityItem(
  item: Pick<CycleActivityItemLike, 'category' | 'kind'>,
): boolean {
  return (
    item.category === 'cycle' || item.kind === 'settlement' || item.kind === 'settlement_proposal'
  );
}

export function cycleActivityKind(item: CycleActivityItemLike): CycleActivityKind {
  if (!isCircleActivityItem(item)) {
    return 'unknown_cycle';
  }

  if (item.kind === 'settlement' && item.status === 'posted') {
    return 'ledger_posted';
  }

  if (item.status === 'executed') {
    return 'executed_proposal';
  }

  if (item.status === 'stale') {
    return 'lifecycle_replaced';
  }

  if (REJECTED_CIRCLE_STATUSES.has(item.status)) {
    return 'lifecycle_rejected';
  }

  if (item.kind === 'settlement_proposal') {
    return ACTIVE_CIRCLE_STATUSES.has(item.status) ? 'active_proposal' : 'unknown_cycle';
  }

  if (ACTIVE_CIRCLE_STATUSES.has(item.status)) {
    return 'active_proposal';
  }

  return 'unknown_cycle';
}

export function isCircleLedgerPosted(item: CycleActivityItemLike): boolean {
  return cycleActivityKind(item) === 'ledger_posted';
}

export function isCircleExecutedProposal(item: CycleActivityItemLike): boolean {
  return cycleActivityKind(item) === 'executed_proposal';
}

export function isCircleLifecycleOnly(item: CycleActivityItemLike): boolean {
  const kind = cycleActivityKind(item);
  return kind === 'lifecycle_rejected' || kind === 'lifecycle_replaced';
}

export function circleHistoryGroupKey(
  item: Pick<
    CycleActivityItemLike,
    'id' | 'originSettlementProposalId' | 'happyCircleCaseId'
  >,
): string {
  if (item.happyCircleCaseId) {
    return `happy_circle_case:${item.happyCircleCaseId}`;
  }

  if (item.originSettlementProposalId) {
    return `settlement:${item.originSettlementProposalId}`;
  }

  return `event:${item.id}`;
}

export function circleAmountIsReal(item: CycleActivityItemLike): boolean {
  return !isCircleActivityItem(item) || isCircleLedgerPosted(item);
}
