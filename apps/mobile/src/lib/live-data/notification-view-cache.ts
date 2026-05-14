import type { ActivityItemDto } from '@happy-circles/application';

import { notificationViewKeyForItem } from './builders/notifications';

const optimisticViewedKeysByUserId = new Map<string, Set<string>>();

export function rememberNotificationViewKeys(
  userId: string | null | undefined,
  keys: Iterable<string>,
): ReadonlySet<string> {
  if (!userId) {
    return new Set();
  }

  let userKeys = optimisticViewedKeysByUserId.get(userId);
  if (!userKeys) {
    userKeys = new Set();
    optimisticViewedKeysByUserId.set(userId, userKeys);
  }

  for (const key of keys) {
    if (key.trim().length > 0) {
      userKeys.add(key);
    }
  }

  return new Set(userKeys);
}

export function rememberNotificationItemsViewed(
  userId: string | null | undefined,
  items: readonly Pick<ActivityItemDto, 'id' | 'kind' | 'status'>[],
): ReadonlySet<string> {
  return rememberNotificationViewKeys(
    userId,
    items.map((item) => notificationViewKeyForItem(item)),
  );
}

export function notificationViewedKeysWithLocalCache(
  userId: string | null | undefined,
  serverKeys: Iterable<string> | null | undefined,
): ReadonlySet<string> {
  const merged = new Set(serverKeys ?? []);

  if (!userId) {
    return merged;
  }

  const localKeys = optimisticViewedKeysByUserId.get(userId);
  if (!localKeys) {
    return merged;
  }

  for (const key of localKeys) {
    merged.add(key);
  }

  return merged;
}

export function clearNotificationViewCache(userId?: string | null): void {
  if (userId) {
    optimisticViewedKeysByUserId.delete(userId);
    return;
  }

  optimisticViewedKeysByUserId.clear();
}
