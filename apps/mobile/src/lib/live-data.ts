import { useMutation, useQuery } from '@tanstack/react-query';

import type {
  ActiveSettlementPreviewDto,
  ActivityItemDto,
  ActivitySectionDto,
  BalanceAnalyticsCategoryRowDto,
  BalanceAnalyticsDto,
  BalanceAnalyticsLens,
  BalanceAnalyticsPeriod,
  BalanceAnalyticsPeriodDto,
  BalanceAnalyticsPersonRowDto,
  BalanceLensSummaryDto,
  BalanceOverviewDto,
  BalanceSettlementMetricsDto,
  BalanceWaterfallGroupDto,
  DashboardDto,
  PendingActionDto,
  PendingRequestHistoryStepDto,
  PersonCardDto,
  PersonDetailDto,
  PersonPendingRequestDto,
  PersonTimelineItemDto,
} from '@happy-circles/application';
import {
  activateAccountFromInviteSchema,
  amendFinancialRequestSchema,
  createBalanceRequestSchema,
  createPeopleOutreachSchema,
  requestAccountDeletionSchema,
  cancelAccountInviteSchema,
  cancelFriendshipInviteSchema,
  claimExternalFriendshipInviteSchema,
  createExternalFriendshipInviteSchema,
  createInternalFriendshipInviteSchema,
  cycleSettlementDecisionSchema,
  cycleSettlementExecutionSchema,
  friendshipInviteDecisionSchema,
  friendshipInvitePreviewSchema,
  accountInvitePreviewSchema,
  resolvePeopleTargetsSchema,
  reviewAccountInviteSchema,
  reviewExternalFriendshipInviteSchema,
  requestDecisionSchema,
  type TransactionCategory,
  type Database,
} from '@happy-circles/shared';

import { useSession } from '@/providers/session-provider';
import { recordProductEventSafe } from './analytics-client';
import { resolveAvatarUrl } from './avatar';
import { formatCop } from './data';
import { buildActivityHistoryItems, compareHistoryItems } from './history-cases';
import { createIdempotencyKey } from './idempotency';
import { queryClient } from './query-client';
import { supabase } from './supabase';
import {
  createSupportId,
  isJwtAuthError,
  readFunctionErrorDetails,
  reportAndCreateSupportError,
} from './support-errors';
import {
  DEFAULT_TRANSACTION_CATEGORY,
  USER_TRANSACTION_CATEGORIES,
  normalizeTransactionCategory,
  transactionCategoryLabel,
} from './transaction-categories';

type RelationshipRow = Database['public']['Tables']['relationships']['Row'];
type NonNullFields<T, K extends keyof T> = Omit<T, K> & {
  readonly [P in K]-?: NonNullable<T[P]>;
};
type OverrideFields<T, U> = Omit<T, keyof U> & U;
type GeneratedFriendshipInviteRow = Database['public']['Views']['v_friendship_invites_live']['Row'];
type FriendshipInviteRow = OverrideFields<
  NonNullFields<
    GeneratedFriendshipInviteRow,
    'created_at' | 'flow' | 'id' | 'inviter_user_id' | 'origin_channel' | 'updated_at'
  >,
  { readonly status: string }
>;
type GeneratedFriendshipInviteDeliveryRow =
  Database['public']['Views']['v_friendship_invite_deliveries_live']['Row'];
type FriendshipInviteDeliveryRow = OverrideFields<
  NonNullFields<
    GeneratedFriendshipInviteDeliveryRow,
    'channel' | 'created_at' | 'id' | 'invite_id'
  >,
  { readonly status: string }
>;
type GeneratedAccountInviteRow = Database['public']['Views']['v_account_invites_live']['Row'];
type AccountInviteRow = OverrideFields<
  NonNullFields<
    GeneratedAccountInviteRow,
    'created_at' | 'expires_at' | 'id' | 'inviter_user_id' | 'updated_at'
  >,
  { readonly status: string }
>;
type GeneratedAccountInviteDeliveryRow =
  Database['public']['Views']['v_account_invite_deliveries_live']['Row'];
type AccountInviteDeliveryRow = NonNullFields<
  GeneratedAccountInviteDeliveryRow,
  'channel' | 'created_at' | 'id' | 'invite_id' | 'status'
>;
type FinancialRequestRow = Database['public']['Tables']['financial_requests']['Row'];
type AuditEventRow = Database['public']['Tables']['audit_events']['Row'];
type SettlementProposalRow = Database['public']['Tables']['settlement_proposals']['Row'];
type SettlementParticipantRow =
  Database['public']['Tables']['settlement_proposal_participants']['Row'];
type UserProfileRow = Database['public']['Tables']['user_profiles']['Row'];
type NotificationViewRow = Database['public']['Tables']['notification_views']['Row'];
type OpenDebtRow = NonNullFields<
  Database['public']['Views']['v_open_debts']['Row'],
  | 'amount_minor'
  | 'creditor_user_id'
  | 'currency_code'
  | 'debtor_user_id'
  | 'relationship_id'
  | 'user_high_id'
  | 'user_low_id'
>;
type RelationshipHistoryRow = NonNullFields<
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
type InboxItemRow = NonNullFields<
  Database['public']['Views']['v_inbox_items']['Row'],
  'created_at' | 'item_id' | 'item_kind' | 'owner_user_id' | 'status'
>;

interface AuditListItem {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
}

interface SettlementMovement {
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

function normalizeSettlementDetailDecision(decision: string | null): SettlementDetailDecision {
  if (decision === 'approved') {
    return 'approved';
  }

  if (decision === 'rejected') {
    return 'rejected';
  }

  return 'pending';
}

interface TimelineEventDraft {
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

interface ActionableItem {
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

interface InviteProfilePresentation {
  readonly displayName: string;
  readonly avatarUrl: string | null;
  readonly phoneLabel: string | null;
  readonly emailLabel: string | null;
  readonly referenceLabel: string | null;
  readonly roleLabel: string | null;
}

type LivePersonDetailDto = PersonDetailDto & {
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

interface CreateRequestInput {
  readonly responderUserId: string;
  readonly debtorUserId: string;
  readonly creditorUserId: string;
  readonly amountMinor: number;
  readonly description: string;
  readonly category?: TransactionCategory;
}

const APP_SNAPSHOT_QUERY_KEY = 'app-snapshot';
const LIVE_SNAPSHOT_TIMEOUT_MS = 20_000;

function createSnapshotAbortSignal(parentSignal?: AbortSignal) {
  const controller = new AbortController();
  let timedOut = false;
  let rejectTimeout: (error: Error) => void = () => undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    rejectTimeout = reject;
  });

  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
    rejectTimeout(
      new Error('La sincronizacion tardo demasiado. Revisa tu conexion e intenta de nuevo.'),
    );
  }, LIVE_SNAPSHOT_TIMEOUT_MS);

  const abortFromParent = () => {
    controller.abort();
  };

  if (parentSignal?.aborted) {
    abortFromParent();
  } else {
    parentSignal?.addEventListener('abort', abortFromParent, { once: true });
  }

  return {
    cleanup: () => {
      clearTimeout(timeoutId);
      parentSignal?.removeEventListener('abort', abortFromParent);
    },
    signal: controller.signal,
    timeoutPromise,
    wasTimedOut: () => timedOut,
  };
}

function assertSupabaseClient() {
  if (!supabase) {
    throw new Error('Supabase no esta configurado en esta app.');
  }

  return supabase;
}

export function notificationViewKeyForItem(
  item: Pick<ActivityItemDto, 'id' | 'kind' | 'status'>,
): string {
  return [item.kind, item.id, item.status].map((part) => String(part).trim()).join(':');
}

function notificationViewRowForItem(
  userId: string,
  item: Pick<ActivityItemDto, 'id' | 'kind' | 'status'>,
): Database['public']['Tables']['notification_views']['Insert'] {
  return {
    user_id: userId,
    notification_key: notificationViewKeyForItem(item),
    notification_kind: String(item.kind),
    source_item_id: String(item.id),
    notification_status: String(item.status),
    viewed_at: new Date().toISOString(),
  };
}

function getCounterpartyUserId(
  relationship: RelationshipRow,
  currentUserId: string,
): string | null {
  if (relationship.user_low_id === currentUserId) {
    return relationship.user_high_id;
  }

  if (relationship.user_high_id === currentUserId) {
    return relationship.user_low_id;
  }

  return null;
}

function formatRelativeLabel(value: string): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return 'recientemente';
  }

  const diffMs = Date.now() - timestamp;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) {
    return 'hace un momento';
  }

  if (diffMs < hour) {
    return `hace ${Math.max(1, Math.round(diffMs / minute))} min`;
  }

  if (diffMs < day) {
    return `hace ${Math.max(1, Math.round(diffMs / hour))} h`;
  }

  if (diffMs < 7 * day) {
    return `hace ${Math.max(1, Math.round(diffMs / day))} d`;
  }

  return new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'short',
  }).format(new Date(timestamp));
}

function groupBy<K extends string, V>(items: readonly V[], getKey: (item: V) => K): Map<K, V[]> {
  const grouped = new Map<K, V[]>();

  for (const item of items) {
    const key = getKey(item);
    const bucket = grouped.get(key);
    if (bucket) {
      bucket.push(item);
      continue;
    }

    grouped.set(key, [item]);
  }

  return grouped;
}

function buildNameByUserId(
  profiles: readonly UserProfileRow[],
  currentUserId: string,
): Map<string, string> {
  const names = new Map<string, string>();

  for (const profile of profiles) {
    names.set(profile.id, profile.id === currentUserId ? 'Tu' : profile.display_name);
  }

  return names;
}

function buildProfileByUserId(profiles: readonly UserProfileRow[]): Map<string, UserProfileRow> {
  return new Map(profiles.map((profile) => [profile.id, profile]));
}

function deriveDirection(
  currentUserId: string,
  edge: OpenDebtRow | undefined,
): PersonCardDto['direction'] {
  if (edge) {
    return edge.creditor_user_id === currentUserId ? 'owes_me' : 'i_owe';
  }

  return 'settled';
}

function sortByNewest<T extends { readonly createdAt: string }>(items: readonly T[]): T[] {
  return [...items].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
}

function actionablePriority(item: {
  readonly kind: PendingActionDto['kind'];
  readonly status: string;
}): number {
  if (item.kind === 'settlement_proposal' && item.status === 'approved') {
    return 0;
  }

  if (item.kind === 'settlement_proposal') {
    return 1;
  }

  if (item.kind === 'financial_request') {
    return 2;
  }

  if (item.kind === 'friendship_invite') {
    return 3;
  }

  return 4;
}

function sortActionableItems<
  T extends {
    readonly kind: PendingActionDto['kind'];
    readonly status: string;
    readonly createdAt: string;
    readonly title: string;
  },
>(items: readonly T[]): T[] {
  return [...items].sort((left, right) => {
    const priorityDiff = actionablePriority(left) - actionablePriority(right);
    if (priorityDiff !== 0) {
      return priorityDiff;
    }

    const timeDiff = Date.parse(right.createdAt) - Date.parse(left.createdAt);
    if (timeDiff !== 0) {
      return timeDiff;
    }

    return left.title.localeCompare(right.title, 'es-CO');
  });
}

function sortHistoryItems<
  T extends {
    readonly id: string;
    readonly kind: ActivityItemDto['kind'];
    readonly status: string;
    readonly happenedAt?: string;
  },
>(items: readonly T[]): T[] {
  return [...items].sort(compareHistoryItems);
}

function uniqueActivityItemsById<T extends { readonly id: string }>(items: readonly T[]): T[] {
  const seenIds = new Set<string>();
  const uniqueItems: T[] = [];

  for (const item of items) {
    if (seenIds.has(item.id)) {
      continue;
    }

    seenIds.add(item.id);
    uniqueItems.push(item);
  }

  return uniqueItems;
}

function actionableItemToActivityItem(item: ActionableItem): ActivityItemDto {
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    subtitle: item.subtitle,
    status: item.status,
    href: item.href,
    amountMinor: item.amountMinor,
    category: item.category,
    counterpartyLabel: item.counterpartyLabel,
    tone: item.tone,
    pendingHistorySteps: item.pendingHistorySteps,
  };
}

function sortPeople(left: PersonCardDto, right: PersonCardDto): number {
  if (left.pendingCount !== right.pendingCount) {
    return right.pendingCount - left.pendingCount;
  }

  const amountDiff = Math.abs(right.netAmountMinor) - Math.abs(left.netAmountMinor);
  if (amountDiff !== 0) {
    return amountDiff;
  }

  return left.displayName.localeCompare(right.displayName, 'es-CO');
}

function requestDirectionForUser(
  request: Pick<FinancialRequestRow, 'creditor_user_id' | 'debtor_user_id'>,
  currentUserId: string,
): 'i_owe' | 'owes_me' {
  return request.creditor_user_id === currentUserId ? 'owes_me' : 'i_owe';
}

function historyFlowLabelForCurrentUser(
  row: Pick<RelationshipHistoryRow, 'creditor_user_id' | 'debtor_user_id'>,
  currentUserId: string,
): 'entrada' | 'salida' | null {
  if (row.creditor_user_id === currentUserId) {
    return 'entrada';
  }

  if (row.debtor_user_id === currentUserId) {
    return 'salida';
  }

  return null;
}

function buildPendingRequestImpactTitle(input: {
  readonly request: FinancialRequestRow;
  readonly currentUserId: string;
}): string {
  const { request, currentUserId } = input;
  const direction = requestDirectionForUser(request, currentUserId);

  return direction === 'owes_me' ? 'Entrada propuesta' : 'Salida propuesta';
}

function formatPendingRequestTitle(request: FinancialRequestRow, currentUserId: string): string {
  return buildPendingRequestImpactTitle({
    request,
    currentUserId,
  });
}

function formatPendingRequestSubtitle(
  request: FinancialRequestRow,
  names: Map<string, string>,
  currentUserId: string,
  counterpartyName: string,
): string {
  const creatorName = userLabelForRequest(
    request.creator_user_id,
    currentUserId,
    counterpartyName,
    names,
    'Persona',
  );
  return [
    creatorName,
    request.description ?? 'Sin descripcion',
    formatRelativeLabel(request.created_at),
  ].join(' | ');
}

function pendingRequestHistoryTitle(index: number, total: number): string {
  if (total <= 1) {
    return 'Propuesta actual';
  }

  if (index === 0) {
    return 'Propuesta inicial';
  }

  if (index === total - 1) {
    return 'Monto actual';
  }

  return 'Cambio propuesto';
}

function buildPendingRequestHistorySteps(input: {
  readonly request: FinancialRequestRow;
  readonly requestsById: ReadonlyMap<string, FinancialRequestRow>;
  readonly currentUserId: string;
  readonly counterpartyName: string;
  readonly names: Map<string, string>;
}): readonly PendingRequestHistoryStepDto[] {
  const chain: FinancialRequestRow[] = [];
  const seenIds = new Set<string>();
  let currentRequest: FinancialRequestRow | undefined = input.request;

  while (currentRequest && !seenIds.has(currentRequest.id) && chain.length < 20) {
    chain.push(currentRequest);
    seenIds.add(currentRequest.id);
    currentRequest = currentRequest.parent_request_id
      ? input.requestsById.get(currentRequest.parent_request_id)
      : undefined;
  }

  const chronologicalChain = [...chain].reverse();

  return chronologicalChain.map((request, index) => ({
    id: request.id,
    title: pendingRequestHistoryTitle(index, chronologicalChain.length),
    description: request.description ?? 'Sin descripcion',
    amountMinor: request.amount_minor,
    category: normalizeTransactionCategory(request.category),
    createdAtLabel: formatRelativeLabel(request.created_at),
    createdByLabel: userLabelForRequest(
      request.creator_user_id,
      input.currentUserId,
      input.counterpartyName,
      input.names,
      'Persona',
    ),
    status: request.status,
    isCurrent: request.id === input.request.id,
  }));
}

function buildPersonPendingRequest(input: {
  readonly request: FinancialRequestRow;
  readonly currentUserId: string;
  readonly counterpartyName: string;
  readonly names: Map<string, string>;
}): PersonPendingRequestDto {
  const { request, currentUserId, counterpartyName, names } = input;
  const requestKind: PersonPendingRequestDto['requestKind'] =
    request.request_type === 'transaction_reversal' ? request.request_type : 'balance_increase';

  return {
    id: request.id,
    requestKind,
    responseState:
      request.responder_user_id === currentUserId ? 'requires_you' : 'waiting_other_side',
    tone: requestDirectionForUser(request, currentUserId) === 'owes_me' ? 'positive' : 'negative',
    category: normalizeTransactionCategory(request.category),
    title: buildPendingRequestImpactTitle({
      request,
      currentUserId,
    }),
    description: request.description ?? 'Sin descripcion',
    amountMinor: request.amount_minor,
    createdAtLabel: formatRelativeLabel(request.created_at),
    createdByLabel: userLabelForRequest(
      request.creator_user_id,
      currentUserId,
      counterpartyName,
      names,
      'Persona',
    ),
  };
}

function userLabelForRequest(
  userId: string | null | undefined,
  currentUserId: string,
  counterpartyName: string,
  names: Map<string, string>,
  fallback: string,
): string {
  if (!userId) {
    return fallback;
  }

  return userId === currentUserId ? 'Tu' : (names.get(userId) ?? counterpartyName);
}

function resolveRootRequestId(
  requestId: string,
  requestsById: ReadonlyMap<string, FinancialRequestRow>,
): string {
  let currentId = requestId;
  let guard = 0;

  while (guard < 20) {
    const request = requestsById.get(currentId);
    if (!request?.parent_request_id) {
      return request?.id ?? currentId;
    }

    currentId = request.parent_request_id;
    guard += 1;
  }

  return currentId;
}

function normalizeComparableText(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLocaleLowerCase('es-CO');
  return normalized && normalized.length > 0 ? normalized : null;
}

function requestTypeFromAcceptanceSubtype(
  subtype: RelationshipHistoryRow['subtype'],
): FinancialRequestRow['request_type'] | null {
  if (subtype === 'balance_increase_acceptance') {
    return 'balance_increase';
  }

  if (subtype === 'transaction_reversal_acceptance') {
    return 'transaction_reversal';
  }

  return null;
}

function inferOriginRequestIdFromLedgerRow(input: {
  readonly row: RelationshipHistoryRow;
  readonly requests: readonly FinancialRequestRow[];
  readonly requestsById: ReadonlyMap<string, FinancialRequestRow>;
}): string | null {
  const requestType = requestTypeFromAcceptanceSubtype(input.row.subtype);
  if (!requestType) {
    return null;
  }

  const happenedAt = Date.parse(input.row.happened_at);
  if (Number.isNaN(happenedAt)) {
    return null;
  }

  const normalizedDescription = normalizeComparableText(input.row.description);
  const candidates = input.requests
    .filter((request) => {
      if (request.status !== 'accepted' || request.request_type !== requestType) {
        return false;
      }

      if (request.amount_minor !== input.row.amount_minor) {
        return false;
      }

      if (
        request.debtor_user_id !== input.row.debtor_user_id ||
        request.creditor_user_id !== input.row.creditor_user_id
      ) {
        return false;
      }

      const resolvedAt = Date.parse(
        request.resolved_at ?? request.updated_at ?? request.created_at,
      );
      if (Number.isNaN(resolvedAt) || Math.abs(resolvedAt - happenedAt) > 60_000) {
        return false;
      }

      const requestDescription = normalizeComparableText(request.description);
      return !normalizedDescription || requestDescription === normalizedDescription;
    })
    .sort((left, right) => {
      const leftResolvedAt = Date.parse(left.resolved_at ?? left.updated_at ?? left.created_at);
      const rightResolvedAt = Date.parse(right.resolved_at ?? right.updated_at ?? right.created_at);
      return Math.abs(leftResolvedAt - happenedAt) - Math.abs(rightResolvedAt - happenedAt);
    });

  if (candidates.length === 0) {
    return null;
  }

  return resolveRootRequestId(candidates[0].id, input.requestsById);
}

function buildRequestFlowLabelFromRequest(
  request: FinancialRequestRow,
  currentUserId: string,
  counterpartyName: string,
  names: Map<string, string>,
): string {
  const creator = userLabelForRequest(
    request.creator_user_id,
    currentUserId,
    counterpartyName,
    names,
    'Persona',
  );
  const responder = userLabelForRequest(
    request.responder_user_id,
    currentUserId,
    counterpartyName,
    names,
    'La otra persona',
  );

  return `${creator} -> ${responder}`;
}

function buildRequestCreatedTitle(
  request: FinancialRequestRow,
  currentUserId: string,
  counterpartyName: string,
  names: Map<string, string>,
): string {
  const creator = userLabelForRequest(
    request.creator_user_id,
    currentUserId,
    counterpartyName,
    names,
    'Persona',
  );

  if (request.parent_request_id) {
    return `${creator} propuso un nuevo monto`;
  }

  if (request.request_type === 'transaction_reversal') {
    return `${creator} propuso ajustar el movimiento`;
  }

  return `${creator} propuso una ${requestDirectionForUser(request, currentUserId) === 'owes_me' ? 'entrada' : 'salida'}`;
}

