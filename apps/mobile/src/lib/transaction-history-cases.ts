import type { ActivityItemDto } from '@happy-circles/application';

import {
  buildMovementHistoryCases,
  type HistoryCase,
  type HistoryCaseItem,
} from './history-cases';
import { isConsolidatedTransactionItem } from './transaction-presentation';

export type TransactionHistoryCaseItem = Omit<ActivityItemDto, 'kind'> &
  Omit<HistoryCaseItem, 'category' | 'kind'> & {
    readonly category?: ActivityItemDto['category'];
    readonly kind: HistoryCaseItem['kind'];
  };

export function activityHistoryCaseItem(item: ActivityItemDto): TransactionHistoryCaseItem {
  const normalizedKind: HistoryCaseItem['kind'] =
    item.kind === 'settlement'
      ? 'settlement'
      : item.kind === 'payment' || item.kind === 'manual_payment'
        ? 'payment'
        : item.kind === 'system' || item.kind === 'system_note'
          ? 'system'
          : item.kind === 'friendship_invite'
            ? 'friendship_invite'
            : 'request';

  return {
    ...item,
    kind: normalizedKind,
  };
}

export function buildTransactionMovementHistoryCases(
  historyItems: readonly ActivityItemDto[],
): HistoryCase<TransactionHistoryCaseItem>[] {
  return buildMovementHistoryCases(
    historyItems.filter(isConsolidatedTransactionItem).map(activityHistoryCaseItem),
  );
}

export function pendingHappyCircleCaseIds(
  pendingItems: readonly Pick<ActivityItemDto, 'happyCircleCaseId' | 'kind'>[],
): ReadonlySet<string> {
  return new Set(
    pendingItems.flatMap((item) =>
      item.kind === 'settlement_proposal' && item.happyCircleCaseId
        ? [item.happyCircleCaseId]
        : [],
    ),
  );
}

export function historyCaseVisibleWithPendingHappyCircle(
  itemCase: Pick<HistoryCase<HistoryCaseItem>, 'latest'>,
  activeHappyCircleCaseIds: ReadonlySet<string>,
): boolean {
  return (
    itemCase.latest.status !== 'stale' ||
    !itemCase.latest.happyCircleCaseId ||
    !activeHappyCircleCaseIds.has(itemCase.latest.happyCircleCaseId)
  );
}
