import type { ActivityItemDto } from '@happy-circles/application';

import {
  type NotificationViewDescriptor,
  notificationViewDescriptorForItem,
  notificationViewRowForDescriptor,
  notificationViewRowForItem,
} from '../builders/notifications';
import { assertSupabaseClient, invalidateAppSnapshot } from '../client';
import {
  rememberNotificationItemsViewed,
  rememberNotificationViewKeys,
} from '../notification-view-cache';

export async function markNotificationItemsViewed(
  userId: string | null,
  items: readonly ActivityItemDto[],
): Promise<void> {
  if (!userId || items.length === 0) {
    return;
  }

  rememberNotificationItemsViewed(userId, items);

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

export async function markNotificationViewsViewed(
  userId: string | null,
  views: readonly NotificationViewDescriptor[],
): Promise<void> {
  if (!userId || views.length === 0) {
    return;
  }

  rememberNotificationViewKeys(
    userId,
    views.map((view) => view.notificationKey),
  );

  const client = assertSupabaseClient();
  const rowsByKey = new Map(
    views.map((view) => {
      const row = notificationViewRowForDescriptor(userId, view);
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

export function notificationViewDescriptorForActivityItem(
  item: Pick<ActivityItemDto, 'id' | 'kind' | 'status'>,
): NotificationViewDescriptor {
  return notificationViewDescriptorForItem(item);
}
