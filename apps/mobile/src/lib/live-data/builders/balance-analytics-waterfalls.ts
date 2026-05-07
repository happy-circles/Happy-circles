import type {
  BalanceAnalyticsPeriod,
  BalanceWaterfallGroupDto,
  DashboardDto,
} from '@happy-circles/application';
import type { TransactionCategory } from '@happy-circles/shared';

import type { RelationshipHistoryRow } from '../types';
import type { AnalyticsRange } from '../utils/dates';
import { dateMs } from '../utils/dates';
import { transactionCategoryLabel } from '../../transaction-categories';
import type { AnalyticsEvent } from './balance-analytics-runtime';

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