function buildRequestResolutionTitle(
  request: FinancialRequestRow,
  currentUserId: string,
  counterpartyName: string,
  names: Map<string, string>,
): string | null {
  const responder = userLabelForRequest(
    request.responder_user_id,
    currentUserId,
    counterpartyName,
    names,
    'La otra persona',
  );

  if (request.status === 'accepted') {
    if (request.parent_request_id) {
      return `${responder} acepto el nuevo monto`;
    }

    if (request.request_type === 'transaction_reversal') {
      return `${responder} acepto el ajuste`;
    }

    return `${responder} acepto la propuesta`;
  }

  if (request.status === 'rejected') {
    if (request.parent_request_id) {
      return `${responder} no acepto el nuevo monto`;
    }

    if (request.request_type === 'transaction_reversal') {
      return `${responder} no acepto el ajuste`;
    }

    return `${responder} no acepto la propuesta`;
  }

  if (request.status === 'canceled') {
    return 'La propuesta fue cancelada';
  }

  if (request.status === 'expired') {
    return 'La propuesta expiro';
  }

  if (request.status === 'amended') {
    return `${responder} propuso un nuevo monto`;
  }

  return null;
}

function requestToneForStatus(
  request: FinancialRequestRow,
  currentUserId: string,
  status: FinancialRequestRow['status'],
): PersonTimelineItemDto['tone'] {
  if (
    status === 'rejected' ||
    status === 'amended' ||
    status === 'canceled' ||
    status === 'expired'
  ) {
    return 'neutral';
  }

  if (request.creditor_user_id === currentUserId) {
    return 'positive';
  }

  if (request.debtor_user_id === currentUserId) {
    return 'negative';
  }

  return 'neutral';
}

function buildRequestEventSubtitle(
  flowLabel: string,
  description: string | null,
  happenedAt: string,
): string {
  return [flowLabel, description ?? 'Sin descripcion', formatRelativeLabel(happenedAt)].join(' | ');
}

function buildPersonTimeline(input: {
  readonly requests: readonly FinancialRequestRow[];
  readonly historyRows: readonly RelationshipHistoryRow[];
  readonly currentUserId: string;
  readonly counterpartyName: string;
  readonly names: Map<string, string>;
}): PersonTimelineItemDto[] {
  const requestById = new Map(input.requests.map((request) => [request.id, request]));
  const requestIdsWithChildren = new Set(
    input.requests.flatMap((request) =>
      request.parent_request_id ? [request.parent_request_id] : [],
    ),
  );
  const drafts: TimelineEventDraft[] = [];

  for (const request of input.requests) {
    const rootRequestId = resolveRootRequestId(request.id, requestById);
    const flowLabel = buildRequestFlowLabelFromRequest(
      request,
      input.currentUserId,
      input.counterpartyName,
      input.names,
    );

    drafts.push({
      id: `${request.id}:created`,
      title: buildRequestCreatedTitle(
        request,
        input.currentUserId,
        input.counterpartyName,
        input.names,
      ),
      subtitle: buildRequestEventSubtitle(flowLabel, request.description, request.created_at),
      amountMinor: request.amount_minor,
      category: normalizeTransactionCategory(request.category),
      tone: requestToneForStatus(request, input.currentUserId, 'pending'),
      kind: 'request',
      status: 'pending',
      sourceType: 'user',
      sourceLabel: 'Usuario',
      originRequestId: rootRequestId,
      originSettlementProposalId: undefined,
      flowLabel,
      detail: request.description ?? undefined,
      happenedAt: request.created_at,
      sortWeight: 1,
    });

    const resolutionTitle = buildRequestResolutionTitle(
      request,
      input.currentUserId,
      input.counterpartyName,
      input.names,
    );
    const resolutionAt = request.resolved_at ?? request.updated_at;
    const shouldAddAmendedFallback =
      request.status === 'amended' && !requestIdsWithChildren.has(request.id);

    if (
      resolutionTitle &&
      resolutionAt &&
      (request.status === 'accepted' ||
        request.status === 'rejected' ||
        request.status === 'canceled' ||
        request.status === 'expired' ||
        shouldAddAmendedFallback)
    ) {
      drafts.push({
        id: `${request.id}:${request.status}`,
        title: resolutionTitle,
        subtitle: buildRequestEventSubtitle(flowLabel, request.description, resolutionAt),
        amountMinor: request.amount_minor,
        category: normalizeTransactionCategory(request.category),
        tone: requestToneForStatus(request, input.currentUserId, request.status),
        kind: 'request',
        status: request.status,
        sourceType: 'user',
        sourceLabel: 'Usuario',
        originRequestId: rootRequestId,
        originSettlementProposalId: undefined,
        flowLabel,
        detail: request.description ?? undefined,
        happenedAt: resolutionAt,
        sortWeight: 2,
      });
    }
  }

  for (const row of input.historyRows) {
    if (row.item_kind !== 'ledger_transaction') {
      continue;
    }

    const originRequestId = row.origin_request_id
      ? resolveRootRequestId(row.origin_request_id, requestById)
      : inferOriginRequestIdFromLedgerRow({
          row,
          requests: input.requests,
          requestsById: requestById,
        });

    drafts.push({
      id: row.item_id,
      title: buildTimelineStepTitle(row, input.currentUserId, input.counterpartyName, input.names),
      subtitle: buildHistorySubtitle(row, input.currentUserId, input.counterpartyName, input.names),
      amountMinor: row.amount_minor,
      category: normalizeTransactionCategory(row.category),
      tone: historyToneForRow(row, input.currentUserId),
      kind: historyKindForTimeline(row),
      status: row.status,
      sourceType: sourceTypeForRow(row),
      sourceLabel: sourceTypeForRow(row) === 'system' ? 'Sistema' : 'Usuario',
      originRequestId: originRequestId ?? row.item_id,
      originSettlementProposalId: row.origin_settlement_proposal_id ?? undefined,
      flowLabel: buildMovementFlowLabel(row, input.names) ?? undefined,
      detail: row.description ?? undefined,
      happenedAt: row.happened_at,
      sortWeight: 3,
    });
  }

  return drafts
    .sort((left, right) => {
      const timeDiff = Date.parse(right.happenedAt) - Date.parse(left.happenedAt);
      if (timeDiff !== 0) {
        return timeDiff;
      }

      if (left.sortWeight !== right.sortWeight) {
        return right.sortWeight - left.sortWeight;
      }

      return right.id.localeCompare(left.id);
    })
    .map(
      (event): PersonTimelineItemDto => ({
        id: event.id,
        title: event.title,
        subtitle: event.subtitle,
        amountMinor: event.amountMinor,
        category: event.category,
        tone: event.tone,
        kind: event.kind,
        status: event.status,
        sourceType: event.sourceType,
        sourceLabel: event.sourceLabel,
        originRequestId: event.originRequestId,
        originSettlementProposalId: event.originSettlementProposalId,
        flowLabel: event.flowLabel,
        detail: event.detail,
        happenedAt: event.happenedAt,
        happenedAtLabel: formatRelativeLabel(event.happenedAt),
      }),
    );
}

function parseSettlementMovements(
  value: Database['public']['Tables']['settlement_proposals']['Row']['movements_json'],
) {
  if (!Array.isArray(value)) {
    return [] as SettlementMovement[];
  }

  return value.flatMap((entry) => {
    if (Array.isArray(entry) || typeof entry !== 'object' || entry === null) {
      return [];
    }

    const debtorUserId = entry['debtor_user_id'];
    const creditorUserId = entry['creditor_user_id'];
    const amountMinor = entry['amount_minor'];

    if (
      typeof debtorUserId === 'string' &&
      typeof creditorUserId === 'string' &&
      typeof amountMinor === 'number'
    ) {
      return [
        {
          debtor_user_id: debtorUserId,
          creditor_user_id: creditorUserId,
          amount_minor: amountMinor,
        },
      ];
    }

    return [];
  });
}

function buildPendingSettlementItems(
  proposals: readonly SettlementProposalRow[],
  participantsByProposalId: Map<string, SettlementParticipantRow[]>,
  names: Map<string, string>,
  currentUserId: string,
  visibleCounterpartyUserIds: ReadonlySet<string>,
  inboxItems: readonly InboxItemRow[],
): ActionableItem[] {
  const proposalById = new Map(proposals.map((proposal) => [proposal.id, proposal]));
  const pendingProposalIds = new Set<string>();
  const items: ActionableItem[] = [];

  for (const inboxItem of inboxItems) {
    if (
      inboxItem.owner_user_id !== currentUserId ||
      inboxItem.item_kind !== 'settlement_proposal' ||
      inboxItem.status !== 'pending_approvals'
    ) {
      continue;
    }

    const proposal = proposalById.get(inboxItem.item_id);
    if (!proposal) {
      continue;
    }

    const participants = participantsByProposalId.get(proposal.id) ?? [];
    const participantLabels = buildSettlementParticipantLabels({
      participantUserIds: participants.map((participant) => participant.participant_user_id),
      currentUserId,
      visibleCounterpartyUserIds,
      names,
    });
    const titleBase = `Ajusta saldos con ${summarizeSettlementParticipants(participantLabels)}`;

    pendingProposalIds.add(proposal.id);
    items.push({
      id: proposal.id,
      kind: 'settlement_proposal',
      title: 'Happy Circle pendiente',
      subtitle: `${titleBase} | ${formatRelativeLabel(proposal.created_at)}`,
      status: 'pending_approvals',
      ctaLabel: 'Revisar',
      href: `/settlements/${proposal.id}`,
      amountMinor: settlementProposalTotalAmount(proposal),
      category: 'cycle',
      participantUserIds: participants.map((participant) => participant.participant_user_id),
      createdAt: proposal.created_at,
    });
  }

  for (const proposal of proposals) {
    if (pendingProposalIds.has(proposal.id)) {
      continue;
    }

    const participants = participantsByProposalId.get(proposal.id) ?? [];
    const actorParticipant = participants.find(
      (participant) => participant.participant_user_id === currentUserId,
    );
    const participantLabels = buildSettlementParticipantLabels({
      participantUserIds: participants.map((participant) => participant.participant_user_id),
      currentUserId,
      visibleCounterpartyUserIds,
      names,
    });
    const titleBase = `Ajusta saldos con ${summarizeSettlementParticipants(participantLabels)}`;

    if (proposal.status === 'pending_approvals' && actorParticipant?.decision === 'approved') {
      const approvalsPending = participants.filter(
        (participant) => participant.decision === 'pending',
      ).length;

      items.push({
        id: proposal.id,
        kind: 'settlement_proposal',
        title: 'Happy Circle esperando aprobaciones',
        subtitle: `${titleBase} | faltan ${approvalsPending} aprobacion${approvalsPending === 1 ? '' : 'es'}`,
        status: 'waiting_other_side',
        ctaLabel: 'Revisar',
        href: `/settlements/${proposal.id}`,
        amountMinor: settlementProposalTotalAmount(proposal),
        category: 'cycle',
        participantUserIds: participants.map((participant) => participant.participant_user_id),
        createdAt: proposal.created_at,
      });
    }

    if (proposal.status === 'approved' && !proposal.executed_at) {
      items.push({
        id: proposal.id,
        kind: 'settlement_proposal',
        title: 'Happy Circle listo',
        subtitle: `${titleBase} | ya puedes completarlo`,
        status: 'approved',
        ctaLabel: 'Completar',
        href: `/settlements/${proposal.id}`,
        amountMinor: settlementProposalTotalAmount(proposal),
        category: 'cycle',
        participantUserIds: participants.map((participant) => participant.participant_user_id),
        createdAt: proposal.created_at,
      });
    }
  }

  return items;
}

function settlementProposalTotalAmount(proposal: SettlementProposalRow): number {
  return parseSettlementMovements(proposal.movements_json).reduce(
    (total, movement) => total + movement.amount_minor,
    0,
  );
}

function settlementSavedMovementsCount(participantCount: number, movementCount: number): number {
  return Math.max(participantCount - movementCount, 0);
}

function settlementParticipantLabel(input: {
  readonly participantUserId: string;
  readonly currentUserId: string;
  readonly visibleCounterpartyUserIds: ReadonlySet<string>;
  readonly names: Map<string, string>;
}): string | null {
  if (input.participantUserId === input.currentUserId) {
    return 'Tu';
  }

  if (input.visibleCounterpartyUserIds.has(input.participantUserId)) {
    return input.names.get(input.participantUserId) ?? 'Persona';
  }

  return null;
}

function buildSettlementParticipantLabels(input: {
  readonly participantUserIds: readonly string[];
  readonly currentUserId: string;
  readonly visibleCounterpartyUserIds: ReadonlySet<string>;
  readonly names: Map<string, string>;
}): readonly string[] {
  const labels: string[] = [];
  let hiddenCount = 0;

  for (const participantUserId of input.participantUserIds) {
    const label = settlementParticipantLabel({
      participantUserId,
      currentUserId: input.currentUserId,
      visibleCounterpartyUserIds: input.visibleCounterpartyUserIds,
      names: input.names,
    });

    if (label) {
      if (!labels.includes(label)) {
        labels.push(label);
      }
      continue;
    }

    hiddenCount += 1;
  }

  if (hiddenCount === 1) {
    labels.push('Otra persona');
  } else if (hiddenCount > 1) {
    labels.push(`${hiddenCount} personas mas`);
  }

  return labels;
}

function summarizeSettlementParticipants(labels: readonly string[]): string {
  const others = labels.filter((label) => label !== 'Tu');

  if (others.length === 0) {
    return 'tu circulo';
  }

  if (others.length === 1) {
    return others[0] ?? 'tu circulo';
  }

  if (others.length === 2) {
    return `${others[0]} y ${others[1]}`;
  }

  return `${others[0]} y ${others.length - 1} mas`;
}

function buildSettlementProposalHistoryTimelineItems(input: {
  readonly proposals: readonly SettlementProposalRow[];
  readonly participantsByProposalId: Map<string, SettlementParticipantRow[]>;
  readonly currentUserId: string;
  readonly counterpartyUserId: string;
  readonly names: Map<string, string>;
}): PersonTimelineItemDto[] {
  return input.proposals.flatMap((proposal): PersonTimelineItemDto[] => {
    if (proposal.status !== 'rejected' && proposal.status !== 'stale') {
      return [];
    }

    const participants = input.participantsByProposalId.get(proposal.id) ?? [];
    const participantIds = new Set(
      participants.map((participant) => participant.participant_user_id),
    );
    if (!participantIds.has(input.currentUserId) || !participantIds.has(input.counterpartyUserId)) {
      return [];
    }

    const happenedAt = proposal.updated_at ?? proposal.created_at;
    const otherNames = participants
      .map((participant) => input.names.get(participant.participant_user_id) ?? 'Persona')
      .filter((name) => name !== 'Tu');
    const detail =
      proposal.status === 'rejected' ? 'Este Circle no se completo' : 'Este Circle fue reemplazado';
    const peopleLabel = otherNames.length > 0 ? `Con ${otherNames.join(', ')}` : 'Happy Circle';

    return [
      {
        id: `${proposal.id}:${proposal.status}`,
        title:
          proposal.status === 'rejected'
            ? 'Happy Circle no completado'
            : 'Happy Circle reemplazado',
        subtitle: [peopleLabel, detail, formatRelativeLabel(happenedAt)].join(' | '),
        amountMinor: settlementProposalTotalAmount(proposal),
        category: 'cycle',
        tone: 'neutral',
        kind: 'settlement',
        status: proposal.status,
        sourceType: 'system',
        sourceLabel: 'Happy Circle',
        originRequestId: undefined,
        originSettlementProposalId: proposal.id,
        flowLabel: peopleLabel,
        detail,
        happenedAt,
        happenedAtLabel: formatRelativeLabel(happenedAt),
      },
    ];
  });
}

function parseFriendshipClaimantSnapshot(
  value: Database['public']['Tables']['friendship_invites']['Row']['claimant_snapshot'],
): FriendshipClaimantSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const snapshot = value as Record<string, unknown>;
  return {
    displayName:
      typeof snapshot.displayName === 'string' && snapshot.displayName.trim().length > 0
        ? snapshot.displayName.trim()
        : 'Persona',
    avatarPath:
      typeof snapshot.avatarPath === 'string' && snapshot.avatarPath.trim().length > 0
        ? snapshot.avatarPath.trim()
        : null,
    maskedEmail:
      typeof snapshot.maskedEmail === 'string' && snapshot.maskedEmail.trim().length > 0
        ? snapshot.maskedEmail.trim()
        : null,
    maskedPhone:
      typeof snapshot.maskedPhone === 'string' && snapshot.maskedPhone.trim().length > 0
        ? snapshot.maskedPhone.trim()
        : null,
    emailConfirmed: snapshot.emailConfirmed === true,
    phonePresent: snapshot.phonePresent === true,
    phoneVerified: snapshot.phoneVerified === true,
    claimedAt:
      typeof snapshot.claimedAt === 'string' && snapshot.claimedAt.trim().length > 0
        ? snapshot.claimedAt.trim()
        : null,
  };
}

function maskInvitePhone(value: string | null | undefined): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }

  const digits = value.replaceAll(/\D/g, '');
  if (digits.length < 4) {
    return null;
  }

  return `***${digits.slice(-4)}`;
}

function buildIntendedRecipientReferenceFromParts(input: {
  readonly alias: string | null;
  readonly phoneE164: string | null;
}): string | null {
  const parts = [input.alias?.trim() || null, maskInvitePhone(input.phoneE164)].filter(Boolean);

  return parts.length > 0 ? parts.join(' | ') : null;
}

function phoneLabelFromInviteParts(input: {
  readonly label: string | null;
  readonly phoneE164: string | null;
}): string | null {
  const label = input.label?.trim();
  if (label) {
    return label;
  }

  return maskInvitePhone(input.phoneE164);
}

function inviteProfileFromUser(input: {
  readonly fallbackName?: string | null;
  readonly names: Map<string, string>;
  readonly profiles: Map<string, UserProfileRow>;
  readonly referenceLabel?: string | null;
  readonly roleLabel?: string | null;
  readonly userId: string;
}): InviteProfilePresentation {
  const profile = input.profiles.get(input.userId);
  const displayName =
    profile?.display_name?.trim() ||
    input.names.get(input.userId)?.trim() ||
    input.fallbackName?.trim() ||
    'Persona';

  return {
    displayName,
    avatarUrl: profile ? resolveAvatarUrl(profile.avatar_path, profile.updated_at) : null,
    phoneLabel: maskInvitePhone(profile?.phone_e164),
    emailLabel: null,
    referenceLabel: input.referenceLabel?.trim() || null,
    roleLabel: input.roleLabel?.trim() || null,
  };
}

function inviteProfileFromIntendedRecipient(input: {
  readonly alias: string | null;
  readonly phoneE164: string | null;
  readonly phoneLabel: string | null;
  readonly roleLabel?: string | null;
}): InviteProfilePresentation {
  const displayName = input.alias?.trim() || 'Contacto invitado';
  const phoneLabel = phoneLabelFromInviteParts({
    label: input.phoneLabel,
    phoneE164: input.phoneE164,
  });

  return {
    displayName,
    avatarUrl: null,
    phoneLabel,
    emailLabel: null,
    referenceLabel:
      displayName !== 'Contacto invitado' && phoneLabel ? `${displayName} | ${phoneLabel}` : null,
    roleLabel: input.roleLabel?.trim() || null,
  };
}

function inviteProfileFromClaimantSnapshot(
  snapshot: FriendshipClaimantSnapshot | null,
  roleLabel?: string | null,
): InviteProfilePresentation {
  return {
    displayName: snapshot?.displayName?.trim() || 'Persona',
    avatarUrl: resolveAvatarUrl(snapshot?.avatarPath ?? null),
    phoneLabel: snapshot?.maskedPhone ?? null,
    emailLabel: snapshot?.maskedEmail ?? null,
    referenceLabel: null,
    roleLabel: roleLabel?.trim() || null,
  };
}

function inviteProfileFromClaimant(input: {
  readonly claimantUserId: string | null;
  readonly names: Map<string, string>;
  readonly profiles: Map<string, UserProfileRow>;
  readonly snapshot: FriendshipClaimantSnapshot | null;
}): InviteProfilePresentation {
  const snapshotProfile = inviteProfileFromClaimantSnapshot(input.snapshot, 'Perfil reclamado');

  if (!input.claimantUserId) {
    return snapshotProfile;
  }

  const userProfile = inviteProfileFromUser({
    fallbackName: input.snapshot?.displayName,
    names: input.names,
    profiles: input.profiles,
    roleLabel: 'Perfil reclamado',
    userId: input.claimantUserId,
  });

  return {
    displayName:
      userProfile.displayName !== 'Persona' ? userProfile.displayName : snapshotProfile.displayName,
    avatarUrl: userProfile.avatarUrl ?? snapshotProfile.avatarUrl,
    phoneLabel: snapshotProfile.phoneLabel ?? userProfile.phoneLabel,
    emailLabel: snapshotProfile.emailLabel ?? userProfile.emailLabel,
    referenceLabel: userProfile.referenceLabel ?? snapshotProfile.referenceLabel,
    roleLabel: userProfile.roleLabel ?? snapshotProfile.roleLabel,
  };
}

