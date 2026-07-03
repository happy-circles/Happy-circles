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
  readonly decisionSource?: 'manual' | 'carried';
}

export interface HappyCircleScoreAwardDto {
  readonly id: string;
  readonly settlementProposalId: string;
  readonly scoreDelta: number;
  readonly participantCount: number;
  readonly awardedAt: string;
  readonly claimedAt: string | null;
}

export interface HappyCircleScoreDto {
  readonly totalFaces: number;
  readonly closedCircleCount: number;
  readonly claimableAwards: readonly HappyCircleScoreAwardDto[];
  readonly recentAwards: readonly HappyCircleScoreAwardDto[];
  readonly latestAward: HappyCircleScoreAwardDto | null;
}

export interface ActiveSettlementPreviewDto {
  readonly proposalId: string;
  readonly happyCircleCaseId: string | null;
  readonly versionNumber: number | null;
  readonly isCurrentVersion: boolean;
  readonly replacesProposalId: string | null;
  readonly replacedByProposalId: string | null;
  readonly staleReason: string | null;
  readonly status: 'pending_approvals' | 'approved';
  readonly title: string;
  readonly subtitle: string;
  readonly totalAmountMinor: number;
  readonly personalAmountMinor: number;
  readonly approvalsPending: number;
  readonly movementCount: number;
  readonly savedMovementsCount: number;
  readonly participantCount: number;
  readonly participantUserIds: readonly string[];
  readonly participantLabels: readonly string[];
  readonly participantDecisions: readonly SettlementParticipantDecisionDto[];
  readonly incomingConnection?: ActiveSettlementDirectConnectionDto | null;
  readonly outgoingConnection?: ActiveSettlementDirectConnectionDto | null;
}

export interface ActiveSettlementDirectConnectionDto {
  readonly userId: string;
  readonly label: string;
  readonly amountMinor: number;
}

export interface BalanceProjectionDto {
  readonly pendingCount: number;
  readonly pendingAmountMinor: number;
  readonly pendingIncomingMinor: number;
  readonly pendingOutgoingMinor: number;
  readonly impactMinor: number;
  readonly projectedNetBalanceMinor: number;
}

export interface BalanceSettlementMetricsDto {
  readonly activeCount: number;
  readonly activeProposal: ActiveSettlementPreviewDto | null;
  readonly activeProposals: readonly ActiveSettlementPreviewDto[];
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
  readonly topCategoryBreakdown: readonly {
    readonly category: TransactionCategory;
    readonly netMinor: number;
    readonly movementCount: number;
  }[];
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
  readonly originSettlementProposalId?: string | null;
  readonly happyCircleCaseId?: string | null;
  readonly replacesProposalId?: string | null;
  readonly replacedByProposalId?: string | null;
  readonly staleReason?: string | null;
  readonly createdByCurrentUser?: boolean;
}

export interface PendingRequestHistoryStepDto {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly amountMinor: number;
  readonly category?: TransactionCategory;
  readonly createdAtLabel: string;
  readonly createdByLabel: string;
  readonly status: string;
  readonly isCurrent: boolean;
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
  readonly happyCircleCaseId?: string | null;
  readonly replacesProposalId?: string | null;
  readonly replacedByProposalId?: string | null;
  readonly staleReason?: string | null;
  readonly counterpartyLabel?: string;
  readonly participantUserIds?: readonly string[];
  readonly pendingHistorySteps?: readonly PendingRequestHistoryStepDto[];
  readonly createdByCurrentUser?: boolean;
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
  readonly happyCircleCaseId?: string | null;
  readonly replacesProposalId?: string | null;
  readonly replacedByProposalId?: string | null;
  readonly staleReason?: string | null;
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
