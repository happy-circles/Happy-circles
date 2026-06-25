import type { ActivityItemDto } from '@happy-circles/application';

import {
  notificationItemCanAlert,
  notificationViewKeyForItem,
} from '@/lib/live-data/builders/notifications';
import {
  buildTransactionMovementHistoryCases,
  historyCaseVisibleWithPendingHappyCircle,
  pendingHappyCircleCaseIds,
  type TransactionHistoryCaseItem,
} from '@/lib/transaction-history-cases';
import type { HistoryCase } from '@/lib/history-cases';
import { isPendingTransactionItem } from '@/lib/transaction-presentation';

export interface DashboardPendingTransactionPreviewItem {
  readonly highlightPending: boolean;
  readonly isPending: true;
  readonly item: ActivityItemDto;
  readonly unread: boolean;
}

export interface DashboardHistoryTransactionPreviewItem {
  readonly highlightPending: false;
  readonly historyCase: HistoryCase<TransactionHistoryCaseItem>;
  readonly isPending: false;
  readonly item: TransactionHistoryCaseItem;
  readonly unread: false;
}

export type DashboardTransactionPreviewItem =
  | DashboardPendingTransactionPreviewItem
  | DashboardHistoryTransactionPreviewItem;

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
  const activeHappyCircleCaseIds = pendingHappyCircleCaseIds(pendingTransactionItems);
  const recentHistoryCases = buildTransactionMovementHistoryCases(historyItems)
    .filter((itemCase) =>
      historyCaseVisibleWithPendingHappyCircle(itemCase, activeHappyCircleCaseIds),
    );
  const visibleItems: DashboardTransactionPreviewItem[] = [
    ...pendingTransactionItems.map((item) => ({
      highlightPending: true as const,
      isPending: true as const,
      item,
      unread:
        notificationItemCanAlert(item) &&
        !notificationViewedKeys.has(notificationViewKeyForItem(item)),
    })),
    ...recentHistoryCases.map((historyCase) => ({
      highlightPending: false as const,
      historyCase,
      isPending: false as const,
      item: historyCase.latest,
      unread: false as const,
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