function inviteProfileFields(profile: InviteProfilePresentation): {
  readonly profileDisplayName: string;
  readonly profileAvatarUrl: string | null;
  readonly profilePhoneLabel: string | null;
  readonly profileEmailLabel: string | null;
  readonly profileReferenceLabel: string | null;
  readonly profileRoleLabel: string | null;
} {
  return {
    profileDisplayName: profile.displayName,
    profileAvatarUrl: profile.avatarUrl,
    profilePhoneLabel: profile.phoneLabel,
    profileEmailLabel: profile.emailLabel,
    profileReferenceLabel: profile.referenceLabel,
    profileRoleLabel: profile.roleLabel,
  };
}

function inviteProfileHref(
  profileUserId: string | null,
  inviteId: string,
  panel: 'pending' | 'history',
): string | null {
  return profileUserId
    ? `/person/${encodeURIComponent(profileUserId)}?panel=${panel}&focus=${encodeURIComponent(inviteId)}`
    : null;
}

function intendedInviteProfileFields(profile: InviteProfilePresentation): {
  readonly intendedProfileDisplayName: string | null;
  readonly intendedProfilePhoneLabel: string | null;
} {
  return {
    intendedProfileDisplayName:
      profile.displayName === 'Contacto invitado' ? null : profile.displayName,
    intendedProfilePhoneLabel: profile.phoneLabel,
  };
}

function respondingInviteProfileFields(profile: InviteProfilePresentation | null): {
  readonly respondingProfileDisplayName: string | null;
  readonly respondingProfileAvatarUrl: string | null;
  readonly respondingProfilePhoneLabel: string | null;
  readonly respondingProfileEmailLabel: string | null;
} {
  return {
    respondingProfileDisplayName:
      profile && profile.displayName !== 'Persona' ? profile.displayName : null,
    respondingProfileAvatarUrl: profile?.avatarUrl ?? null,
    respondingProfilePhoneLabel: profile?.phoneLabel ?? null,
    respondingProfileEmailLabel: profile?.emailLabel ?? null,
  };
}

function buildIntendedRecipientReference(invite: FriendshipInviteRow): string | null {
  return buildIntendedRecipientReferenceFromParts({
    alias: invite.intended_recipient_alias,
    phoneE164: invite.intended_recipient_phone_e164,
  });
}

function buildAccountIntendedRecipientReference(invite: AccountInviteRow): string | null {
  return buildIntendedRecipientReferenceFromParts({
    alias: invite.intended_recipient_alias,
    phoneE164: invite.intended_recipient_phone_e164,
  });
}

function channelLabel(channel: string | null | undefined) {
  if (channel === 'internal') {
    return 'Interna';
  }

  if (channel === 'qr') {
    return 'QR';
  }

  return 'Remota';
}

function getFriendshipActorRole(
  invite: FriendshipInviteRow,
  currentUserId: string,
): FriendshipInviteListItem['actorRole'] {
  if (invite.inviter_user_id === currentUserId) {
    return 'sender';
  }

  if (invite.target_user_id === currentUserId) {
    return 'recipient';
  }

  if (invite.claimant_user_id === currentUserId) {
    return 'claimant';
  }

  return 'none';
}

function buildLatestDeliveryByInviteId(
  deliveries: readonly FriendshipInviteDeliveryRow[],
): ReadonlyMap<string, FriendshipInviteDeliveryRow> {
  const map = new Map<string, FriendshipInviteDeliveryRow>();

  for (const delivery of deliveries) {
    const current = map.get(delivery.invite_id);
    if (!current || delivery.created_at > current.created_at) {
      map.set(delivery.invite_id, delivery);
    }
  }

  return map;
}

function inviteTimelineEvent(input: {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly status: string;
  readonly sourceLabel: string;
  readonly detail: 'Invitacion de amistad' | 'Acceso privado';
  readonly happenedAt: string | null | undefined;
  readonly originInviteId: string;
  readonly tone?: PersonTimelineItemDto['tone'];
}): PersonTimelineItemDto | null {
  if (!input.happenedAt) {
    return null;
  }

  return {
    id: input.id,
    title: input.title,
    subtitle: input.subtitle,
    amountMinor: 0,
    tone: input.tone ?? 'neutral',
    kind: 'system',
    status: input.status,
    sourceType: 'user',
    sourceLabel: input.sourceLabel,
    detail: input.detail,
    happenedAt: input.happenedAt,
    happenedAtLabel: formatRelativeLabel(input.happenedAt),
    originRequestId: input.originInviteId,
  };
}

function uniqueTimelineItemsById(
  items: readonly (PersonTimelineItemDto | null)[],
): PersonTimelineItemDto[] {
  const seenIds = new Set<string>();
  const uniqueItems: PersonTimelineItemDto[] = [];

  for (const item of items) {
    if (!item || seenIds.has(item.id)) {
      continue;
    }

    seenIds.add(item.id);
    uniqueItems.push(item);
  }

  return uniqueItems;
}

function inviteTerminalTone(status: string): PersonTimelineItemDto['tone'] {
  if (status === 'accepted') {
    return 'positive';
  }

  if (status === 'rejected' || status === 'expired' || status === 'canceled') {
    return 'negative';
  }

  return 'neutral';
}

function isSpecificInviteName(value: string | null | undefined): boolean {
  const normalized = value?.trim().toLocaleLowerCase('es-CO');
  return Boolean(
    normalized &&
    normalized !== 'persona' &&
    normalized !== 'contacto invitado' &&
    normalized !== 'tu contacto' &&
    normalized !== 'tu',
  );
}

function inviteNamesMatch(left: string | null | undefined, right: string | null | undefined) {
  return left?.trim().toLocaleLowerCase('es-CO') === right?.trim().toLocaleLowerCase('es-CO');
}

function relevantInviteTargetLabel(input: {
  readonly intendedRecipientReference: string | null;
  readonly targetName: string;
}): string {
  if (isSpecificInviteName(input.targetName)) {
    return input.targetName;
  }

  const [referenceName] = input.intendedRecipientReference
    ?.split('|')
    .map((part) => part.trim())
    .filter(Boolean) ?? [null];

  return referenceName ?? input.targetName;
}

function friendshipInviteCurrentStatusTitle(input: {
  readonly actionState: FriendshipInviteListItem['actionState'];
  readonly actorRole: FriendshipInviteListItem['actorRole'];
  readonly claimantName: string;
  readonly inviterName: string;
  readonly targetName: string;
}): string {
  if (input.actionState === 'requires_you_response') {
    return 'Pendiente de tu respuesta';
  }

  if (input.actionState === 'requires_you_review') {
    return `${input.claimantName} espera tu validacion`;
  }

  if (input.actionState === 'waiting_sender_review') {
    return `Esperando validacion de ${input.inviterName}`;
  }

  if (input.actionState === 'pending_claim') {
    return `Esperando a ${input.targetName}`;
  }

  return input.actorRole === 'sender'
    ? `Esperando respuesta de ${input.targetName}`
    : 'Solicitud enviada';
}

function buildFriendshipInviteTimeline(input: {
  readonly invite: FriendshipInviteRow;
  readonly deliveries: readonly FriendshipInviteDeliveryRow[];
  readonly actorRole: FriendshipInviteListItem['actorRole'];
  readonly actionState: FriendshipInviteListItem['actionState'];
  readonly inviterName: string;
  readonly targetName: string;
  readonly claimantName: string;
  readonly intendedRecipientReference: string | null;
}): readonly PersonTimelineItemDto[] {
  const sourceLabel = input.actorRole === 'sender' ? 'Tu' : input.inviterName;
  const deliveryRows = [...input.deliveries].sort((left, right) =>
    left.created_at.localeCompare(right.created_at),
  );
  const claimedDelivery = [...deliveryRows].reverse().find((delivery) => delivery.claimed_at);
  const targetReference = relevantInviteTargetLabel({
    intendedRecipientReference: input.intendedRecipientReference,
    targetName: input.targetName,
  });
  const claimedByDifferentPerson =
    isSpecificInviteName(input.claimantName) &&
    isSpecificInviteName(targetReference) &&
    !inviteNamesMatch(input.claimantName, targetReference);
  const claimedEvent =
    claimedDelivery || input.invite.claimant_user_id
      ? inviteTimelineEvent({
          id: `${input.invite.id}:claimed`,
          title:
            claimedByDifferentPerson && input.actorRole !== 'claimant'
              ? `${input.claimantName} reclamo la invitacion enviada a ${targetReference}`
              : input.actorRole === 'claimant'
                ? 'Reclamaste la invitacion'
                : `${input.claimantName} reclamo la invitacion`,
          subtitle: claimedByDifferentPerson ? 'Requiere verificacion' : 'Solicitud reclamada',
          status:
            input.actionState === 'requires_you_review' ||
            input.actionState === 'waiting_sender_review'
              ? input.actionState
              : 'posted',
          sourceLabel: input.claimantName,
          detail: 'Invitacion de amistad',
          happenedAt: claimedDelivery?.claimed_at ?? input.invite.updated_at,
          originInviteId: input.invite.id,
        })
      : null;
  const currentStatusEvent =
    input.actionState !== 'history'
      ? inviteTimelineEvent({
          id: `${input.invite.id}:current:${input.actionState}`,
          title: friendshipInviteCurrentStatusTitle(input),
          subtitle:
            input.actionState === 'requires_you_review' ||
            input.actionState === 'waiting_sender_review'
              ? 'Por verificar'
              : 'Solicitud de amistad',
          status: input.actionState,
          sourceLabel,
          detail: 'Invitacion de amistad',
          happenedAt: input.invite.updated_at ?? input.invite.created_at,
          originInviteId: input.invite.id,
        })
      : null;
  const terminalEvent =
    input.actionState === 'history'
      ? inviteTimelineEvent({
          id: `${input.invite.id}:resolved`,
          title:
            input.invite.status === 'accepted'
              ? input.actorRole === 'sender'
                ? `Amistad conectada con ${input.claimantName !== 'Persona' ? input.claimantName : input.targetName}`
                : `Amistad conectada con ${input.inviterName}`
              : input.invite.status === 'rejected'
                ? 'La invitacion fue rechazada'
                : input.invite.status === 'expired'
                  ? 'La invitacion expiro'
                  : 'La invitacion fue cancelada',
          subtitle: claimedByDifferentPerson
            ? `${input.claimantName} reclamo la invitacion enviada a ${targetReference}`
            : 'Solicitud de amistad',
          status: input.invite.status,
          sourceLabel,
          detail: 'Invitacion de amistad',
          happenedAt: input.invite.resolved_at ?? input.invite.updated_at,
          originInviteId: input.invite.id,
          tone: inviteTerminalTone(input.invite.status),
        })
      : null;

  return uniqueTimelineItemsById([
    inviteTimelineEvent({
      id: `${input.invite.id}:created`,
      title:
        input.actorRole === 'sender'
          ? `Invitacion enviada a ${targetReference}`
          : `${input.inviterName} envio la invitacion`,
      subtitle: 'Solicitud de amistad',
      status: 'posted',
      sourceLabel,
      detail: 'Invitacion de amistad',
      happenedAt: input.invite.created_at,
      originInviteId: input.invite.id,
    }),
    claimedEvent,
    currentStatusEvent,
    terminalEvent,
  ]).sort((left, right) => Date.parse(left.happenedAt ?? '') - Date.parse(right.happenedAt ?? ''));
}

function buildFriendshipInviteItems(input: {
  readonly invites: readonly FriendshipInviteRow[];
  readonly deliveries: readonly FriendshipInviteDeliveryRow[];
  readonly names: Map<string, string>;
  readonly profiles: Map<string, UserProfileRow>;
  readonly currentUserId: string;
}): {
  readonly pendingItems: readonly FriendshipInviteListItem[];
  readonly historyItems: readonly FriendshipInviteListItem[];
  readonly summary: FriendshipSummary;
} {
  const latestDeliveryByInviteId = buildLatestDeliveryByInviteId(input.deliveries);
  const deliveriesByInviteId = groupBy(input.deliveries, (delivery) => delivery.invite_id);
  const pendingItems: FriendshipInviteListItem[] = [];
  const historyItems: FriendshipInviteListItem[] = [];

  for (const invite of input.invites) {
    const latestDelivery = latestDeliveryByInviteId.get(invite.id);
    const claimantUserId = invite.claimant_user_id ?? latestDelivery?.claimed_by_user_id ?? null;
    let actorRole = getFriendshipActorRole(invite, input.currentUserId);
    if (actorRole === 'none' && claimantUserId === input.currentUserId) {
      actorRole = 'claimant';
    }

    if (actorRole === 'none') {
      continue;
    }

    const claimantSnapshot = parseFriendshipClaimantSnapshot(invite.claimant_snapshot);
    const intendedRecipientProfile = inviteProfileFromIntendedRecipient({
      alias: invite.intended_recipient_alias,
      phoneE164: invite.intended_recipient_phone_e164,
      phoneLabel: invite.intended_recipient_phone_label,
      roleLabel: 'Contacto invitado',
    });
    const inviterProfile = inviteProfileFromUser({
      names: input.names,
      profiles: input.profiles,
      roleLabel: actorRole === 'recipient' ? 'Te envio una solicitud' : 'Contacto de confianza',
      userId: invite.inviter_user_id,
    });
    const targetProfile = invite.target_user_id
      ? inviteProfileFromUser({
          fallbackName: invite.intended_recipient_alias,
          names: input.names,
          profiles: input.profiles,
          referenceLabel: intendedRecipientProfile.referenceLabel,
          roleLabel: 'Solicitud enviada',
          userId: invite.target_user_id,
        })
      : intendedRecipientProfile;
    const claimantProfile = inviteProfileFromClaimant({
      claimantUserId,
      names: input.names,
      profiles: input.profiles,
      snapshot: claimantSnapshot,
    });
    const visibleProfile =
      actorRole === 'sender'
        ? invite.status === 'pending_sender_review' ||
          (invite.flow === 'external' && invite.status !== 'pending_claim')
          ? claimantProfile
          : targetProfile
        : inviterProfile;
    const visibleProfileUserId =
      actorRole === 'sender'
        ? invite.status === 'pending_sender_review' ||
          (invite.flow === 'external' && invite.status !== 'pending_claim')
          ? claimantUserId
          : invite.target_user_id
        : invite.inviter_user_id;
    const respondingProfile =
      invite.flow === 'external' && (claimantUserId || claimantSnapshot) ? claimantProfile : null;
    const inviterName =
      invite.inviter_user_id === input.currentUserId ? 'Tu' : inviterProfile.displayName;
    const targetName = invite.target_user_id
      ? targetProfile.displayName
      : (invite.intended_recipient_alias ?? intendedRecipientProfile.displayName);
    const claimantName = claimantProfile.displayName;
    const intendedRecipientReference = buildIntendedRecipientReference(invite);
    const pieces = [channelLabel(latestDelivery?.channel ?? invite.origin_channel)];
    if (invite.expires_at) {
      pieces.push(`vence ${formatRelativeLabel(invite.expires_at)}`);
    }

    let title = 'Invitacion';
    let subtitle = pieces.join(' | ');
    let actionState: FriendshipInviteListItem['actionState'] = 'history';
    let status = invite.status;

    if (invite.status === 'pending_recipient') {
      if (actorRole === 'recipient') {
        title = `${inviterName} quiere conectar contigo`;
        subtitle = 'Responde esta solicitud';
        actionState = 'requires_you_response';
        status = 'requires_you_response';
      } else {
        title = `Esperando a ${targetName}`;
        subtitle = 'Solicitud pendiente';
        actionState = 'waiting_other_side';
        status = 'waiting_other_side';
      }
    } else if (invite.status === 'pending_claim') {
      title =
        latestDelivery?.channel === 'qr'
          ? invite.intended_recipient_alias
            ? `QR temporal para ${invite.intended_recipient_alias}`
            : 'QR temporal activo'
          : `Invitacion lista para ${invite.intended_recipient_alias ?? 'tu contacto'}`;
      subtitle = [
        intendedRecipientReference,
        latestDelivery?.expires_at
          ? `vence ${formatRelativeLabel(latestDelivery.expires_at)}`
          : null,
      ]
        .filter(Boolean)
        .join(' | ');
      actionState = 'pending_claim';
      status = 'pending_claim';
    } else if (invite.status === 'pending_sender_review') {
      if (actorRole === 'sender') {
        title = `${claimantName} reclamo la invitacion para ${targetName}`;
        subtitle = [
          intendedRecipientReference ? `Pensada para ${intendedRecipientReference}` : null,
          'Por verificar',
        ]
          .filter(Boolean)
          .join(' | ');
        actionState = 'requires_you_review';
        status = 'requires_you_review';
      } else {
        title = `Esperando validacion de ${inviterName}`;
        subtitle = 'Ya reclamaste esta invitacion';
        actionState = 'waiting_sender_review';
        status = 'waiting_sender_review';
      }
    } else {
      const happenedAt = invite.resolved_at ?? invite.updated_at ?? invite.created_at;
      const autoAcceptedByPhoneMatch =
        invite.resolution_reason === 'claim_phone_match_auto_accepted' &&
        invite.flow === 'external';
      title =
        invite.status === 'accepted'
          ? actorRole === 'sender'
            ? invite.flow === 'external'
              ? autoAcceptedByPhoneMatch
                ? `${claimantName} acepto tu invitacion`
                : `Confirmaste a ${claimantName}`
              : `${targetName} acepto tu invitacion`
            : actorRole === 'claimant'
              ? autoAcceptedByPhoneMatch
                ? 'Conexion creada'
                : `${inviterName} confirmo esta conexion`
              : `Aceptaste la invitacion de ${inviterName}`
          : invite.status === 'rejected'
            ? actorRole === 'sender'
              ? invite.flow === 'external'
                ? `Rechazaste a ${claimantName}`
                : `${targetName} rechazo tu invitacion`
              : actorRole === 'claimant'
                ? `${inviterName} rechazo esta conexion`
                : `Rechazaste la invitacion de ${inviterName}`
            : invite.status === 'expired'
              ? actorRole === 'sender'
                ? 'La invitacion vencio'
                : 'Esta invitacion vencio'
              : 'Invitacion cancelada';
      subtitle = [
        actorRole === 'sender' ? intendedRecipientReference : null,
        formatRelativeLabel(happenedAt),
      ]
        .filter(Boolean)
        .join(' | ');
      historyItems.push({
        id: invite.id,
        inviteId: invite.id,
        kind: 'friendship_invite',
        flow: invite.flow as FriendshipInviteListItem['flow'],
        actorRole,
        originChannel: invite.origin_channel as FriendshipInviteListItem['originChannel'],
        actionState: 'history',
        title,
        subtitle,
        status: invite.status,
        ctaLabel: 'Ver',
        href: '/activity',
        sourceType: 'user',
        createdAt: invite.created_at,
        happenedAt,
        happenedAtLabel: formatRelativeLabel(happenedAt),
        counterpartyLabel:
          actorRole === 'sender'
            ? invite.flow === 'external'
              ? claimantProfile.displayName !== 'Persona'
                ? claimantProfile.displayName
                : (invite.intended_recipient_alias ?? undefined)
              : targetName
            : inviterName !== 'Tu'
              ? inviterName
              : undefined,
        expiresAt: invite.expires_at,
        resolvedAt: invite.resolved_at,
        claimantSnapshot,
        intendedRecipientAlias: invite.intended_recipient_alias,
        intendedRecipientPhoneE164: invite.intended_recipient_phone_e164,
        intendedRecipientPhoneLabel: invite.intended_recipient_phone_label,
        profileUserId: visibleProfileUserId,
        profileHref: inviteProfileHref(visibleProfileUserId, invite.id, 'history'),
        profileTimelineItems: buildFriendshipInviteTimeline({
          invite,
          deliveries: deliveriesByInviteId.get(invite.id) ?? [],
          actorRole,
          actionState: 'history',
          inviterName,
          targetName,
          claimantName,
          intendedRecipientReference,
        }),
        ...inviteProfileFields(visibleProfile),
        ...intendedInviteProfileFields(targetProfile),
        ...respondingInviteProfileFields(respondingProfile),
      });
      continue;
    }

    pendingItems.push({
      id: invite.id,
      inviteId: invite.id,
      kind: 'friendship_invite',
      flow: invite.flow as FriendshipInviteListItem['flow'],
      actorRole,
      originChannel: invite.origin_channel as FriendshipInviteListItem['originChannel'],
      actionState,
      title,
      subtitle,
      status,
      ctaLabel:
        actionState === 'requires_you_response'
          ? 'Responder'
          : actionState === 'requires_you_review'
            ? 'Verificar'
            : actionState === 'pending_claim'
              ? latestDelivery?.channel === 'qr'
                ? 'QR activo'
                : 'Compartir'
              : 'Ver',
      href: '/activity',
      createdAt: invite.created_at,
      expiresAt: invite.expires_at,
      resolvedAt: invite.resolved_at,
      claimantSnapshot,
      counterpartyLabel:
        actorRole === 'sender' &&
        invite.flow === 'external' &&
        claimantProfile.displayName !== 'Persona'
          ? claimantProfile.displayName
          : undefined,
      intendedRecipientAlias: invite.intended_recipient_alias,
      intendedRecipientPhoneE164: invite.intended_recipient_phone_e164,
      intendedRecipientPhoneLabel: invite.intended_recipient_phone_label,
      profileUserId: visibleProfileUserId,
      profileHref: inviteProfileHref(visibleProfileUserId, invite.id, 'pending'),
      profileTimelineItems: buildFriendshipInviteTimeline({
        invite,
        deliveries: deliveriesByInviteId.get(invite.id) ?? [],
        actorRole,
        actionState,
        inviterName,
        targetName,
        claimantName,
        intendedRecipientReference,
      }),
      ...inviteProfileFields(visibleProfile),
      ...intendedInviteProfileFields(targetProfile),
      ...respondingInviteProfileFields(respondingProfile),
    });
  }

  return {
    pendingItems: sortByNewest(pendingItems),
    historyItems: sortHistoryItems(historyItems),
    summary: {
      requiresResponseCount: pendingItems.filter(
        (item) => item.actionState === 'requires_you_response',
      ).length,
      requiresReviewCount: pendingItems.filter((item) => item.actionState === 'requires_you_review')
        .length,
      waitingSenderReviewCount: pendingItems.filter(
        (item) => item.actionState === 'waiting_sender_review',
      ).length,
      sentOutsideCount: pendingItems.filter((item) => item.actionState === 'pending_claim').length,
      historyCount: historyItems.length,
    },
  };
}

