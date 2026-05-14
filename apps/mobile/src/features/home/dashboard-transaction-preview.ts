import type { ActivityItemDto } from '@happy-circles/application';

import { buildHistoryCases, isHistoryCaseItem } from '@/lib/history-cases';
import {
  notificationItemCanAlert,
  notificationViewKeyForItem,
} from '@/lib/live-data/builders/notifications';
import {
  isConsolidatedTransactionItem,
  isPendingTransactionItem,
} from '@/lib/transaction-presentation';

export interface DashboardTransactionPreviewItem {
  readonly highlightPending: boolean;
  readonly isPending: boolean;
  readonly item: ActivityItemDto;
  readonly unread: boolean;
}

export interface DashboardTransactionPreview {
  readonly visibleItems: readonly DashboardTransactionPreviewItem[];
}

export function buildDashboardTransactionPreview({
  historyItems,
  limit,
  notificationViewedKeys,
  pendingItems,
}: {
  readonly historyItems: readonly ActivityItemDto[];
  readonly limit: number;
  readonly notificationViewedKeys: ReadonlySet<string>;
  readonly pendingItems: readonly ActivityItemDto[];
}): DashboardTransactionPreview {
  const pendingTransactionItems = pendingItems.filter(isPendingTransactionItem);
  const pendingHappyCircleCaseIds = new Set(
    pendingTransactionItems.flatMap((item) =>
      item.kind === 'settlement_proposal' && item.happyCircleCaseId ? [item.happyCircleCaseId] : [],
    ),
  );
  const recentHistoryItems = buildHistoryCases(
    historyItems.filter(isConsolidatedTransactionItem).filter(isHistoryCaseItem),
  )
    .filter(
      (itemCase) =>
        itemCase.latest.status !== 'stale' ||
        !itemCase.latest.happyCircleCaseId ||
        !pendingHappyCircleCaseIds.has(itemCase.latest.happyCircleCaseId),
    )
    .map((itemCase) => itemCase.latest);
  const visibleItems = [
    ...pendingTransactionItems.map((item) => ({
      highlightPending: true,
      isPending: true,
      item,
      unread:
        notificationItemCanAlert(item) &&
        !notificationViewedKeys.has(notificationViewKeyForItem(item)),
    })),
    ...recentHistoryItems.map((item) => ({
      highlightPending: false,
      isPending: false,
      item,
      unread: false,
    })),
  ]
    .sort(comparePreviewItems)
    .slice(0, limit);

  return {
    visibleItems,
  };
}

function comparePreviewItems(
  left: DashboardTransactionPreviewItem,
  right: DashboardTransactionPreviewItem,
): number {
  if (left.isPending !== right.isPending) {
    return left.isPending ? -1 : 1;
  }

  const timeDiff = previewTimeMs(right.item) - previewTimeMs(left.item);
  if (timeDiff !== 0) {
    return timeDiff;
  }

  return right.item.id.localeCompare(left.item.id);
}

function previewTimeMs(item: ActivityItemDto): number {
  const createdAt = readStringField(item, 'createdAt');
  const timestamp = Date.parse(item.happenedAt ?? createdAt ?? '');

  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function readStringField(value: unknown, key: string): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const field = (value as Record<string, unknown>)[key];
  return typeof field === 'string' && field.trim().length > 0 ? field : null;
}
