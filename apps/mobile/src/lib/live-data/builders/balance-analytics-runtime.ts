import type {
  BalanceAnalyticsCategoryRowDto,
  BalanceAnalyticsDto,
  BalanceAnalyticsLens,
  BalanceAnalyticsPeriod,
  BalanceAnalyticsPeriodDto,
  BalanceAnalyticsPersonRowDto,
  BalanceLensSummaryDto,
  BalanceOverviewDto,
  BalanceWaterfallGroupDto,
  DashboardDto,
  PersonCardDto,
  ActiveSettlementPreviewDto,
} from '@happy-circles/application';
import type { TransactionCategory } from '@happy-circles/shared';
import type {
  FinancialRequestRow,
  RelationshipHistoryRow,
  SettlementParticipantRow,
  SettlementProposalRow,
} from '../types';
import type { AnalyticsRange } from '../utils/dates';
import { computeChangeRatio, dateMs, isWithinRange, periodRange } from '../utils/dates';
import { groupBy } from '../utils/context';
import { requestDirectionForUser } from '../utils/money-and-direction';
import { parseSettlementMovements, buildSettlementMetrics } from './settlements';
import {
  transactionCategoryLabel,
  USER_TRANSACTION_CATEGORIES,
  normalizeTransactionCategory,
} from '../../transaction-categories';

export interface AnalyticsEvent {
  readonly id: string;
  readonly happenedAt: string;
  readonly timeMs: number;
  readonly category: TransactionCategory;
  readonly counterpartyUserId: string;
  readonly counterpartyLabel: string;
  readonly iOweMinor: number;
  readonly owedToMeMinor: number;
  readonly netMinor: number;
}

export interface CurrentPersonBalanceSnapshot {
  readonly userId: string;
  readonly label: string;
  readonly netMinor: number;
  readonly iOweMinor: number;
  readonly owedToMeMinor: number;
}

export function formatPeriodComparison(
  changeRatio: number | null,
  previousLabel: string | null,
): string {
  if (changeRatio === null || !previousLabel) {
    return 'No hay comparacion disponible todavia.';
  }

  if (changeRatio === 0) {
    return `Sin cambio frente a ${previousLabel.toLocaleLowerCase('es-CO')}.`;
  }

  const percentage = `${Math.round(Math.abs(changeRatio) * 100)}%`;
  return changeRatio > 0
    ? `Subio ${percentage} frente a ${previousLabel.toLocaleLowerCase('es-CO')}.`
    : `Bajo ${percentage} frente a ${previousLabel.toLocaleLowerCase('es-CO')}.`;
}

export function buildAnalyticsEvents(input: {
  readonly history: readonly RelationshipHistoryRow[];
  readonly currentUserId: string;
  readonly counterpartyByRelationshipId: ReadonlyMap<
    string,
    {
      readonly userId: string;
      readonly displayName: string;
    }
  >;
}): AnalyticsEvent[] {
  return input.history.flatMap((row): AnalyticsEvent[] => {
    if (row.item_kind !== 'ledger_transaction' || row.subtype === 'cycle_settlement') {
      return [];
    }

    const counterparty = input.counterpartyByRelationshipId.get(row.relationship_id);
    const timeMs = dateMs(row.happened_at);
    if (!counterparty || timeMs === null) {
      return [];
    }

    const iOweMinor = row.debtor_user_id === input.currentUserId ? row.amount_minor : 0;
    const owedToMeMinor = row.creditor_user_id === input.currentUserId ? row.amount_minor : 0;

    return [
      {
        id: row.item_id,
        happenedAt: row.happened_at,
        timeMs,
        category: normalizeTransactionCategory(row.category),
        counterpartyUserId: counterparty.userId,
        counterpartyLabel: counterparty.displayName,
        iOweMinor,
        owedToMeMinor,
        netMinor: owedToMeMinor - iOweMinor,
      },
    ];
  });
}

