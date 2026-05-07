import type { ActivityItemDto } from '@happy-circles/application';

import { buildHistoryCases, isHistoryCaseItem } from '@/lib/history-cases';
import { isConsolidatedTransactionItem } from '@/lib/transaction-presentation';

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
}: {
  readonly historyItems: readonly ActivityItemDto[];
  readonly limit: number;
}): DashboardTransactionPreview {
  const recentTransactionItems = buildHistoryCases(
    historyItems.filter(isConsolidatedTransactionItem).filter(isHistoryCaseItem),
  )
    .map((itemCase) => itemCase.latest)
    .slice(0, limit);
  const visibleItems = recentTransactionItems.map((item) => ({
    highlightPending: false,
    isPending: false,
    item,
    unread: false,
  }));

  return {
    visibleItems,
  };
}
