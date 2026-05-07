import { describe, expect, it, vi } from 'vitest';

import type {
  BalanceAnalyticsCategoryRowDto,
  BalanceAnalyticsPersonRowDto,
} from '@happy-circles/application';

vi.mock('react-native', () => ({
  Platform: {
    OS: 'web',
    select: (options: Record<string, unknown>) => options.web ?? options.default,
  },
  StyleSheet: {
    create: (styles: unknown) => styles,
    hairlineWidth: 1,
  },
}));

import {
  categoryFocusMeta,
  categoryImpactAmount,
  categoryLensAmount,
  comparisonCopy,
  focusIndex,
  formatCompactCop,
  formatHomeBalanceCop,
  isBalanceFocus,
  personFocusMeta,
  personImpactAmount,
  personLensAmount,
  signedFormatCompactCop,
} from './balance-helpers';

function person(value: Partial<BalanceAnalyticsPersonRowDto>): BalanceAnalyticsPersonRowDto {
  return {
    categoryLabels: [],
    movementCount: 0,
    periodIOweMinor: 0,
    periodNetMinor: 0,
    periodOwedToMeMinor: 0,
    topCategoryBreakdown: [],
    ...value,
  } as BalanceAnalyticsPersonRowDto;
}

function category(value: Partial<BalanceAnalyticsCategoryRowDto>): BalanceAnalyticsCategoryRowDto {
  return {
    iOweMinor: 0,
    movementCount: 0,
    netMinor: 0,
    owedToMeMinor: 0,
    personLabels: [],
    previousNetMinor: 0,
    ...value,
  } as BalanceAnalyticsCategoryRowDto;
}

describe('balance helpers', () => {
  it('formats balance amounts consistently with the screen contract', () => {
    expect(formatCompactCop(123_456)).toBe('$\u00a01.235');
    expect(formatCompactCop(1_000_000)).toBe('$10K');
    expect(formatCompactCop(-123_456_789)).toBe('-$1.2M');
    expect(signedFormatCompactCop(1_000_000)).toBe('+$10K');
    expect(formatHomeBalanceCop(-123_456)).toBe('- $\u00a01.235');
  });

  it('keeps comparison copy and focus routing deterministic', () => {
    expect(comparisonCopy(null, 'Abril')).toBe('Sin comparacion disponible.');
    expect(comparisonCopy(0, 'Abril')).toBe('Sin cambio frente a abril.');
    expect(comparisonCopy(0.254, 'Abril')).toBe('Subio 25% frente a abril.');
    expect(comparisonCopy(-0.1, 'Abril')).toBe('Bajo 10% frente a abril.');
    expect(isBalanceFocus('categories')).toBe(true);
    expect(isBalanceFocus('projection')).toBe(false);
    expect(isBalanceFocus('unknown')).toBe(false);
    expect(focusIndex('categories')).toBe(2);
  });

  it('selects person and category amounts by lens', () => {
    const personRow = person({
      periodIOweMinor: -30_000,
      periodNetMinor: 70_000,
      periodOwedToMeMinor: 100_000,
    });
    const categoryRow = category({
      iOweMinor: -20_000,
      netMinor: 40_000,
      owedToMeMinor: 60_000,
    });

    expect(personImpactAmount(personRow)).toBe(70_000);
    expect(personLensAmount(personRow, 'balance')).toBe(70_000);
    expect(personLensAmount(personRow, 'i_owe')).toBe(-30_000);
    expect(personLensAmount(personRow, 'owed_to_me')).toBe(100_000);
    expect(categoryImpactAmount(categoryRow)).toBe(40_000);
    expect(categoryLensAmount(categoryRow, 'balance')).toBe(40_000);
    expect(categoryLensAmount(categoryRow, 'i_owe')).toBe(-20_000);
    expect(categoryLensAmount(categoryRow, 'owed_to_me')).toBe(60_000);
  });

  it('derives ranking metadata without screen state', () => {
    expect(
      personFocusMeta(
        person({
          movementCount: 3,
          topCategoryBreakdown: [{ category: 'food_drinks', netMinor: -1_500_000 }] as never,
        }),
      ),
    ).toBe('Comida -$15K - 3 movimientos');
    expect(personFocusMeta(person({ movementCount: 1 }))).toBe('1 movimiento');
    expect(
      categoryFocusMeta(
        category({
          movementCount: 4,
          personLabels: ['Ana Maria', 'Ana Lopez', 'Ben Soto', 'Carla Diaz'],
        }),
      ),
    ).toBe('Ana, Ben y 1 mas');
    expect(categoryFocusMeta(category({ movementCount: 2 }))).toBe('2 movimientos');
  });
});
