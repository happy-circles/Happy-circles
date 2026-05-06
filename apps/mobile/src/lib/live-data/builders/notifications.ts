import type { ActivityItemDto } from '@happy-circles/application';
import type { Database } from '@happy-circles/shared';

export function notificationViewKeyForItem(
  item: Pick<ActivityItemDto, 'id' | 'kind' | 'status'>,
): string {
  return [item.kind, item.id, item.status].map((part) => String(part).trim()).join(':');
}

export function notificationViewRowForItem(
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