export function buildCurrentPersonBalances(
  people: readonly PersonCardDto[],
): readonly CurrentPersonBalanceSnapshot[] {
  return people.map((person) => ({
    userId: person.userId,
    label: person.displayName,
    netMinor:
      person.direction === 'owes_me'
        ? person.netAmountMinor
        : person.direction === 'i_owe'
          ? -person.netAmountMinor
          : 0,
    iOweMinor: person.direction === 'i_owe' ? person.netAmountMinor : 0,
    owedToMeMinor: person.direction === 'owes_me' ? person.netAmountMinor : 0,
  }));
}

export function topCategoryBreakdownForEvents(
  events: readonly AnalyticsEvent[],
): BalanceAnalyticsPersonRowDto['topCategoryBreakdown'] {
  const totals = new Map<
    TransactionCategory,
    {
      readonly category: TransactionCategory;
      netMinor: number;
      movementCount: number;
    }
  >();

  for (const event of events) {
    const current = totals.get(event.category);
    if (current) {
      current.netMinor += event.netMinor;
      current.movementCount += 1;
      continue;
    }

    totals.set(event.category, {
      category: event.category,
      netMinor: event.netMinor,
      movementCount: 1,
    });
  }

  return Array.from(totals.values())
    .sort((left, right) => {
      const amountDiff = Math.abs(right.netMinor) - Math.abs(left.netMinor);
      if (amountDiff !== 0) {
        return amountDiff;
      }

      return right.movementCount - left.movementCount;
    })
    .slice(0, 3)
    .map((entry) => ({
      category: entry.category,
      netMinor: entry.netMinor,
      movementCount: entry.movementCount,
    }));
}

export function buildPeopleAnalyticsRows(input: {
  readonly currentBalances: readonly CurrentPersonBalanceSnapshot[];
  readonly currentEvents: readonly AnalyticsEvent[];
  readonly previousEvents: readonly AnalyticsEvent[];
}): readonly BalanceAnalyticsPersonRowDto[] {
  const currentByUserId = groupBy(input.currentEvents, (event) => event.counterpartyUserId);
  const previousByUserId = groupBy(input.previousEvents, (event) => event.counterpartyUserId);

  return input.currentBalances
    .map((person): BalanceAnalyticsPersonRowDto => {
      const currentEvents = currentByUserId.get(person.userId) ?? [];
      const previousEvents = previousByUserId.get(person.userId) ?? [];
      const periodIOweMinor = currentEvents.reduce((total, event) => total + event.iOweMinor, 0);
      const periodOwedToMeMinor = currentEvents.reduce(
        (total, event) => total + event.owedToMeMinor,
        0,
      );
      const previousPeriodNetMinor = previousEvents.reduce(
        (total, event) => total + event.netMinor,
        0,
      );
      const topCategoryBreakdown = topCategoryBreakdownForEvents(currentEvents);

      return {
        key: person.userId,
        userId: person.userId,
        label: person.label,
        netMinor: person.netMinor,
        iOweMinor: person.iOweMinor,
        owedToMeMinor: person.owedToMeMinor,
        movementCount: currentEvents.length,
        periodNetMinor: periodOwedToMeMinor - periodIOweMinor,
        periodIOweMinor,
        periodOwedToMeMinor,
        previousPeriodNetMinor,
        topCategories: topCategoryBreakdown.map((entry) => entry.category),
        topCategoryBreakdown,
      };
    })
    .filter(
      (row) =>
        row.netMinor !== 0 ||
        row.periodNetMinor !== 0 ||
        row.periodIOweMinor !== 0 ||
        row.periodOwedToMeMinor !== 0 ||
        row.movementCount > 0,
    )
    .sort((left, right) => {
      const amountDiff = Math.abs(right.periodNetMinor) - Math.abs(left.periodNetMinor);
      if (amountDiff !== 0) {
        return amountDiff;
      }

      if (right.movementCount !== left.movementCount) {
        return right.movementCount - left.movementCount;
      }

      return left.label.localeCompare(right.label, 'es-CO');
    });
}

