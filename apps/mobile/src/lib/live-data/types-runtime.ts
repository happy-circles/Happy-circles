import type {
  ActivityItemDto,
  ActivitySectionDto,
  BalanceAnalyticsDto,
  BalanceOverviewDto,
  DashboardDto,
  PendingActionDto,
  PendingRequestHistoryStepDto,
  PersonCardDto,
  PersonDetailDto,
  PersonTimelineItemDto,
} from '@happy-circles/application';
import type { Database, TransactionCategory } from '@happy-circles/shared';

export type RelationshipRow = Database['public']['Tables']['relationships']['Row'];
export type NonNullFields<T, K extends keyof T> = Omit<T, K> & {
  readonly [P in K]-?: NonNullable<T[P]>;
};
export type OverrideFields<T, U> = Omit<T, keyof U> & U;
export type GeneratedFriendshipInviteRow = Database['public']['Views']['v_friendship_invites_live']['Row'];
export type FriendshipInviteRow = OverrideFields<
  NonNullFields<
    GeneratedFriendshipInviteRow,
    'created_at' | 'flow' | 'id' | 'inviter_user_id' | 'origin_channel' | 'updated_at'
  >,
  { readonly status: string }
>;
export type GeneratedFriendshipInviteDeliveryRow =
  Database['public']['Views']['v_friendship_invite_deliveries_live']['Row'];
export type FriendshipInviteDeliveryRow = OverrideFields<
  NonNullFields<
    GeneratedFriendshipInviteDeliveryRow,
    'channel' | 'created_at' | 'id' | 'invite_id'
  >,
  { readonly status: string }
>;
export type GeneratedAccountInviteRow = Database['public']['Views']['v_account_invites_live']['Row'];
export type AccountInviteRow = OverrideFields<
  NonNullFields<
    GeneratedAccountInviteRow,
    'created_at' | 'expires_at' | 'id' | 'inviter_user_id' | 'updated_at'
  >,
  { readonly status: string }
>;
export type GeneratedAccountInviteDeliveryRow =
  Database['public']['Views']['v_account_invite_deliveries_live']['Row'];
export type AccountInviteDeliveryRow = NonNullFields<
  GeneratedAccountInviteDeliveryRow,
  'channel' | 'created_at' | 'id' | 'invite_id' | 'status'
>;
export type FinancialRequestRow = Database['public']['Tables']['financial_requests']['Row'];
export type AuditEventRow = Database['public']['Tables']['audit_events']['Row'];
export type SettlementProposalRow = Database['public']['Tables']['settlement_proposals']['Row'];
export type SettlementParticipantRow =
  Database['public']['Tables']['settlement_proposal_participants']['Row'];
export type UserProfileRow = Database['public']['Tables']['user_profiles']['Row'];
export type NotificationViewRow = Database['public']['Tables']['notification_views']['Row'];
export type OpenDebtRow = NonNullFields<
  Database['public']['Views']['v_open_debts']['Row'],
  | 'amount_minor'
  | 'creditor_user_id'
  | 'currency_code'
  | 'debtor_user_id'
  | 'relationship_id'
  | 'user_high_id'
  | 'user_low_id'
>;
export type RelationshipHistoryRow = NonNullFields<
  Database['public']['Views']['v_relationship_history']['Row'],
  | 'amount_minor'
  | 'happened_at'
  | 'item_id'
  | 'item_kind'
  | 'relationship_id'
  | 'source_type'
  | 'status'
  | 'subtype'
>;
export type InboxItemRow = NonNullFields<
  Database['public']['Views']['v_inbox_items']['Row'],
  'created_at' | 'item_id' | 'item_kind' | 'owner_user_id' | 'status'
>;

export interface AuditListItem {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
}

export interface SettlementMovement {
  readonly debtor_user_id: string;
  readonly creditor_user_id: string;
  readonly amount_minor: number;
}

export type SettlementDetailDecision = 'approved' | 'pending' | 'rejected';

export interface SettlementDetailParticipantDto {
  readonly userId: string;
  readonly label: string;
  readonly decision: SettlementDetailDecision;
}

