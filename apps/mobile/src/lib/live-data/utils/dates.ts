import type { BalanceAnalyticsPeriod } from '@happy-circles/application';

export function formatRelativeLabel(value: string, nowMs: number): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return 'recientemente';
  }

  const diffMs = nowMs - timestamp;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) {
    return 'hace un momento';
  }

  if (diffMs < hour) {
    return `hace ${Math.max(1, Math.round(diffMs / minute))} min`;
  }

  if (diffMs < day) {
    return `hace ${Math.max(1, Math.round(diffMs / hour))} h`;
  }

  if (diffMs < 7 * day) {
    return `hace ${Math.max(1, Math.round(diffMs / day))} d`;
  }

  return new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'short',
  }).format(new Date(timestamp));
}

export interface AnalyticsRange {
  readonly currentStartMs: number | null;
  readonly currentEndMs: number | null;
  readonly previousStartMs: number | null;
  readonly previousEndMs: number | null;
  readonly currentLabel: string;
  readonly previousLabel: string | null;
}

export function dateMs(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 0, 0, 0, 0);
}

export function endOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 23, 59, 59, 999);
}

export function startOfWeek(value: Date): Date {
  const day = value.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  return startOfDay(new Date(value.getFullYear(), value.getMonth(), value.getDate() + offset));
}

export function startOfMonth(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), 1, 0, 0, 0, 0);
}

export function startOfYear(value: Date): Date {
  return new Date(value.getFullYear(), 0, 1, 0, 0, 0, 0);
}

export function previousRangeFromBounds(
  start: Date,
  end: Date,
): Pick<AnalyticsRange, 'previousStartMs' | 'previousEndMs'> {
  const lengthMs = end.getTime() - start.getTime() + 1;
  return {
    previousStartMs: start.getTime() - lengthMs,
    previousEndMs: start.getTime() - 1,
  };
}

export function periodRange(period: BalanceAnalyticsPeriod, now: Date): AnalyticsRange {
  if (period === 'week') {
    const start = startOfWeek(now);
    const end = endOfDay(now);
    return {
      currentStartMs: start.getTime(),
      currentEndMs: end.getTime(),
      currentLabel: 'Esta semana',
      previousLabel: 'Semana anterior',
      ...previousRangeFromBounds(start, end),
    };
  }

  if (period === 'month') {
    const start = startOfMonth(now);
    const end = endOfDay(now);
    return {
      currentStartMs: start.getTime(),
      currentEndMs: end.getTime(),
      currentLabel: new Intl.DateTimeFormat('es-CO', {
        month: 'long',
        year: 'numeric',
      }).format(now),
      previousLabel: 'Mes anterior',
      ...previousRangeFromBounds(start, end),
    };
  }

  if (period === 'year') {
    const start = startOfYear(now);
    const end = endOfDay(now);
    return {
      currentStartMs: start.getTime(),
      currentEndMs: end.getTime(),
      currentLabel: `${now.getFullYear()}`,
      previousLabel: `${now.getFullYear() - 1}`,
      ...previousRangeFromBounds(start, end),
    };
  }

  return {
    currentStartMs: null,
    currentEndMs: null,
    previousStartMs: null,
    previousEndMs: null,
    currentLabel: 'Todo el tiempo',
    previousLabel: null,
  };
}

export function isWithinRange(
  timeMs: number,
  startMs: number | null,
  endMs: number | null,
): boolean {
  if (startMs !== null && timeMs < startMs) {
    return false;
  }

  if (endMs !== null && timeMs > endMs) {
    return false;
  }

  return true;
}

export function computeChangeRatio(current: number, previous: number): number | null {
  if (previous === 0) {
    return current === 0 ? 0 : null;
  }

  return (current - previous) / Math.abs(previous);
}
