import type { ActivityItemDto, PersonDetailDto } from '@happy-circles/application';
import { buildActivityHistoryItems } from '../../history-cases';
import { notificationViewKeyForItem } from './notifications';
import type { AccountInviteListItem, ActionableItem, FriendshipInviteListItem } from '../types';
import {
  sortActionableItems,
  sortHistoryItems,
  uniqueActivityItemsById,
} from '../utils/sorting';

export function buildActivityState(input: {
  readonly pendingRequests: readonly ActionableItem[];
  readonly pendingSettlements: readonly ActionableItem[];
  readonly friendshipPendingItems: readonly FriendshipInviteListItem[];
  readonly friendshipHistoryItems: readonly ActivityItemDto[];
  readonly accountInvitePendingItems: readonly AccountInviteListItem[];
  readonly accountInviteHistoryItems: readonly ActivityItemDto[];
  readonly relationshipPeopleById: Record<string, PersonDetailDto>;
  readonly notificationViewedKeys: ReadonlySet<string>;
}): {
  readonly pendingItems: readonly (
    | ActionableItem
    | FriendshipInviteListItem
    | AccountInviteListItem
  )[];
  readonly unviewedPendingItems: readonly (
    | ActionableItem
    | FriendshipInviteListItem
    | AccountInviteListItem
  )[];
  readonly historyItems: readonly ActivityItemDto[];
} {
  const pendingItems = sortActionableItems([
    ...input.pendingRequests,
    ...input.pendingSettlements,
    ...input.friendshipPendingItems,
    ...input.accountInvitePendingItems,
  ]);
  const unviewedPendingItems = pendingItems.filter(
    (item) => !input.notificationViewedKeys.has(notificationViewKeyForItem(item)),
  );
  const historyItems = uniqueActivityItemsById(
    sortHistoryItems([
      ...buildActivityHistoryItems(input.relationshipPeopleById),
      ...input.friendshipHistoryItems,
      ...input.accountInviteHistoryItems,
    ]),
  );

  return {
    pendingItems,
    unviewedPendingItems,
    historyItems,
  };
}