export interface SettlementDetailMovementDto {
  readonly id: string;
  readonly debtorUserId: string;
  readonly debtorLabel: string;
  readonly creditorUserId: string;
  readonly creditorLabel: string;
  readonly amountMinor: number;
}

export interface TimelineEventDraft {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly amountMinor: number;
  readonly category?: TransactionCategory;
  readonly tone: PersonTimelineItemDto['tone'];
  readonly kind: PersonTimelineItemDto['kind'];
  readonly status: string;
  readonly sourceType: 'user' | 'system';
  readonly sourceLabel: string;
  readonly originRequestId?: string | null;
  readonly originSettlementProposalId?: string | null;
  readonly flowLabel?: string;
  readonly detail?: string;
  readonly happenedAt: string;
  readonly sortWeight: number;
}

export interface SettlementDetailDto {
  readonly id: string;
  readonly status: string;
  readonly snapshotHash: string;
  readonly participants: readonly string[];
  readonly participantDecisions: readonly SettlementDetailParticipantDto[];
  readonly participantStatuses: readonly string[];
  readonly movementDetails: readonly SettlementDetailMovementDto[];
  readonly movements: readonly string[];
  readonly impactLines: readonly string[];
  readonly explainers: readonly string[];
}

export interface AccountDeletionRequestResult {
  readonly requestId: string;
  readonly status: 'completed';
  readonly processedAt: string;
  readonly retentionMode: 'anonymize_profile_retain_ledger';
  readonly revokedDeviceCount: number;
  readonly authUserDeleted?: boolean;
  readonly avatarObjectsRemoved?: number;
}

export interface FriendshipInviteDto {
  readonly inviteId: string;
  readonly flow: 'internal' | 'external';
  readonly actorRole: 'sender' | 'claimant' | 'recipient' | 'none';
  readonly originChannel: 'internal' | 'remote' | 'qr';
  readonly actionState:
    | 'requires_you_response'
    | 'requires_you_review'
    | 'waiting_sender_review'
    | 'pending_claim'
    | 'waiting_other_side'
    | 'history';
  readonly title: string;
  readonly subtitle: string;
  readonly status: string;
  readonly createdAt: string;
  readonly expiresAt: string | null;
  readonly resolvedAt: string | null;
  readonly claimantSnapshot: FriendshipClaimantSnapshot | null;
  readonly intendedRecipientAlias: string | null;
  readonly intendedRecipientPhoneE164: string | null;
  readonly intendedRecipientPhoneLabel: string | null;
  readonly href: string;
}

export interface FriendshipIdentityFlags {
  readonly emailConfirmed: boolean;
  readonly hasDisplayName: boolean;
  readonly hasAvatar: boolean;
  readonly hasPhone: boolean;
  readonly phoneVerified: boolean;
}

export interface FriendshipClaimantSnapshot {
  readonly displayName: string;
  readonly avatarPath: string | null;
  readonly maskedEmail: string | null;
  readonly maskedPhone: string | null;
  readonly emailConfirmed: boolean;
  readonly phonePresent: boolean;
  readonly phoneVerified: boolean;
  readonly claimedAt: string | null;
}

export interface FriendshipInviteListItem extends ActivityItemDto {
  readonly kind: 'friendship_invite';
  readonly inviteId: string;
  readonly flow: 'internal' | 'external';
  readonly actorRole: 'sender' | 'claimant' | 'recipient' | 'none';
  readonly originChannel: 'internal' | 'remote' | 'qr';
  readonly actionState:
    | 'requires_you_response'
    | 'requires_you_review'
    | 'waiting_sender_review'
    | 'pending_claim'
    | 'waiting_other_side'
    | 'history';
  readonly expiresAt: string | null;
  readonly resolvedAt: string | null;
  readonly claimantSnapshot: FriendshipClaimantSnapshot | null;
  readonly intendedRecipientAlias: string | null;
  readonly intendedRecipientPhoneE164: string | null;
  readonly intendedRecipientPhoneLabel: string | null;
  readonly ctaLabel: string;
  readonly createdAt: string;
  readonly profileUserId: string | null;
  readonly profileHref: string | null;
  readonly profileTimelineItems: readonly PersonTimelineItemDto[];
  readonly profileDisplayName: string;
  readonly profileAvatarUrl: string | null;
  readonly profilePhoneLabel: string | null;
  readonly profileEmailLabel: string | null;
  readonly profileReferenceLabel: string | null;
  readonly profileRoleLabel: string | null;
  readonly intendedProfileDisplayName: string | null;
  readonly intendedProfilePhoneLabel: string | null;
  readonly respondingProfileDisplayName: string | null;
  readonly respondingProfileAvatarUrl: string | null;
  readonly respondingProfilePhoneLabel: string | null;
  readonly respondingProfileEmailLabel: string | null;
}

