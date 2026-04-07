import type {
  AuditEvent,
  FinancialRequest,
  PairNetEdge,
  SettlementProposal,
} from '@happy-circles/domain';
import type { IdempotencyKey, RelationshipId, UserId } from '@happy-circles/shared';

export interface LoggerPort {
  info(event: string, payload?: Record<string, unknown>): void;
  error(event: string, payload?: Record<string, unknown>): void;
}

export interface ClockPort {
  now(): Date;
}

export interface IdGeneratorPort {
  uuid(): string;
}

export interface IdempotencyPort {
  ensure(actorUserId: UserId, operationName: string, key: IdempotencyKey): Promise<void>;
}

export interface RelationshipRepository {
  findByUsers(left: UserId, right: UserId): Promise<{ id: RelationshipId; active: boolean } | null>;
}

export interface FinancialRequestRepository {
  insert(request: FinancialRequest): Promise<void>;
  findPendingById(requestId: string): Promise<FinancialRequest | null>;
}

export interface LedgerRepository {
  createAcceptedRequestTransaction(requestId: string, actorUserId: UserId): Promise<void>;
}

export interface SettlementRepository {
  saveProposal(proposal: SettlementProposal): Promise<void>;
  listAuthoritativeEdges(): Promise<readonly PairNetEdge[]>;
}

export interface AuditRepository {
  append(event: AuditEvent): Promise<void>;
}
