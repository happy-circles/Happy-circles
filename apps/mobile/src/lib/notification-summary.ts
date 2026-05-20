import type { ActivityItemDto } from '@happy-circles/application';

import {
  notificationItemCanAlert,
  notificationViewKeyForItem,
} from '@/lib/live-data/builders/notifications';

export type NotificationSummaryCategoryKey = 'transactions' | 'friends' | 'reminders';

export interface NotificationSummaryCategoryCounts {
  readonly transactions: number;
  readonly friends: number;
  readonly reminders: number;
}

export interface NotificationSummary {
  readonly alertableItems: readonly ActivityItemDto[];
  readonly reviewedItems: readonly ActivityItemDto[];
  readonly unviewedItems: readonly ActivityItemDto[];
  readonly unreadCount: number;
  readonly categoryCounts: NotificationSummaryCategoryCounts;
}

export function notificationSummaryCategoryForItem(
  item: ActivityItemDto,
): NotificationSummaryCategoryKey {
  const kind = String(item.kind);

  if (kind === 'friendship_invite' || kind === 'account_invite') {
    return 'friends';
  }

  if (kind === 'system' || kind === 'system_note' || kind === 'reminder') {
    return 'reminders';
  }

  return 'transactions';
}

export function buildNotificationSummary(
  items: readonly ActivityItemDto[],
  notificationViewedKeys: ReadonlySet<string>,
): NotificationSummary {
  const alertableItems: ActivityItemDto[] = [];
  const reviewedItems: ActivityItemDto[] = [];
  const unviewedItems: ActivityItemDto[] = [];
  const categoryCounts: Record<NotificationSummaryCategoryKey, number> = {
    transactions: 0,
    friends: 0,
    reminders: 0,
  };

  for (const item of items) {
    if (!notificationItemCanAlert(item)) {
      continue;
    }

    alertableItems.push(item);

    if (notificationViewedKeys.has(notificationViewKeyForItem(item))) {
      reviewedItems.push(item);
      continue;
    }

    unviewedItems.push(item);
    categoryCounts[notificationSummaryCategoryForItem(item)] += 1;
  }

  return {
    alertableItems,
    reviewedItems,
    unviewedItems,
    unreadCount: unviewedItems.length,
    categoryCounts,
  };
}