export function buildCategoryAnalyticsRows(input: {
  readonly currentEvents: readonly AnalyticsEvent[];
  readonly previousEvents: readonly AnalyticsEvent[];
}): readonly BalanceAnalyticsCategoryRowDto[] {
  const categories = [...USER_TRANSACTION_CATEGORIES, 'cycle'] as const;
  const currentEventsByCategory = groupBy(input.currentEvents, (event) => event.category);
  const previousEventsByCategory = groupBy(input.previousEvents, (event) => event.category);

  return categories
    .map((category): BalanceAnalyticsCategoryRowDto | null => {
      const currentEvents = currentEventsByCategory.get(category) ?? [];
      const previousEvents = previousEventsByCategory.get(category) ?? [];
      if (currentEvents.length === 0 && previousEvents.length === 0) {
        return null;
      }

      const iOweMinor = currentEvents.reduce((total, event) => total + event.iOweMinor, 0);
      const owedToMeMinor = currentEvents.reduce((total, event) => total + event.owedToMeMinor, 0);
      const previousNetMinor = previousEvents.reduce((total, event) => total + event.netMinor, 0);
      const personLabels = Array.from(
        new Set(currentEvents.map((event) => event.counterpartyLabel)),
      ).slice(0, 4);
      const userIds = Array.from(new Set(currentEvents.map((event) => event.counterpartyUserId)));

      return {
        key: category,
        category,
        label: transactionCategoryLabel(category),
        netMinor: owedToMeMinor - iOweMinor,
        iOweMinor,
        owedToMeMinor,
        movementCount: currentEvents.length,
        previousNetMinor,
        personLabels,
        userIds,
      };
    })
    .filter((row): row is BalanceAnalyticsCategoryRowDto => Boolean(row))
    .sort((left, right) => {
      const amountDiff = Math.abs(right.netMinor) - Math.abs(left.netMinor);
      if (amountDiff !== 0) {
        return amountDiff;
      }

      if (right.movementCount !== left.movementCount) {
        return right.movementCount - left.movementCount;
      }

      return left.label.localeCompare(right.label, 'es-CO');
    });
}

