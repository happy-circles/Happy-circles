import type { TransactionCategory } from '@happy-circles/shared';

import { recordProductEventSafe } from '../../analytics-client';

export function recordFriendshipInviteCreated(input: {
  readonly flow: 'internal' | 'external';
  readonly source: string;
  readonly channel?: 'remote' | 'qr';
}): void {
  recordProductEventSafe({
    eventName: 'friendship_invite_created',
    screenName: 'people',
    metadata:
      input.flow === 'external'
        ? { channel: input.channel, flow: input.flow, source: input.source }
        : { flow: input.flow, source: input.source },
  });
}

export function recordFriendshipInviteAccepted(input: {
  readonly flow: 'internal' | 'external';
  readonly decision: 'accept' | 'approve' | 'reject';
}): void {
  recordProductEventSafe({
    eventName: 'friendship_invite_accepted',
    screenName: 'people',
    metadata: { flow: input.flow, decision: input.decision },
  });
}

export function recordFinancialRequestStarted(category: TransactionCategory): void {
  recordProductEventSafe({
    eventName: 'financial_request_started',
    screenName: 'register',
    metadata: { category },
  });
}

export function recordFinancialRequestCreated(): void {
  recordProductEventSafe({
    eventName: 'financial_request_created',
    screenName: 'register',
  });
}

export function recordFinancialRequestAccepted(): void {
  recordProductEventSafe({
    eventName: 'financial_request_accepted',
    screenName: 'transactions',
  });
}

export function recordSettlementApproved(): void {
  recordProductEventSafe({
    eventName: 'settlement_proposal_approved',
    screenName: 'settlement_detail',
  });
}

export function recordSettlementExecuted(): void {
  recordProductEventSafe({
    eventName: 'settlement_executed',
    screenName: 'settlement_detail',
  });
}
