import type {
  ActivitySectionDto,
  BalanceAnalyticsDto,
  BalanceOverviewDto,
  DashboardDto,
  HappyCircleScoreDto,
  PersonCardDto,
  PersonDetailDto,
} from '@happy-circles/application';
import type { TransactionCategory } from '@happy-circles/shared';

import type {
  AccountInviteDeliveryRow,
  AccountInviteListItem,
  AccountInviteRow,
  AccountInviteSummary,
  AuditEventRow,
  AuditListItem,
  FinancialRequestRow,
  FriendshipInviteDeliveryRow,
  FriendshipInviteListItem,
  FriendshipInviteRow,
  FriendshipSummary,
  HappyCircleScoreEventRow,
  InboxItemRow,
  NotificationViewRow,
  OpenDebtRow,
  RelationshipHistoryRow,
  RelationshipRow,
  SettlementDetailDto,
  SettlementParticipantRow,
  SettlementProposalRow,
  UserProfileRow,
} from './types-runtime';
import type { SignedAvatarUrlRecord } from '../avatar';

export type LivePersonDetailDto = PersonDetailDto & {
  readonly relationshipStatus?: 'active' | 'pending_invite';
};

export interface AppSnapshot {
  readonly dashboard: DashboardDto;
  readonly balanceOverview: BalanceOverviewDto;
  readonly balanceAnalytics: BalanceAnalyticsDto;
  readonly people: readonly PersonCardDto[];
  readonly peopleById: Readonly<Record<string, LivePersonDetailDto>>;
  readonly currentUserProfile: {
    readonly displayName: string;
    readonly email: string;
    readonly avatarUrl: string | null;
  } | null;
  readonly happyCircleScore: HappyCircleScoreDto;
  readonly friendshipPendingItems: readonly FriendshipInviteListItem[];
  readonly friendshipHistoryItems: readonly FriendshipInviteListItem[];
  readonly friendshipSummary: FriendshipSummary;
  readonly accountInvitePendingItems: readonly AccountInviteListItem[];
  readonly accountInviteHistoryItems: readonly AccountInviteListItem[];
  readonly accountInviteSummary: AccountInviteSummary;
  readonly activitySections: readonly ActivitySectionDto[];
  readonly notificationUnreadCount: number;
  readonly notificationViewedKeys: ReadonlySet<string>;
  readonly pendingCount: number;
  readonly auditEvents: readonly AuditListItem[];
  readonly settlementsById: Readonly<Record<string, SettlementDetailDto>>;
}

export interface CreateRequestInput {
  readonly responderUserId: string;
  readonly debtorUserId: string;
  readonly creditorUserId: string;
  readonly amountMinor: number;
  readonly description: string;
  readonly category?: TransactionCategory;
}

export interface LiveSnapshotLimits {
  readonly financialRequestHistory: number;
  readonly relationshipHistory: number;
  readonly friendshipInviteHistory: number;
  readonly accountInviteHistory: number;
  readonly settlementHistory: number;
  readonly auditEvents: number;
  readonly notificationViews: number;
}

export interface LiveSnapshotRows {
  readonly profiles: readonly UserProfileRow[];
  readonly avatarSignedUrlsByPath: SignedAvatarUrlRecord;
  readonly relationships: readonly RelationshipRow[];
  readonly openDebts: readonly OpenDebtRow[];
  readonly financialRequests: readonly FinancialRequestRow[];
  readonly history: readonly RelationshipHistoryRow[];
  readonly inboxItems: readonly InboxItemRow[];
  readonly friendshipInvites: readonly FriendshipInviteRow[];
  readonly friendshipInviteDeliveries: readonly FriendshipInviteDeliveryRow[];
  readonly accountInvites: readonly AccountInviteRow[];
  readonly accountInviteDeliveries: readonly AccountInviteDeliveryRow[];
  readonly settlementProposals: readonly SettlementProposalRow[];
  readonly settlementParticipants: readonly SettlementParticipantRow[];
  readonly happyCircleScoreEvents: readonly HappyCircleScoreEventRow[];
  readonly notificationViews: readonly NotificationViewRow[];
  readonly auditEvents: readonly AuditEventRow[];
  readonly limits: LiveSnapshotLimits;
  readonly fetchedAt: string;
}
