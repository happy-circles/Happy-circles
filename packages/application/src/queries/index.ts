export interface HomeSummaryDto {
  readonly netBalanceMinor: number;
  readonly totalIOweMinor: number;
  readonly totalOwedToMeMinor: number;
}

export interface PersonCardDto {
  readonly userId: string;
  readonly displayName: string;
  readonly netAmountMinor: number;
  readonly direction: 'i_owe' | 'owes_me';
  readonly pendingCount: number;
  readonly lastActivityLabel: string;
}

export interface PendingActionDto {
  readonly id: string;
  readonly kind: 'financial_request' | 'settlement_proposal' | 'reminder';
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
  readonly kind:
    | 'financial_request'
    | 'settlement_proposal'
    | 'accepted_request'
    | 'manual_payment'
    | 'system_note';
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
}

export interface PersonDetailDto {
  readonly userId: string;
  readonly displayName: string;
  readonly direction: 'i_owe' | 'owes_me';
  readonly netAmountMinor: number;
  readonly pendingCount: number;
  readonly headline: string;
  readonly supportText?: string;
  readonly timeline: readonly PersonTimelineItemDto[];
}

export interface DashboardDto {
  readonly summary: HomeSummaryDto;
  readonly urgentCount: number;
  readonly topPendingPreview?: PendingActionDto | null;
  readonly activePeople: readonly PersonCardDto[];
}