export function buildWaterfalls(input: {
  readonly period: BalanceAnalyticsPeriod;
  readonly currentSummary: DashboardDto['summary'];
  readonly currentEvents: readonly AnalyticsEvent[];
  readonly history: readonly RelationshipHistoryRow[];
  readonly currentUserId: string;
  readonly range: AnalyticsRange;
  readonly counterpartyByRelationshipId: ReadonlyMap<
    string,
    {
      readonly userId: string;
      readonly displayName: string;
    }
  >;
}): {
  readonly byCategory: readonly BalanceWaterfallGroupDto[];
  readonly byPerson: readonly BalanceWaterfallGroupDto[];
} {
  const byCategory = new Map<
    TransactionCategory | 'cycle',
    {
      readonly category: TransactionCategory | 'cycle';
      iOweMinor: number;
      owedToMeMinor: number;
      resolvedMinor: number;
      netMinor: number;
    }
  >();

  const byPerson = new Map<
    string,
    {
      readonly userId: string;
      readonly label: string;
      iOweMinor: number;
      owedToMeMinor: number;
      resolvedMinor: number;
      netMinor: number;
    }
  >();

  const getCategoryGroup = (category: TransactionCategory | 'cycle') => {
    let group = byCategory.get(category);
    if (!group) {
      group = {
        category,
        iOweMinor: 0,
        owedToMeMinor: 0,
        resolvedMinor: 0,
        netMinor: 0,
      };
      byCategory.set(category, group);
    }
    return group;
  };

  const getPersonGroup = (userId: string, label: string) => {
    let group = byPerson.get(userId);
    if (!group) {
      group = {
        userId,
        label,
        iOweMinor: 0,
        owedToMeMinor: 0,
        resolvedMinor: 0,
        netMinor: 0,
      };
      byPerson.set(userId, group);
    }
    return group;
  };

  for (const event of input.currentEvents) {
    const catGroup = getCategoryGroup(event.category);
    catGroup.iOweMinor += event.iOweMinor;
    catGroup.owedToMeMinor += event.owedToMeMinor;
    catGroup.netMinor += event.netMinor;

    const personGroup = getPersonGroup(event.counterpartyUserId, event.counterpartyLabel);
    personGroup.iOweMinor += event.iOweMinor;
    personGroup.owedToMeMinor += event.owedToMeMinor;
    personGroup.netMinor += event.netMinor;
  }

  const settlements = input.history.filter((row) => {
    if (row.item_kind !== 'ledger_transaction' || row.subtype !== 'cycle_settlement') {
      return false;
    }

    const timeMs = dateMs(row.happened_at);
    if (timeMs === null) {
      return false;
    }

    if (
      input.period !== 'all' &&
      (timeMs < (input.range.currentStartMs ?? 0) ||
        timeMs > (input.range.currentEndMs ?? Infinity))
    ) {
      return false;
    }

    return true;
  });

  for (const row of settlements) {
    const counterparty = input.counterpartyByRelationshipId.get(row.relationship_id);
    if (!counterparty) {
      continue;
    }

    const iOweMinor = row.debtor_user_id === input.currentUserId ? row.amount_minor : 0;
    const owedToMeMinor = row.creditor_user_id === input.currentUserId ? row.amount_minor : 0;
    const netMinor = owedToMeMinor - iOweMinor;
    const resolvedMinorAmount = Math.abs(netMinor);

    const catGroup = getCategoryGroup('cycle');
    catGroup.resolvedMinor += resolvedMinorAmount;
    catGroup.netMinor += netMinor;

    const personGroup = getPersonGroup(counterparty.userId, counterparty.displayName);
    personGroup.resolvedMinor += resolvedMinorAmount;
    personGroup.netMinor += netMinor;
  }

  const periodNetMinor = Array.from(byCategory.values()).reduce(
    (total, group) => total + group.netMinor,
    0,
  );
  const startingBalanceMinor = input.currentSummary.netBalanceMinor - periodNetMinor;

  const buildSteps = (
    groups: readonly {
      readonly key: string;
      readonly label: string;
      readonly category?: TransactionCategory | 'cycle';
      readonly personId?: string;
      readonly iOweMinor: number;
      readonly owedToMeMinor: number;
      readonly resolvedMinor: number;
      readonly netMinor: number;
    }[],
  ): readonly BalanceWaterfallGroupDto[] => {
    let cumulative = startingBalanceMinor;
    const steps = groups
      .filter(
        (g) =>
          g.iOweMinor !== 0 || g.owedToMeMinor !== 0 || g.resolvedMinor !== 0 || g.netMinor !== 0,
      )
      .sort((left, right) => Math.abs(right.netMinor) - Math.abs(left.netMinor))
      .map((g): BalanceWaterfallGroupDto => {
        cumulative += g.netMinor;
        return {
          key: g.key,
          label: g.label,
          category: g.category,
          personId: g.personId,
          iOweMinor: g.iOweMinor,
          owedToMeMinor: g.owedToMeMinor,
          resolvedMinor: g.resolvedMinor,
          netMinor: g.netMinor,
          cumulativeBalanceMinor: cumulative,
        };
      });

    return [
      {
        key: 'starting_balance',
        label: input.period === 'all' ? 'Saldo base' : 'Saldo inicial',
        category: 'starting_balance',
        iOweMinor: 0,
        owedToMeMinor: 0,
        resolvedMinor: 0,
        netMinor: startingBalanceMinor,
        cumulativeBalanceMinor: startingBalanceMinor,
      },
      ...steps,
      {
        key: 'ending_balance',
        label: 'Balance final',
        category: 'ending_balance',
        iOweMinor: 0,
        owedToMeMinor: 0,
        resolvedMinor: 0,
        netMinor: input.currentSummary.netBalanceMinor,
        cumulativeBalanceMinor: input.currentSummary.netBalanceMinor,
      },
    ];
  };

  return {
    byCategory: buildSteps(
      Array.from(byCategory.values()).map((g) => ({
        key: g.category,
        label:
          g.category === 'cycle'
            ? 'Cierres de sistema'
            : transactionCategoryLabel(g.category as TransactionCategory),
        category: g.category,
        iOweMinor: g.iOweMinor,
        owedToMeMinor: g.owedToMeMinor,
        resolvedMinor: g.resolvedMinor,
        netMinor: g.netMinor,
      })),
    ),
    byPerson: buildSteps(
      Array.from(byPerson.values()).map((g) => ({
        key: g.userId,
        label: g.label,
        personId: g.userId,
        iOweMinor: g.iOweMinor,
        owedToMeMinor: g.owedToMeMinor,
        resolvedMinor: g.resolvedMinor,
        netMinor: g.netMinor,
      })),
    ),
  };
}