function normalizeAccountInviteChannel(
  value: string | null | undefined,
): AccountInviteListItem['originChannel'] {
  return value === 'qr' ? 'qr' : 'remote';
}

function getAccountInviteActorRole(
  invite: AccountInviteRow,
  currentUserId: string,
): AccountInviteListItem['actorRole'] {
  if (invite.inviter_user_id === currentUserId) {
    return 'inviter';
  }

  if (invite.activated_user_id === currentUserId) {
    return 'activated';
  }

  return 'none';
}

function buildLatestAccountDeliveryByInviteId(
  deliveries: readonly AccountInviteDeliveryRow[],
): ReadonlyMap<string, AccountInviteDeliveryRow> {
  const map = new Map<string, AccountInviteDeliveryRow>();

  for (const delivery of deliveries) {
    const current = map.get(delivery.invite_id);
    if (!current || delivery.created_at > current.created_at) {
      map.set(delivery.invite_id, delivery);
    }
  }

  return map;
}

function accountInviteCurrentStatusTitle(input: {
  readonly actionState: AccountInviteListItem['actionState'];
  readonly inviterName: string;
  readonly targetName: string;
}): string {
  if (input.actionState === 'requires_you_review') {
    return `${input.targetName} espera tu validacion`;
  }

  if (input.actionState === 'waiting_sender_review') {
    return `Esperando validacion de ${input.inviterName}`;
  }

  return `Esperando activacion de ${input.targetName}`;
}

function buildAccountInviteTimeline(input: {
  readonly invite: AccountInviteRow;
  readonly deliveries: readonly AccountInviteDeliveryRow[];
  readonly actorRole: AccountInviteListItem['actorRole'];
  readonly actionState: AccountInviteListItem['actionState'];
  readonly inviterName: string;
  readonly targetName: string;
  readonly intendedRecipientReference: string | null;
}): readonly PersonTimelineItemDto[] {
  const sourceLabel = input.actorRole === 'inviter' ? 'Tu' : input.inviterName;
  const deliveryRows = [...input.deliveries].sort((left, right) =>
    left.created_at.localeCompare(right.created_at),
  );
  const activationDelivery = [...deliveryRows]
    .reverse()
    .find((delivery) => delivery.activation_completed_at);
  const targetReference = relevantInviteTargetLabel({
    intendedRecipientReference: input.intendedRecipientReference,
    targetName: input.targetName,
  });
  const activatedByDifferentPerson =
    isSpecificInviteName(input.targetName) &&
    isSpecificInviteName(targetReference) &&
    !inviteNamesMatch(input.targetName, targetReference);
  const activationEvent =
    activationDelivery || input.invite.activated_user_id || input.invite.activated_at
      ? inviteTimelineEvent({
          id: `${input.invite.id}:activated`,
          title:
            activatedByDifferentPerson && input.actorRole !== 'activated'
              ? `${input.targetName} activo el acceso enviado a ${targetReference}`
              : input.actorRole === 'activated'
                ? 'Activaste el acceso privado'
                : `${input.targetName} activo el acceso privado`,
          subtitle: activatedByDifferentPerson ? 'Requiere verificacion' : 'Acceso privado',
          status:
            input.actionState === 'requires_you_review' ||
            input.actionState === 'waiting_sender_review'
              ? input.actionState
              : 'posted',
          sourceLabel: input.targetName,
          detail: 'Acceso privado',
          happenedAt:
            activationDelivery?.activation_completed_at ??
            input.invite.activated_at ??
            input.invite.updated_at,
          originInviteId: input.invite.id,
        })
      : null;
  const currentStatusEvent =
    input.actionState !== 'history'
      ? inviteTimelineEvent({
          id: `${input.invite.id}:current:${input.actionState}`,
          title: accountInviteCurrentStatusTitle(input),
          subtitle:
            input.actionState === 'requires_you_review' ||
            input.actionState === 'waiting_sender_review'
              ? 'Por verificar'
              : 'Acceso privado',
          status: input.actionState,
          sourceLabel,
          detail: 'Acceso privado',
          happenedAt: input.invite.updated_at ?? input.invite.created_at,
          originInviteId: input.invite.id,
        })
      : null;
  const terminalEvent =
    input.actionState === 'history'
      ? inviteTimelineEvent({
          id: `${input.invite.id}:resolved`,
          title:
            input.invite.status === 'accepted'
              ? input.actorRole === 'inviter'
                ? `Acceso confirmado para ${input.targetName}`
                : `Acceso confirmado por ${input.inviterName}`
              : input.invite.status === 'rejected'
                ? 'El acceso fue rechazado'
                : input.invite.status === 'expired'
                  ? 'El acceso expiro'
                  : 'El acceso fue cancelado',
          subtitle: activatedByDifferentPerson
            ? `${input.targetName} activo el acceso enviado a ${targetReference}`
            : 'Acceso privado',
          status: input.invite.status,
          sourceLabel,
          detail: 'Acceso privado',
          happenedAt: input.invite.resolved_at ?? input.invite.updated_at,
          originInviteId: input.invite.id,
          tone: inviteTerminalTone(input.invite.status),
        })
      : null;

  return uniqueTimelineItemsById([
    inviteTimelineEvent({
      id: `${input.invite.id}:created`,
      title:
        input.actorRole === 'inviter'
          ? `Acceso privado enviado a ${targetReference}`
          : `${input.inviterName} te envio un acceso privado`,
      subtitle: 'Acceso privado',
      status: 'posted',
      sourceLabel,
      detail: 'Acceso privado',
      happenedAt: input.invite.created_at,
      originInviteId: input.invite.id,
    }),
    activationEvent,
    currentStatusEvent,
    terminalEvent,
  ]).sort((left, right) => Date.parse(left.happenedAt ?? '') - Date.parse(right.happenedAt ?? ''));
}

function buildAccountInviteItems(input: {
  readonly invites: readonly AccountInviteRow[];
  readonly deliveries: readonly AccountInviteDeliveryRow[];
  readonly names: Map<string, string>;
  readonly profiles: Map<string, UserProfileRow>;
  readonly currentUserId: string;
}): {
  readonly pendingItems: readonly AccountInviteListItem[];
  readonly historyItems: readonly AccountInviteListItem[];
  readonly summary: AccountInviteSummary;
} {
  const latestDeliveryByInviteId = buildLatestAccountDeliveryByInviteId(input.deliveries);
  const deliveriesByInviteId = groupBy(input.deliveries, (delivery) => delivery.invite_id);
  const pendingItems: AccountInviteListItem[] = [];
  const historyItems: AccountInviteListItem[] = [];

  for (const invite of input.invites) {
    const actorRole = getAccountInviteActorRole(invite, input.currentUserId);
    if (actorRole === 'none') {
      continue;
    }

    const latestDelivery = latestDeliveryByInviteId.get(invite.id);
    const originChannel = normalizeAccountInviteChannel(latestDelivery?.channel);
    const intendedRecipientProfile = inviteProfileFromIntendedRecipient({
      alias: invite.intended_recipient_alias,
      phoneE164: invite.intended_recipient_phone_e164,
      phoneLabel: invite.intended_recipient_phone_label,
      roleLabel: 'Acceso enviado',
    });
    const inviterProfile = inviteProfileFromUser({
      names: input.names,
      profiles: input.profiles,
      roleLabel: actorRole === 'activated' ? 'Te envio un acceso privado' : 'Contacto de confianza',
      userId: invite.inviter_user_id,
    });
    const inviterName =
      invite.inviter_user_id === input.currentUserId ? 'Tu' : inviterProfile.displayName;
    const activatedUserProfile = invite.activated_user_id
      ? input.profiles.get(invite.activated_user_id)
      : undefined;
    const activatedUserDisplayName = invite.activated_user_id
      ? (input.names.get(invite.activated_user_id) ?? 'Persona')
      : null;
    const activatedUserAvatarUrl = activatedUserProfile
      ? resolveAvatarUrl(activatedUserProfile.avatar_path, activatedUserProfile.updated_at)
      : null;
    const activatedInviteProfile = invite.activated_user_id
      ? inviteProfileFromUser({
          fallbackName: invite.intended_recipient_alias,
          names: input.names,
          profiles: input.profiles,
          referenceLabel: intendedRecipientProfile.referenceLabel,
          roleLabel: 'Cuenta activada',
          userId: invite.activated_user_id,
        })
      : intendedRecipientProfile;
    const visibleProfile = actorRole === 'inviter' ? activatedInviteProfile : inviterProfile;
    const visibleProfileUserId =
      actorRole === 'inviter' ? invite.activated_user_id : invite.inviter_user_id;
    const respondingProfile = invite.activated_user_id ? activatedInviteProfile : null;
    const intendedRecipientReference = buildAccountIntendedRecipientReference(invite);
    const targetName =
      activatedUserDisplayName ??
      (activatedInviteProfile.displayName === 'Contacto invitado'
        ? 'tu contacto'
        : activatedInviteProfile.displayName);
    const expiryLabel = invite.expires_at
      ? `vence ${formatRelativeLabel(invite.expires_at)}`
      : null;
    let title = 'Invitacion de acceso';
    let subtitle = [intendedRecipientReference, expiryLabel].filter(Boolean).join(' | ');
    let actionState: AccountInviteListItem['actionState'] = 'history';
    let status = invite.status;
    let ctaLabel = 'Ver';

    if (invite.status === 'pending_activation') {
      if (actorRole !== 'inviter') {
        continue;
      }

      title = `Acceso privado para ${targetName}`;
      actionState = 'pending_activation';
      status = 'pending_activation';
      ctaLabel = originChannel === 'qr' ? 'QR activo' : 'Compartir';
    } else if (invite.status === 'pending_inviter_review') {
      if (actorRole === 'inviter') {
        title = `${targetName} activo el acceso privado`;
        subtitle = [
          intendedRecipientReference ? `Pensada para ${intendedRecipientReference}` : null,
          'Por verificar',
        ]
          .filter(Boolean)
          .join(' | ');
        actionState = 'requires_you_review';
        status = 'requires_you_review';
        ctaLabel = 'Verificar';
      } else {
        title = `Esperando validacion de ${inviterName}`;
        subtitle = 'Ya activaste este acceso';
        actionState = 'waiting_sender_review';
        status = 'waiting_sender_review';
      }
    } else {
      const happenedAt = invite.resolved_at ?? invite.updated_at ?? invite.created_at;
      const autoAcceptedByPhoneMatch =
        invite.resolution_reason === 'activation_phone_match_auto_accepted';
      title =
        invite.status === 'accepted'
          ? actorRole === 'inviter'
            ? autoAcceptedByPhoneMatch
              ? `${targetName} activo el acceso privado`
              : `Confirmaste a ${targetName}`
            : `${inviterName} confirmo tu acceso`
          : invite.status === 'rejected'
            ? actorRole === 'inviter'
              ? `Rechazaste a ${targetName}`
              : `${inviterName} rechazo este acceso`
            : invite.status === 'expired'
              ? actorRole === 'inviter'
                ? `El acceso para ${targetName} vencio`
                : 'Este acceso vencio'
              : 'Invitacion de acceso cancelada';
      subtitle = [
        actorRole === 'inviter' ? intendedRecipientReference : null,
        formatRelativeLabel(happenedAt),
      ]
        .filter(Boolean)
        .join(' | ');
      historyItems.push({
        id: invite.id,
        inviteId: invite.id,
        kind: 'account_invite',
        actorRole,
        originChannel,
        actionState: 'history',
        title,
        subtitle,
        status: invite.status,
        ctaLabel: 'Ver',
        href: '/activity?domain=friendships',
        sourceType: 'user',
        createdAt: invite.created_at,
        happenedAt,
        happenedAtLabel: formatRelativeLabel(happenedAt),
        counterpartyLabel: actorRole === 'inviter' ? targetName : inviterName,
        expiresAt: invite.expires_at,
        activatedAt: invite.activated_at,
        resolvedAt: invite.resolved_at,
        intendedRecipientAlias: invite.intended_recipient_alias,
        intendedRecipientPhoneE164: invite.intended_recipient_phone_e164,
        intendedRecipientPhoneLabel: invite.intended_recipient_phone_label,
        activatedUserId: invite.activated_user_id,
        activatedUserDisplayName,
        activatedUserAvatarUrl,
        profileUserId: visibleProfileUserId,
        profileHref: inviteProfileHref(visibleProfileUserId, invite.id, 'history'),
        profileTimelineItems: buildAccountInviteTimeline({
          invite,
          deliveries: deliveriesByInviteId.get(invite.id) ?? [],
          actorRole,
          actionState: 'history',
          inviterName,
          targetName,
          intendedRecipientReference,
        }),
        ...inviteProfileFields(visibleProfile),
        ...intendedInviteProfileFields(intendedRecipientProfile),
        ...respondingInviteProfileFields(respondingProfile),
      });
      continue;
    }

    pendingItems.push({
      id: invite.id,
      inviteId: invite.id,
      kind: 'account_invite',
      actorRole,
      originChannel,
      actionState,
      title,
      subtitle,
      status,
      ctaLabel,
      href: '/activity?domain=friendships',
      sourceType: 'user',
      createdAt: invite.created_at,
      counterpartyLabel: actorRole === 'inviter' ? targetName : inviterName,
      expiresAt: invite.expires_at,
      activatedAt: invite.activated_at,
      resolvedAt: invite.resolved_at,
      intendedRecipientAlias: invite.intended_recipient_alias,
      intendedRecipientPhoneE164: invite.intended_recipient_phone_e164,
      intendedRecipientPhoneLabel: invite.intended_recipient_phone_label,
      activatedUserId: invite.activated_user_id,
      activatedUserDisplayName,
      activatedUserAvatarUrl,
      profileUserId: visibleProfileUserId,
      profileHref: inviteProfileHref(visibleProfileUserId, invite.id, 'pending'),
      profileTimelineItems: buildAccountInviteTimeline({
        invite,
        deliveries: deliveriesByInviteId.get(invite.id) ?? [],
        actorRole,
        actionState,
        inviterName,
        targetName,
        intendedRecipientReference,
      }),
      ...inviteProfileFields(visibleProfile),
      ...intendedInviteProfileFields(intendedRecipientProfile),
      ...respondingInviteProfileFields(respondingProfile),
    });
  }

  return {
    pendingItems: sortByNewest(pendingItems),
    historyItems: sortHistoryItems(historyItems),
    summary: {
      requiresReviewCount: pendingItems.filter((item) => item.actionState === 'requires_you_review')
        .length,
      pendingActivationCount: pendingItems.filter(
        (item) => item.actionState === 'pending_activation',
      ).length,
      waitingInviterReviewCount: pendingItems.filter(
        (item) => item.actionState === 'waiting_sender_review',
      ).length,
      historyCount: historyItems.length,
    },
  };
}

type VisibleInviteProfileItem = FriendshipInviteListItem | AccountInviteListItem;

function inviteProfileItemTimestamp(item: ActivityItemDto): string {
  const createdAt = (item as { readonly createdAt?: unknown }).createdAt;
  if (typeof createdAt === 'string' && createdAt.length > 0) {
    return createdAt;
  }

  return item.happenedAt ?? '';
}

function sortInviteProfilePendingItems(items: readonly ActivityItemDto[]): ActivityItemDto[] {
  return [...items].sort(
    (left, right) =>
      Date.parse(inviteProfileItemTimestamp(right)) - Date.parse(inviteProfileItemTimestamp(left)),
  );
}

function inviteProfileDisplayName(
  userId: string,
  item: VisibleInviteProfileItem,
  names: Map<string, string>,
  profiles: Map<string, UserProfileRow>,
): string {
  const profileName = profiles.get(userId)?.display_name?.trim();
  if (profileName) {
    return profileName;
  }

  const knownName = names.get(userId)?.trim();
  if (knownName && knownName !== 'Tu') {
    return knownName;
  }

  if (item.profileDisplayName && item.profileDisplayName !== 'Persona') {
    return item.profileDisplayName;
  }

  return item.counterpartyLabel ?? 'Persona';
}

function inviteProfileAvatarUrl(
  userId: string,
  item: VisibleInviteProfileItem,
  profiles: Map<string, UserProfileRow>,
): string | null {
  const profile = profiles.get(userId);
  return profile
    ? resolveAvatarUrl(profile.avatar_path, profile.updated_at)
    : item.profileAvatarUrl;
}

function groupInviteProfileItems<T extends VisibleInviteProfileItem>(
  items: readonly T[],
): Map<string, T[]> {
  const groupedItems = new Map<string, T[]>();

  for (const item of items) {
    if (!item.profileUserId) {
      continue;
    }

    const existingItems = groupedItems.get(item.profileUserId);
    if (existingItems) {
      existingItems.push(item);
    } else {
      groupedItems.set(item.profileUserId, [item]);
    }
  }

  return groupedItems;
}

function upsertInviteProfilePeople(input: {
  readonly peopleById: Record<string, LivePersonDetailDto>;
  readonly pendingItems: readonly VisibleInviteProfileItem[];
  readonly historyItems: readonly VisibleInviteProfileItem[];
  readonly names: Map<string, string>;
  readonly profiles: Map<string, UserProfileRow>;
}) {
  const pendingByUserId = groupInviteProfileItems(input.pendingItems);
  const historyByUserId = groupInviteProfileItems(input.historyItems);
  const profileUserIds = new Set([...pendingByUserId.keys(), ...historyByUserId.keys()]);

  for (const userId of profileUserIds) {
    const pendingItems = (pendingByUserId.get(userId) ?? []).map((item) => ({
      ...item,
      href: item.profileHref ?? item.href,
    }));
    const historyItems = historyByUserId.get(userId) ?? [];
    const anchorItem = pendingItems[0] ?? historyItems[0];
    if (!anchorItem) {
      continue;
    }

    const existingPerson = input.peopleById[userId];
    const displayName =
      existingPerson?.displayName ??
      inviteProfileDisplayName(userId, anchorItem, input.names, input.profiles);
    const avatarUrl =
      existingPerson?.avatarUrl ?? inviteProfileAvatarUrl(userId, anchorItem, input.profiles);
    const nextPendingItems = sortInviteProfilePendingItems([
      ...pendingItems,
      ...(existingPerson?.pendingItems ?? []),
    ]);
    const inviteTimelineItems = [...pendingItems, ...historyItems].flatMap(
      (item) => item.profileTimelineItems,
    );
    const nextTimeline = sortHistoryItems([
      ...inviteTimelineItems,
      ...(existingPerson?.timeline ?? []),
    ]);
    const pendingLabel = `${nextPendingItems.length} pendiente${
      nextPendingItems.length > 1 ? 's' : ''
    }`;
    const supportText =
      nextPendingItems.length > 0
        ? `Tienes ${pendingLabel} con ${displayName}.`
        : (existingPerson?.supportText ?? `Sin movimientos registrados con ${displayName}.`);
    const netAmountMinor = existingPerson?.netAmountMinor ?? 0;
    const headline =
      nextPendingItems.length > 0 && netAmountMinor === 0
        ? `${pendingLabel} por resolver con ${displayName}`
        : (existingPerson?.headline ?? `Con ${displayName} estan al dia`);

    input.peopleById[userId] = {
      userId,
      displayName,
      avatarUrl,
      direction: existingPerson?.direction ?? 'settled',
      netAmountMinor,
      pendingCount: nextPendingItems.length,
      headline,
      supportText,
      pendingItems: nextPendingItems,
      pendingRequest: existingPerson?.pendingRequest,
      timeline: nextTimeline,
      relationshipStatus: existingPerson?.relationshipStatus ?? 'pending_invite',
    };
  }
}

function historyToneForRow(
  row: RelationshipHistoryRow,
  currentUserId: string,
): PersonTimelineItemDto['tone'] {
  if (row.item_kind === 'ledger_transaction' && row.subtype === 'cycle_settlement') {
    return 'neutral';
  }

  if (row.status === 'rejected' || row.status === 'amended') {
    return 'neutral';
  }

  if (row.creditor_user_id === currentUserId) {
    return 'positive';
  }

  if (row.debtor_user_id === currentUserId) {
    return 'negative';
  }

  return 'neutral';
}

