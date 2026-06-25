import type {
  ActivityItemDto,
  ActiveSettlementPreviewDto,
  BalanceAnalyticsPersonRowDto,
  PersonCardDto,
} from '@happy-circles/application';

import { formatCompactCop, signedFormatCompactCop } from '@/features/balance/balance-helpers';
import {
  circleHistoryGroupKey,
  cycleActivityKind,
  isCircleActivityItem as isSemanticCircleActivityItem,
} from '@/lib/cycle-activity';
import {
  isConsolidatedTransactionItem,
  isNoBalanceTransactionStatus,
  isPendingTransactionItem,
  transactionVisualCategory,
} from '@/lib/transaction-presentation';

export const PEOPLE_INSIGHT_FILTERS = [
  'balance',
  'owed_to_me',
  'i_owe',
  'pending',
  'rejected',
  'circles',
  'movements',
] as const;

export type PeopleInsightFilter = (typeof PEOPLE_INSIGHT_FILTERS)[number];
export type PeopleInsightTone =
  | 'positive'
  | 'negative'
  | 'pending'
  | 'danger'
  | 'neutral'
  | 'cycle';

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

type PeopleInsightDisplayPerson = Pick<PeopleInsightPerson, 'avatarUrl' | 'label' | 'userId'>;

export const PEOPLE_INSIGHT_OPTIONS: readonly PeopleInsightOption[] = [
  { label: 'Balance', value: 'balance' },
  { label: 'Te deben', value: 'owed_to_me' },
  { label: 'Debes', value: 'i_owe' },
  { label: 'Pendientes', value: 'pending' },
  { label: 'Rechazadas', value: 'rejected' },
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

  if (filter === 'rejected') {
    return 'Sin rechazadas';
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
    return 'Cuando alguien te deba, esos movimientos aparecerán aquí.';
  }

  if (filter === 'i_owe') {
    return 'Cuando debas en una relación, esos movimientos aparecerán aquí.';
  }

  if (filter === 'pending') {
    return 'Los movimientos que esperan una respuesta aparecerán aquí.';
  }

  if (filter === 'rejected') {
    return 'Los movimientos rechazados aparecerán aquí.';
  }

  if (filter === 'circles') {
    return 'Los Happy Circles activos y su historial aparecerán aquí.';
  }

  if (filter === 'movements') {
    return 'Cuando registres movimientos con personas, aparecerán aquí.';
  }

  return 'Los movimientos que explican tu balance aparecerán aquí.';
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
    return isPeopleCircleActivityItem(item);
  }

  return false;
}

