import type {
  BalanceAnalyticsCategoryRowDto,
  BalanceAnalyticsLens,
  BalanceAnalyticsPeriod,
  BalanceAnalyticsPersonRowDto,
} from '@happy-circles/application';
import type { Href } from 'expo-router';

import { formatCop } from '@/lib/data';
import { transactionCategoryLabel } from '@/lib/transaction-categories';
import type { ProjectionChartFilter } from '@/lib/transaction-filters';

export type BalanceFocus = 'balance' | 'projection' | 'people' | 'categories' | 'settlements';
export type BalanceFocusIconName =
  | 'wallet-outline'
  | 'trending-up-outline'
  | 'people-outline'
  | 'pricetags-outline'
  | 'happy-outline';

export type FocusOption = {
  readonly label: string;
  readonly value: BalanceFocus;
  readonly icon: BalanceFocusIconName;
};

export const FOCUS_OPTIONS: readonly FocusOption[] = [
  { label: 'Balance', value: 'balance', icon: 'wallet-outline' },
  { label: 'Proyeccion', value: 'projection', icon: 'trending-up-outline' },
  { label: 'Personas', value: 'people', icon: 'people-outline' },
  { label: 'Categorias', value: 'categories', icon: 'pricetags-outline' },
  { label: 'Happy Circles', value: 'settlements', icon: 'happy-outline' },
];

export function isBalanceFocus(value: string | null | undefined): value is BalanceFocus {
  return (
    value === 'balance' ||
    value === 'projection' ||
    value === 'people' ||
    value === 'categories' ||
    value === 'settlements'
  );
}

export function balanceTone(amountMinor: number): 'positive' | 'negative' | 'neutral' {
  if (amountMinor > 0) {
    return 'positive';
  }

  if (amountMinor < 0) {
    return 'negative';
  }

  return 'neutral';
}

export function amountTone(amountMinor: number): 'positive' | 'negative' | 'neutral' {
  if (amountMinor > 0) {
    return 'positive';
  }

  if (amountMinor < 0) {
    return 'negative';
  }

  return 'neutral';
}

export function formatCompactCop(minor: number): string {
  const value = Math.abs(minor) / 100;
  if (value >= 1_000_000) {
    const formatted = (value / 1_000_000).toFixed(1).replace(/\.0$/, '');
    return minor < 0 ? `-$${formatted}M` : `$${formatted}M`;
  }

  if (value >= 10_000) {
    const formatted = (value / 1_000).toFixed(1).replace(/\.0$/, '');
    return minor < 0 ? `-$${formatted}K` : `$${formatted}K`;
  }

  return formatCop(minor);
}

export function signedFormatCop(minor: number): string {
  if (minor > 0) {
    return `+${formatCop(minor)}`;
  }

  return formatCop(minor);
}

export function signedFormatCompactCop(minor: number): string {
  if (minor > 0) {
    return `+${formatCompactCop(minor)}`;
  }

  return formatCompactCop(minor);
}

export function formatHomeBalanceCop(minor: number): string {
  if (minor < 0) {
    return `- ${formatCop(Math.abs(minor))}`;
  }

  return formatCop(minor);
}

export function periodScopeLabel(period: BalanceAnalyticsPeriod): string {
  if (period === 'week') {
    return 'esta semana';
  }

  if (period === 'month') {
    return 'este mes';
  }

  if (period === 'year') {
    return 'este ano';
  }

  return 'desde el inicio';
}

export function comparisonCopy(
  changeRatio: number | null,
  previousLabel: string | null,
): string {
  if (changeRatio === null || !previousLabel) {
    return 'Sin comparacion disponible.';
  }

  const percentage = `${Math.round(Math.abs(changeRatio) * 100)}%`;
  const previous = previousLabel.toLocaleLowerCase('es-CO');
  if (changeRatio === 0) {
    return `Sin cambio frente a ${previous}.`;
  }

  return changeRatio > 0
    ? `Subio ${percentage} frente a ${previous}.`
    : `Bajo ${percentage} frente a ${previous}.`;
}

export function transactionFilterHref(filter: ProjectionChartFilter): Href {
  return `/transactions?filter=${filter}` as Href;
}

export function personImpactAmount(row: BalanceAnalyticsPersonRowDto): number {
  return row.periodNetMinor;
}

export function categoryImpactAmount(row: BalanceAnalyticsCategoryRowDto): number {
  return row.netMinor;
}

export function personLensAmount(
  row: BalanceAnalyticsPersonRowDto,
  lens: BalanceAnalyticsLens,
): number {
  if (lens === 'i_owe') {
    return row.periodIOweMinor;
  }

  if (lens === 'owed_to_me') {
    return row.periodOwedToMeMinor;
  }

  return row.periodNetMinor;
}

export function categoryLensAmount(
  row: BalanceAnalyticsCategoryRowDto,
  lens: BalanceAnalyticsLens,
): number {
  if (lens === 'i_owe') {
    return row.iOweMinor;
  }

  if (lens === 'owed_to_me') {
    return row.owedToMeMinor;
  }

  return row.netMinor;
}

export function focusIndex(focus: BalanceFocus): number {
  const index = FOCUS_OPTIONS.findIndex((option) => option.value === focus);
  return index >= 0 ? index : 0;
}

export function movementCountLabel(count: number): string {
  return `${count} movimiento${count === 1 ? '' : 's'}`;
}

export function firstName(value: string): string {
  const [name] = value.trim().split(/\s+/);

  return name && name.length > 0 ? name : value;
}

function compactFirstNames(values: readonly string[]): string | null {
  const names = Array.from(
    new Set(
      values
        .map(firstName)
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    ),
  );

  if (names.length === 0) {
    return null;
  }

  const visibleNames = names.slice(0, 2);
  const hiddenCount = names.length - visibleNames.length;

  return hiddenCount > 0 ? `${visibleNames.join(', ')} y ${hiddenCount} mas` : visibleNames.join(', ');
}

export function personFocusMeta(row: BalanceAnalyticsPersonRowDto): string {
  const topCategory = row.topCategoryBreakdown[0] ?? null;
  const movementLabel = movementCountLabel(row.movementCount);

  if (!topCategory) {
    return movementLabel;
  }

  return `${transactionCategoryLabel(topCategory.category)} ${signedFormatCompactCop(
    topCategory.netMinor,
  )} - ${movementLabel}`;
}

export function categoryFocusMeta(row: BalanceAnalyticsCategoryRowDto): string {
  const peopleLabel = compactFirstNames(row.personLabels);

  if (peopleLabel) {
    return peopleLabel;
  }

  return movementCountLabel(row.movementCount);
}

export function categoryLabel(category: BalanceAnalyticsCategoryRowDto['category']): string {
  return transactionCategoryLabel(category);
}