function sourceTypeForRow(row: RelationshipHistoryRow): 'user' | 'system' {
  if (row.item_kind === 'ledger_transaction' && row.source_type === 'system') {
    return 'system';
  }

  return 'user';
}

function isHistoryRowVisibleToCurrentUser(
  row: RelationshipHistoryRow,
  currentUserId: string,
  visibleRelationshipIds: ReadonlySet<string>,
): boolean {
  if (!visibleRelationshipIds.has(row.relationship_id)) {
    return false;
  }

  if (row.debtor_user_id === currentUserId || row.creditor_user_id === currentUserId) {
    return true;
  }

  if (row.item_kind === 'financial_request') {
    return row.creator_user_id === currentUserId || row.responder_user_id === currentUserId;
  }

  return false;
}

function historyKindForTimeline(row: RelationshipHistoryRow): PersonTimelineItemDto['kind'] {
  if (row.item_kind === 'financial_request') {
    return 'request';
  }

  if (row.subtype === 'cycle_settlement') {
    return 'settlement';
  }

  return 'system';
}

function buildHistoryTitle(
  row: RelationshipHistoryRow,
  counterpartyName: string,
  names: Map<string, string>,
): string {
  const movementFlow = buildMovementFlowLabel(row, names);

  if (row.item_kind === 'financial_request') {
    if (row.status === 'pending') {
      return `Propuesta pendiente con ${counterpartyName}`;
    }

    if (row.status === 'accepted') {
      return `Propuesta aceptada con ${counterpartyName}`;
    }

    if (row.status === 'amended') {
      return `${counterpartyName} propuso un nuevo monto`;
    }

    if (row.status === 'rejected') {
      return `${counterpartyName} no acepto la propuesta`;
    }

    return `Propuesta con ${counterpartyName}`;
  }

  if (
    row.subtype === 'balance_increase_acceptance' ||
    row.subtype === 'transaction_reversal_acceptance'
  ) {
    return movementFlow
      ? `Movimiento registrado: ${movementFlow}`
      : `Movimiento registrado con ${counterpartyName}`;
  }

  if (row.subtype === 'cycle_settlement') {
    return movementFlow
      ? `Happy Circle completado: ${movementFlow}`
      : `Happy Circle con ${counterpartyName}`;
  }

  return movementFlow
    ? `Movimiento confirmado: ${movementFlow}`
    : `Movimiento con ${counterpartyName}`;
}

function buildMovementFlowLabel(
  row: RelationshipHistoryRow,
  names: Map<string, string>,
): string | null {
  if (!row.debtor_user_id || !row.creditor_user_id) {
    return null;
  }

  const debtor = names.get(row.debtor_user_id) ?? 'Deudor';
  const creditor = names.get(row.creditor_user_id) ?? 'Acreedor';
  return `${debtor} -> ${creditor}`;
}

function buildTimelineStepTitle(
  row: RelationshipHistoryRow,
  currentUserId: string,
  counterpartyName: string,
  names: Map<string, string>,
): string {
  const creator =
    row.creator_user_id === currentUserId
      ? 'Tu'
      : row.creator_user_id
        ? (names.get(row.creator_user_id) ?? counterpartyName)
        : 'Sistema';
  const responder =
    row.responder_user_id === currentUserId
      ? 'Tu'
      : row.responder_user_id
        ? (names.get(row.responder_user_id) ?? counterpartyName)
        : 'La otra persona';

  if (row.item_kind === 'financial_request') {
    if (row.status === 'pending') {
      if (row.subtype === 'transaction_reversal') {
        return `${creator} propuso ajustar el movimiento`;
      }

      const flowLabel = historyFlowLabelForCurrentUser(row, currentUserId) ?? 'entrada';
      return `${creator} propuso una ${flowLabel}`;
    }

    if (row.status === 'accepted') {
      if (row.subtype === 'transaction_reversal') {
        return `${responder} acepto el ajuste`;
      }

      if (row.subtype === 'balance_increase') {
        return `${responder} acepto la propuesta`;
      }

      return `${responder} acepto el ajuste`;
    }

    if (row.status === 'amended') {
      return `${responder} propuso un nuevo monto`;
    }

    if (row.status === 'rejected') {
      return `${responder} no acepto la propuesta`;
    }
  }

  if (row.subtype === 'balance_increase_acceptance') {
    const flowLabel = historyFlowLabelForCurrentUser(row, currentUserId) ?? 'entrada';
    return sourceTypeForRow(row) === 'system'
      ? `Sistema registro la ${flowLabel}`
      : `${creator} registro la ${flowLabel}`;
  }

  if (row.subtype === 'transaction_reversal_acceptance') {
    return sourceTypeForRow(row) === 'system'
      ? 'Sistema aplico el ajuste'
      : `${creator} aplico el ajuste`;
  }

  if (row.subtype === 'cycle_settlement') {
    return 'Completaste un Circle!';
  }

  return buildHistoryTitle(row, counterpartyName, names);
}

function buildCycleSettlementImpactLabel(row: RelationshipHistoryRow): string | null {
  if (row.subtype !== 'cycle_settlement') {
    return null;
  }

  return 'Completaste un Circle!';
}

function buildHistorySubtitle(
  row: RelationshipHistoryRow,
  currentUserId: string,
  counterpartyName: string,
  names: Map<string, string>,
): string {
  const isCycleSettlement = row.subtype === 'cycle_settlement';
  const pieces = [
    isCycleSettlement ? 'Happy Circle' : sourceTypeForRow(row) === 'system' ? 'Sistema' : 'Usuario',
  ];

  const movementFlow = buildMovementFlowLabel(row, names);
  if (movementFlow) {
    pieces.push(movementFlow);
  }

  const cycleImpact = buildCycleSettlementImpactLabel(row);
  if (cycleImpact) {
    pieces.push(cycleImpact);
  }

  if (row.description) {
    pieces.push(row.description);
  }

  pieces.push(formatRelativeLabel(row.happened_at));
  return pieces.join(' | ');
}

function buildSettlementDetail(
  proposal: SettlementProposalRow,
  participants: readonly SettlementParticipantRow[],
  names: Map<string, string>,
  currentUserId: string,
  visibleCounterpartyUserIds: ReadonlySet<string>,
): SettlementDetailDto {
  const participantLabel = (participantUserId: string) =>
    settlementParticipantLabel({
      participantUserId,
      currentUserId,
      visibleCounterpartyUserIds,
      names,
    }) ?? 'Otra persona';

  const movementDetails = parseSettlementMovements(proposal.movements_json).map(
    (movement, index) => {
      const debtor = participantLabel(movement.debtor_user_id);
      const creditor = participantLabel(movement.creditor_user_id);

      return {
        id: `${proposal.id}:movement:${index}`,
        debtorUserId: movement.debtor_user_id,
        debtorLabel: debtor,
        creditorUserId: movement.creditor_user_id,
        creditorLabel: creditor,
        amountMinor: movement.amount_minor,
      };
    },
  );
  const movements = movementDetails.map(
    (movement) =>
      `${movement.debtorLabel} paga a ${movement.creditorLabel}: ${formatCop(movement.amountMinor)}`,
  );
  const impactLines = movementDetails.map((movement) => {
    return `Ajusta el saldo entre ${movement.debtorLabel} y ${movement.creditorLabel} por ${formatCop(movement.amountMinor)}`;
  });
  const participantDecisions = participants.map((participant) => ({
    userId: participant.participant_user_id,
    label: participantLabel(participant.participant_user_id),
    decision: normalizeSettlementDetailDecision(participant.decision),
  }));
  const participantStatuses = participantDecisions.map(
    (participant) => `${participant.label}: ${participant.decision}`,
  );

  const approvalsPending = participants.filter(
    (participant) => participant.decision === 'pending',
  ).length;
  const explainers =
    proposal.status === 'pending_approvals'
      ? [
          approvalsPending > 0
            ? `Faltan ${approvalsPending} aprobacion${approvalsPending > 1 ? 'es' : ''} para que quede aprobado.`
            : 'Todos aprobaron, solo falta completar el Circle.',
          'Happy Circles evita aplicar una propuesta sobre saldos que ya cambiaron.',
        ]
      : proposal.status === 'approved'
        ? ['La propuesta ya fue aprobada por todos.', 'El siguiente paso es completar el Circle.']
        : proposal.status === 'executed'
          ? ['Completaste un Circle!', 'El saldo neto ya fue actualizado.']
          : ['Este Circle ya no esta activo. Puedes crear otro si los saldos cambiaron.'];

  return {
    id: proposal.id,
    status: proposal.status,
    snapshotHash: proposal.graph_snapshot_hash,
    participants: participantDecisions.map((participant) => participant.label),
    participantDecisions,
    participantStatuses,
    movementDetails,
    movements,
    impactLines,
    explainers,
  };
}

function buildAuditItems(events: readonly AuditEventRow[]): AuditListItem[] {
  return events.map((event) => ({
    id: event.id,
    title: event.event_name.replaceAll('_', ' '),
    subtitle: `${event.entity_type} | ${formatRelativeLabel(event.created_at)}`,
  }));
}

interface AnalyticsEvent {
  readonly id: string;
  readonly happenedAt: string;
  readonly timeMs: number;
  readonly category: TransactionCategory;
  readonly counterpartyUserId: string;
  readonly counterpartyLabel: string;
  readonly iOweMinor: number;
  readonly owedToMeMinor: number;
  readonly netMinor: number;
}

interface CurrentPersonBalanceSnapshot {
  readonly userId: string;
  readonly label: string;
  readonly netMinor: number;
  readonly iOweMinor: number;
  readonly owedToMeMinor: number;
}

interface AnalyticsRange {
  readonly currentStartMs: number | null;
  readonly currentEndMs: number | null;
  readonly previousStartMs: number | null;
  readonly previousEndMs: number | null;
  readonly currentLabel: string;
  readonly previousLabel: string | null;
}

function dateMs(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 0, 0, 0, 0);
}

function endOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 23, 59, 59, 999);
}

function startOfWeek(value: Date): Date {
  const day = value.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  return startOfDay(new Date(value.getFullYear(), value.getMonth(), value.getDate() + offset));
}

function startOfMonth(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), 1, 0, 0, 0, 0);
}

function startOfYear(value: Date): Date {
  return new Date(value.getFullYear(), 0, 1, 0, 0, 0, 0);
}

function previousRangeFromBounds(
  start: Date,
  end: Date,
): Pick<AnalyticsRange, 'previousStartMs' | 'previousEndMs'> {
  const lengthMs = end.getTime() - start.getTime() + 1;
  return {
    previousStartMs: start.getTime() - lengthMs,
    previousEndMs: start.getTime() - 1,
  };
}

function periodRange(period: BalanceAnalyticsPeriod, now = new Date()): AnalyticsRange {
  if (period === 'week') {
    const start = startOfWeek(now);
    const end = endOfDay(now);
    return {
      currentStartMs: start.getTime(),
      currentEndMs: end.getTime(),
      currentLabel: 'Esta semana',
      previousLabel: 'Semana anterior',
      ...previousRangeFromBounds(start, end),
    };
  }

  if (period === 'month') {
    const start = startOfMonth(now);
    const end = endOfDay(now);
    return {
      currentStartMs: start.getTime(),
      currentEndMs: end.getTime(),
      currentLabel: new Intl.DateTimeFormat('es-CO', {
        month: 'long',
        year: 'numeric',
      }).format(now),
      previousLabel: 'Mes anterior',
      ...previousRangeFromBounds(start, end),
    };
  }

  if (period === 'year') {
    const start = startOfYear(now);
    const end = endOfDay(now);
    return {
      currentStartMs: start.getTime(),
      currentEndMs: end.getTime(),
      currentLabel: `${now.getFullYear()}`,
      previousLabel: `${now.getFullYear() - 1}`,
      ...previousRangeFromBounds(start, end),
    };
  }

  return {
    currentStartMs: null,
    currentEndMs: null,
    previousStartMs: null,
    previousEndMs: null,
    currentLabel: 'Todo el tiempo',
    previousLabel: null,
  };
}

function isWithinRange(timeMs: number, startMs: number | null, endMs: number | null): boolean {
  if (startMs !== null && timeMs < startMs) {
    return false;
  }

  if (endMs !== null && timeMs > endMs) {
    return false;
  }

  return true;
}

function computeChangeRatio(current: number, previous: number): number | null {
  if (previous === 0) {
    return current === 0 ? 0 : null;
  }

  return (current - previous) / Math.abs(previous);
}

function formatPeriodComparison(changeRatio: number | null, previousLabel: string | null): string {
  if (changeRatio === null || !previousLabel) {
    return 'No hay comparacion disponible todavia.';
  }

  if (changeRatio === 0) {
    return `Sin cambio frente a ${previousLabel.toLocaleLowerCase('es-CO')}.`;
  }

  const percentage = `${Math.round(Math.abs(changeRatio) * 100)}%`;
  return changeRatio > 0
    ? `Subio ${percentage} frente a ${previousLabel.toLocaleLowerCase('es-CO')}.`
    : `Bajo ${percentage} frente a ${previousLabel.toLocaleLowerCase('es-CO')}.`;
}

function buildAnalyticsEvents(input: {
  readonly history: readonly RelationshipHistoryRow[];
  readonly currentUserId: string;
  readonly counterpartyByRelationshipId: ReadonlyMap<
    string,
    {
      readonly userId: string;
      readonly displayName: string;
    }
  >;
}): AnalyticsEvent[] {
  return input.history.flatMap((row): AnalyticsEvent[] => {
    if (row.item_kind !== 'ledger_transaction' || row.subtype === 'cycle_settlement') {
      return [];
    }

    const counterparty = input.counterpartyByRelationshipId.get(row.relationship_id);
    const timeMs = dateMs(row.happened_at);
    if (!counterparty || timeMs === null) {
      return [];
    }

    const iOweMinor = row.debtor_user_id === input.currentUserId ? row.amount_minor : 0;
    const owedToMeMinor = row.creditor_user_id === input.currentUserId ? row.amount_minor : 0;

    return [
      {
        id: row.item_id,
        happenedAt: row.happened_at,
        timeMs,
        category: normalizeTransactionCategory(row.category),
        counterpartyUserId: counterparty.userId,
        counterpartyLabel: counterparty.displayName,
        iOweMinor,
        owedToMeMinor,
        netMinor: owedToMeMinor - iOweMinor,
      },
    ];
  });
}

function buildCurrentPersonBalances(
  people: readonly PersonCardDto[],
): readonly CurrentPersonBalanceSnapshot[] {
  return people.map((person) => ({
    userId: person.userId,
    label: person.displayName,
    netMinor:
      person.direction === 'owes_me'
        ? person.netAmountMinor
        : person.direction === 'i_owe'
          ? -person.netAmountMinor
          : 0,
    iOweMinor: person.direction === 'i_owe' ? person.netAmountMinor : 0,
    owedToMeMinor: person.direction === 'owes_me' ? person.netAmountMinor : 0,
  }));
}

function topCategoryBreakdownForEvents(
  events: readonly AnalyticsEvent[],
): BalanceAnalyticsPersonRowDto['topCategoryBreakdown'] {
  const totals = new Map<
    TransactionCategory,
    {
      readonly category: TransactionCategory;
      netMinor: number;
      movementCount: number;
    }
  >();

  for (const event of events) {
    const current = totals.get(event.category);
    if (current) {
      current.netMinor += event.netMinor;
      current.movementCount += 1;
      continue;
    }

    totals.set(event.category, {
      category: event.category,
      netMinor: event.netMinor,
      movementCount: 1,
    });
  }

  return Array.from(totals.values())
    .sort((left, right) => {
      const amountDiff = Math.abs(right.netMinor) - Math.abs(left.netMinor);
      if (amountDiff !== 0) {
        return amountDiff;
      }

      return right.movementCount - left.movementCount;
    })
    .slice(0, 3)
    .map((entry) => ({
      category: entry.category,
      netMinor: entry.netMinor,
      movementCount: entry.movementCount,
    }));
}

function buildPeopleAnalyticsRows(input: {
  readonly currentBalances: readonly CurrentPersonBalanceSnapshot[];
  readonly currentEvents: readonly AnalyticsEvent[];
  readonly previousEvents: readonly AnalyticsEvent[];
}): readonly BalanceAnalyticsPersonRowDto[] {
  const currentByUserId = groupBy(input.currentEvents, (event) => event.counterpartyUserId);
  const previousByUserId = groupBy(input.previousEvents, (event) => event.counterpartyUserId);

  return input.currentBalances
    .map((person): BalanceAnalyticsPersonRowDto => {
      const currentEvents = currentByUserId.get(person.userId) ?? [];
      const previousEvents = previousByUserId.get(person.userId) ?? [];
      const periodIOweMinor = currentEvents.reduce((total, event) => total + event.iOweMinor, 0);
      const periodOwedToMeMinor = currentEvents.reduce(
        (total, event) => total + event.owedToMeMinor,
        0,
      );
      const previousPeriodNetMinor = previousEvents.reduce(
        (total, event) => total + event.netMinor,
        0,
      );
      const topCategoryBreakdown = topCategoryBreakdownForEvents(currentEvents);

      return {
        key: person.userId,
        userId: person.userId,
        label: person.label,
        netMinor: person.netMinor,
        iOweMinor: person.iOweMinor,
        owedToMeMinor: person.owedToMeMinor,
        movementCount: currentEvents.length,
        periodNetMinor: periodOwedToMeMinor - periodIOweMinor,
        periodIOweMinor,
        periodOwedToMeMinor,
        previousPeriodNetMinor,
        topCategories: topCategoryBreakdown.map((entry) => entry.category),
        topCategoryBreakdown,
      };
    })
    .filter(
      (row) =>
        row.netMinor !== 0 ||
        row.periodNetMinor !== 0 ||
        row.periodIOweMinor !== 0 ||
        row.periodOwedToMeMinor !== 0 ||
        row.movementCount > 0,
    )
    .sort((left, right) => {
      const amountDiff = Math.abs(right.periodNetMinor) - Math.abs(left.periodNetMinor);
      if (amountDiff !== 0) {
        return amountDiff;
      }

      if (right.movementCount !== left.movementCount) {
        return right.movementCount - left.movementCount;
      }

      return left.label.localeCompare(right.label, 'es-CO');
    });
}

function buildCategoryAnalyticsRows(input: {
  readonly currentEvents: readonly AnalyticsEvent[];
  readonly previousEvents: readonly AnalyticsEvent[];
}): readonly BalanceAnalyticsCategoryRowDto[] {
  const categories = [...USER_TRANSACTION_CATEGORIES, 'cycle'] as const;

  return categories
    .map((category): BalanceAnalyticsCategoryRowDto | null => {
      const currentEvents = input.currentEvents.filter((event) => event.category === category);
      const previousEvents = input.previousEvents.filter((event) => event.category === category);
      if (currentEvents.length === 0 && previousEvents.length === 0) {
        return null;
      }

      const iOweMinor = currentEvents.reduce((total, event) => total + event.iOweMinor, 0);
      const owedToMeMinor = currentEvents.reduce((total, event) => total + event.owedToMeMinor, 0);
      const previousNetMinor = previousEvents.reduce((total, event) => total + event.netMinor, 0);
      const personLabels = Array.from(
        new Set(currentEvents.map((event) => event.counterpartyLabel)),
      ).slice(0, 4);
      const userIds = Array.from(new Set(currentEvents.map((event) => event.counterpartyUserId)));

      return {
        key: category,
        category,
        label: transactionCategoryLabel(category),
        netMinor: owedToMeMinor - iOweMinor,
        iOweMinor,
        owedToMeMinor,
        movementCount: currentEvents.length,
        previousNetMinor,
        personLabels,
        userIds,
      };
    })
    .filter((row): row is BalanceAnalyticsCategoryRowDto => Boolean(row))
    .sort((left, right) => {
      const amountDiff = Math.abs(right.netMinor) - Math.abs(left.netMinor);
      if (amountDiff !== 0) {
        return amountDiff;
      }

      if (right.movementCount !== left.movementCount) {
        return right.movementCount - left.movementCount;
      }

      return left.label.localeCompare(right.label, 'es-CO');
    });
}

