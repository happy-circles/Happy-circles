import type {
  AuditEntityType,
  AuditEventId,
  AuditEventName,
  UserId,
} from '@happy-circles/shared';

export interface AuditEvent {
  readonly id: AuditEventId;
  readonly actorUserId?: UserId;
  readonly entityType: AuditEntityType;
  readonly entityId: string;
  readonly eventName: AuditEventName;
  readonly requestId?: string;
  readonly metadata: Record<string, string | number | boolean | null>;
}
