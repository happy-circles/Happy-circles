import type {
  ActivityItemDto,
  PendingActionDto,
  PendingRequestHistoryStepDto,
} from '@happy-circles/application';
import type { TransactionCategory } from '@happy-circles/shared';

export interface ActionableItem {
  readonly id: PendingActionDto['id'];
  readonly kind: Extract<
    PendingActionDto['kind'],
    'financial_request' | 'settlement_proposal' | 'friendship_invite' | 'account_invite'
  >;
  readonly title: PendingActionDto['title'];
  readonly subtitle: PendingActionDto['subtitle'];
  readonly status: PendingActionDto['status'];
  readonly ctaLabel: PendingActionDto['ctaLabel'];
  readonly href: PendingActionDto['href'];
  readonly amountMinor?: PendingActionDto['amountMinor'];
  readonly category?: TransactionCategory;
  readonly originSettlementProposalId?: string | null;
  readonly happyCircleCaseId?: string | null;
  readonly replacesProposalId?: string | null;
  readonly replacedByProposalId?: string | null;
  readonly staleReason?: string | null;
  readonly counterpartyLabel?: string;
  readonly tone?: ActivityItemDto['tone'];
  readonly participantUserIds?: readonly string[];
  readonly pendingHistorySteps?: readonly PendingRequestHistoryStepDto[];
  readonly createdByCurrentUser?: boolean;
  readonly requestKind?: 'balance_increase' | 'transaction_reversal';
  readonly versionNumber?: number;
  readonly createdAt: string;
}