function buildWaterfalls(input: {
  readonly period: BalanceAnalyticsPeriod;
  readonly currentSummary: DashboardDto['summary'];
  readonly currentEvents: readonly AnalyticsEvent[];
  readonly history: readonly RelationshipHistoryRow[];
  readonly currentUserId: string;
  readonly range: AnalyticsRange;
  readonly counterpartyByRelationshipId: ReadonlyMap<
    string,
    {
      readonly userId: string;
      readonly displayName: string;
    }
  >;
}): {
  readonly byCategory: readonly BalanceWaterfallGroupDto[];
  readonly byPerson: readonly BalanceWaterfallGroupDto[];
} {
  const byCategory = new Map<
    TransactionCategory | 'cycle',
    {
      readonly category: TransactionCategory | 'cycle';
      iOweMinor: number;
      owedToMeMinor: number;
      resolvedMinor: number;
      netMinor: number;
    }
  >();

  const byPerson = new Map<
    string,
    {
      readonly userId: string;
      readonly label: string;
      iOweMinor: number;
      owedToMeMinor: number;
      resolvedMinor: number;
      netMinor: number;
    }
  >();

  const getCategoryGroup = (category: TransactionCategory | 'cycle') => {
    let group = byCategory.get(category);
    if (!group) {
      group = {
        category,
        iOweMinor: 0,
        owedToMeMinor: 0,
        resolvedMinor: 0,
        netMinor: 0,
      };
      byCategory.set(category, group);
    }
    return group;
  };

  const getPersonGroup = (userId: string, label: string) => {
    let group = byPerson.get(userId);
    if (!group) {
      group = {
        userId,
        label,
        iOweMinor: 0,
        owedToMeMinor: 0,
        resolvedMinor: 0,
        netMinor: 0,
      };
      byPerson.set(userId, group);
    }
    return group;
  };

  for (const event of input.currentEvents) {
    const catGroup = getCategoryGroup(event.category);
    catGroup.iOweMinor += event.iOweMinor;
    catGroup.owedToMeMinor += event.owedToMeMinor;
    catGroup.netMinor += event.netMinor;

    const personGroup = getPersonGroup(event.counterpartyUserId, event.counterpartyLabel);
    personGroup.iOweMinor += event.iOweMinor;
    personGroup.owedToMeMinor += event.owedToMeMinor;
    personGroup.netMinor += event.netMinor;
  }

  const settlements = input.history.filter((row) => {
    if (row.item_kind !== 'ledger_transaction' || row.subtype !== 'cycle_settlement') {
      return false;
    }

    const timeMs = dateMs(row.happened_at);
    if (timeMs === null) {
      return false;
    }

    if (
      input.period !== 'all' &&
      (timeMs < (input.range.currentStartMs ?? 0) ||
        timeMs > (input.range.currentEndMs ?? Infinity))
    ) {
      return false;
    }

    return true;
  });

  for (const row of settlements) {
    const counterparty = input.counterpartyByRelationshipId.get(row.relationship_id);
    if (!counterparty) {
      continue;
    }

    const iOweMinor = row.debtor_user_id === input.currentUserId ? row.amount_minor : 0;
    const owedToMeMinor = row.creditor_user_id === input.currentUserId ? row.amount_minor : 0;
    const netMinor = owedToMeMinor - iOweMinor;
    const resolvedMinorAmount = Math.abs(netMinor);

    const catGroup = getCategoryGroup('cycle');
    catGroup.resolvedMinor += resolvedMinorAmount;
    catGroup.netMinor += netMinor;

    const personGroup = getPersonGroup(counterparty.userId, counterparty.displayName);
    personGroup.resolvedMinor += resolvedMinorAmount;
    personGroup.netMinor += netMinor;
  }

  const periodNetMinor = Array.from(byCategory.values()).reduce(
    (total, group) => total + group.netMinor,
    0,
  );
  const startingBalanceMinor = input.currentSummary.netBalanceMinor - periodNetMinor;

  const buildSteps = (
    groups: readonly {
      readonly key: string;
      readonly label: string;
      readonly category?: TransactionCategory | 'cycle';
      readonly personId?: string;
      readonly iOweMinor: number;
      readonly owedToMeMinor: number;
      readonly resolvedMinor: number;
      readonly netMinor: number;
    }[],
  ): readonly BalanceWaterfallGroupDto[] => {
    let cumulative = startingBalanceMinor;
    const steps = groups
      .filter(
        (g) =>
          g.iOweMinor !== 0 || g.owedToMeMinor !== 0 || g.resolvedMinor !== 0 || g.netMinor !== 0,
      )
      .sort((left, right) => Math.abs(right.netMinor) - Math.abs(left.netMinor))
      .map((g): BalanceWaterfallGroupDto => {
        cumulative += g.netMinor;
        return {
          key: g.key,
          label: g.label,
          category: g.category,
          personId: g.personId,
          iOweMinor: g.iOweMinor,
          owedToMeMinor: g.owedToMeMinor,
          resolvedMinor: g.resolvedMinor,
          netMinor: g.netMinor,
          cumulativeBalanceMinor: cumulative,
        };
      });

    return [
      {
        key: 'starting_balance',
        label: input.period === 'all' ? 'Saldo base' : 'Saldo inicial',
        category: 'starting_balance',
        iOweMinor: 0,
        owedToMeMinor: 0,
        resolvedMinor: 0,
        netMinor: startingBalanceMinor,
        cumulativeBalanceMinor: startingBalanceMinor,
      },
      ...steps,
      {
        key: 'ending_balance',
        label: 'Balance final',
        category: 'ending_balance',
        iOweMinor: 0,
        owedToMeMinor: 0,
        resolvedMinor: 0,
        netMinor: input.currentSummary.netBalanceMinor,
        cumulativeBalanceMinor: input.currentSummary.netBalanceMinor,
      },
    ];
  };

  return {
    byCategory: buildSteps(
      Array.from(byCategory.values()).map((g) => ({
        key: g.category,
        label:
          g.category === 'cycle'
            ? 'Cierres de sistema'
            : transactionCategoryLabel(g.category as TransactionCategory),
        category: g.category,
        iOweMinor: g.iOweMinor,
        owedToMeMinor: g.owedToMeMinor,
        resolvedMinor: g.resolvedMinor,
        netMinor: g.netMinor,
      })),
    ),
    byPerson: buildSteps(
      Array.from(byPerson.values()).map((g) => ({
        key: g.userId,
        label: g.label,
        personId: g.userId,
        iOweMinor: g.iOweMinor,
        owedToMeMinor: g.owedToMeMinor,
        resolvedMinor: g.resolvedMinor,
        netMinor: g.netMinor,
      })),
    ),
  };
}

function buildLensSummary(input: {
  readonly lens: BalanceAnalyticsLens;
  readonly currentSummary: DashboardDto['summary'];
  readonly currentEvents: readonly AnalyticsEvent[];
  readonly previousEvents: readonly AnalyticsEvent[];
}): BalanceLensSummaryDto {
  const periodIOweMinor = input.currentEvents.reduce((total, event) => total + event.iOweMinor, 0);
  const periodOwedToMeMinor = input.currentEvents.reduce(
    (total, event) => total + event.owedToMeMinor,
    0,
  );
  const previousIOweMinor = input.previousEvents.reduce(
    (total, event) => total + event.iOweMinor,
    0,
  );
  const previousOwedToMeMinor = input.previousEvents.reduce(
    (total, event) => total + event.owedToMeMinor,
    0,
  );
  const finalMinor =
    input.lens === 'balance'
      ? input.currentSummary.netBalanceMinor
      : input.lens === 'i_owe'
        ? input.currentSummary.totalIOweMinor
        : input.currentSummary.totalOwedToMeMinor;
  const deltaMinor =
    input.lens === 'balance'
      ? periodOwedToMeMinor - periodIOweMinor
      : input.lens === 'i_owe'
        ? periodIOweMinor
        : periodOwedToMeMinor;
  const previousDeltaMinor =
    input.lens === 'balance'
      ? previousOwedToMeMinor - previousIOweMinor
      : input.lens === 'i_owe'
        ? previousIOweMinor
        : previousOwedToMeMinor;

  return {
    initialMinor: finalMinor - deltaMinor,
    finalMinor,
    deltaMinor,
    previousDeltaMinor,
    changeRatio: computeChangeRatio(deltaMinor, previousDeltaMinor),
    movementCount: input.currentEvents.length,
  };
}

function buildActiveSettlementPreview(input: {
  readonly proposals: readonly SettlementProposalRow[];
  readonly participantsByProposalId: Map<string, SettlementParticipantRow[]>;
  readonly currentUserId: string;
  readonly visibleCounterpartyUserIds: ReadonlySet<string>;
  readonly names: Map<string, string>;
}): ActiveSettlementPreviewDto | null {
  const activeProposals = input.proposals
    .filter((proposal) => proposal.status === 'pending_approvals' || proposal.status === 'approved')
    .filter((proposal) =>
      (input.participantsByProposalId.get(proposal.id) ?? []).some(
        (participant) => participant.participant_user_id === input.currentUserId,
      ),
    )
    .sort((left, right) => {
      const leftPriority = left.status === 'approved' ? 0 : 1;
      const rightPriority = right.status === 'approved' ? 0 : 1;
      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }

      return Date.parse(right.updated_at) - Date.parse(left.updated_at);
    });

  const proposal = activeProposals[0];
  if (!proposal) {
    return null;
  }

  const participants = input.participantsByProposalId.get(proposal.id) ?? [];
  const participantUserIds = participants.map((participant) => participant.participant_user_id);
  const participantLabels = buildSettlementParticipantLabels({
    participantUserIds,
    currentUserId: input.currentUserId,
    visibleCounterpartyUserIds: input.visibleCounterpartyUserIds,
    names: input.names,
  });
  const approvalsPending = participants.filter(
    (participant) => participant.decision === 'pending',
  ).length;
  const movementCount = parseSettlementMovements(proposal.movements_json).length;
  const participantDecisions = participants.map((participant, index) => ({
    userId: participant.participant_user_id,
    label: participantLabels[index] ?? 'Persona',
    decision: normalizeSettlementDetailDecision(participant.decision),
  }));

  return {
    proposalId: proposal.id,
    status: proposal.status === 'approved' ? 'approved' : 'pending_approvals',
    title: proposal.status === 'approved' ? 'Happy Circle listo' : 'Happy Circle pendiente',
    subtitle:
      proposal.status === 'approved'
        ? `Con ${summarizeSettlementParticipants(participantLabels)} ya puedes completarlo.`
        : `Con ${summarizeSettlementParticipants(participantLabels)} faltan ${approvalsPending} aprobacion${approvalsPending === 1 ? '' : 'es'}.`,
    totalAmountMinor: settlementProposalTotalAmount(proposal),
    approvalsPending,
    movementCount,
    savedMovementsCount: settlementSavedMovementsCount(participants.length, movementCount),
    participantCount: participants.length,
    participantUserIds,
    participantLabels,
    participantDecisions,
  };
}

function buildSettlementMetrics(input: {
  readonly proposals: readonly SettlementProposalRow[];
  readonly participantsByProposalId: Map<string, SettlementParticipantRow[]>;
  readonly currentUserId: string;
  readonly visibleCounterpartyUserIds: ReadonlySet<string>;
  readonly names: Map<string, string>;
  readonly activeProposal: ActiveSettlementPreviewDto | null;
  readonly range: AnalyticsRange;
}): BalanceSettlementMetricsDto {
  const participatedProposals = input.proposals.filter((proposal) =>
    (input.participantsByProposalId.get(proposal.id) ?? []).some(
      (participant) => participant.participant_user_id === input.currentUserId,
    ),
  );
  const relevantTimestamp = (proposal: SettlementProposalRow) =>
    dateMs(proposal.executed_at ?? proposal.updated_at ?? proposal.created_at);
  const currentExecuted = participatedProposals.filter((proposal) => {
    if (proposal.status !== 'executed') {
      return false;
    }
    const timeMs = relevantTimestamp(proposal);
    return (
      timeMs !== null && isWithinRange(timeMs, input.range.currentStartMs, input.range.currentEndMs)
    );
  });
  const previousExecuted = participatedProposals.filter((proposal) => {
    if (proposal.status !== 'executed') {
      return false;
    }
    const timeMs = relevantTimestamp(proposal);
    return (
      timeMs !== null &&
      isWithinRange(timeMs, input.range.previousStartMs, input.range.previousEndMs)
    );
  });
  const currentRelevant = participatedProposals.filter((proposal) => {
    const timeMs = relevantTimestamp(proposal);
    return (
      timeMs !== null && isWithinRange(timeMs, input.range.currentStartMs, input.range.currentEndMs)
    );
  });
  const sumProposalTotal = (proposal: SettlementProposalRow) =>
    settlementProposalTotalAmount(proposal);
  const sumMovementCount = (proposal: SettlementProposalRow) =>
    parseSettlementMovements(proposal.movements_json).length;

  const resolvedMinor = currentExecuted.reduce(
    (total, proposal) => total + sumProposalTotal(proposal),
    0,
  );
  const previousResolvedMinor = previousExecuted.reduce(
    (total, proposal) => total + sumProposalTotal(proposal),
    0,
  );
  const movementCount = currentExecuted.reduce(
    (total, proposal) => total + sumMovementCount(proposal),
    0,
  );
  const savedMovementsCount = currentExecuted.reduce((total, proposal) => {
    const participants = input.participantsByProposalId.get(proposal.id) ?? [];
    return total + settlementSavedMovementsCount(participants.length, sumMovementCount(proposal));
  }, 0);

  return {
    activeCount: participatedProposals.filter(
      (proposal) => proposal.status === 'pending_approvals' || proposal.status === 'approved',
    ).length,
    activeProposal: input.activeProposal,
    resolvedMinor,
    movementCount,
    savedMovementsCount,
    participatedCount: currentRelevant.length,
    previousResolvedMinor,
    changeRatio: computeChangeRatio(resolvedMinor, previousResolvedMinor),
  };
}

function buildBalanceProjection(input: {
  readonly financialRequests: readonly FinancialRequestRow[];
  readonly currentUserId: string;
  readonly currentSummary: DashboardDto['summary'];
}): BalanceOverviewDto['projection'] {
  const pendingRequests = input.financialRequests.filter((request) => request.status === 'pending');
  let pendingIncomingMinor = 0;
  let pendingOutgoingMinor = 0;

  const impactMinor = pendingRequests.reduce((total, request) => {
    if (request.creditor_user_id === input.currentUserId) {
      pendingIncomingMinor += request.amount_minor;
      return total + request.amount_minor;
    }

    if (request.debtor_user_id === input.currentUserId) {
      pendingOutgoingMinor += request.amount_minor;
      return total - request.amount_minor;
    }

    return total;
  }, 0);
  const pendingAmountMinor = pendingRequests.reduce(
    (total, request) => total + request.amount_minor,
    0,
  );

  return {
    pendingCount: pendingRequests.length,
    pendingAmountMinor,
    pendingIncomingMinor,
    pendingOutgoingMinor,
    impactMinor,
    projectedNetBalanceMinor: input.currentSummary.netBalanceMinor + impactMinor,
  };
}

function buildAnalyticsInsight(input: {
  readonly lensSummary: BalanceLensSummaryDto;
  readonly topPerson: BalanceAnalyticsPersonRowDto | null;
  readonly topCategory: BalanceAnalyticsCategoryRowDto | null;
  readonly previousLabel: string | null;
}): string {
  const comparison = formatPeriodComparison(input.lensSummary.changeRatio, input.previousLabel);
  const detail =
    input.topCategory && input.topPerson
      ? `${input.topCategory.label} y ${input.topPerson.label} explican la mayor parte del cambio.`
      : input.topCategory
        ? `${input.topCategory.label} explica la mayor parte del cambio.`
        : input.topPerson
          ? `${input.topPerson.label} concentra el mayor impacto del periodo.`
          : 'Todavia no hay suficiente actividad para explicar cambios.';

  return `${detail} ${comparison}`;
}

function buildBalanceAnalytics(input: {
  readonly currentSummary: DashboardDto['summary'];
  readonly people: readonly PersonCardDto[];
  readonly history: readonly RelationshipHistoryRow[];
  readonly counterpartyByRelationshipId: ReadonlyMap<
    string,
    {
      readonly userId: string;
      readonly displayName: string;
    }
  >;
  readonly proposals: readonly SettlementProposalRow[];
  readonly participantsByProposalId: Map<string, SettlementParticipantRow[]>;
  readonly currentUserId: string;
  readonly visibleCounterpartyUserIds: ReadonlySet<string>;
  readonly names: Map<string, string>;
  readonly activeProposal: ActiveSettlementPreviewDto | null;
}): BalanceAnalyticsDto {
  const events = buildAnalyticsEvents({
    history: input.history,
    currentUserId: input.currentUserId,
    counterpartyByRelationshipId: input.counterpartyByRelationshipId,
  });
  const currentBalances = buildCurrentPersonBalances(input.people);
  const periods: BalanceAnalyticsPeriod[] = ['week', 'month', 'year', 'all'];

  return {
    defaultPeriod: 'month',
    periods: Object.fromEntries(
      periods.map((period): [BalanceAnalyticsPeriod, BalanceAnalyticsPeriodDto] => {
        const range = periodRange(period);
        const currentEvents = events.filter((event) =>
          isWithinRange(event.timeMs, range.currentStartMs, range.currentEndMs),
        );
        const previousEvents = range.previousLabel
          ? events.filter((event) =>
              isWithinRange(event.timeMs, range.previousStartMs, range.previousEndMs),
            )
          : [];
        const summaries: Record<BalanceAnalyticsLens, BalanceLensSummaryDto> = {
          balance: buildLensSummary({
            lens: 'balance',
            currentSummary: input.currentSummary,
            currentEvents,
            previousEvents,
          }),
          i_owe: buildLensSummary({
            lens: 'i_owe',
            currentSummary: input.currentSummary,
            currentEvents,
            previousEvents,
          }),
          owed_to_me: buildLensSummary({
            lens: 'owed_to_me',
            currentSummary: input.currentSummary,
            currentEvents,
            previousEvents,
          }),
        };
        const people = buildPeopleAnalyticsRows({
          currentBalances,
          currentEvents,
          previousEvents,
        });
        const categories = buildCategoryAnalyticsRows({
          currentEvents,
          previousEvents,
        });
        const settlements = buildSettlementMetrics({
          proposals: input.proposals,
          participantsByProposalId: input.participantsByProposalId,
          currentUserId: input.currentUserId,
          visibleCounterpartyUserIds: input.visibleCounterpartyUserIds,
          names: input.names,
          activeProposal: input.activeProposal,
          range,
        });

        const waterfalls = buildWaterfalls({
          period,
          currentSummary: input.currentSummary,
          currentEvents,
          history: input.history,
          currentUserId: input.currentUserId,
          range,
          counterpartyByRelationshipId: input.counterpartyByRelationshipId,
        });

        return [
          period,
          {
            period,
            labels: {
              current: range.currentLabel,
              previous: range.previousLabel,
            },
            summaries,
            waterfallByCategory: waterfalls.byCategory,
            waterfallByPerson: waterfalls.byPerson,
            people,
            categories,
            settlements,
            insight: buildAnalyticsInsight({
              lensSummary: summaries.balance,
              topPerson: people[0] ?? null,
              topCategory: categories[0] ?? null,
              previousLabel: range.previousLabel,
            }),
          },
        ];
      }),
    ) as Readonly<Record<BalanceAnalyticsPeriod, BalanceAnalyticsPeriodDto>>,
  };
}

