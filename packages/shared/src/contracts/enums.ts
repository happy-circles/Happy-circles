export {
  ANALYTICS_EVENT_CATALOG,
  ANALYTICS_EVENT_FAMILIES,
  ANALYTICS_EVENT_KINDS,
  ANALYTICS_EVENT_NAMES,
  ANALYTICS_FEATURE_KEYS,
  ANALYTICS_METADATA_KEYS,
  ANALYTICS_SCREEN_NAMES,
  getAllowedAnalyticsMetadataKeys,
  getAnalyticsEventCatalogEntry,
  isAnalyticsMetadataKeyAllowed,
} from './analytics';
export type {
  AnalyticsEventFamily,
  AnalyticsEventCatalogEntry,
  AnalyticsEventKind,
  AnalyticsEventName,
  AnalyticsFeatureKey,
  AnalyticsMetadataKey,
  AnalyticsScreenName,
} from './analytics';

export const CURRENCY_CODE = 'COP' as const;

export type CurrencyCode = typeof CURRENCY_CODE;

export const REQUEST_TYPES = ['balance_increase', 'transaction_reversal'] as const;
export type RequestType = (typeof REQUEST_TYPES)[number];

export const REQUEST_STATUSES = [
  'pending',
  'accepted',
  'rejected',
  'amended',
  'canceled',
  'expired',
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const TRANSACTION_TYPES = [
  'balance_increase_acceptance',
  'transaction_reversal_acceptance',
  'cycle_settlement',
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const TRANSACTION_CATEGORIES = [
  'food_drinks',
  'transport',
  'entertainment',
  'services',
  'home',
  'other',
  'cycle',
] as const;
export type TransactionCategory = (typeof TRANSACTION_CATEGORIES)[number];

export const TRANSACTION_SOURCE_TYPES = ['user', 'system'] as const;
export type TransactionSourceType = (typeof TRANSACTION_SOURCE_TYPES)[number];

export const ACCOUNT_KINDS = ['receivable', 'payable'] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];

export const ENTRY_SIDES = ['debit', 'credit'] as const;
export type EntrySide = (typeof ENTRY_SIDES)[number];

export const PROPOSAL_STATUSES = [
  'pending_approvals',
  'approved',
  'rejected',
  'stale',
  'executed',
  'expired',
] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export const HAPPY_CIRCLE_CASE_STATUSES = ['active', 'completed', 'closed'] as const;
export type HappyCircleCaseStatus = (typeof HAPPY_CIRCLE_CASE_STATUSES)[number];

export const SETTLEMENT_STALE_REASONS = [
  'balance_changed',
  'related_execution_changed_balance',
  'participant_set_changed',
] as const;
export type SettlementStaleReason = (typeof SETTLEMENT_STALE_REASONS)[number];

export const PARTICIPANT_DECISIONS = ['pending', 'approved', 'rejected'] as const;
export type ParticipantDecision = (typeof PARTICIPANT_DECISIONS)[number];

export const FRIENDSHIP_INVITE_FLOWS = ['internal', 'external'] as const;
export type FriendshipInviteFlow = (typeof FRIENDSHIP_INVITE_FLOWS)[number];

export const FRIENDSHIP_INVITE_STATUSES = [
  'pending_recipient',
  'pending_claim',
  'pending_sender_review',
  'accepted',
  'rejected',
  'canceled',
  'expired',
] as const;
export type FriendshipInviteStatus = (typeof FRIENDSHIP_INVITE_STATUSES)[number];

export const FRIENDSHIP_INVITE_CHANNELS = ['internal', 'remote', 'qr'] as const;
export type FriendshipInviteChannel = (typeof FRIENDSHIP_INVITE_CHANNELS)[number];

export const ACCOUNT_ACCESS_STATES = ['needs_invite', 'needs_activation', 'active'] as const;
export type AccountAccessState = (typeof ACCOUNT_ACCESS_STATES)[number];

export const ACCOUNT_INVITE_STATUSES = [
  'pending_activation',
  'pending_inviter_review',
  'accepted',
  'rejected',
  'canceled',
  'expired',
] as const;
export type AccountInviteStatus = (typeof ACCOUNT_INVITE_STATUSES)[number];

export const ACCOUNT_INVITE_CHANNELS = ['remote', 'qr'] as const;
export type AccountInviteChannel = (typeof ACCOUNT_INVITE_CHANNELS)[number];

export const PEOPLE_TARGET_STATUSES = [
  'active_user',
  'pending_activation',
  'no_account',
  'already_related',
  'pending_friendship',
] as const;
export type PeopleTargetStatus = (typeof PEOPLE_TARGET_STATUSES)[number];

export const AUDIT_ENTITY_TYPES = [
  'friendship_invite',
  'account_invite',
  'relationship',
  'financial_request',
  'ledger_transaction',
  'happy_circle_case',
  'settlement_proposal',
  'settlement_execution',
  'user_profile',
] as const;
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

export const AUDIT_EVENT_NAMES = [
  'friendship_invite_created',
  'friendship_invite_delivery_created',
  'friendship_invite_claimed',
  'friendship_invite_sender_approved',
  'friendship_invite_sender_rejected',
  'friendship_invite_accepted',
  'friendship_invite_rejected',
  'friendship_invite_canceled',
  'friendship_invite_expired',
  'account_invite_created',
  'account_invite_delivery_created',
  'account_invite_opened',
  'account_invite_authenticated',
  'account_invite_activated',
  'account_invite_sender_approved',
  'account_invite_sender_rejected',
  'account_invite_accepted',
  'account_invite_rejected',
  'account_invite_canceled',
  'account_invite_expired',
  'financial_request_created',
  'financial_request_rejected',
  'financial_request_amended',
  'financial_request_accepted',
  'settlement_proposed',
  'settlement_approved',
  'settlement_rejected',
  'settlement_executed',
  'happy_circle_case.created',
  'happy_circle_case.version_created',
  'happy_circle_case.version_replaced',
  'happy_circle_case.version_stale',
  'happy_circle_case.version_approved',
  'happy_circle_case.version_executed',
  'account_deletion_completed',
] as const;
export type AuditEventName = (typeof AUDIT_EVENT_NAMES)[number];

export const SUPPORT_ERROR_KINDS = [
  'edge_function',
  'client_exception',
  'client_action',
  'data_sync',
] as const;
export type SupportErrorKind = (typeof SUPPORT_ERROR_KINDS)[number];
