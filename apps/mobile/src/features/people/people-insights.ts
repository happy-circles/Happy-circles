import type {
  ActivityItemDto,
  ActiveSettlementPreviewDto,
  BalanceAnalyticsPersonRowDto,
  PersonCardDto,
} from '@happy-circles/application';

import { formatCompactCop, signedFormatCompactCop } from '@/features/balance/balance-helpers';
import {
  isConsolidatedTransactionItem,
  isCycleTransactionItem,
  isNoBalanceTransactionStatus,
  isPendingTransactionItem,
  transactionVisualCategory,
} from '@/lib/transaction-presentation';

export const PEOPLE_INSIGHT_FILTERS = [
  'balance',
  'owed_to_me',
  'i_owe',
  'pending',
  'circles',
  'movements',
] as const;

export type PeopleInsightFilter = (typeof PEOPLE_INSIGHT_FILTERS)[number];
export type PeopleInsightTone = 'positive' | 'negative' | 'pending' | 'neutral' | 'cycle';

export type PeopleInsightOption = {
  readonly label: string;
  readonly value: PeopleInsightFilter;
};

export type PeopleInsightActivityItem = {
  readonly item: ActivityItemDto;
  readonly panel: 'pending' | 'history';
};

export type PeopleInsightPerson = {
  readonly avatarUrl?: string | null;
  readonly label: string;
  readonly metricLabel: string;
  readonly score: number;
  readonly tone: PeopleInsightTone;
  readonly userId: string;
};

export const PEOPLE_INSIGHT_OPTIONS: readonly PeopleInsightOption[] = [
  { label: 'Balance', value: 'balance' },
  { label: 'Te deben', value: 'owed_to_me' },
  { label: 'Debes', value: 'i_owe' },
  { label: 'Pendientes', value: 'pending' },
  { label: 'Circles', value: 'circles' },
  { label: 'Movimientos', value: 'movements' },
];

const PEOPLE_INSIGHT_FILTER_SET = new Set<string>(PEOPLE_INSIGHT_FILTERS);

export function normalizePeopleInsightFilter(
  value: string | readonly string[] | undefined,
): PeopleInsightFilter {
  const rawValue = typeof value === 'string' ? value : value?.[0];

  return rawValue && PEOPLE_INSIGHT_FILTER_SET.has(rawValue)
    ? (rawValue as PeopleInsightFilter)
    : 'balance';
}

export function peopleInsightLabel(filter: PeopleInsightFilter): string {
  return PEOPLE_INSIGHT_OPTIONS.find((option) => option.value === filter)?.label ?? 'Balance';
}

export function peopleInsightEmptyTitle(filter: PeopleInsightFilter): string {
  if (filter === 'pending') {
    return 'Sin pendientes';
  }

  if (filter === 'circles') {
    return 'Sin Circles';
  }

  if (filter === 'movements') {
    return 'Sin movimientos';
  }

  return 'Sin movimientos de balance';
}

export function peopleInsightEmptyDescription(filter: PeopleInsightFilter): string {
  if (filter === 'owed_to_me') {
    return 'Cuando alguien te deba, esos movimientos apareceran aqui.';
  }

  if (filter === 'i_owe') {
    return 'Cuando debas en una relacion, esos movimientos apareceran aqui.';
  }

  if (filter === 'pending') {
    return 'Los movimientos que esperan una respuesta apareceran aqui.';
  }

  if (filter === 'circles') {
    return 'Los Happy Circles activos y su historial apareceran aqui.';
  }

  if (filter === 'movements') {
    return 'Cuando registres movimientos con personas, apareceran aqui.';
  }

  return 'Los movimientos que explican tu balance apareceran aqui.';
}