export function buildLensSummary(input: {
  readonly lens: BalanceAnalyticsLens;
  readonly currentSummary: DashboardDto['summary'];
  readonly currentEvents: readonly AnalyticsEvent[];
  readonly previousEvents: readonly AnalyticsEvent[];
}): BalanceLensSummaryDto {
  const periodIOweMinor = input.currentEvents.reduce((total, event) => total + event.iOweMinor, 0);
  const periodOwedToMeMinor = input.currentEvents.reduce(
    (total, event) => total + event.owedToMeMinor,
    0,
  );
  const previousIOweMinor = input.previousEvents.reduce(
    (total, event) => total + event.iOweMinor,
    0,
  );
  const previousOwedToMeMinor = input.previousEvents.reduce(
    (total, event) => total + event.owedToMeMinor,
    0,
  );
  const finalMinor =
    input.lens === 'balance'
      ? input.currentSummary.netBalanceMinor
      : input.lens === 'i_owe'
        ? input.currentSummary.totalIOweMinor
        : input.currentSummary.totalOwedToMeMinor;
  const deltaMinor =
    input.lens === 'balance'
      ? periodOwedToMeMinor - periodIOweMinor
      : input.lens === 'i_owe'
        ? periodIOweMinor
        : periodOwedToMeMinor;
  const previousDeltaMinor =
    input.lens === 'balance'
      ? previousOwedToMeMinor - previousIOweMinor
      : input.lens === 'i_owe'
        ? previousIOweMinor
        : previousOwedToMeMinor;

  return {
    initialMinor: finalMinor - deltaMinor,
    finalMinor,
    deltaMinor,
    previousDeltaMinor,
    changeRatio: computeChangeRatio(deltaMinor, previousDeltaMinor),
    movementCount: input.currentEvents.length,
  };
}

export function buildBalanceProjection(input: {
  readonly financialRequests: readonly FinancialRequestRow[];
  readonly currentUserId: string;
  readonly currentSummary: DashboardDto['summary'];
}): BalanceOverviewDto['projection'] {
  const pendingRequests = input.financialRequests.filter((request) => request.status === 'pending');
  let pendingIncomingMinor = 0;
  let pendingOutgoingMinor = 0;

  const impactMinor = pendingRequests.reduce((total, request) => {
    if (request.creditor_user_id === input.currentUserId) {
      pendingIncomingMinor += request.amount_minor;
      return total + request.amount_minor;
    }

    if (request.debtor_user_id === input.currentUserId) {
      pendingOutgoingMinor += request.amount_minor;
      return total - request.amount_minor;
    }

    return total;
  }, 0);
  const pendingAmountMinor = pendingRequests.reduce(
    (total, request) => total + request.amount_minor,
    0,
  );

  return {
    pendingCount: pendingRequests.length,
    pendingAmountMinor,
    pendingIncomingMinor,
    pendingOutgoingMinor,
    impactMinor,
    projectedNetBalanceMinor: input.currentSummary.netBalanceMinor + impactMinor,
  };
}

export function buildAnalyticsInsight(input: {
  readonly lensSummary: BalanceLensSummaryDto;
  readonly topPerson: BalanceAnalyticsPersonRowDto | null;
  readonly topCategory: BalanceAnalyticsCategoryRowDto | null;
  readonly previousLabel: string | null;
}): string {
  const comparison = formatPeriodComparison(input.lensSummary.changeRatio, input.previousLabel);
  const detail =
    input.topCategory && input.topPerson
      ? `${input.topCategory.label} y ${input.topPerson.label} explican la mayor parte del cambio.`
      : input.topCategory
        ? `${input.topCategory.label} explica la mayor parte del cambio.`
        : input.topPerson
          ? `${input.topPerson.label} concentra el mayor impacto del periodo.`
          : 'Todavia no hay suficiente actividad para explicar cambios.';

  return `${detail} ${comparison}`;
}

