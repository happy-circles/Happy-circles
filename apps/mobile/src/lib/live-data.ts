import { useMutation, useQuery } from '@tanstack/react-query';

import type {
  ActivityItemDto,
  ActivitySectionDto,
  DashboardDto,
  PendingActionDto,
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
import { AVATAR_BUCKET, resolveAvatarUrl } from './avatar';
import { formatCop } from './data';
import { buildActivityHistoryItems, compareHistoryItems } from './history-cases';
import { createIdempotencyKey } from './idempotency';
import { queryClient } from './query-client';
import { supabase } from './supabase';
import { DEFAULT_TRANSACTION_CATEGORY, normalizeTransactionCategory } from './transaction-categories';

type RelationshipRow = Database['public']['Tables']['relationships']['Row'];
type FriendshipInviteRow = Database['public']['Views']['v_friendship_invites_live']['Row'];
type FriendshipInviteDeliveryRow =
  Database['public']['Views']['v_friendship_invite_deliveries_live']['Row'];
type AccountInviteRow = Database['public']['Views']['v_account_invites_live']['Row'];
type AccountInviteDeliveryRow =
  Database['public']['Views']['v_account_invite_deliveries_live']['Row'];
type FinancialRequestRow = Database['public']['Tables']['financial_requests']['Row'];
type AuditEventRow = Database['public']['Tables']['audit_events']['Row'];
type SettlementProposalRow = Database['public']['Tables']['settlement_proposals']['Row'];
type SettlementParticipantRow =
  Database['public']['Tables']['settlement_proposal_participants']['Row'];
type UserProfileRow = Database['public']['Tables']['user_profiles']['Row'];
type OpenDebtRow = Database['public']['Views']['v_open_debts']['Row'];
type RelationshipHistoryRow = Database['public']['Views']['v_relationship_history']['Row'];
type InboxItemRow = Database['public']['Views']['v_inbox_items']['Row'];

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
  readonly participantStatuses: readonly string[];
  readonly movements: readonly string[];
  readonly impactLines: readonly string[];
  readonly explainers: readonly string[];
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
  readonly inviteId: string;
  readonly deliveryId: string;
  readonly status:
    | 'pending_activation'
    | 'pending_inviter_review'
    | 'accepted'
    | 'rejected'
    | 'canceled'
    | 'expired';
  readonly deliveryStatus: 'issued' | 'authenticated' | 'activated' | 'revoked' | 'expired';
  readonly channel: 'remote' | 'qr';
  readonly expiresAt: string;
  readonly inviteExpiresAt: string;
  readonly resolvedAt: string | null;
  readonly inviterUserId: string;
  readonly inviterDisplayName: string;
  readonly intendedRecipientAlias: string | null;
  readonly intendedRecipientPhoneE164: string | null;
  readonly intendedRecipientPhoneLabel: string | null;
  readonly activatedUserId: string | null;
  readonly activatedDisplayName: string | null;
  readonly linkedRelationshipId: string | null;
  readonly reason:
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
  readonly createdAt: string;
}

