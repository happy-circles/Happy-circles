import type { ActivityItemDto, PersonDetailDto, PersonTimelineItemDto } from '@happy-circles/application';

import type {
  ActivityHistoryItem,
  ComparableHistoryItem,
  HistoryCase,
  HistoryCaseItem,
} from './history-case-types';
import { historyCaseKey, historyStepPriority } from './history-case-helpers';

export type {
  ActivityHistoryItem,
  ComparableHistoryItem,
  HistoryCase,
  HistoryCaseItem,
  HistoryDirection,
  HistoryStatusTone,
} from './history-case-types';
export * from './history-case-presentation';

export function isHistoryCaseItem(item: ActivityItemDto): item is ActivityHistoryItem {
  return (
    item.kind === 'request' ||
    item.kind === 'payment' ||
    item.kind === 'settlement' ||
    item.kind === 'system' ||
    item.kind === 'friendship_invite'
  );
}

export function compareHistoryItems<T extends ComparableHistoryItem>(left: T, right: T): number {
  const timeDiff = Date.parse(right.happenedAt ?? '') - Date.parse(left.happenedAt ?? '');
  if (timeDiff !== 0) {
    return timeDiff;
  }

  const priorityDiff = historyStepPriority(right) - historyStepPriority(left);
  if (priorityDiff !== 0) {
    return priorityDiff;
  }

  return right.id.localeCompare(left.id);
}

export function buildHistoryCases<T extends HistoryCaseItem>(
  items: readonly T[],
): HistoryCase<T>[] {
  const sortedItems = [...items].sort(compareHistoryItems);

  const groups = new Map<string, T[]>();
  for (const item of sortedItems) {
    const key = historyCaseKey(item);
    const existing = groups.get(key);
    if (existing) {
      existing.push(item);
    } else {
      groups.set(key, [item]);
    }
  }

  return Array.from(groups.entries())
    .flatMap(([id, groupedItems]): HistoryCase<T>[] => {
      const uniqueItems = groupedItems.filter(
        (item, index, collection) =>
          collection.findIndex((candidate) => candidate.id === item.id) === index,
      );
      const completedItems = uniqueItems.filter((item) => item.status !== 'pending');
      if (completedItems.length === 0) {
        return [];
      }

      const steps = [...uniqueItems].reverse();
      return [
        {
          id,
          // Keep pending proposals inside the expanded timeline, but anchor the case
          // on the latest completed event so history does not duplicate inbox items.
          latest: completedItems[0],
          earliest: steps[0],
          steps,
          isCycleSnippet: groupedItems.some((item) => item.kind === 'settlement'),
        },
      ];
    })
    .sort((left, right) => compareHistoryItems(left.latest, right.latest));
}

export function toHistoryFeedItem(
  item: PersonTimelineItemDto,
  counterpartyLabel?: string,
): HistoryCaseItem {
  return {
    id: item.id,
    title: item.title,
    subtitle: item.subtitle,
    status: item.status,
    kind: item.kind,
    amountMinor: item.amountMinor,
    category: item.category,
    tone: item.tone,
    flowLabel: item.flowLabel,
    detail: item.detail,
    happenedAt: item.happenedAt,
    happenedAtLabel: item.happenedAtLabel,
    originRequestId: item.originRequestId,
    originSettlementProposalId: item.originSettlementProposalId,
    counterpartyLabel,
  };
}

export function buildActivityHistoryItems(
  peopleById: Readonly<Record<string, PersonDetailDto>>,
): ActivityItemDto[] {
  return Object.values(peopleById)
    .flatMap((person) =>
      person.timeline.map(
        (item): ActivityItemDto => ({
          id: item.id,
          title: item.title,
          subtitle: item.subtitle,
          status: item.status,
          href: `/person/${person.userId}`,
          amountMinor: item.amountMinor,
          category: item.category,
          sourceType: item.sourceType,
          detail: item.detail,
          happenedAt: item.happenedAt,
          happenedAtLabel: item.happenedAtLabel,
          tone: item.tone,
          flowLabel: item.flowLabel,
          originRequestId: item.originRequestId,
          originSettlementProposalId: item.originSettlementProposalId,
          counterpartyLabel: person.displayName,
          kind: item.kind,
        }),
      ),
    )
    .sort(compareHistoryItems);
}

