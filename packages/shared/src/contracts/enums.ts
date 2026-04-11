export const CURRENCY_CODE = 'COP' as const;

export type CurrencyCode = typeof CURRENCY_CODE;

export const REQUEST_TYPES = [
  'balance_increase',
  'transaction_reversal',
] as const;
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

export const PARTICIPANT_DECISIONS = ['pending', 'approved', 'rejected'] as const;
export type ParticipantDecision = (typeof PARTICIPANT_DECISIONS)[number];

export const CONTACT_INVITE_STATUSES = ['pending', 'matched', 'canceled'] as const;
export type ContactInviteStatus = (typeof CONTACT_INVITE_STATUSES)[number];

export const AUDIT_ENTITY_TYPES = [
  'relationship_invite',
  'relationship',
  'financial_request',
  'ledger_transaction',
  'settlement_proposal',
  'settlement_execution',
] as const;
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

export const AUDIT_EVENT_NAMES = [
  'relationship_invited',
  'relationship_invite_rejected',
  'relationship_accepted',
  'financial_request_created',
  'financial_request_rejected',
  'financial_request_amended',
  'financial_request_accepted',
  'settlement_proposed',
  'settlement_approved',
  'settlement_rejected',
  'settlement_executed',
] as const;
export type AuditEventName = (typeof AUDIT_EVENT_NAMES)[number];