export interface AppSnapshot {
  readonly dashboard: DashboardDto;
  readonly people: readonly PersonCardDto[];
  readonly peopleById: Readonly<Record<string, PersonDetailDto>>;
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

function assertSupabaseClient() {
  if (!supabase) {
    throw new Error('Supabase no esta configurado en esta app.');
  }

  return supabase;
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
  if (status === 'rejected' || status === 'amended' || status === 'canceled' || status === 'expired') {
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
    const participantNames = participants.map(
      (participant) => names.get(participant.participant_user_id) ?? 'Persona',
    );
    const others = participantNames.filter((name) => name !== 'Tu');
    const titleBase =
      others.length > 0
        ? `Ajusta saldos con ${others.join(', ')}`
        : 'Ajusta saldos en tu circulo';

    pendingProposalIds.add(proposal.id);
    items.push({
      id: proposal.id,
      kind: 'settlement_proposal',
      title: 'Happy Circle pendiente',
      subtitle: `${titleBase} | ${formatRelativeLabel(proposal.created_at)}`,
      status: 'pending_approvals',
      ctaLabel: 'Revisar',
      href: `/settlements/${proposal.id}`,
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
    const participantNames = participants.map(
      (participant) => names.get(participant.participant_user_id) ?? 'Persona',
    );
    const others = participantNames.filter((name) => name !== 'Tu');
    const titleBase =
      others.length > 0
        ? `Ajusta saldos con ${others.join(', ')}`
        : 'Ajusta saldos en tu circulo';

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
      proposal.status === 'rejected'
        ? 'Este Circle no se completo'
        : 'Este Circle fue reemplazado';
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

function buildFriendshipInviteItems(input: {
  readonly invites: readonly FriendshipInviteRow[];
  readonly deliveries: readonly FriendshipInviteDeliveryRow[];
  readonly names: Map<string, string>;
  readonly currentUserId: string;
}): {
  readonly pendingItems: readonly FriendshipInviteListItem[];
  readonly historyItems: readonly FriendshipInviteListItem[];
  readonly summary: FriendshipSummary;
} {
  const latestDeliveryByInviteId = buildLatestDeliveryByInviteId(input.deliveries);
  const pendingItems: FriendshipInviteListItem[] = [];
  const historyItems: FriendshipInviteListItem[] = [];

  for (const invite of input.invites) {
    const actorRole = getFriendshipActorRole(invite, input.currentUserId);
    if (actorRole === 'none') {
      continue;
    }

    const latestDelivery = latestDeliveryByInviteId.get(invite.id);
    const claimantSnapshot = parseFriendshipClaimantSnapshot(invite.claimant_snapshot);
    const inviterName =
      invite.inviter_user_id === input.currentUserId
        ? 'Tu'
        : (input.names.get(invite.inviter_user_id) ?? 'Persona');
    const targetName = invite.target_user_id
      ? (input.names.get(invite.target_user_id) ?? 'Persona')
      : (invite.intended_recipient_alias ?? 'Persona');
    const claimantName = claimantSnapshot?.displayName ?? 'Persona';
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
        subtitle = `${channelLabel(invite.origin_channel)} | responde en la app`;
        actionState = 'requires_you_response';
        status = 'requires_you_response';
      } else {
        title = `Esperando a ${targetName}`;
        subtitle = `${channelLabel(invite.origin_channel)} | invitacion interna pendiente`;
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
        channelLabel(latestDelivery?.channel ?? invite.origin_channel),
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
        title = `Verifica a ${claimantName}`;
        subtitle = [
          channelLabel(latestDelivery?.channel ?? invite.origin_channel),
          intendedRecipientReference ? `Pensada para ${intendedRecipientReference}` : null,
          claimantSnapshot?.maskedEmail,
          claimantSnapshot?.maskedPhone,
        ]
          .filter(Boolean)
          .join(' | ');
        actionState = 'requires_you_review';
        status = 'requires_you_review';
      } else {
        title = `Esperando validacion de ${inviterName}`;
        subtitle = `${channelLabel(latestDelivery?.channel ?? invite.origin_channel)} | ya reclamaste esta invitacion`;
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
                ? `${claimantName} entro con el telefono esperado`
                : `Confirmaste a ${claimantName}`
              : `${targetName} acepto tu invitacion`
            : actorRole === 'claimant'
              ? autoAcceptedByPhoneMatch
                ? `Tu telefono coincidio y la conexion quedo creada`
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
        channelLabel(latestDelivery?.channel ?? invite.origin_channel),
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
              ? (claimantSnapshot?.displayName ?? invite.intended_recipient_alias ?? undefined)
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
      intendedRecipientAlias: invite.intended_recipient_alias,
      intendedRecipientPhoneE164: invite.intended_recipient_phone_e164,
      intendedRecipientPhoneLabel: invite.intended_recipient_phone_label,
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
  const pendingItems: AccountInviteListItem[] = [];
  const historyItems: AccountInviteListItem[] = [];

  for (const invite of input.invites) {
    const actorRole = getAccountInviteActorRole(invite, input.currentUserId);
    if (actorRole === 'none') {
      continue;
    }

    const latestDelivery = latestDeliveryByInviteId.get(invite.id);
    const originChannel = normalizeAccountInviteChannel(latestDelivery?.channel);
    const inviterName =
      invite.inviter_user_id === input.currentUserId
        ? 'Tu'
        : (input.names.get(invite.inviter_user_id) ?? 'Persona');
    const activatedUserProfile = invite.activated_user_id
      ? input.profiles.get(invite.activated_user_id)
      : undefined;
    const activatedUserDisplayName = invite.activated_user_id
      ? (input.names.get(invite.activated_user_id) ?? 'Persona')
      : null;
    const activatedUserAvatarUrl = activatedUserProfile
      ? resolveAvatarUrl(activatedUserProfile.avatar_path, activatedUserProfile.updated_at)
      : null;
    const intendedRecipientReference = buildAccountIntendedRecipientReference(invite);
    const targetName = activatedUserDisplayName ?? invite.intended_recipient_alias ?? 'tu contacto';
    const expiryLabel = invite.expires_at
      ? `vence ${formatRelativeLabel(invite.expires_at)}`
      : null;
    const deliveryMeta =
      latestDelivery?.status === 'authenticated'
        ? 'link abierto'
        : latestDelivery?.status === 'activated'
          ? 'cuenta activada'
          : null;

    let title = 'Invitacion de acceso';
    let subtitle = [
      channelLabel(originChannel),
      intendedRecipientReference,
      deliveryMeta,
      expiryLabel,
    ]
      .filter(Boolean)
      .join(' | ');
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
        title = `Verifica a ${targetName}`;
        subtitle = [
          channelLabel(originChannel),
          intendedRecipientReference ? `Pensada para ${intendedRecipientReference}` : null,
          invite.activated_at ? `activada ${formatRelativeLabel(invite.activated_at)}` : null,
        ]
          .filter(Boolean)
          .join(' | ');
        actionState = 'requires_you_review';
        status = 'requires_you_review';
        ctaLabel = 'Verificar';
      } else {
        title = `Esperando validacion de ${inviterName}`;
        subtitle = `${channelLabel(originChannel)} | ya activaste este acceso`;
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
              ? `${targetName} entro con el telefono esperado`
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
        channelLabel(originChannel),
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
    isCycleSettlement
      ? 'Happy Circle'
      : sourceTypeForRow(row) === 'system'
        ? 'Sistema'
        : 'Usuario',
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
): SettlementDetailDto {
  const movements = parseSettlementMovements(proposal.movements_json).map((movement) => {
    const debtor = names.get(movement.debtor_user_id) ?? 'Deudor';
    const creditor = names.get(movement.creditor_user_id) ?? 'Acreedor';
    return `${debtor} paga a ${creditor}: ${formatCop(movement.amount_minor)}`;
  });
  const impactLines = parseSettlementMovements(proposal.movements_json).map((movement) => {
    const debtor = names.get(movement.debtor_user_id) ?? 'Deudor';
    const creditor = names.get(movement.creditor_user_id) ?? 'Acreedor';
    return `Ajusta el saldo entre ${debtor} y ${creditor} por ${formatCop(movement.amount_minor)}`;
  });
  const participantStatuses = participants.map((participant) => {
    const name = names.get(participant.participant_user_id) ?? 'Persona';
    return `${name}: ${participant.decision}`;
  });

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
        ? [
            'La propuesta ya fue aprobada por todos.',
            'El siguiente paso es completar el Circle.',
          ]
        : proposal.status === 'executed'
          ? [
              'Completaste un Circle!',
              'El saldo neto ya fue actualizado.',
            ]
          : ['Este Circle ya no esta activo. Puedes crear otro si los saldos cambiaron.'];

  return {
    id: proposal.id,
    status: proposal.status,
    snapshotHash: proposal.graph_snapshot_hash,
    participants: participants.map(
      (participant) => names.get(participant.participant_user_id) ?? 'Persona',
    ),
    participantStatuses,
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
  readonly auditEvents: readonly AuditEventRow[];
}): AppSnapshot {
  const nameByUserId = buildNameByUserId(input.profiles, input.currentUserId);
  const profileByUserId = buildProfileByUserId(input.profiles);
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
  const history = input.history.filter((row) =>
    isHistoryRowVisibleToCurrentUser(row, input.currentUserId, visibleRelationshipIds),
  );
  const openDebtsByRelationshipId = new Map(
    input.openDebts.map((row) => [row.relationship_id, row]),
  );
  const requestsByRelationshipId = groupBy(input.financialRequests, (row) => row.relationship_id);
  const historyByRelationshipId = groupBy(history, (row) => row.relationship_id);
  const settlementParticipantsByProposalId = groupBy(
    input.settlementParticipants,
    (row) => row.settlement_proposal_id,
  );
  const friendshipState = buildFriendshipInviteItems({
    invites: input.friendshipInvites,
    deliveries: input.friendshipInviteDeliveries,
    names: nameByUserId,
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

  const peopleById = Object.fromEntries(
    people.map((person): [string, PersonDetailDto] => {
      const relationship = relationshipsByCounterpartyId.get(person.userId);
      const requests = relationship ? (requestsByRelationshipId.get(relationship.id) ?? []) : [];
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

      const headline =
        person.netAmountMinor === 0
          ? `Con ${person.displayName} estan al dia`
          : person.direction === 'owes_me'
            ? `${person.displayName} te debe`
            : `Le debes a ${person.displayName}`;

      const supportText =
        person.pendingCount > 0
          ? `Tienes ${person.pendingCount} pendiente${person.pendingCount > 1 ? 's' : ''} con ${person.displayName}.`
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
        },
      ];
    }),
  );

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
        createdAt: request.created_at,
      };
    });

  const pendingItems = sortByNewest([
    ...pendingRequests,
    ...pendingSettlements,
    ...friendshipState.pendingItems,
    ...accountInviteState.pendingItems,
  ]);

  const historyItems = sortHistoryItems([
    ...buildActivityHistoryItems(peopleById),
    ...friendshipState.historyItems,
    ...accountInviteState.historyItems,
  ]);

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
      ),
    ]),
  );
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
    pendingCount: pendingItems.length,
    auditEvents: buildAuditItems(input.auditEvents),
    settlementsById,
  };
}