function buildLiveSnapshot(input: {
  readonly currentUserId: string;
  readonly profiles: readonly UserProfileRow[];
  readonly friendshipInvites: readonly FriendshipInviteRow[];
  readonly friendshipInviteDeliveries: readonly FriendshipInviteDeliveryRow[];
  readonly accountInvites: readonly AccountInviteRow[];
  readonly accountInviteDeliveries: readonly AccountInviteDeliveryRow[];
  readonly relationships: readonly RelationshipRow[];
  readonly openDebts: readonly OpenDebtRow[];
  readonly financialRequests: readonly FinancialRequestRow[];
  readonly history: readonly RelationshipHistoryRow[];
  readonly inboxItems: readonly InboxItemRow[];
  readonly settlementProposals: readonly SettlementProposalRow[];
  readonly settlementParticipants: readonly SettlementParticipantRow[];
  readonly notificationViews: readonly NotificationViewRow[];
  readonly auditEvents: readonly AuditEventRow[];
}): AppSnapshot {
  const nameByUserId = buildNameByUserId(input.profiles, input.currentUserId);
  const profileByUserId = buildProfileByUserId(input.profiles);
  const notificationViewedKeys = new Set(
    input.notificationViews.map((view) => view.notification_key),
  );
  const relationshipsByCounterpartyId = new Map<string, RelationshipRow>();
  const counterpartyByRelationshipId = new Map<
    string,
    {
      readonly userId: string;
      readonly displayName: string;
    }
  >();

  for (const relationship of input.relationships) {
    const counterpartyUserId = getCounterpartyUserId(relationship, input.currentUserId);
    if (counterpartyUserId) {
      relationshipsByCounterpartyId.set(counterpartyUserId, relationship);
      counterpartyByRelationshipId.set(relationship.id, {
        userId: counterpartyUserId,
        displayName: nameByUserId.get(counterpartyUserId) ?? 'Persona',
      });
    }
  }

  const visibleRelationshipIds = new Set(
    input.relationships.map((relationship) => relationship.id),
  );
  const visibleCounterpartyUserIds = new Set(relationshipsByCounterpartyId.keys());
  const history = input.history.filter((row) =>
    isHistoryRowVisibleToCurrentUser(row, input.currentUserId, visibleRelationshipIds),
  );
  const openDebtsByRelationshipId = new Map(
    input.openDebts.map((row) => [row.relationship_id, row]),
  );
  const requestsByRelationshipId = groupBy(input.financialRequests, (row) => row.relationship_id);
  const financialRequestsById = new Map(
    input.financialRequests.map((request) => [request.id, request]),
  );
  const historyByRelationshipId = groupBy(history, (row) => row.relationship_id);
  const settlementParticipantsByProposalId = groupBy(
    input.settlementParticipants,
    (row) => row.settlement_proposal_id,
  );
  const friendshipState = buildFriendshipInviteItems({
    invites: input.friendshipInvites,
    deliveries: input.friendshipInviteDeliveries,
    names: nameByUserId,
    profiles: profileByUserId,
    currentUserId: input.currentUserId,
  });
  const accountInviteState = buildAccountInviteItems({
    invites: input.accountInvites,
    deliveries: input.accountInviteDeliveries,
    names: nameByUserId,
    profiles: profileByUserId,
    currentUserId: input.currentUserId,
  });
  const pendingSettlements = buildPendingSettlementItems(
    input.settlementProposals,
    settlementParticipantsByProposalId,
    nameByUserId,
    input.currentUserId,
    visibleCounterpartyUserIds,
    input.inboxItems,
  );

  const people = Array.from(relationshipsByCounterpartyId.entries())
    .map(([counterpartyUserId, relationship]): PersonCardDto => {
      const requests = requestsByRelationshipId.get(relationship.id) ?? [];
      const relatedSettlements = pendingSettlements.filter((item) =>
        item.participantUserIds?.includes(counterpartyUserId),
      );
      const latestRequest = requests[0];
      const edge = openDebtsByRelationshipId.get(relationship.id);
      const direction = deriveDirection(input.currentUserId, edge);
      const timeline = historyByRelationshipId.get(relationship.id) ?? [];
      const latestHistory = timeline[0];
      const pendingCount =
        requests.filter((row) => row.status === 'pending').length + relatedSettlements.length;
      const lastActivityLabel =
        latestRequest && (!latestHistory || latestRequest.created_at >= latestHistory.happened_at)
          ? `Propuesta pendiente ${formatRelativeLabel(latestRequest.created_at)}`
          : latestHistory
            ? `Ultimo movimiento ${formatRelativeLabel(latestHistory.happened_at)}`
            : 'Sin movimientos todavia';

      return {
        userId: counterpartyUserId,
        displayName: nameByUserId.get(counterpartyUserId) ?? 'Persona',
        avatarUrl: resolveAvatarUrl(
          profileByUserId.get(counterpartyUserId)?.avatar_path,
          profileByUserId.get(counterpartyUserId)?.updated_at ?? null,
        ),
        netAmountMinor: edge?.amount_minor ?? 0,
        direction,
        pendingCount,
        lastActivityLabel,
      };
    })
    .sort(sortPeople);

  const peopleById: Record<string, LivePersonDetailDto> = Object.fromEntries(
    people.map((person): [string, LivePersonDetailDto] => {
      const relationship = relationshipsByCounterpartyId.get(person.userId);
      const requests = relationship ? (requestsByRelationshipId.get(relationship.id) ?? []) : [];
      const personRequestsById = new Map(requests.map((request) => [request.id, request]));
      const latestPendingRequest = requests.find((request) => request.status === 'pending');
      const personPendingRequests = requests
        .filter((request) => request.status === 'pending')
        .map(
          (request): ActionableItem => ({
            id: request.id,
            kind: 'financial_request',
            title: formatPendingRequestTitle(request, input.currentUserId),
            subtitle: formatPendingRequestSubtitle(
              request,
              nameByUserId,
              input.currentUserId,
              person.displayName,
            ),
            status:
              request.responder_user_id === input.currentUserId
                ? 'requires_you'
                : 'waiting_other_side',
            ctaLabel: 'Responder',
            href: `/person/${person.userId}`,
            amountMinor: request.amount_minor,
            category: normalizeTransactionCategory(request.category),
            counterpartyLabel: person.displayName,
            tone:
              requestDirectionForUser(request, input.currentUserId) === 'owes_me'
                ? 'positive'
                : 'negative',
            pendingHistorySteps: buildPendingRequestHistorySteps({
              request,
              requestsById: personRequestsById,
              currentUserId: input.currentUserId,
              counterpartyName: person.displayName,
              names: nameByUserId,
            }),
            createdAt: request.created_at,
          }),
        );
      const personPendingSettlements = pendingSettlements.filter((item) =>
        item.participantUserIds?.includes(person.userId),
      );
      const pendingItems = sortByNewest([
        ...personPendingRequests,
        ...personPendingSettlements,
      ]).map(actionableItemToActivityItem);
      const historyRows = relationship ? (historyByRelationshipId.get(relationship.id) ?? []) : [];
      const timeline = [
        ...buildPersonTimeline({
          requests,
          historyRows,
          currentUserId: input.currentUserId,
          counterpartyName: person.displayName,
          names: nameByUserId,
        }),
        ...buildSettlementProposalHistoryTimelineItems({
          proposals: input.settlementProposals,
          participantsByProposalId: settlementParticipantsByProposalId,
          currentUserId: input.currentUserId,
          counterpartyUserId: person.userId,
          names: nameByUserId,
        }),
      ].sort(compareHistoryItems);

      const pendingLabel = `${person.pendingCount} pendiente${person.pendingCount > 1 ? 's' : ''}`;
      const headline =
        person.netAmountMinor === 0
          ? person.pendingCount > 0
            ? `${pendingLabel} por resolver con ${person.displayName}`
            : `Con ${person.displayName} estan al dia`
          : person.direction === 'owes_me'
            ? `${person.displayName} te debe`
            : `Le debes a ${person.displayName}`;

      const supportText =
        person.pendingCount > 0
          ? `Tienes ${pendingLabel} con ${person.displayName}.`
          : person.lastActivityLabel;

      const pendingRequest = latestPendingRequest
        ? buildPersonPendingRequest({
            request: latestPendingRequest,
            currentUserId: input.currentUserId,
            counterpartyName: person.displayName,
            names: nameByUserId,
          })
        : undefined;

      return [
        person.userId,
        {
          userId: person.userId,
          displayName: person.displayName,
          avatarUrl: person.avatarUrl ?? null,
          direction: person.direction,
          netAmountMinor: person.netAmountMinor,
          pendingCount: person.pendingCount,
          headline,
          supportText,
          pendingItems,
          pendingRequest,
          timeline,
          relationshipStatus: 'active',
        },
      ];
    }),
  );
  const relationshipPeopleById: Record<string, PersonDetailDto> = { ...peopleById };
  upsertInviteProfilePeople({
    peopleById,
    pendingItems: [...friendshipState.pendingItems, ...accountInviteState.pendingItems],
    historyItems: [...friendshipState.historyItems, ...accountInviteState.historyItems],
    names: nameByUserId,
    profiles: profileByUserId,
  });

  const pendingRequests = input.financialRequests
    .filter((request) => request.status === 'pending')
    .map((request): ActionableItem => {
      const counterparty = counterpartyByRelationshipId.get(request.relationship_id);

      return {
        id: request.id,
        kind: 'financial_request',
        title: formatPendingRequestTitle(request, input.currentUserId),
        subtitle: formatPendingRequestSubtitle(
          request,
          nameByUserId,
          input.currentUserId,
          counterparty?.displayName ?? 'Persona',
        ),
        status:
          request.responder_user_id === input.currentUserId ? 'requires_you' : 'waiting_other_side',
        ctaLabel: 'Responder',
        href: counterparty ? `/person/${counterparty.userId}` : '/activity',
        amountMinor: request.amount_minor,
        category: normalizeTransactionCategory(request.category),
        counterpartyLabel: counterparty?.displayName,
        tone:
          requestDirectionForUser(request, input.currentUserId) === 'owes_me'
            ? 'positive'
            : 'negative',
        pendingHistorySteps: buildPendingRequestHistorySteps({
          request,
          requestsById: financialRequestsById,
          currentUserId: input.currentUserId,
          counterpartyName: counterparty?.displayName ?? 'Persona',
          names: nameByUserId,
        }),
        createdAt: request.created_at,
      };
    });

  const pendingItems = sortActionableItems([
    ...pendingRequests,
    ...pendingSettlements,
    ...friendshipState.pendingItems,
    ...accountInviteState.pendingItems,
  ]);
  const unviewedPendingItems = pendingItems.filter(
    (item) => !notificationViewedKeys.has(notificationViewKeyForItem(item)),
  );

  const historyItems = uniqueActivityItemsById(
    sortHistoryItems([
      ...buildActivityHistoryItems(relationshipPeopleById),
      ...friendshipState.historyItems,
      ...accountInviteState.historyItems,
    ]),
  );

  const summary = input.openDebts.reduce(
    (accumulator, debt) => {
      if (debt.debtor_user_id === input.currentUserId) {
        return {
          netBalanceMinor: accumulator.netBalanceMinor - debt.amount_minor,
          totalIOweMinor: accumulator.totalIOweMinor + debt.amount_minor,
          totalOwedToMeMinor: accumulator.totalOwedToMeMinor,
        };
      }

      if (debt.creditor_user_id === input.currentUserId) {
        return {
          netBalanceMinor: accumulator.netBalanceMinor + debt.amount_minor,
          totalIOweMinor: accumulator.totalIOweMinor,
          totalOwedToMeMinor: accumulator.totalOwedToMeMinor + debt.amount_minor,
        };
      }

      return accumulator;
    },
    {
      netBalanceMinor: 0,
      totalIOweMinor: 0,
      totalOwedToMeMinor: 0,
    },
  );

  const settlementsById = Object.fromEntries(
    input.settlementProposals.map((proposal) => [
      proposal.id,
      buildSettlementDetail(
        proposal,
        settlementParticipantsByProposalId.get(proposal.id) ?? [],
        nameByUserId,
        input.currentUserId,
        visibleCounterpartyUserIds,
      ),
    ]),
  );
  const activeProposal = buildActiveSettlementPreview({
    proposals: input.settlementProposals,
    participantsByProposalId: settlementParticipantsByProposalId,
    currentUserId: input.currentUserId,
    visibleCounterpartyUserIds,
    names: nameByUserId,
  });
  const balanceOverview: BalanceOverviewDto = {
    updatedAt: new Date().toISOString(),
    updatedAtLabel: 'Actualizado hace unos segundos',
    summary,
    projection: buildBalanceProjection({
      financialRequests: input.financialRequests,
      currentUserId: input.currentUserId,
      currentSummary: summary,
    }),
    resolution: buildSettlementMetrics({
      proposals: input.settlementProposals,
      participantsByProposalId: settlementParticipantsByProposalId,
      currentUserId: input.currentUserId,
      visibleCounterpartyUserIds,
      names: nameByUserId,
      activeProposal,
      range: periodRange('all'),
    }),
  };
  const balanceAnalytics = buildBalanceAnalytics({
    currentSummary: summary,
    people,
    history,
    counterpartyByRelationshipId,
    proposals: input.settlementProposals,
    participantsByProposalId: settlementParticipantsByProposalId,
    currentUserId: input.currentUserId,
    visibleCounterpartyUserIds,
    names: nameByUserId,
    activeProposal,
  });
  const currentUserProfileRow = profileByUserId.get(input.currentUserId);

  return {
    dashboard: {
      summary,
      urgentCount: pendingItems.length,
      topPendingPreview: pendingItems[0]
        ? {
            id: pendingItems[0].id,
            kind: pendingItems[0].kind,
            title: pendingItems[0].title,
            subtitle: pendingItems[0].subtitle,
            status: pendingItems[0].status,
            ctaLabel: pendingItems[0].ctaLabel,
            href: pendingItems[0].href ?? '/activity',
            amountMinor: pendingItems[0].amountMinor,
            category: pendingItems[0].category,
          }
        : null,
      activePeople: people,
    },
    balanceOverview,
    balanceAnalytics,
    people,
    peopleById,
    currentUserProfile: currentUserProfileRow
      ? {
          displayName: currentUserProfileRow.display_name,
          email: currentUserProfileRow.email,
          avatarUrl: resolveAvatarUrl(
            currentUserProfileRow.avatar_path,
            currentUserProfileRow.updated_at,
          ),
        }
      : null,
    friendshipPendingItems: friendshipState.pendingItems,
    friendshipHistoryItems: friendshipState.historyItems,
    friendshipSummary: friendshipState.summary,
    accountInvitePendingItems: accountInviteState.pendingItems,
    accountInviteHistoryItems: accountInviteState.historyItems,
    accountInviteSummary: accountInviteState.summary,
    activitySections: [
      {
        key: 'pending',
        title: 'Pendientes',
        description: 'Todo lo que espera accion tuya ahora mismo.',
        emptyMessage: 'No hay pendientes por ahora.',
        items: pendingItems,
      },
      {
        key: 'history',
        title: 'Historial',
        description: 'Lo ultimo que ya quedo registrado en el ledger o resuelto.',
        emptyMessage: 'Aun no hay historial.',
        items: historyItems,
      },
    ],
    notificationUnreadCount: unviewedPendingItems.length,
    notificationViewedKeys,
    pendingCount: pendingItems.length,
    auditEvents: buildAuditItems(input.auditEvents),
    settlementsById,
  };
}

async function fetchLiveSnapshot(
  currentUserId: string,
  requestSignal?: AbortSignal,
): Promise<AppSnapshot> {
  const client = assertSupabaseClient();
  const snapshotAbort = createSnapshotAbortSignal(requestSignal);
  const { signal } = snapshotAbort;

  try {
    const snapshotResultsPromise = Promise.all([
      client
        .from('user_profiles')
        .select(
          'id, display_name, email, avatar_path, account_access_state, invited_by_user_id, activated_via_account_invite_id, activated_at, phone_country_iso2, phone_country_calling_code, phone_national_number, phone_e164, phone_verified_at, created_at, updated_at',
        )
        .abortSignal(signal),
      client
        .from('v_friendship_invites_live')
        .select(
          'id, inviter_user_id, target_user_id, claimant_user_id, relationship_id, flow, origin_channel, status, resolution_actor, resolution_reason, intended_recipient_alias, intended_recipient_phone_e164, intended_recipient_phone_label, claimant_snapshot, source_context, expires_at, resolved_at, created_at, updated_at',
        )
        .order('created_at', { ascending: false })
        .abortSignal(signal),
      client
        .from('v_friendship_invite_deliveries_live')
        .select(
          'id, invite_id, channel, source_context, status, created_at, updated_at, expires_at, claimed_at, claimed_by_user_id, revoked_at',
        )
        .order('created_at', { ascending: false })
        .abortSignal(signal),
      client
        .from('v_account_invites_live')
        .select(
          'id, inviter_user_id, activated_user_id, linked_relationship_id, status, resolution_actor, resolution_reason, intended_recipient_alias, intended_recipient_phone_e164, intended_recipient_phone_label, source_context, expires_at, activated_at, resolved_at, created_at, updated_at',
        )
        .order('created_at', { ascending: false })
        .abortSignal(signal),
      client
        .from('v_account_invite_deliveries_live')
        .select(
          'id, invite_id, channel, source_context, status, expires_at, revoked_at, first_opened_at, last_opened_at, open_count, first_app_opened_at, authenticated_user_id, authenticated_at, activation_completed_at, created_at, updated_at',
        )
        .order('created_at', { ascending: false })
        .abortSignal(signal),
      client
        .from('relationships')
        .select('id, user_low_id, user_high_id, status, created_at, updated_at')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .abortSignal(signal),
      client.from('v_open_debts').select('*').abortSignal(signal),
      client
        .from('financial_requests')
        .select(
          'id, relationship_id, request_type, status, creator_user_id, responder_user_id, debtor_user_id, creditor_user_id, amount_minor, currency_code, description, category, parent_request_id, target_ledger_transaction_id, created_at, updated_at, resolved_at',
        )
        .order('created_at', { ascending: false })
        .abortSignal(signal),
      client
        .from('v_relationship_history')
        .select('*')
        .order('happened_at', { ascending: false })
        .abortSignal(signal),
      client
        .from('v_inbox_items')
        .select('owner_user_id, item_id, item_kind, subtype, status, created_at')
        .eq('owner_user_id', currentUserId)
        .order('created_at', { ascending: false })
        .abortSignal(signal),
      client
        .from('settlement_proposals')
        .select(
          'id, created_by_user_id, status, graph_snapshot_hash, graph_snapshot, movements_json, anchor_user_low_id, anchor_user_high_id, currency_code, source_graph_cycle_job_id, created_at, updated_at, executed_at',
        )
        .order('created_at', { ascending: false })
        .abortSignal(signal),
      client
        .from('settlement_proposal_participants')
        .select('id, settlement_proposal_id, participant_user_id, decision, decided_at, created_at')
        .abortSignal(signal),
      client
        .from('notification_views')
        .select(
          'user_id, notification_key, notification_kind, source_item_id, notification_status, viewed_at, created_at, updated_at',
        )
        .eq('user_id', currentUserId)
        .order('viewed_at', { ascending: false })
        .abortSignal(signal),
      client
        .from('audit_events')
        .select(
          'id, actor_user_id, entity_type, entity_id, event_name, request_id, metadata_json, created_at',
        )
        .order('created_at', { ascending: false })
        .limit(20)
        .abortSignal(signal),
    ]);
    void snapshotResultsPromise.catch(() => undefined);

    const [
      profilesResult,
      friendshipInvitesResult,
      friendshipInviteDeliveriesResult,
      accountInvitesResult,
      accountInviteDeliveriesResult,
      relationshipsResult,
      openDebtsResult,
      requestsResult,
      historyResult,
      inboxItemsResult,
      settlementProposalsResult,
      settlementParticipantsResult,
      notificationViewsResult,
      auditResult,
    ] = await Promise.race([snapshotResultsPromise, snapshotAbort.timeoutPromise]);

    if (snapshotAbort.wasTimedOut()) {
      throw new Error('La sincronizacion tardo demasiado. Revisa tu conexion e intenta de nuevo.');
    }

    if (requestSignal?.aborted) {
      throw new Error('Sincronizacion cancelada.');
    }

    if (profilesResult.error) {
      throw new Error(profilesResult.error.message);
    }

    if (friendshipInvitesResult.error) {
      throw new Error(friendshipInvitesResult.error.message);
    }

    if (friendshipInviteDeliveriesResult.error) {
      throw new Error(friendshipInviteDeliveriesResult.error.message);
    }

    if (accountInvitesResult.error) {
      throw new Error(accountInvitesResult.error.message);
    }

    if (accountInviteDeliveriesResult.error) {
      throw new Error(accountInviteDeliveriesResult.error.message);
    }

    if (relationshipsResult.error) {
      throw new Error(relationshipsResult.error.message);
    }

    if (openDebtsResult.error) {
      throw new Error(openDebtsResult.error.message);
    }

    if (requestsResult.error) {
      throw new Error(requestsResult.error.message);
    }

    if (historyResult.error) {
      throw new Error(historyResult.error.message);
    }

    if (inboxItemsResult.error) {
      throw new Error(inboxItemsResult.error.message);
    }

    if (settlementProposalsResult.error) {
      throw new Error(settlementProposalsResult.error.message);
    }

    if (settlementParticipantsResult.error) {
      throw new Error(settlementParticipantsResult.error.message);
    }

    if (notificationViewsResult.error) {
      throw new Error(notificationViewsResult.error.message);
    }

    if (auditResult.error) {
      throw new Error(auditResult.error.message);
    }

    return buildLiveSnapshot({
      currentUserId,
      profiles: profilesResult.data ?? [],
      friendshipInvites: (friendshipInvitesResult.data ?? []) as readonly FriendshipInviteRow[],
      friendshipInviteDeliveries: (friendshipInviteDeliveriesResult.data ??
        []) as readonly FriendshipInviteDeliveryRow[],
      accountInvites: (accountInvitesResult.data ?? []) as readonly AccountInviteRow[],
      accountInviteDeliveries: (accountInviteDeliveriesResult.data ??
        []) as readonly AccountInviteDeliveryRow[],
      relationships: relationshipsResult.data ?? [],
      openDebts: (openDebtsResult.data ?? []) as readonly OpenDebtRow[],
      financialRequests: requestsResult.data ?? [],
      history: (historyResult.data ?? []) as readonly RelationshipHistoryRow[],
      inboxItems: (inboxItemsResult.data ?? []) as readonly InboxItemRow[],
      settlementProposals: settlementProposalsResult.data ?? [],
      settlementParticipants: settlementParticipantsResult.data ?? [],
      notificationViews: notificationViewsResult.data ?? [],
      auditEvents: auditResult.data ?? [],
    });
  } catch (error) {
    if (snapshotAbort.wasTimedOut()) {
      throw new Error('La sincronizacion tardo demasiado. Revisa tu conexion e intenta de nuevo.');
    }

    if (requestSignal?.aborted) {
      throw new Error('Sincronizacion cancelada.');
    }

    throw error;
  } finally {
    snapshotAbort.cleanup();
  }
}

async function fetchAppSnapshot(userId: string | null, signal?: AbortSignal) {
  if (!userId) {
    throw new Error('No hay una sesion lista para cargar datos.');
  }

  try {
    return await fetchLiveSnapshot(userId, signal);
  } catch (error) {
    throw reportAndCreateSupportError({
      error,
      fallbackMessage: 'No pudimos sincronizar tus datos.',
      kind: 'data_sync',
      metadata: { operation: 'fetch_app_snapshot' },
    });
  }
}

