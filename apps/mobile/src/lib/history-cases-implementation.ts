import type {
  ActivityItemDto,
  PersonDetailDto,
  PersonTimelineItemDto,
} from '@happy-circles/application';

import type {
  ActivityHistoryItem,
  ComparableHistoryItem,
  HistoryCase,
  HistoryCaseItem,
} from './history-case-types';
import { historyCaseKey, historyStepPriority } from './history-case-helpers';
import {
  circleHistoryGroupKey,
  isCircleActivityItem,
  isCircleExecutedProposal,
  isCircleLifecycleOnly,
  isCircleLedgerPosted,
} from './cycle-activity';

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

export interface BuildHistoryCasesOptions {
  readonly circleGrouping?: 'case' | 'movement';
}

export function buildHistoryCases<T extends HistoryCaseItem>(
  items: readonly T[],
  options: BuildHistoryCasesOptions = {},
): HistoryCase<T>[] {
  const sortedItems = movementHistoryItems(items, options).sort(compareHistoryItems);

  const groups = new Map<string, T[]>();
  for (const item of sortedItems) {
    const key = historyCaseKeyForGrouping(item, options);
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

      const isCycleSnippet = groupedItems.some(isCircleActivityItem);
      const latest = isCycleSnippet ? selectCycleLatestItem(completedItems) : completedItems[0];
      const steps =
        isCycleSnippet && isCircleExecutedProposal(latest)
          ? sortExecutedCycleSteps(uniqueItems)
          : [...uniqueItems].reverse();

      return [
        {
          id,
          // Keep pending proposals inside the expanded timeline, but anchor the case
          // on the latest completed event so history does not duplicate inbox items.
          latest,
          earliest: steps[0],
          steps,
          isCycleSnippet,
        },
      ];
    })
    .sort((left, right) => compareHistoryItems(left.latest, right.latest));
}

export function buildMovementHistoryCases<T extends HistoryCaseItem>(
  items: readonly T[],
): HistoryCase<T>[] {
  return buildHistoryCases(items, { circleGrouping: 'movement' });
}

function movementHistoryItems<T extends HistoryCaseItem>(
  items: readonly T[],
  options: BuildHistoryCasesOptions,
): T[] {
  if (options.circleGrouping !== 'movement') {
    return [...items];
  }

  const postedCircleGroupKeys = new Set(
    items.filter(isCircleLedgerPosted).flatMap((item) => circleActivityGroupingKeys(item)),
  );

  if (postedCircleGroupKeys.size === 0) {
    return [...items];
  }

  return items.filter((item) => {
    if (!isCircleActivityItem(item)) {
      return true;
    }

    if (isCircleLedgerPosted(item)) {
      return true;
    }

    return !circleActivityGroupingKeys(item).some((key) => postedCircleGroupKeys.has(key));
  });
}

function circleActivityGroupingKeys(item: HistoryCaseItem): string[] {
  const keys = new Set([circleHistoryGroupKey(item)]);

  if (item.happyCircleCaseId) {
    keys.add(`happy_circle_case:${item.happyCircleCaseId}`);
  }

  if (item.originSettlementProposalId) {
    keys.add(`settlement:${item.originSettlementProposalId}`);
  }

  return Array.from(keys);
}

function historyCaseKeyForGrouping(
  item: HistoryCaseItem,
  options: BuildHistoryCasesOptions,
): string {
  if (options.circleGrouping === 'movement' && isCircleLedgerPosted(item)) {
    return `cycle_movement:${item.id}`;
  }

  return historyCaseKey(item);
}

function selectCycleLatestItem<T extends HistoryCaseItem>(items: readonly T[]): T {
  const executed = items.find(isCircleExecutedProposal);
  if (executed) {
    return executed;
  }

  const lifecycle = items.find(isCircleLifecycleOnly);
  if (lifecycle) {
    return lifecycle;
  }

  return items[0];
}

function sortExecutedCycleSteps<T extends HistoryCaseItem>(items: readonly T[]): T[] {
  return [...items].sort((left, right) => {
    const rankDiff = executedCycleStepRank(left) - executedCycleStepRank(right);
    if (rankDiff !== 0) {
      return rankDiff;
    }

    const timeDiff = Date.parse(left.happenedAt ?? '') - Date.parse(right.happenedAt ?? '');
    if (timeDiff !== 0 && !Number.isNaN(timeDiff)) {
      return timeDiff;
    }

    return left.id.localeCompare(right.id);
  });
}

function executedCycleStepRank(item: HistoryCaseItem): number {
  if (isCircleLifecycleOnly(item)) {
    return 0;
  }

  if (isCircleExecutedProposal(item)) {
    return 1;
  }

  if (item.kind === 'settlement' && item.status === 'posted') {
    return 2;
  }

  return 3;
}

export function buildLatestHistoryCaseItems<T extends HistoryCaseItem>(
  items: readonly T[],
  options: BuildHistoryCasesOptions = {},
): T[] {
  return buildHistoryCases(items, options).map(latestItemFromHistoryCase);
}

export function buildLatestMovementHistoryCaseItems<T extends HistoryCaseItem>(
  items: readonly T[],
): T[] {
  return buildLatestHistoryCaseItems(items, { circleGrouping: 'movement' });
}

function latestItemFromHistoryCase<T extends HistoryCaseItem>(itemCase: HistoryCase<T>): T {
  const firstHref = itemCase.steps.find((step) => step.href)?.href;
  const firstCounterpartyLabel = itemCase.steps.find(
    (step) => step.counterpartyLabel,
  )?.counterpartyLabel;
  const firstFlowLabel = itemCase.steps.find((step) => step.flowLabel)?.flowLabel;

  return {
    ...itemCase.latest,
    href: itemCase.latest.href ?? firstHref,
    counterpartyLabel: itemCase.latest.counterpartyLabel ?? firstCounterpartyLabel,
    flowLabel: itemCase.latest.flowLabel ?? firstFlowLabel,
  };
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
    sourceType: item.sourceType,
    tone: item.tone,
    flowLabel: item.flowLabel,
    detail: item.detail,
    happenedAt: item.happenedAt,
    happenedAtLabel: item.happenedAtLabel,
    originRequestId: item.originRequestId,
    originSettlementProposalId: item.originSettlementProposalId,
    happyCircleCaseId: item.happyCircleCaseId,
    replacesProposalId: item.replacesProposalId,
    replacedByProposalId: item.replacedByProposalId,
    staleReason: item.staleReason,
    counterpartyLabel,
  };
}

function activityHistoryItemHref(person: PersonDetailDto, item: PersonTimelineItemDto): string {
  if (isCircleActivityItem(item)) {
    return item.originSettlementProposalId
      ? `/settlements/${item.originSettlementProposalId}`
      : '/circles';
  }

  return `/person/${person.userId}`;
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
          href: activityHistoryItemHref(person, item),
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
          happyCircleCaseId: item.happyCircleCaseId,
          replacesProposalId: item.replacesProposalId,
          replacedByProposalId: item.replacedByProposalId,
          staleReason: item.staleReason,
          counterpartyLabel: person.displayName,
          kind: item.kind,
        }),
      ),
    )
    .sort(compareHistoryItems);
}