async function fetchLiveSnapshot(currentUserId: string): Promise<AppSnapshot> {
  const client = assertSupabaseClient();
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
    auditResult,
  ] = await Promise.all([
    client
      .from('user_profiles')
      .select(
        'id, display_name, email, avatar_path, account_access_state, invited_by_user_id, activated_via_account_invite_id, activated_at, phone_country_iso2, phone_country_calling_code, phone_national_number, phone_e164, phone_verified_at, created_at, updated_at',
      ),
    client
      .from('v_friendship_invites_live')
      .select(
        'id, inviter_user_id, target_user_id, claimant_user_id, relationship_id, flow, origin_channel, status, resolution_actor, resolution_reason, intended_recipient_alias, intended_recipient_phone_e164, intended_recipient_phone_label, claimant_snapshot, source_context, expires_at, resolved_at, created_at, updated_at',
      )
      .order('created_at', { ascending: false }),
    client
      .from('v_friendship_invite_deliveries_live')
      .select(
        'id, invite_id, token, channel, source_context, status, created_at, updated_at, expires_at, claimed_at, claimed_by_user_id, revoked_at',
      )
      .order('created_at', { ascending: false }),
    client
      .from('v_account_invites_live')
      .select(
        'id, inviter_user_id, activated_user_id, linked_relationship_id, status, resolution_actor, resolution_reason, intended_recipient_alias, intended_recipient_phone_e164, intended_recipient_phone_label, source_context, expires_at, activated_at, resolved_at, created_at, updated_at',
      )
      .order('created_at', { ascending: false }),
    client
      .from('v_account_invite_deliveries_live')
      .select(
        'id, invite_id, token, channel, source_context, status, expires_at, revoked_at, first_opened_at, last_opened_at, open_count, first_app_opened_at, authenticated_user_id, authenticated_at, activation_completed_at, created_at, updated_at',
      )
      .order('created_at', { ascending: false }),
    client
      .from('relationships')
      .select('id, user_low_id, user_high_id, status, created_at, updated_at')
      .eq('status', 'active')
      .order('created_at', { ascending: false }),
    client.from('v_open_debts').select('*'),
    client
      .from('financial_requests')
      .select(
        'id, relationship_id, request_type, status, creator_user_id, responder_user_id, debtor_user_id, creditor_user_id, amount_minor, currency_code, description, category, parent_request_id, target_ledger_transaction_id, created_at, updated_at, resolved_at',
      )
      .order('created_at', { ascending: false }),
    client.from('v_relationship_history').select('*').order('happened_at', { ascending: false }),
    client
      .from('v_inbox_items')
      .select('owner_user_id, item_id, item_kind, subtype, status, created_at')
      .eq('owner_user_id', currentUserId)
      .order('created_at', { ascending: false }),
    client
      .from('settlement_proposals')
      .select(
        'id, created_by_user_id, status, graph_snapshot_hash, graph_snapshot, movements_json, created_at, updated_at, executed_at',
      )
      .order('created_at', { ascending: false }),
    client
      .from('settlement_proposal_participants')
      .select('id, settlement_proposal_id, participant_user_id, decision, decided_at'),
    client
      .from('audit_events')
      .select(
        'id, actor_user_id, entity_type, entity_id, event_name, request_id, metadata_json, created_at',
      )
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

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

  if (auditResult.error) {
    throw new Error(auditResult.error.message);
  }

  return buildLiveSnapshot({
    currentUserId,
    profiles: profilesResult.data ?? [],
    friendshipInvites: friendshipInvitesResult.data ?? [],
    friendshipInviteDeliveries: friendshipInviteDeliveriesResult.data ?? [],
    accountInvites: accountInvitesResult.data ?? [],
    accountInviteDeliveries: accountInviteDeliveriesResult.data ?? [],
    relationships: relationshipsResult.data ?? [],
    openDebts: openDebtsResult.data ?? [],
    financialRequests: requestsResult.data ?? [],
    history: historyResult.data ?? [],
    inboxItems: inboxItemsResult.data ?? [],
    settlementProposals: settlementProposalsResult.data ?? [],
    settlementParticipants: settlementParticipantsResult.data ?? [],
    auditEvents: auditResult.data ?? [],
  });
}

async function fetchAppSnapshot(userId: string | null) {
  if (!userId) {
    throw new Error('No hay una sesion lista para cargar datos.');
  }

  return fetchLiveSnapshot(userId);
}

async function parseFunctionError(error: unknown) {
  if (!(error instanceof Error)) {
    return 'Unexpected error';
  }

  const maybeContext =
    'context' in error && error.context instanceof Response ? error.context : null;

  if (maybeContext) {
    try {
      const cloned = maybeContext.clone();
      const body = (await cloned.json()) as { error?: string; message?: string };
      if (typeof body.error === 'string' && body.error.length > 0) {
        return body.error;
      }

      if (typeof body.message === 'string' && body.message.length > 0) {
        return body.message;
      }
    } catch {
      try {
        const text = await maybeContext.text();
        if (text.trim().length > 0) {
          return `${error.message}: ${text}`;
        }
      } catch {
        return error.message;
      }
    }
  }

  return error.message;
}

function isJwtAuthError(message: string): boolean {
  const normalized = message.trim().toLocaleLowerCase('en-US');

  return (
    normalized.includes('invalid jwt') ||
    normalized.includes('jwt expired') ||
    normalized.includes('jwt malformed') ||
    normalized.includes('bad jwt') ||
    normalized.includes('missing authorization header')
  );
}

async function invokeSupabaseFunction<TBody extends Record<string, unknown>, TResult>(
  name: string,
  body: TBody,
): Promise<TResult> {
  const client = assertSupabaseClient();
  const invoke = async () => client.functions.invoke<TResult>(name, { body });
  let result = await invoke();

  if (result.error) {
    const parsedMessage = await parseFunctionError(result.error);
    if (isJwtAuthError(parsedMessage)) {
      const { data: refreshData, error: refreshError } = await client.auth.refreshSession();
      if (refreshError || !refreshData.session) {
        await client.auth.signOut();
        throw new Error('Tu sesion ya no es valida. Cierra sesion y vuelve a entrar.');
      }

      result = await invoke();
      if (result.error) {
        throw new Error(await parseFunctionError(result.error));
      }

      if (result.data === null) {
        throw new Error(`La funcion ${name} respondio sin payload.`);
      }

      return result.data;
    }

    throw new Error(parsedMessage);
  }

  if (result.data === null) {
    throw new Error(`La funcion ${name} respondio sin payload.`);
  }

  return result.data;
}

async function invalidateAppSnapshot() {
  await queryClient.invalidateQueries({
    queryKey: [APP_SNAPSHOT_QUERY_KEY],
  });
}

function useSensitiveMutationGuard() {
  const session = useSession();

  return async (actionLabel: string) => {
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
    queryFn: () => fetchAppSnapshot(userId),
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
    onSuccess: invalidateAppSnapshot,
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
    onSuccess: invalidateAppSnapshot,
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
      const response = await fetch(input.uri);
      const arrayBuffer = await response.arrayBuffer();
      const normalizedContentType = input.contentType?.toLocaleLowerCase('en-US') ?? '';
      const fileExtension = normalizedContentType.includes('png')
        ? 'png'
        : normalizedContentType.includes('heic')
          ? 'heic'
          : normalizedContentType.includes('webp')
            ? 'webp'
            : 'jpg';
      const avatarPath = `${userId}/${Date.now()}.${fileExtension}`;

      const uploadResult = await client.storage
        .from(AVATAR_BUCKET)
        .upload(avatarPath, arrayBuffer, {
          contentType: input.contentType ?? 'image/jpeg',
          upsert: false,
        });

      if (uploadResult.error) {
        throw new Error(uploadResult.error.message);
      }

      const updateResult = await client
        .from('user_profiles')
        .update({ avatar_path: avatarPath } as never)
        .eq('id', userId);

      if (updateResult.error) {
        throw new Error(updateResult.error.message);
      }

      return avatarPath;
    },
    onSuccess: async () => {
      await session.refreshAccountState();
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
    onSuccess: invalidateAppSnapshot,
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
    onSuccess: invalidateAppSnapshot,
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
    onSuccess: invalidateAppSnapshot,
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
    onSuccess: invalidateAppSnapshot,
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
    onSuccess: invalidateAppSnapshot,
  });
}