async function invokeSupabaseFunction<TBody extends Record<string, unknown>, TResult>(
  name: string,
  body: TBody,
): Promise<TResult> {
  const client = assertSupabaseClient();
  const supportId = createSupportId();
  const invoke = async () =>
    client.functions.invoke<TResult>(name, {
      body,
      headers: {
        'x-client-info': 'happy-circles-mobile',
        'x-request-id': supportId,
      },
    });
  let result = await invoke();

  if (result.error) {
    const details = await readFunctionErrorDetails(result.error);
    if (isJwtAuthError(details)) {
      const { data: refreshData, error: refreshError } = await client.auth.refreshSession();
      if (refreshError || !refreshData.session) {
        await client.auth.signOut();
        throw new Error('Tu sesion ya no es valida. Cierra sesion y vuelve a entrar.');
      }

      result = await invoke();
      if (result.error) {
        const retryDetails = await readFunctionErrorDetails(result.error);
        throw reportAndCreateSupportError({
          error: new Error(retryDetails.message),
          errorCode: retryDetails.code,
          functionName: name,
          kind: 'edge_function',
          metadata: { status: retryDetails.status ?? null },
          requestId: retryDetails.requestId ?? supportId,
          status: retryDetails.status,
          supportId,
        });
      }

      if (result.data === null) {
        throw reportAndCreateSupportError({
          error: new Error(`La funcion ${name} respondio sin payload.`),
          errorCode: 'empty_payload',
          functionName: name,
          kind: 'edge_function',
          metadata: { status: 'empty_payload' },
          requestId: supportId,
          supportId,
        });
      }

      return result.data;
    }

    throw reportAndCreateSupportError({
      error: new Error(details.message),
      errorCode: details.code,
      functionName: name,
      kind: 'edge_function',
      metadata: { status: details.status ?? null },
      requestId: details.requestId ?? supportId,
      status: details.status,
      supportId,
    });
  }

  if (result.data === null) {
    throw reportAndCreateSupportError({
      error: new Error(`La funcion ${name} respondio sin payload.`),
      errorCode: 'empty_payload',
      functionName: name,
      kind: 'edge_function',
      metadata: { status: 'empty_payload' },
      requestId: supportId,
      supportId,
    });
  }

  return result.data;
}

async function invalidateAppSnapshot() {
  await queryClient.invalidateQueries({
    queryKey: [APP_SNAPSHOT_QUERY_KEY],
  });
}

export async function markNotificationItemsViewed(
  userId: string | null,
  items: readonly ActivityItemDto[],
): Promise<void> {
  if (!userId || items.length === 0) {
    return;
  }

  const client = assertSupabaseClient();
  const rowsByKey = new Map(
    items.map((item) => {
      const row = notificationViewRowForItem(userId, item);
      return [row.notification_key, row] as const;
    }),
  );
  const rows = Array.from(rowsByKey.values());
  const { error } = await client.from('notification_views').upsert(rows, {
    onConflict: 'user_id,notification_key',
  });

  if (error) {
    throw new Error(error.message);
  }

  await invalidateAppSnapshot();
}

function useSensitiveMutationGuard() {
  const session = useSession();

  return async (actionLabel: string) => {
    if (!session.isEmailConfirmed) {
      throw new Error('Confirma tu correo antes de mover dinero o aprobar cambios sensibles.');
    }

    if (session.profileCompletionState !== 'complete') {
      throw new Error('Completa tu perfil antes de mover dinero o aprobar cambios sensibles.');
    }

    if (session.deviceTrustState !== 'trusted') {
      throw new Error('Este dispositivo aun no es confiable. Validalo primero desde seguridad.');
    }

    const result = await session.stepUpAuth();
    if (!result.success) {
      if (
        result.error === 'not_available' ||
        result.error === 'not_enrolled' ||
        result.error === 'passcode_not_set'
      ) {
        throw new Error(
          `Este dispositivo no puede usar ${session.biometricLabel} para ${actionLabel}.`,
        );
      }

      if (result.error === 'lockout') {
        throw new Error(
          `${session.biometricLabel} esta bloqueado temporalmente. Desbloquea el dispositivo y vuelve a intentar.`,
        );
      }

      if (result.error === 'user_cancel') {
        throw new Error(`Cancelaste ${session.biometricLabel}.`);
      }

      if (result.error === 'authentication_failed') {
        throw new Error(`No se pudo validar ${session.biometricLabel} para ${actionLabel}.`);
      }

      throw new Error(`No se pudo validar tu identidad para ${actionLabel}.`);
    }
  };
}

export function useAppSnapshot() {
  const { userId } = useSession();

  return useQuery({
    queryKey: [APP_SNAPSHOT_QUERY_KEY, userId ?? 'signed-out'],
    enabled: Boolean(userId),
    queryFn: ({ signal }) => fetchAppSnapshot(userId, signal),
  });
}

export function useCreateInternalFriendshipInviteMutation() {
  return useMutation({
    mutationFn: async (input: {
      readonly targetUserId: string;
      readonly sourceContext?: string;
    }) => {
      const payload = createInternalFriendshipInviteSchema.parse({
        idempotencyKey: createIdempotencyKey('create_internal_friendship_invite'),
        targetUserId: input.targetUserId,
        sourceContext: input.sourceContext,
      });

      return invokeSupabaseFunction<typeof payload, FriendshipInviteActionResult>(
        'create-internal-friendship-invite',
        payload,
      );
    },
    onSuccess: async (_data, input) => {
      recordProductEventSafe({
        eventName: 'friendship_invite_created',
        screenName: 'people',
        metadata: { flow: 'internal', source: input.sourceContext ?? 'direct' },
      });
      await invalidateAppSnapshot();
    },
  });
}

export function useCreateExternalFriendshipInviteMutation() {
  return useMutation({
    mutationFn: async (input: {
      readonly channel: 'remote' | 'qr';
      readonly sourceContext?: string;
      readonly intendedRecipientAlias?: string;
      readonly intendedRecipientPhoneE164?: string;
      readonly intendedRecipientPhoneLabel?: string;
    }) => {
      const payload = createExternalFriendshipInviteSchema.parse({
        idempotencyKey: createIdempotencyKey(`create_external_friendship_invite_${input.channel}`),
        channel: input.channel,
        sourceContext: input.sourceContext,
        intendedRecipientAlias: input.intendedRecipientAlias,
        intendedRecipientPhoneE164: input.intendedRecipientPhoneE164,
        intendedRecipientPhoneLabel: input.intendedRecipientPhoneLabel,
      });

      return invokeSupabaseFunction<typeof payload, FriendshipInviteDeliveryResult>(
        'create-external-friendship-invite',
        payload,
      );
    },
    onSuccess: async (_data, input) => {
      recordProductEventSafe({
        eventName: 'friendship_invite_created',
        screenName: 'people',
        metadata: {
          channel: input.channel,
          flow: 'external',
          source: input.sourceContext ?? 'share',
        },
      });
      await invalidateAppSnapshot();
    },
  });
}

export function useFriendshipInvitePreviewQuery(deliveryToken: string | null) {
  const { userId } = useSession();

  return useQuery({
    queryKey: ['friendship-invite-preview', userId ?? 'signed-out', deliveryToken ?? 'missing'],
    enabled: Boolean(userId && deliveryToken),
    queryFn: async () => {
      const payload = friendshipInvitePreviewSchema.parse({
        deliveryToken,
      });

      return invokeSupabaseFunction<typeof payload, FriendshipInvitePreviewResult>(
        'get-friendship-invite-preview',
        payload,
      );
    },
  });
}

export function useResolvePeopleTargetsMutation() {
  return useMutation({
    mutationFn: async (phoneE164List: readonly string[]) => {
      const payload = resolvePeopleTargetsSchema.parse({
        phoneE164List,
      });

      return invokeSupabaseFunction<typeof payload, PeopleTargetResolution[]>(
        'resolve-people-targets',
        payload,
      );
    },
  });
}

export function useCreatePeopleOutreachMutation() {
  return useMutation({
    mutationFn: async (input: {
      readonly channel: 'remote' | 'qr';
      readonly sourceContext?: string;
      readonly intendedRecipientAlias: string;
      readonly intendedRecipientPhoneE164: string;
      readonly intendedRecipientPhoneLabel?: string;
    }) => {
      const payload = createPeopleOutreachSchema.parse({
        idempotencyKey: createIdempotencyKey(`create_people_outreach_${input.channel}`),
        channel: input.channel,
        sourceContext: input.sourceContext,
        intendedRecipientAlias: input.intendedRecipientAlias,
        intendedRecipientPhoneE164: input.intendedRecipientPhoneE164,
        intendedRecipientPhoneLabel: input.intendedRecipientPhoneLabel,
      });

      return invokeSupabaseFunction<typeof payload, PeopleOutreachResult>(
        'create-people-outreach',
        payload,
      );
    },
    onSuccess: invalidateAppSnapshot,
  });
}

export function useAccountInvitePreviewQuery(deliveryToken: string | null) {
  const { userId } = useSession();

  return useQuery({
    queryKey: ['account-invite-preview', userId ?? 'signed-out', deliveryToken ?? 'missing'],
    enabled: Boolean(deliveryToken),
    queryFn: async () => {
      const payload = accountInvitePreviewSchema.parse({
        deliveryToken,
      });

      return invokeSupabaseFunction<typeof payload, AccountInvitePreviewResult>(
        'get-account-invite-preview-public',
        payload,
      );
    },
  });
}

export function useActivateAccountFromInviteMutation() {
  return useMutation({
    mutationFn: async (input: {
      readonly deliveryToken: string;
      readonly currentDeviceId: string;
    }) => {
      const payload = activateAccountFromInviteSchema.parse({
        idempotencyKey: createIdempotencyKey('activate_account_from_invite'),
        deliveryToken: input.deliveryToken,
        currentDeviceId: input.currentDeviceId,
      });

      return invokeSupabaseFunction<typeof payload, AccountInviteActionResult>(
        'activate-account-from-invite',
        payload,
      );
    },
    onSuccess: invalidateAppSnapshot,
  });
}

export function useReviewAccountInviteMutation() {
  return useMutation({
    mutationFn: async (input: {
      readonly inviteId: string;
      readonly decision: 'approve' | 'reject';
    }) => {
      const payload = reviewAccountInviteSchema.parse({
        idempotencyKey: createIdempotencyKey(`review_account_invite_${input.decision}`),
        inviteId: input.inviteId,
        decision: input.decision,
      });

      return invokeSupabaseFunction<typeof payload, AccountInviteActionResult>(
        'review-account-invite',
        payload,
      );
    },
    onSuccess: invalidateAppSnapshot,
  });
}

export function useCancelAccountInviteMutation() {
  return useMutation({
    mutationFn: async (inviteId: string) => {
      const payload = cancelAccountInviteSchema.parse({
        idempotencyKey: createIdempotencyKey('cancel_account_invite'),
        inviteId,
      });

      return invokeSupabaseFunction<typeof payload, AccountInviteActionResult>(
        'cancel-account-invite',
        payload,
      );
    },
    onSuccess: invalidateAppSnapshot,
  });
}

export function useClaimExternalFriendshipInviteMutation() {
  return useMutation({
    mutationFn: async (deliveryToken: string) => {
      const payload = claimExternalFriendshipInviteSchema.parse({
        idempotencyKey: createIdempotencyKey('claim_external_friendship_invite'),
        deliveryToken,
      });

      return invokeSupabaseFunction<typeof payload, FriendshipInviteActionResult>(
        'claim-external-friendship-invite',
        payload,
      );
    },
    onSuccess: invalidateAppSnapshot,
  });
}

export function useUpdateProfileAvatarMutation() {
  const session = useSession();

  return useMutation({
    mutationFn: async (input: { readonly uri: string; readonly contentType?: string | null }) => {
      const userId = session.userId;
      if (!userId) {
        throw new Error('No hay una sesion activa.');
      }

      const client = assertSupabaseClient();
      const uriLower = input.uri.toLocaleLowerCase('en-US');
      const inputContentType = input.contentType?.trim().toLocaleLowerCase('en-US') ?? '';
      const normalizedContentType =
        inputContentType ||
        (uriLower.endsWith('.png')
          ? 'image/png'
          : uriLower.endsWith('.webp')
            ? 'image/webp'
            : uriLower.endsWith('.heic')
              ? 'image/heic'
              : uriLower.endsWith('.heif')
                ? 'image/heif'
                : 'image/jpeg');
      const fileExtension = normalizedContentType.includes('png')
        ? 'png'
        : normalizedContentType.includes('heic')
          ? 'heic'
          : normalizedContentType.includes('heif')
            ? 'heif'
            : normalizedContentType.includes('webp')
              ? 'webp'
              : 'jpg';
      const formData = new FormData();
      formData.append('avatar', {
        name: `avatar.${fileExtension}`,
        type: normalizedContentType,
        uri: input.uri,
      } as unknown as Blob);

      const supportId = createSupportId();
      const result = await client.functions.invoke<{ avatarPath: string }>('upload-avatar', {
        body: formData,
        headers: {
          'x-client-info': 'happy-circles-mobile',
          'x-request-id': supportId,
        },
      });

      if (result.error) {
        const details = await readFunctionErrorDetails(result.error);
        throw reportAndCreateSupportError({
          error: new Error(details.message),
          errorCode: details.code,
          functionName: 'upload-avatar',
          kind: 'edge_function',
          metadata: { status: details.status ?? null },
          requestId: details.requestId ?? supportId,
          status: details.status,
          supportId,
        });
      }

      if (!result.data?.avatarPath) {
        throw reportAndCreateSupportError({
          error: new Error('No se pudo actualizar la foto.'),
          errorCode: 'empty_payload',
          functionName: 'upload-avatar',
          kind: 'edge_function',
          metadata: { status: 'empty_payload' },
          requestId: supportId,
          supportId,
        });
      }

      return result.data.avatarPath;
    },
    onSuccess: async () => {
      await session.refreshAccountState({ preserveTrustedDeviceDuringLoad: true });
      await invalidateAppSnapshot();
    },
  });
}

export function useRequestAccountDeletionMutation() {
  return useMutation({
    mutationFn: async () => {
      const payload = requestAccountDeletionSchema.parse({
        idempotencyKey: createIdempotencyKey('request_account_deletion'),
      });

      return invokeSupabaseFunction<typeof payload, AccountDeletionRequestResult>(
        'request-account-deletion',
        payload,
      );
    },
    onSuccess: async () => {
      await invalidateAppSnapshot();
    },
  });
}

export function useReviewExternalFriendshipInviteMutation() {
  return useMutation({
    mutationFn: async (input: {
      readonly inviteId: string;
      readonly decision: 'approve' | 'reject';
    }) => {
      const payload = reviewExternalFriendshipInviteSchema.parse({
        idempotencyKey: createIdempotencyKey(`review_external_friendship_invite_${input.decision}`),
        inviteId: input.inviteId,
        decision: input.decision,
      });

      return invokeSupabaseFunction<typeof payload, FriendshipInviteActionResult>(
        'review-external-friendship-invite',
        payload,
      );
    },
    onSuccess: async (_data, input) => {
      if (input.decision === 'approve') {
        recordProductEventSafe({
          eventName: 'friendship_invite_accepted',
          screenName: 'people',
          metadata: { flow: 'external', decision: input.decision },
        });
      }
      await invalidateAppSnapshot();
    },
  });
}

export function useRespondInternalFriendshipInviteMutation() {
  return useMutation({
    mutationFn: async (input: {
      readonly inviteId: string;
      readonly decision: 'accept' | 'reject';
    }) => {
      const payload = friendshipInviteDecisionSchema.parse({
        idempotencyKey: createIdempotencyKey(
          `respond_internal_friendship_invite_${input.decision}`,
        ),
        inviteId: input.inviteId,
        decision: input.decision,
      });

      return invokeSupabaseFunction<typeof payload, FriendshipInviteActionResult>(
        'respond-internal-friendship-invite',
        payload,
      );
    },
    onSuccess: async (_data, input) => {
      if (input.decision === 'accept') {
        recordProductEventSafe({
          eventName: 'friendship_invite_accepted',
          screenName: 'people',
          metadata: { flow: 'internal', decision: input.decision },
        });
      }
      await invalidateAppSnapshot();
    },
  });
}

export function useCancelFriendshipInviteMutation() {
  return useMutation({
    mutationFn: async (inviteId: string) => {
      const payload = cancelFriendshipInviteSchema.parse({
        idempotencyKey: createIdempotencyKey('cancel_friendship_invite'),
        inviteId,
      });

      return invokeSupabaseFunction<typeof payload, FriendshipInviteActionResult>(
        'cancel-friendship-invite',
        payload,
      );
    },
    onSuccess: invalidateAppSnapshot,
  });
}

export function useCreateRequestMutation() {
  const guardSensitiveAction = useSensitiveMutationGuard();

  return useMutation({
    mutationFn: async (input: CreateRequestInput) => {
      recordProductEventSafe({
        eventName: 'financial_request_started',
        screenName: 'register',
        metadata: { category: input.category ?? DEFAULT_TRANSACTION_CATEGORY },
      });
      await guardSensitiveAction('crear el movimiento');

      const payload = createBalanceRequestSchema.parse({
        idempotencyKey: createIdempotencyKey('mobile_balance_increase'),
        responderUserId: input.responderUserId,
        debtorUserId: input.debtorUserId,
        creditorUserId: input.creditorUserId,
        amountMinor: input.amountMinor,
        description: input.description,
        category: input.category ?? DEFAULT_TRANSACTION_CATEGORY,
        requestKind: 'balance_increase',
      });

      return invokeSupabaseFunction('create-balance-request', payload);
    },
    onSuccess: async () => {
      recordProductEventSafe({
        eventName: 'financial_request_created',
        screenName: 'register',
      });
      await invalidateAppSnapshot();
    },
  });
}

export function useAcceptFinancialRequestMutation() {
  const guardSensitiveAction = useSensitiveMutationGuard();

  return useMutation({
    mutationFn: async (requestId: string) => {
      await guardSensitiveAction('aceptar la solicitud');

      const payload = requestDecisionSchema.parse({
        idempotencyKey: createIdempotencyKey('accept_request'),
        requestId,
      });

      return invokeSupabaseFunction('accept-financial-request', payload);
    },
    onSuccess: async () => {
      recordProductEventSafe({
        eventName: 'financial_request_accepted',
        screenName: 'transactions',
      });
      await invalidateAppSnapshot();
    },
  });
}

export function useRejectFinancialRequestMutation() {
  const guardSensitiveAction = useSensitiveMutationGuard();

  return useMutation({
    mutationFn: async (requestId: string) => {
      await guardSensitiveAction('rechazar la solicitud');

      const payload = requestDecisionSchema.parse({
        idempotencyKey: createIdempotencyKey('reject_request'),
        requestId,
      });

      return invokeSupabaseFunction('reject-financial-request', payload);
    },
    onSuccess: invalidateAppSnapshot,
  });
}

export function useAmendFinancialRequestMutation() {
  const guardSensitiveAction = useSensitiveMutationGuard();

  return useMutation({
    mutationFn: async (input: {
      readonly requestId: string;
      readonly amountMinor: number;
      readonly description: string;
      readonly category?: TransactionCategory;
    }) => {
      await guardSensitiveAction('proponer un nuevo monto');

      const payload = amendFinancialRequestSchema.parse({
        idempotencyKey: createIdempotencyKey('amend_request'),
        requestId: input.requestId,
        amountMinor: input.amountMinor,
        description: input.description,
        category: input.category ?? DEFAULT_TRANSACTION_CATEGORY,
      });

      return invokeSupabaseFunction('amend-financial-request', payload);
    },
    onSuccess: invalidateAppSnapshot,
  });
}

export function useApproveSettlementMutation() {
  const guardSensitiveAction = useSensitiveMutationGuard();

  return useMutation({
    mutationFn: async (proposalId: string) => {
      await guardSensitiveAction('aprobar el Happy Circle');

      const payload = cycleSettlementDecisionSchema.parse({
        idempotencyKey: createIdempotencyKey('approve_settlement'),
        proposalId,
      });

      return invokeSupabaseFunction('approve-cycle-settlement', payload);
    },
    onSuccess: async () => {
      recordProductEventSafe({
        eventName: 'settlement_proposal_approved',
        screenName: 'settlement_detail',
      });
      await invalidateAppSnapshot();
    },
  });
}

export function useRejectSettlementMutation() {
  const guardSensitiveAction = useSensitiveMutationGuard();

  return useMutation({
    mutationFn: async (proposalId: string) => {
      await guardSensitiveAction('no aprobar el Happy Circle');

      const payload = cycleSettlementDecisionSchema.parse({
        idempotencyKey: createIdempotencyKey('reject_settlement'),
        proposalId,
      });

      return invokeSupabaseFunction('reject-cycle-settlement', payload);
    },
    onSuccess: invalidateAppSnapshot,
  });
}

export function useExecuteSettlementMutation() {
  const guardSensitiveAction = useSensitiveMutationGuard();

  return useMutation({
    mutationFn: async (proposalId: string) => {
      await guardSensitiveAction('completar el Happy Circle');

      const payload = cycleSettlementExecutionSchema.parse({
        idempotencyKey: createIdempotencyKey('execute_settlement'),
        proposalId,
      });

      return invokeSupabaseFunction('execute-approved-cycle-settlement', payload);
    },
    onSuccess: async () => {
      recordProductEventSafe({
        eventName: 'settlement_executed',
        screenName: 'settlement_detail',
      });
      await invalidateAppSnapshot();
    },
  });
}