export function buildBalanceAnalytics(input: {
  readonly currentSummary: DashboardDto['summary'];
  readonly people: readonly PersonCardDto[];
  readonly history: readonly RelationshipHistoryRow[];
  readonly counterpartyByRelationshipId: ReadonlyMap<
    string,
    {
      readonly userId: string;
      readonly displayName: string;
    }
  >;
  readonly proposals: readonly SettlementProposalRow[];
  readonly participantsByProposalId: Map<string, SettlementParticipantRow[]>;
  readonly currentUserId: string;
  readonly visibleCounterpartyUserIds: ReadonlySet<string>;
  readonly names: Map<string, string>;
  readonly activeProposal: ActiveSettlementPreviewDto | null;
  readonly now: Date;
}): BalanceAnalyticsDto {
  const events = buildAnalyticsEvents({
    history: input.history,
    currentUserId: input.currentUserId,
    counterpartyByRelationshipId: input.counterpartyByRelationshipId,
  });
  const currentBalances = buildCurrentPersonBalances(input.people);
  const periods: BalanceAnalyticsPeriod[] = ['week', 'month', 'year', 'all'];

  return {
    defaultPeriod: 'month',
    periods: Object.fromEntries(
      periods.map((period): [BalanceAnalyticsPeriod, BalanceAnalyticsPeriodDto] => {
        const range = periodRange(period, input.now);
        const currentEvents = events.filter((event) =>
          isWithinRange(event.timeMs, range.currentStartMs, range.currentEndMs),
        );
        const previousEvents = range.previousLabel
          ? events.filter((event) =>
              isWithinRange(event.timeMs, range.previousStartMs, range.previousEndMs),
            )
          : [];
        const summaries: Record<BalanceAnalyticsLens, BalanceLensSummaryDto> = {
          balance: buildLensSummary({
            lens: 'balance',
            currentSummary: input.currentSummary,
            currentEvents,
            previousEvents,
          }),
          i_owe: buildLensSummary({
            lens: 'i_owe',
            currentSummary: input.currentSummary,
            currentEvents,
            previousEvents,
          }),
          owed_to_me: buildLensSummary({
            lens: 'owed_to_me',
            currentSummary: input.currentSummary,
            currentEvents,
            previousEvents,
          }),
        };
        const people = buildPeopleAnalyticsRows({
          currentBalances,
          currentEvents,
          previousEvents,
        });
        const categories = buildCategoryAnalyticsRows({
          currentEvents,
          previousEvents,
        });
        const settlements = buildSettlementMetrics({
          proposals: input.proposals,
          participantsByProposalId: input.participantsByProposalId,
          currentUserId: input.currentUserId,
          visibleCounterpartyUserIds: input.visibleCounterpartyUserIds,
          names: input.names,
          activeProposal: input.activeProposal,
          range,
        });

        const waterfalls = buildWaterfalls({
          period,
          currentSummary: input.currentSummary,
          currentEvents,
          history: input.history,
          currentUserId: input.currentUserId,
          range,
          counterpartyByRelationshipId: input.counterpartyByRelationshipId,
        });

        return [
          period,
          {
            period,
            labels: {
              current: range.currentLabel,
              previous: range.previousLabel,
            },
            summaries,
            waterfallByCategory: waterfalls.byCategory,
            waterfallByPerson: waterfalls.byPerson,
            people,
            categories,
            settlements,
            insight: buildAnalyticsInsight({
              lensSummary: summaries.balance,
              topPerson: people[0] ?? null,
              topCategory: categories[0] ?? null,
              previousLabel: range.previousLabel,
            }),
          },
        ];
      }),
    ) as Readonly<Record<BalanceAnalyticsPeriod, BalanceAnalyticsPeriodDto>>,
  };
}
