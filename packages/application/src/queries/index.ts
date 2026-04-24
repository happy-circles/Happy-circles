import type { TransactionCategory } from '@happy-circles/shared';

export interface HomeSummaryDto {
  readonly netBalanceMinor: number;
  readonly totalIOweMinor: number;
  readonly totalOwedToMeMinor: number;
}

export type BalanceAnalyticsPeriod = 'week' | 'month' | 'year' | 'all';
export type BalanceAnalyticsLens = 'balance' | 'i_owe' | 'owed_to_me';

export interface SettlementParticipantDecisionDto {
  readonly userId: string;
  readonly label: string;
  readonly decision: 'approved' | 'pending' | 'rejected';
}

export interface ActiveSettlementPreviewDto {
  readonly proposalId: string;
  readonly status: 'pending_approvals' | 'approved';
  readonly title: string;
  readonly subtitle: string;
  readonly totalAmountMinor: number;
  readonly approvalsPending: number;
  readonly movementCount: number;
  readonly savedMovementsCount: number;
  readonly participantCount: number;
  readonly participantUserIds: readonly string[];
  readonly participantLabels: readonly string[];
  readonly participantDecisions: readonly SettlementParticipantDecisionDto[];
}

export interface BalanceProjectionDto {
  readonly pendingCount: number;
  readonly pendingAmountMinor: number;
  readonly impactMinor: number;
  readonly projectedNetBalanceMinor: number;
}

export interface BalanceSettlementMetricsDto {
  readonly activeCount: number;
  readonly activeProposal: ActiveSettlementPreviewDto | null;
  readonly resolvedMinor: number;
  readonly movementCount: number;
  readonly savedMovementsCount: number;
  readonly participatedCount: number;
  readonly previousResolvedMinor: number;
  readonly changeRatio: number | null;
}

export interface BalanceOverviewDto {
  readonly updatedAt: string;
  readonly updatedAtLabel: string;
  readonly summary: HomeSummaryDto;
  readonly projection: BalanceProjectionDto;
  readonly resolution: BalanceSettlementMetricsDto;
}

export interface BalanceLensSummaryDto {
  readonly initialMinor: number;
  readonly finalMinor: number;
  readonly deltaMinor: number;
  readonly previousDeltaMinor: number;
  readonly changeRatio: number | null;
  readonly movementCount: number;
}

export interface BalanceWaterfallGroupDto {
  readonly key: string;
  readonly label: string;
  readonly category?: TransactionCategory | 'starting_balance' | 'ending_balance';
  readonly personId?: string;
  readonly iOweMinor: number;
  readonly owedToMeMinor: number;
  readonly resolvedMinor: number;
  readonly netMinor: number;
  readonly cumulativeBalanceMinor: number;
}

export interface BalanceAnalyticsPersonRowDto {
  readonly key: string;
  readonly userId: string;
  readonly label: string;
  readonly netMinor: number;
  readonly iOweMinor: number;
  readonly owedToMeMinor: number;
  readonly movementCount: number;
  readonly periodNetMinor: number;
  readonly periodIOweMinor: number;
  readonly periodOwedToMeMinor: number;
  readonly previousPeriodNetMinor: number;
  readonly topCategories: readonly TransactionCategory[];
}

export interface BalanceAnalyticsCategoryRowDto {
  readonly key: string;
  readonly category: TransactionCategory;
  readonly label: string;
  readonly netMinor: number;
  readonly iOweMinor: number;
  readonly owedToMeMinor: number;
  readonly movementCount: number;
  readonly previousNetMinor: number;
  readonly personLabels: readonly string[];
  readonly userIds: readonly string[];
}

export interface BalanceAnalyticsPeriodDto {
  readonly period: BalanceAnalyticsPeriod;
  readonly labels: {
    readonly current: string;
    readonly previous: string | null;
  };
  readonly summaries: Readonly<Record<BalanceAnalyticsLens, BalanceLensSummaryDto>>;
  readonly waterfallByCategory: readonly BalanceWaterfallGroupDto[];
  readonly waterfallByPerson: readonly BalanceWaterfallGroupDto[];
  readonly people: readonly BalanceAnalyticsPersonRowDto[];
  readonly categories: readonly BalanceAnalyticsCategoryRowDto[];
  readonly settlements: BalanceSettlementMetricsDto;
  readonly insight: string;
}

export interface BalanceAnalyticsDto {
  readonly defaultPeriod: BalanceAnalyticsPeriod;
  readonly periods: Readonly<Record<BalanceAnalyticsPeriod, BalanceAnalyticsPeriodDto>>;
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
  readonly kind:
    | 'financial_request'
    | 'settlement_proposal'
    | 'friendship_invite'
    | 'account_invite'
    | 'reminder';
  readonly title: string;
  readonly subtitle: string;
  readonly status: string;
  readonly ctaLabel: string;
  readonly href: string;
  readonly amountMinor?: number;
  readonly category?: TransactionCategory;
}

export interface ActivityItemDto {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly status: string;
  readonly href?: string;
  readonly amountMinor?: number;
  readonly category?: TransactionCategory;
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
    | 'account_invite'
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
  readonly category?: TransactionCategory;
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
  readonly category?: TransactionCategory;
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