function matchesPeopleHistoryFilter(item: ActivityItemDto, filter: PeopleInsightFilter): boolean {
  if (filter === 'movements') {
    return true;
  }

  if (filter === 'rejected') {
    return item.status === 'rejected';
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
    return isPeopleCircleActivityItem(item);
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
    pending: pendingItems
      .filter(isPendingTransactionItem)
      .filter((item) => matchesPeoplePendingFilter(item, filter)),
    history: historyItems
      .filter(isConsolidatedTransactionItem)
      .filter((item) => matchesPeopleHistoryFilter(item, filter)),
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
): PeopleInsightDisplayPerson {
  const person = peopleById.get(row.userId);

  return {
    avatarUrl: person?.avatarUrl ?? null,
    label: person?.displayName ?? row.label,
    userId: row.userId,
  };
}

function personCardDisplayData(person: PersonCardDto): PeopleInsightDisplayPerson {
  return {
    avatarUrl: person.avatarUrl ?? null,
    label: person.displayName,
    userId: person.userId,
  };
}

type PeopleInsightRowsInput = {
  readonly activeCircleProposals: readonly ActiveSettlementPreviewDto[];
  readonly analyticsPeople: readonly BalanceAnalyticsPersonRowDto[];
  readonly filter: PeopleInsightFilter;
  readonly historyItems: readonly ActivityItemDto[];
  readonly pendingItems: readonly ActivityItemDto[];
  readonly people: readonly PersonCardDto[];
};

type PeopleInsightRowsByFilterInput = Omit<PeopleInsightRowsInput, 'filter'>;

type ActivityScore = {
  readonly amountMinor: number;
  readonly count: number;
};

type CircleHistoryCounts = {
  readonly completedCount: number;
  readonly notCompletedCount: number;
  readonly replacedCount: number;
};

type PeopleInsightIndexes = {
  readonly activeCircleDisplayPeopleById: ReadonlyMap<string, PeopleInsightDisplayPerson>;
  readonly activeCircleGroupKeysByPerson: ReadonlyMap<string, ReadonlySet<string>>;
  readonly analyticsPeopleById: ReadonlyMap<string, BalanceAnalyticsPersonRowDto>;
  readonly circleHistoryCountsByPerson: ReadonlyMap<string, CircleHistoryCounts>;
  readonly pendingScoresByPerson: ReadonlyMap<string, ActivityScore>;
  readonly peopleById: ReadonlyMap<string, PersonCardDto>;
  readonly rejectedScoresByPerson: ReadonlyMap<string, ActivityScore>;
};

const EMPTY_ACTIVITY_SCORE: ActivityScore = { amountMinor: 0, count: 0 };
const EMPTY_CIRCLE_HISTORY_COUNTS: CircleHistoryCounts = {
  completedCount: 0,
  notCompletedCount: 0,
  replacedCount: 0,
};

function isPeopleCircleActivityItem(item: ActivityItemDto): boolean {
  return isSemanticCircleActivityItem(item) || transactionVisualCategory(item) === 'cycle';
}

function countCircleHistoryGroups(
  kindsByGroupId: ReadonlyMap<string, ReadonlySet<ReturnType<typeof cycleActivityKind>>>,
): CircleHistoryCounts {
  return Array.from(kindsByGroupId.values()).reduce(
    (counts, kinds) => {
      if (kinds.has('executed_proposal')) {
        return { ...counts, completedCount: counts.completedCount + 1 };
      }

      if (kinds.has('lifecycle_replaced')) {
        return { ...counts, replacedCount: counts.replacedCount + 1 };
      }

      if (kinds.has('lifecycle_rejected')) {
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

function activeCircleGroupKey(proposal: ActiveSettlementPreviewDto): string {
  return proposal.happyCircleCaseId
    ? `happy_circle_case:${proposal.happyCircleCaseId}`
    : `settlement:${proposal.proposalId}`;
}

function activeCircleConnectionPeople(
  proposal: ActiveSettlementPreviewDto,
): readonly PeopleInsightDisplayPerson[] {
  const connections = [proposal.incomingConnection, proposal.outgoingConnection].filter(
    (connection): connection is NonNullable<typeof connection> => Boolean(connection),
  );
  const peopleById = new Map<string, PeopleInsightDisplayPerson>();

  for (const connection of connections) {
    peopleById.set(connection.userId, {
      avatarUrl: null,
      label: connection.label,
      userId: connection.userId,
    });
  }

  return Array.from(peopleById.values());
}

function activeCirclePersonIds(proposal: ActiveSettlementPreviewDto): readonly string[] {
  const connectionIds = activeCircleConnectionPeople(proposal).map((person) => person.userId);

  return connectionIds.length > 0 ? connectionIds : proposal.participantUserIds;
}

function buildPeopleIdsByName(people: readonly PersonCardDto[]): Map<string, string[]> {
  const peopleIdsByName = new Map<string, string[]>();

  for (const person of people) {
    const nameKey = normalizedText(person.displayName);
    const existingIds = peopleIdsByName.get(nameKey) ?? [];
    existingIds.push(person.userId);
    peopleIdsByName.set(nameKey, existingIds);
  }

  return peopleIdsByName;
}

function personIdsForActivity(
  item: ActivityItemDto,
  peopleById: ReadonlyMap<string, PersonCardDto>,
  peopleIdsByName: ReadonlyMap<string, readonly string[]>,
): readonly string[] {
  const personIds = new Set<string>();

  for (const participantUserId of item.participantUserIds ?? []) {
    if (peopleById.has(participantUserId)) {
      personIds.add(participantUserId);
    }
  }

  const hrefPersonId = personIdFromActivityHref(item.href);
  if (hrefPersonId) {
    if (peopleById.has(hrefPersonId)) {
      personIds.add(hrefPersonId);
    }

    return Array.from(personIds);
  }

  for (const personId of peopleIdsByName.get(normalizedText(item.counterpartyLabel)) ?? []) {
    personIds.add(personId);
  }

  return Array.from(personIds);
}

function incrementActivityScore(
  scoresByPerson: Map<string, ActivityScore>,
  personId: string,
  item: ActivityItemDto,
) {
  const previousScore = scoresByPerson.get(personId) ?? EMPTY_ACTIVITY_SCORE;

  scoresByPerson.set(personId, {
    amountMinor: previousScore.amountMinor + Math.abs(item.amountMinor ?? 0),
    count: previousScore.count + 1,
  });
}

function buildPeopleInsightIndexes({
  activeCircleProposals,
  analyticsPeople,
  historyItems,
  pendingItems,
  people,
}: PeopleInsightRowsByFilterInput): PeopleInsightIndexes {
  const peopleById = new Map(people.map((person) => [person.userId, person]));
  const peopleIdsByName = buildPeopleIdsByName(people);
  const analyticsPeopleById = new Map(analyticsPeople.map((row) => [row.userId, row]));
  const pendingScoresByPerson = new Map<string, ActivityScore>();
  const rejectedScoresByPerson = new Map<string, ActivityScore>();
  const activeCircleGroupKeysByPerson = new Map<string, Set<string>>();
  const activeCircleDisplayPeopleById = new Map<string, PeopleInsightDisplayPerson>();
  const circleHistoryKindsByPerson = new Map<
    string,
    Map<string, Set<ReturnType<typeof cycleActivityKind>>>
  >();

  for (const item of pendingItems) {
    if (!isPendingTransactionItem(item)) {
      continue;
    }

    for (const personId of personIdsForActivity(item, peopleById, peopleIdsByName)) {
      incrementActivityScore(pendingScoresByPerson, personId, item);
    }
  }

  for (const item of historyItems) {
    if (item.status !== 'rejected' || !isConsolidatedTransactionItem(item)) {
      continue;
    }

    for (const personId of personIdsForActivity(item, peopleById, peopleIdsByName)) {
      incrementActivityScore(rejectedScoresByPerson, personId, item);
    }
  }

  for (const proposal of activeCircleProposals) {
    const groupKey = activeCircleGroupKey(proposal);

    for (const person of activeCircleConnectionPeople(proposal)) {
      const relationshipPerson = peopleById.get(person.userId);
      activeCircleDisplayPeopleById.set(
        person.userId,
        relationshipPerson ? personCardDisplayData(relationshipPerson) : person,
      );
    }

    for (const participantUserId of activeCirclePersonIds(proposal)) {
      if (
        !peopleById.has(participantUserId) &&
        !activeCircleDisplayPeopleById.has(participantUserId)
      ) {
        continue;
      }

      const groupKeys = activeCircleGroupKeysByPerson.get(participantUserId) ?? new Set<string>();
      groupKeys.add(groupKey);
      activeCircleGroupKeysByPerson.set(participantUserId, groupKeys);
    }
  }

  for (const item of historyItems) {
    if (!isPeopleCircleActivityItem(item)) {
      continue;
    }

    const groupKey = circleHistoryGroupKey(item);
    const activityKind = cycleActivityKind(item);

    for (const personId of personIdsForActivity(item, peopleById, peopleIdsByName)) {
      if (activeCircleGroupKeysByPerson.get(personId)?.has(groupKey)) {
        continue;
      }

      const groupsByPerson =
        circleHistoryKindsByPerson.get(personId) ??
        new Map<string, Set<ReturnType<typeof cycleActivityKind>>>();
      const kinds = groupsByPerson.get(groupKey) ?? new Set<ReturnType<typeof cycleActivityKind>>();
      kinds.add(activityKind);
      groupsByPerson.set(groupKey, kinds);
      circleHistoryKindsByPerson.set(personId, groupsByPerson);
    }
  }

  return {
    activeCircleDisplayPeopleById,
    activeCircleGroupKeysByPerson,
    analyticsPeopleById,
    circleHistoryCountsByPerson: new Map(
      Array.from(circleHistoryKindsByPerson.entries()).map(([personId, groupsByPerson]) => [
        personId,
        countCircleHistoryGroups(groupsByPerson),
      ]),
    ),
    pendingScoresByPerson,
    peopleById,
    rejectedScoresByPerson,
  };
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

function buildPeopleInsightRowsForFilter(
  { filter, people }: Pick<PeopleInsightRowsInput, 'filter' | 'people'>,
  indexes: PeopleInsightIndexes,
): PeopleInsightPerson[] {
  if (filter === 'circles') {
    const circlePeopleById = new Map<string, PeopleInsightDisplayPerson>(
      people.map((person) => [person.userId, personCardDisplayData(person)]),
    );

    for (const [personId, displayData] of indexes.activeCircleDisplayPeopleById.entries()) {
      if (!circlePeopleById.has(personId)) {
        circlePeopleById.set(personId, displayData);
      }
    }

    const rankedPeople = Array.from(circlePeopleById.values()).flatMap(
      (displayData): PeopleInsightPerson[] => {
        const activeCircleGroupKeys: ReadonlySet<string> =
          indexes.activeCircleGroupKeysByPerson.get(displayData.userId) ?? new Set<string>();
        const activeCircleCount = activeCircleGroupKeys.size;
        const circleHistoryCounts =
          indexes.circleHistoryCountsByPerson.get(displayData.userId) ??
          EMPTY_CIRCLE_HISTORY_COUNTS;
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
      },
    );

    return rankedPeople.sort((left, right) => {
      const scoreDiff = right.score - left.score;
      if (scoreDiff !== 0) {
        return scoreDiff;
      }

      return left.label.localeCompare(right.label, 'es-CO');
    });
  }

  const rankedPeople = people.flatMap((person): PeopleInsightPerson[] => {
    const row = indexes.analyticsPeopleById.get(person.userId);
    const displayData = row
      ? personDisplayData(indexes.peopleById, row)
      : {
          avatarUrl: person.avatarUrl ?? null,
          label: person.displayName,
          userId: person.userId,
        };

    if (filter === 'balance') {
      const amountMinor = row?.periodNetMinor ?? person.netAmountMinor;

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
        row?.periodOwedToMeMinor ??
        (person.direction === 'owes_me' ? person.netAmountMinor : 0);
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
        row?.periodIOweMinor ?? (person.direction === 'i_owe' ? person.netAmountMinor : 0),
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
      const pendingScore = indexes.pendingScoresByPerson.get(person.userId) ?? EMPTY_ACTIVITY_SCORE;
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

    if (filter === 'rejected') {
      const rejectedScore =
        indexes.rejectedScoresByPerson.get(person.userId) ?? EMPTY_ACTIVITY_SCORE;
      if (rejectedScore.count <= 0) {
        return [];
      }

      return [
        {
          ...displayData,
          metricLabel:
            rejectedScore.amountMinor > 0
              ? `${rejectedScore.count} · ${formatCompactCop(rejectedScore.amountMinor)}`
              : `${rejectedScore.count}`,
          score: rejectedScore.count * 100_000_000 + rejectedScore.amountMinor,
          tone: 'danger',
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

  return rankedPeople.sort((left, right) => {
    const scoreDiff = right.score - left.score;
    if (scoreDiff !== 0) {
      return scoreDiff;
    }

    return left.label.localeCompare(right.label, 'es-CO');
  });
}

export function buildPeopleInsightRows(input: PeopleInsightRowsInput): PeopleInsightPerson[] {
  return buildPeopleInsightRowsForFilter(input, buildPeopleInsightIndexes(input));
}

export function buildPeopleInsightRowsByFilter(
  input: PeopleInsightRowsByFilterInput,
): Record<PeopleInsightFilter, PeopleInsightPerson[]> {
  const indexes = buildPeopleInsightIndexes(input);
  const rowsByFilter = {} as Record<PeopleInsightFilter, PeopleInsightPerson[]>;

  for (const option of PEOPLE_INSIGHT_OPTIONS) {
    rowsByFilter[option.value] = buildPeopleInsightRowsForFilter(
      {
        filter: option.value,
        people: input.people,
      },
      indexes,
    );
  }

  return rowsByFilter;
}

export function buildPeopleInsightRanking(
  input: Parameters<typeof buildPeopleInsightRows>[0],
): PeopleInsightPerson[] {
  return buildPeopleInsightRows(input).slice(0, 3);
}
