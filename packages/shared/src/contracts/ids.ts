export type Brand<T, Name extends string> = T & { readonly __brand: Name };

export type UserId = Brand<string, 'UserId'>;
export type RelationshipId = Brand<string, 'RelationshipId'>;
export type RequestId = Brand<string, 'RequestId'>;
export type LedgerAccountId = Brand<string, 'LedgerAccountId'>;
export type LedgerTransactionId = Brand<string, 'LedgerTransactionId'>;
export type SettlementProposalId = Brand<string, 'SettlementProposalId'>;
export type SettlementExecutionId = Brand<string, 'SettlementExecutionId'>;
export type AuditEventId = Brand<string, 'AuditEventId'>;
export type IdempotencyKey = Brand<string, 'IdempotencyKey'>;
