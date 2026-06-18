import type { BalanceAnalyticsPeriod } from '@happy-circles/application';

import type { SegmentedOption } from '@/components/segmented-control';
import { dateMs, isWithinRange, periodRange } from '@/lib/live-data/utils/dates';

export const CATEGORY_PERIOD_OPTIONS: readonly SegmentedOption<BalanceAnalyticsPeriod>[] = [
  { label: 'Semana', value: 'week' },
  { label: 'Mes', value: 'month' },
  { label: 'Año', value: 'year' },
  { label: 'Todo', value: 'all' },
];

export function snapshotReferenceDate(value: string | null | undefined): Date {
  const timestamp = dateMs(value);
  return new Date(timestamp ?? Date.now());
}

export function filterActivityItemsByPeriod<T extends { readonly happenedAt?: string }>(
  items: readonly T[],
  period: BalanceAnalyticsPeriod,
  referenceDate: Date,
): readonly T[] {
  if (period === 'all') {
    return items;
  }

  const range = periodRange(period, referenceDate);
  return items.filter((item) => {
    const timeMs = dateMs(item.happenedAt);
    return timeMs === null ? true : isWithinRange(timeMs, range.currentStartMs, range.currentEndMs);
  });
}