export function personIdFromActivityHref(href: string | undefined): string | null {
  const match = href?.match(/^\/person\/([^/?#]+)/);
  if (!match?.[1]) {
    return null;
  }

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function normalizedText(value: string | null | undefined): string {
  return value?.trim().toLocaleLowerCase('es-CO') ?? '';
}

function activityMatchesPerson(item: ActivityItemDto, person: PersonCardDto): boolean {
  if (item.participantUserIds?.includes(person.userId)) {
    return true;
  }

  const hrefPersonId = personIdFromActivityHref(item.href);
  if (hrefPersonId) {
    return hrefPersonId === person.userId;
  }

  return normalizedText(item.counterpartyLabel) === normalizedText(person.displayName);
}

export function activityMatchesPersonId(
  item: ActivityItemDto,
  people: readonly PersonCardDto[],
  personId: string | null,
): boolean {
  if (!personId) {
    return true;
  }

  if (item.participantUserIds?.includes(personId)) {
    return true;
  }

  const person = people.find((candidate) => candidate.userId === personId);
  return person
    ? activityMatchesPerson(item, person)
    : personIdFromActivityHref(item.href) === personId;
}

export function activityMatchesQuery(item: ActivityItemDto, query: string): boolean {
  const normalizedQuery = normalizedText(query);
  if (!normalizedQuery) {
    return true;
  }

  return [
    item.title,
    item.subtitle,
    item.detail,
    item.counterpartyLabel,
    item.flowLabel,
    item.category,
    item.status,
  ].some((value) => normalizedText(value).includes(normalizedQuery));
}

function isBalanceRootItem(item: ActivityItemDto): boolean {
  return (
    item.status !== 'amended' &&
    !isNoBalanceTransactionStatus(item.status) &&
    (item.tone === 'positive' || item.tone === 'negative')
  );
}

function matchesPeoplePendingFilter(item: ActivityItemDto, filter: PeopleInsightFilter): boolean {
  if (filter === 'pending' || filter === 'movements') {
    return true;
  }

  if (filter === 'circles') {
    return isCycleTransactionItem(item) || transactionVisualCategory(item) === 'cycle';
  }

  return false;
}

function matchesPeopleHistoryFilter(item: ActivityItemDto, filter: PeopleInsightFilter): boolean {
  if (filter === 'movements') {
    return true;
  }

  if (filter === 'balance') {
    return isBalanceRootItem(item);
  }

  if (filter === 'owed_to_me') {
    return isBalanceRootItem(item) && item.tone === 'positive';
  }

  if (filter === 'i_owe') {
    return isBalanceRootItem(item) && item.tone === 'negative';
  }

  if (filter === 'circles') {
    return isCycleTransactionItem(item) || transactionVisualCategory(item) === 'cycle';
  }

  return false;
}

export function buildPeopleInsightActivitySections({
  filter,
  historyItems,
  pendingItems,
}: {
  readonly filter: PeopleInsightFilter;
  readonly historyItems: readonly ActivityItemDto[];
  readonly pendingItems: readonly ActivityItemDto[];
}): {
  readonly history: readonly ActivityItemDto[];
  readonly pending: readonly ActivityItemDto[];
} {
  return {
    pending: pendingItems.filter(isPendingTransactionItem).filter((item) =>
      matchesPeoplePendingFilter(item, filter),
    ),
    history: historyItems.filter(isConsolidatedTransactionItem).filter((item) =>
      matchesPeopleHistoryFilter(item, filter),
    ),
  };
}

function amountTone(amountMinor: number): PeopleInsightTone {
  if (amountMinor > 0) {
    return 'positive';
  }

  if (amountMinor < 0) {
    return 'negative';
  }

  return 'neutral';
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function personDisplayData(
  peopleById: ReadonlyMap<string, PersonCardDto>,
  row: BalanceAnalyticsPersonRowDto,
): Pick<PeopleInsightPerson, 'avatarUrl' | 'label' | 'userId'> {
  const person = peopleById.get(row.userId);

  return {
    avatarUrl: person?.avatarUrl ?? null,
    label: person?.displayName ?? row.label,
    userId: row.userId,
  };
}

function pendingScoreForPerson(
  person: PersonCardDto,
  pendingItems: readonly ActivityItemDto[],
): {
  readonly amountMinor: number;
  readonly count: number;
} {
  const matchingItems = pendingItems.filter((item) => activityMatchesPerson(item, person));

  return {
    amountMinor: matchingItems.reduce((total, item) => total + Math.abs(item.amountMinor ?? 0), 0),
    count: matchingItems.length,
  };
}

function activeCircleCountForPerson(
  person: PersonCardDto,
  activeCircleProposals: readonly ActiveSettlementPreviewDto[],
): number {
  return activeCircleProposals.filter((proposal) =>
    proposal.participantUserIds.includes(person.userId),
  ).length;
}

function isCircleActivityItem(item: ActivityItemDto): boolean {
  return isCycleTransactionItem(item) || transactionVisualCategory(item) === 'cycle';
}

function circleHistoryCountsForPerson(
  person: PersonCardDto,
  historyItems: readonly ActivityItemDto[],
): {
  readonly completedCount: number;
  readonly notCompletedCount: number;
  readonly replacedCount: number;
} {
  const statusByProposalId = new Map<string, string>();

  for (const item of historyItems) {
    if (!isCircleActivityItem(item) || !activityMatchesPerson(item, person)) {
      continue;
    }

    statusByProposalId.set(item.originSettlementProposalId ?? item.id, item.status);
  }

  return Array.from(statusByProposalId.values()).reduce(
    (counts, status) => {
      if (status === 'posted' || status === 'executed') {
        return { ...counts, completedCount: counts.completedCount + 1 };
      }

      if (status === 'stale') {
        return { ...counts, replacedCount: counts.replacedCount + 1 };
      }

      if (status === 'rejected' || status === 'expired' || status === 'canceled') {
        return { ...counts, notCompletedCount: counts.notCompletedCount + 1 };
      }

      return counts;
    },
    {
      completedCount: 0,
      notCompletedCount: 0,
      replacedCount: 0,
    },
  );
}

function circleMetricLabel(input: {
  readonly activeCount: number;
  readonly completedCount: number;
  readonly notCompletedCount: number;
  readonly replacedCount: number;
}): string {
  const totalCount =
    input.activeCount + input.completedCount + input.replacedCount + input.notCompletedCount;

  return countLabel(totalCount, 'Circle', 'Circles');
}

export function buildPeopleInsightRows({
  activeCircleProposals,
  analyticsPeople,
  filter,
  historyItems,
  pendingItems,
  people,
}: {
  readonly activeCircleProposals: readonly ActiveSettlementPreviewDto[];
  readonly analyticsPeople: readonly BalanceAnalyticsPersonRowDto[];
  readonly filter: PeopleInsightFilter;
  readonly historyItems: readonly ActivityItemDto[];
  readonly pendingItems: readonly ActivityItemDto[];
  readonly people: readonly PersonCardDto[];
}): PeopleInsightPerson[] {
  const peopleById = new Map(people.map((person) => [person.userId, person]));
  const analyticsPeopleById = new Map(analyticsPeople.map((row) => [row.userId, row]));
  const pendingTransactionItems = pendingItems.filter(isPendingTransactionItem);
  const rankedPeople = people.flatMap((person): PeopleInsightPerson[] => {
    const row = analyticsPeopleById.get(person.userId);
    const displayData = row
      ? personDisplayData(peopleById, row)
      : {
          avatarUrl: person.avatarUrl ?? null,
          label: person.displayName,
          userId: person.userId,
        };

    if (filter === 'balance') {
      const amountMinor = row?.netMinor ?? person.netAmountMinor;

      return [
        {
          ...displayData,
          metricLabel: signedFormatCompactCop(amountMinor),
          score: Math.abs(amountMinor),
          tone: amountTone(amountMinor),
        },
      ];
    }

    if (filter === 'owed_to_me') {
      const amountMinor =
        row?.owedToMeMinor ?? (person.direction === 'owes_me' ? person.netAmountMinor : 0);
      if (amountMinor <= 0) {
        return [];
      }

      return [
        {
          ...displayData,
          metricLabel: formatCompactCop(amountMinor),
          score: amountMinor,
          tone: 'positive',
        },
      ];
    }

    if (filter === 'i_owe') {
      const amountMinor = Math.abs(
        row?.iOweMinor ?? (person.direction === 'i_owe' ? person.netAmountMinor : 0),
      );
      if (amountMinor <= 0) {
        return [];
      }

      return [
        {
          ...displayData,
          metricLabel: formatCompactCop(amountMinor),
          score: amountMinor,
          tone: 'negative',
        },
      ];
    }

    if (filter === 'pending') {
      const pendingScore = pendingScoreForPerson(person, pendingTransactionItems);
      if (pendingScore.count <= 0) {
        return [];
      }

      return [
        {
          ...displayData,
          metricLabel:
            pendingScore.amountMinor > 0
              ? `${pendingScore.count} · ${formatCompactCop(pendingScore.amountMinor)}`
              : `${pendingScore.count}`,
          score: pendingScore.count * 100_000_000 + pendingScore.amountMinor,
          tone: 'pending',
        },
      ];
    }

    if (filter === 'circles') {
      const activeCircleCount = activeCircleCountForPerson(person, activeCircleProposals);
      const circleHistoryCounts = circleHistoryCountsForPerson(person, historyItems);
      const circleCount =
        activeCircleCount +
        circleHistoryCounts.completedCount +
        circleHistoryCounts.replacedCount +
        circleHistoryCounts.notCompletedCount;
      if (circleCount <= 0) {
        return [];
      }

      return [
        {
          ...displayData,
          metricLabel: circleMetricLabel({
            activeCount: activeCircleCount,
            completedCount: circleHistoryCounts.completedCount,
            notCompletedCount: circleHistoryCounts.notCompletedCount,
            replacedCount: circleHistoryCounts.replacedCount,
          }),
          score: circleCount * 100 + activeCircleCount,
          tone: 'cycle',
        },
      ];
    }

    const movementCount = row?.movementCount ?? 0;
    if (movementCount <= 0) {
      return [];
    }

    return [
      {
        ...displayData,
        metricLabel: `${movementCount} mov.`,
        score: movementCount,
        tone: 'neutral',
      },
    ];
  });

  return rankedPeople
    .sort((left, right) => {
      const scoreDiff = right.score - left.score;
      if (scoreDiff !== 0) {
        return scoreDiff;
      }

      return left.label.localeCompare(right.label, 'es-CO');
    });
}

export function buildPeopleInsightRanking(
  input: Parameters<typeof buildPeopleInsightRows>[0],
): PeopleInsightPerson[] {
  return buildPeopleInsightRows(input).slice(0, 3);
}
