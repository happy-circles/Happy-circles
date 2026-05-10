import { describe, expect, it, vi } from 'vitest';

import type {
  ActivityItemDto,
  ActiveSettlementPreviewDto,
  BalanceAnalyticsPersonRowDto,
  PersonCardDto,
} from '@happy-circles/application';

vi.mock('react-native', () => ({
  Platform: {
    OS: 'web',
    select: (options: Record<string, unknown>) => options.web ?? options.default,
  },
}));

import {
  buildPeopleInsightActivitySections,
  buildPeopleInsightRanking,
  buildPeopleInsightRows,
  activityMatchesPersonId,
  normalizePeopleInsightFilter,
  peopleInsightLabel,
} from './people-insights';

function person(value: Partial<PersonCardDto>): PersonCardDto {
  return {
    direction: 'settled',
    displayName: 'Persona',
    lastActivityLabel: 'hoy',
    netAmountMinor: 0,
    pendingCount: 0,
    userId: 'person',
    ...value,
  };
}

function analyticsPerson(
  value: Partial<BalanceAnalyticsPersonRowDto>,
): BalanceAnalyticsPersonRowDto {
  return {
    iOweMinor: 0,
    key: value.userId ?? 'person',
    label: 'Persona',
    movementCount: 0,
    netMinor: 0,
    owedToMeMinor: 0,
    periodIOweMinor: 0,
    periodNetMinor: 0,
    periodOwedToMeMinor: 0,
    previousPeriodNetMinor: 0,
    topCategories: [],
    topCategoryBreakdown: [],
    userId: 'person',
    ...value,
  };
}

function activity(value: Partial<ActivityItemDto>): ActivityItemDto {
  return {
    id: 'activity',
    kind: 'request',
    status: 'posted',
    subtitle: 'hoy',
    title: 'Movimiento',
    tone: 'neutral',
    ...value,
  };
}

function activeCircle(value: Partial<ActiveSettlementPreviewDto>): ActiveSettlementPreviewDto {
  return {
    approvalsPending: 0,
    movementCount: 2,
    participantCount: 2,
    participantDecisions: [],
    participantLabels: [],
    participantUserIds: [],
    personalAmountMinor: 0,
    proposalId: 'circle',
    happyCircleCaseId: null,
    versionNumber: null,
    isCurrentVersion: true,
    replacesProposalId: null,
    replacedByProposalId: null,
    staleReason: null,
    savedMovementsCount: 1,
    status: 'pending_approvals',
    subtitle: 'Circle activo',
    title: 'Circle',
    totalAmountMinor: 0,
    ...value,
  };
}