export interface FriendshipSummary {
  readonly requiresResponseCount: number;
  readonly requiresReviewCount: number;
  readonly waitingSenderReviewCount: number;
  readonly sentOutsideCount: number;
  readonly historyCount: number;
}

export interface AccountInviteListItem extends ActivityItemDto {
  readonly kind: 'account_invite';
  readonly inviteId: string;
  readonly actorRole: 'inviter' | 'activated' | 'none';
  readonly originChannel: 'remote' | 'qr';
  readonly actionState:
    | 'pending_activation'
    | 'requires_you_review'
    | 'waiting_sender_review'
    | 'history';
  readonly expiresAt: string | null;
  readonly activatedAt: string | null;
  readonly resolvedAt: string | null;
  readonly intendedRecipientAlias: string | null;
  readonly intendedRecipientPhoneE164: string | null;
  readonly intendedRecipientPhoneLabel: string | null;
  readonly activatedUserId: string | null;
  readonly activatedUserDisplayName: string | null;
  readonly activatedUserAvatarUrl: string | null;
  readonly ctaLabel: string;
  readonly createdAt: string;
  readonly profileUserId: string | null;
  readonly profileHref: string | null;
  readonly profileTimelineItems: readonly PersonTimelineItemDto[];
  readonly profileDisplayName: string;
  readonly profileAvatarUrl: string | null;
  readonly profilePhoneLabel: string | null;
  readonly profileEmailLabel: string | null;
  readonly profileReferenceLabel: string | null;
  readonly profileRoleLabel: string | null;
  readonly intendedProfileDisplayName: string | null;
  readonly intendedProfilePhoneLabel: string | null;
  readonly respondingProfileDisplayName: string | null;
  readonly respondingProfileAvatarUrl: string | null;
  readonly respondingProfilePhoneLabel: string | null;
  readonly respondingProfileEmailLabel: string | null;
}

export interface AccountInviteSummary {
  readonly requiresReviewCount: number;
  readonly pendingActivationCount: number;
  readonly waitingInviterReviewCount: number;
  readonly historyCount: number;
}

export interface FriendshipInviteDeliveryResult {
  readonly inviteId: string;
  readonly deliveryId: string;
  readonly deliveryToken: string;
  readonly flow: 'external';
  readonly status: string;
  readonly channel: 'remote' | 'qr';
  readonly originChannel: 'remote' | 'qr';
  readonly expiresAt: string;
  readonly inviteExpiresAt: string;
  readonly intendedRecipientAlias: string | null;
  readonly intendedRecipientPhoneE164: string | null;
  readonly intendedRecipientPhoneLabel: string | null;
}

export interface FriendshipInviteActionResult {
  readonly inviteId: string;
  readonly status: string;
  readonly resolvedAt?: string | null;
  readonly relationshipId?: string | null;
}

export interface FriendshipInvitePreviewResult {
  readonly inviteId: string;
  readonly deliveryId: string;
  readonly flow: 'internal' | 'external';
  readonly status: string;
  readonly channel: 'remote' | 'qr';
  readonly originChannel: 'internal' | 'remote' | 'qr';
  readonly expiresAt: string | null;
  readonly resolvedAt: string | null;
  readonly actorRole: 'sender' | 'claimant' | 'recipient' | 'none';
  readonly inviterDisplayName: string;
  readonly inviterAvatarPath: string | null;
  readonly intendedRecipientAlias: string | null;
  readonly intendedRecipientPhoneE164: string | null;
  readonly intendedRecipientPhoneLabel: string | null;
  readonly claimantSnapshot: FriendshipClaimantSnapshot | null;
  readonly identityFlags: FriendshipIdentityFlags;
  readonly canClaim: boolean;
  readonly canApprove: boolean;
  readonly canReject: boolean;
  readonly canRespond: boolean;
  readonly reason: string;
}

