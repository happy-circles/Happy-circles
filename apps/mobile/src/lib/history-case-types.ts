import type { ActivityItemDto } from '@happy-circles/application';

export type HistoryStatusTone = 'primary' | 'success' | 'warning' | 'neutral' | 'danger' | 'cycle';
export type HistoryDirection = 'i_owe' | 'owes_me' | 'neutral';

export interface HistoryCaseItem {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly status: string;
  readonly kind: 'request' | 'payment' | 'settlement' | 'system' | 'friendship_invite';
  readonly amountMinor?: number;
  readonly category?: string | null;
  readonly sourceType?: 'user' | 'system';
  readonly tone?: 'positive' | 'negative' | 'neutral';
  readonly flowLabel?: string;
  readonly detail?: string;
  readonly href?: string;
  readonly happenedAt?: string;
  readonly happenedAtLabel?: string;
  readonly originRequestId?: string | null;
  readonly originSettlementProposalId?: string | null;
  readonly happyCircleCaseId?: string | null;
  readonly replacesProposalId?: string | null;
  readonly replacedByProposalId?: string | null;
  readonly staleReason?: string | null;
  readonly counterpartyLabel?: string;
  readonly participantUserIds?: readonly string[];
}

export interface HistoryCase<T extends HistoryCaseItem = HistoryCaseItem> {
  readonly id: string;
  readonly latest: T;
  readonly earliest: T;
  readonly steps: readonly T[];
  readonly isCycleSnippet: boolean;
}

export type ActivityHistoryItem = ActivityItemDto & {
  readonly kind: 'request' | 'payment' | 'settlement' | 'system' | 'friendship_invite';
};

export type ComparableHistoryItem = {
  readonly id: string;
  readonly kind: ActivityItemDto['kind'];
  readonly status: string;
  readonly happenedAt?: string;
};
