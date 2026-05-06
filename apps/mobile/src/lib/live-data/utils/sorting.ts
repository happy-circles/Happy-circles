import type {
  ActivityItemDto,
  PendingActionDto,
  PersonCardDto,
  PersonTimelineItemDto,
} from '@happy-circles/application';
import { compareHistoryItems } from '../../history-cases';
import type { ActionableItem } from '../types';

export function sortByNewest<T extends { readonly createdAt: string }>(items: readonly T[]): T[] {
  return [...items].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
}

export function actionablePriority(item: {
  readonly kind: PendingActionDto['kind'];
  readonly status: string;
}): number {
  if (item.kind === 'settlement_proposal' && item.status === 'approved') {
    return 0;
  }

  if (item.kind === 'settlement_proposal') {
    return 1;
  }

  if (item.kind === 'financial_request') {
    return 2;
  }

  if (item.kind === 'friendship_invite') {
    return 3;
  }

  return 4;
}

export function sortActionableItems<
  T extends {
    readonly kind: PendingActionDto['kind'];
    readonly status: string;
    readonly createdAt: string;
    readonly title: string;
  },
>(items: readonly T[]): T[] {
  return [...items].sort((left, right) => {
    const priorityDiff = actionablePriority(left) - actionablePriority(right);
    if (priorityDiff !== 0) {
      return priorityDiff;
    }

    const timeDiff = Date.parse(right.createdAt) - Date.parse(left.createdAt);
    if (timeDiff !== 0) {
      return timeDiff;
    }

    return left.title.localeCompare(right.title, 'es-CO');
  });
}

export function sortHistoryItems<
  T extends {
    readonly id: string;
    readonly kind: ActivityItemDto['kind'];
    readonly status: string;
    readonly happenedAt?: string;
  },
>(items: readonly T[]): T[] {
  return [...items].sort(compareHistoryItems);
}

export function uniqueActivityItemsById<T extends { readonly id: string }>(
  items: readonly T[],
): T[] {
  const seenIds = new Set<string>();
  const uniqueItems: T[] = [];

  for (const item of items) {
    if (seenIds.has(item.id)) {
      continue;
    }

    seenIds.add(item.id);
    uniqueItems.push(item);
  }

  return uniqueItems;
}

export function actionableItemToActivityItem(item: ActionableItem): ActivityItemDto {
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    subtitle: item.subtitle,
    status: item.status,
    href: item.href,
    amountMinor: item.amountMinor,
    category: item.category,
    counterpartyLabel: item.counterpartyLabel,
    tone: item.tone,
    pendingHistorySteps: item.pendingHistorySteps,
  };
}

export function sortPeople(left: PersonCardDto, right: PersonCardDto): number {
  if (left.pendingCount !== right.pendingCount) {
    return right.pendingCount - left.pendingCount;
  }

  const amountDiff = Math.abs(right.netAmountMinor) - Math.abs(left.netAmountMinor);
  if (amountDiff !== 0) {
    return amountDiff;
  }

  return left.displayName.localeCompare(right.displayName, 'es-CO');
}

export function uniqueTimelineItemsById(
  items: readonly (PersonTimelineItemDto | null)[],
): PersonTimelineItemDto[] {
  const seenIds = new Set<string>();
  const uniqueItems: PersonTimelineItemDto[] = [];

  for (const item of items) {
    if (!item || seenIds.has(item.id)) {
      continue;
    }

    seenIds.add(item.id);
    uniqueItems.push(item);
  }

  return uniqueItems;
}

export function inviteProfileItemTimestamp(item: ActivityItemDto): string {
  const createdAt = (item as { readonly createdAt?: unknown }).createdAt;
  if (typeof createdAt === 'string' && createdAt.length > 0) {
    return createdAt;
  }

  return item.happenedAt ?? '';
}

export function sortInviteProfilePendingItems(
  items: readonly ActivityItemDto[],
): ActivityItemDto[] {
  return [...items].sort(
    (left, right) =>
      Date.parse(inviteProfileItemTimestamp(right)) - Date.parse(inviteProfileItemTimestamp(left)),
  );
}
