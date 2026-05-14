import type { ActivityItemDto } from '@happy-circles/application';
import type { Database } from '@happy-circles/shared';

const INCOMING_ATTENTION_STATES = new Set([
  'pending_approvals',
  'requires_you',
  'requires_you_response',
  'requires_you_review',
]);

export function notificationViewKeyForItem(
  item: Pick<ActivityItemDto, 'id' | 'kind' | 'status'>,
): string {
  return [item.kind, item.id, item.status].map((part) => String(part).trim()).join(':');
}

export function circleDiscoveryViewKeyForProposalId(proposalId: string): string {
  return ['circle_discovery', proposalId].map((part) => String(part).trim()).join(':');
}

export function notificationItemStartsViewed(
  item: Pick<ActivityItemDto, 'kind' | 'status'> & {
    readonly actionState?: string;
    readonly createdByCurrentUser?: boolean;
    readonly id?: string;
    readonly sourceType?: ActivityItemDto['sourceType'];
  },
): boolean {
  return !notificationItemCanAlert(item);
}

export function notificationItemCanAlert(
  item: Pick<ActivityItemDto, 'kind' | 'status'> & {
    readonly actionState?: string;
    readonly createdByCurrentUser?: boolean;
    readonly id?: string;
    readonly sourceType?: ActivityItemDto['sourceType'];
  },
): boolean {
  if (readBooleanField(item, 'createdByCurrentUser')) {
    return false;
  }

  if (
    item.kind === 'system_note' &&
    item.sourceType === 'system' &&
    typeof item.id === 'string' &&
    item.id.startsWith('local-')
  ) {
    return true;
  }

  const actionState = readStringField(item, 'actionState');
  if (actionState) {
    return INCOMING_ATTENTION_STATES.has(actionState);
  }

  return INCOMING_ATTENTION_STATES.has(item.status);
}

export interface NotificationViewDescriptor {
  readonly notificationKey: string;
  readonly notificationKind: string;
  readonly notificationStatus: string;
  readonly sourceItemId: string;
}

export function notificationViewDescriptorForItem(
  item: Pick<ActivityItemDto, 'id' | 'kind' | 'status'>,
): NotificationViewDescriptor {
  return {
    notificationKey: notificationViewKeyForItem(item),
    notificationKind: String(item.kind),
    sourceItemId: String(item.id),
    notificationStatus: String(item.status),
  };
}

export function notificationViewRowForDescriptor(
  userId: string,
  descriptor: NotificationViewDescriptor,
): Database['public']['Tables']['notification_views']['Insert'] {
  return {
    user_id: userId,
    notification_key: descriptor.notificationKey,
    notification_kind: descriptor.notificationKind,
    source_item_id: descriptor.sourceItemId,
    notification_status: descriptor.notificationStatus,
    viewed_at: new Date().toISOString(),
  };
}

export function notificationViewRowForItem(
  userId: string,
  item: Pick<ActivityItemDto, 'id' | 'kind' | 'status'>,
): Database['public']['Tables']['notification_views']['Insert'] {
  return notificationViewRowForDescriptor(userId, notificationViewDescriptorForItem(item));
}

function readBooleanField(value: unknown, key: string): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  return (value as Record<string, unknown>)[key] === true;
}

function readStringField(value: unknown, key: string): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const field = (value as Record<string, unknown>)[key];
  return typeof field === 'string' && field.trim().length > 0 ? field : null;
}