export interface PeopleTargetResolution {
  readonly phoneE164: string;
  readonly status:
    | 'active_user'
    | 'pending_activation'
    | 'no_account'
    | 'already_related'
    | 'pending_friendship';
  readonly matchedUserId: string | null;
  readonly displayName: string | null;
  readonly avatarPath: string | null;
  readonly relationshipId: string | null;
  readonly friendshipInviteId: string | null;
  readonly accountInviteId: string | null;
  readonly accountInviteStatus: string | null;
}

export interface AccountInviteDeliveryResult {
  readonly inviteId: string;
  readonly deliveryId: string;
  readonly deliveryToken: string;
  readonly status: string;
  readonly channel: 'remote' | 'qr';
  readonly originChannel: 'remote' | 'qr';
  readonly expiresAt: string;
  readonly inviteExpiresAt: string;
  readonly intendedRecipientAlias: string | null;
  readonly intendedRecipientPhoneE164: string | null;
  readonly intendedRecipientPhoneLabel: string | null;
}

export interface AccountInvitePreviewResult {
  readonly inviteId: string | null;
  readonly deliveryId: string | null;
  readonly status:
    | 'unavailable'
    | 'pending_activation'
    | 'pending_inviter_review'
    | 'accepted'
    | 'rejected'
    | 'canceled'
    | 'expired';
  readonly deliveryStatus:
    | 'unavailable'
    | 'issued'
    | 'authenticated'
    | 'activated'
    | 'revoked'
    | 'expired';
  readonly channel: 'remote' | 'qr' | null;
  readonly expiresAt: string | null;
  readonly inviteExpiresAt: string | null;
  readonly resolvedAt: string | null;
  readonly inviterDisplayName: string | null;
  readonly inviterAvatarPath: string | null;
  readonly intendedRecipientPhoneMasked: string | null;
  readonly reason:
    | 'invite_unavailable'
    | 'delivery_revoked'
    | 'delivery_expired'
    | 'pending_activation'
    | 'pending_inviter_review'
    | 'accepted'
    | 'rejected'
    | 'canceled'
    | 'expired';
}

export interface AccountInviteActionResult {
  readonly inviteId: string;
  readonly deliveryId?: string;
  readonly status: string;
  readonly resolvedAt?: string | null;
  readonly activatedAt?: string | null;
  readonly relationshipId?: string | null;
  readonly actorRole?: 'claimant';
}

export interface PeopleOutreachResult {
  readonly kind: 'friendship' | 'account_invite' | 'already_related';
  readonly status:
    | 'active_user'
    | 'pending_activation'
    | 'no_account'
    | 'already_related'
    | 'pending_friendship';
  readonly matchedUserId: string | null;
  readonly displayName: string | null;
  readonly relationshipId?: string | null;
  readonly inviteId?: string | null;
  readonly result?: FriendshipInviteActionResult | AccountInviteDeliveryResult;
}

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
  readonly counterpartyLabel?: string;
  readonly tone?: ActivityItemDto['tone'];
  readonly participantUserIds?: readonly string[];
  readonly pendingHistorySteps?: readonly PendingRequestHistoryStepDto[];
  readonly createdAt: string;
}

export interface InviteProfilePresentation {
  readonly displayName: string;
  readonly avatarUrl: string | null;
  readonly phoneLabel: string | null;
  readonly emailLabel: string | null;
  readonly referenceLabel: string | null;
  readonly roleLabel: string | null;
}

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
  readonly notificationViews: readonly NotificationViewRow[];
  readonly auditEvents: readonly AuditEventRow[];
  readonly limits: LiveSnapshotLimits;
  readonly fetchedAt: string;
}