describe('people insights', () => {
  it('normalizes public filters and labels', () => {
    expect(normalizePeopleInsightFilter(undefined)).toBe('balance');
    expect(normalizePeopleInsightFilter('circles')).toBe('circles');
    expect(normalizePeopleInsightFilter(['owed_to_me'])).toBe('owed_to_me');
    expect(normalizePeopleInsightFilter('unknown')).toBe('balance');
    expect(peopleInsightLabel('i_owe')).toBe('Debes');
    expect(peopleInsightLabel('movements')).toBe('Movimientos');
  });

  it('filters pending, balance and circle activity separately', () => {
    const pending = activity({
      id: 'pending',
      kind: 'financial_request',
      status: 'requires_you',
      tone: 'positive',
    });
    const pendingCircle = activity({
      category: 'cycle',
      id: 'pending-circle',
      kind: 'settlement_proposal',
      participantUserIds: ['ana'],
      status: 'pending_approvals',
    });
    const balance = activity({
      id: 'balance',
      kind: 'request',
      status: 'posted',
      tone: 'negative',
    });
    const amended = activity({
      id: 'amended',
      kind: 'request',
      status: 'amended',
      tone: 'positive',
    });
    const cycle = activity({
      category: 'cycle',
      id: 'cycle',
      kind: 'settlement',
      status: 'posted',
      tone: 'neutral',
    });

    expect(
      buildPeopleInsightActivitySections({
        filter: 'balance',
        historyItems: [balance, cycle, amended],
        pendingItems: [pending],
      }),
    ).toEqual({ history: [balance], pending: [] });
    expect(
      buildPeopleInsightActivitySections({
        filter: 'movements',
        historyItems: [balance, cycle, amended],
        pendingItems: [pending],
      }),
    ).toEqual({ history: [balance, cycle, amended], pending: [pending] });
    expect(
      buildPeopleInsightActivitySections({
        filter: 'pending',
        historyItems: [balance, cycle],
        pendingItems: [pending, pendingCircle],
      }),
    ).toEqual({ history: [], pending: [pending, pendingCircle] });
    expect(
      buildPeopleInsightActivitySections({
        filter: 'circles',
        historyItems: [balance, cycle],
        pendingItems: [pending, pendingCircle],
      }),
    ).toEqual({ history: [cycle], pending: [pendingCircle] });
    expect(activityMatchesPersonId(pendingCircle, [person({ userId: 'ana' })], 'ana')).toBe(true);
  });

  it('ranks people by balance, pending, circles and movement counts', () => {
    const people = [
      person({ displayName: 'Ana Perez', pendingCount: 2, userId: 'ana' }),
      person({ displayName: 'Ben Ruiz', pendingCount: 0, userId: 'ben' }),
    ];
    const analyticsPeople = [
      analyticsPerson({
        label: 'Ana Perez',
        movementCount: 4,
        netMinor: -50_000,
        topCategoryBreakdown: [{ category: 'cycle', movementCount: 1, netMinor: 0 }],
        userId: 'ana',
      }),
      analyticsPerson({
        label: 'Ben Ruiz',
        movementCount: 9,
        netMinor: 90_000,
        userId: 'ben',
      }),
    ];
    const pending = activity({
      amountMinor: 12_000,
      href: '/person/ana',
      id: 'pending',
      kind: 'financial_request',
      status: 'requires_you',
    });
    const pendingCircle = activity({
      amountMinor: 45_000,
      category: 'cycle',
      id: 'pending-circle',
      kind: 'settlement_proposal',
      participantUserIds: ['ana'],
      status: 'pending_approvals',
    });
    const closedCircle = activity({
      category: 'cycle',
      href: '/person/ana',
      id: 'closed-circle:ana',
      kind: 'settlement',
      originSettlementProposalId: 'closed-circle',
      status: 'posted',
    });
    const closedCircleDuplicate = activity({
      category: 'cycle',
      href: '/person/ana',
      id: 'closed-circle:ben',
      kind: 'settlement',
      originSettlementProposalId: 'closed-circle',
      status: 'posted',
    });
    const replacedCircle = activity({
      category: 'cycle',
      href: '/person/ana',
      id: 'replaced-circle',
      kind: 'settlement_proposal',
      originSettlementProposalId: 'replaced-circle',
      status: 'stale',
    });
    const rejectedCircle = activity({
      category: 'cycle',
      href: '/person/ana',
      id: 'rejected-circle',
      kind: 'settlement_proposal',
      originSettlementProposalId: 'rejected-circle',
      status: 'rejected',
    });
    const activeCircles = [activeCircle({ participantUserIds: ['ana'] })];

    expect(
      buildPeopleInsightRanking({
        activeCircleProposals: [],
        analyticsPeople,
        filter: 'balance',
        historyItems: [],
        pendingItems: [],
        people,
      })[0]?.userId,
    ).toBe('ben');
    expect(
      buildPeopleInsightRanking({
        activeCircleProposals: [],
        analyticsPeople,
        filter: 'pending',
        historyItems: [],
        pendingItems: [pending, pendingCircle],
        people,
      })[0]?.metricLabel,
    ).toBe('2 · $\u00a0570');
    expect(
      buildPeopleInsightRanking({
        activeCircleProposals: [],
        analyticsPeople,
        filter: 'pending',
        historyItems: [],
        pendingItems: [pending, pendingCircle],
        people,
      })[0]?.tone,
    ).toBe('pending');
    expect(
      buildPeopleInsightRanking({
        activeCircleProposals: activeCircles,
        analyticsPeople,
        filter: 'circles',
        historyItems: [closedCircle, closedCircleDuplicate, replacedCircle, rejectedCircle],
        pendingItems: [],
        people,
      })[0]?.metricLabel,
    ).toBe('4 Circles');
    expect(
      buildPeopleInsightRanking({
        activeCircleProposals: [],
        analyticsPeople,
        filter: 'movements',
        historyItems: [],
        pendingItems: [],
        people,
      })[0]?.userId,
    ).toBe('ben');
  });

  it('keeps balance rows as person-first filter entries', () => {
    const rows = buildPeopleInsightRows({
      activeCircleProposals: [],
      analyticsPeople: [
        analyticsPerson({ label: 'Ana Perez', netMinor: 0, userId: 'ana' }),
        analyticsPerson({ label: 'Ben Ruiz', netMinor: 40_000, userId: 'ben' }),
      ],
      filter: 'balance',
      historyItems: [],
      pendingItems: [],
      people: [
        person({ displayName: 'Ana Perez', netAmountMinor: 0, userId: 'ana' }),
        person({ displayName: 'Ben Ruiz', netAmountMinor: 40_000, userId: 'ben' }),
      ],
    });

    expect(rows.map((row) => row.userId)).toEqual(['ben', 'ana']);
    expect(rows.map((row) => row.metricLabel)).toEqual(['+$\u00a0400', '$\u00a00']);
  });
});
