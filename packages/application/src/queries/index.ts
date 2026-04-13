export interface HomeSummaryDto {
  readonly netBalanceMinor: number;
  readonly totalIOweMinor: number;
  readonly totalOwedToMeMinor: number;
}

export interface PersonCardDto {
  readonly userId: string;
  readonly displayName: string;
  readonly avatarUrl?: string | null;
  readonly netAmountMinor: number;
  readonly direction: 'i_owe' | 'owes_me' | 'settled';
  readonly pendingCount: number;
  readonly lastActivityLabel: string;
}

export interface PendingActionDto {
  readonly id: string;
  readonly kind: 'financial_request' | 'settlement_proposal' | 'friendship_invite' | 'reminder';
  readonly title: string;
  readonly subtitle: string;
  readonly status: string;
  readonly ctaLabel: string;
  readonly href: string;
  readonly amountMinor?: number;
}

export interface ActivityItemDto {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly status: string;
  readonly href?: string;
  readonly amountMinor?: number;
  readonly sourceType?: 'user' | 'system';
  readonly detail?: string;
  readonly happenedAt?: string;
  readonly happenedAtLabel?: string;
  readonly tone?: 'positive' | 'negative' | 'neutral';
  readonly flowLabel?: string;
  readonly originRequestId?: string | null;
  readonly originSettlementProposalId?: string | null;
  readonly counterpartyLabel?: string;
  readonly kind:
    | 'financial_request'
    | 'settlement_proposal'
    | 'friendship_invite'
    | 'accepted_request'
    | 'manual_payment'
    | 'system_note'
    | 'request'
    | 'payment'
    | 'settlement'
    | 'system';
}

export interface ActivitySectionDto {
  readonly key: 'pending' | 'history';
  readonly title: string;
  readonly description: string;
  readonly items: readonly ActivityItemDto[];
  readonly emptyMessage: string;
}

export interface PersonTimelineItemDto {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly amountMinor: number;
  readonly tone: 'positive' | 'negative' | 'neutral';
  readonly kind: 'request' | 'payment' | 'settlement' | 'system';
  readonly status: string;
  readonly sourceType: 'user' | 'system';
  readonly sourceLabel: string;
  readonly originRequestId?: string | null;
  readonly originSettlementProposalId?: string | null;
  readonly flowLabel?: string;
  readonly detail?: string;
  readonly happenedAt?: string;
  readonly happenedAtLabel?: string;
}

export interface PersonPendingRequestDto {
  readonly id: string;
  readonly requestKind: 'balance_increase' | 'transaction_reversal';
  readonly responseState: 'requires_you' | 'waiting_other_side';
  readonly tone: 'positive' | 'negative';
  readonly title: string;
  readonly description: string;
  readonly amountMinor: number;
  readonly createdAtLabel: string;
  readonly createdByLabel: string;
}

export interface PersonDetailDto {
  readonly userId: string;
  readonly displayName: string;
  readonly avatarUrl?: string | null;
  readonly direction: 'i_owe' | 'owes_me' | 'settled';
  readonly netAmountMinor: number;
  readonly pendingCount: number;
  readonly headline: string;
  readonly supportText?: string;
  readonly pendingItems: readonly ActivityItemDto[];
  readonly pendingRequest?: PersonPendingRequestDto;
  readonly timeline: readonly PersonTimelineItemDto[];
}

export interface DashboardDto {
  readonly summary: HomeSummaryDto;
  readonly urgentCount: number;
  readonly topPendingPreview?: PendingActionDto | null;
  readonly activePeople: readonly PersonCardDto[];
}
