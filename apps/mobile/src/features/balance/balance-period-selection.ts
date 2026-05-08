import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

import type { BalanceAnalyticsPeriod } from '@happy-circles/application';

import {
  DEFAULT_BALANCE_ANALYTICS_PERIOD,
  isBalanceAnalyticsPeriod,
} from '@/features/balance/balance-helpers';

const periodSelectionListeners = new Set<() => void>();
let preferredBalanceAnalyticsPeriod: BalanceAnalyticsPeriod | null = null;

function subscribeToPreferredBalanceAnalyticsPeriod(listener: () => void): () => void {
  periodSelectionListeners.add(listener);

  return () => {
    periodSelectionListeners.delete(listener);
  };
}

export function setPreferredBalanceAnalyticsPeriod(period: BalanceAnalyticsPeriod): void {
  if (preferredBalanceAnalyticsPeriod === period) {
    return;
  }

  preferredBalanceAnalyticsPeriod = period;
  periodSelectionListeners.forEach((listener) => listener());
}

export function usePreferredBalanceAnalyticsPeriod(
  fallbackPeriod: BalanceAnalyticsPeriod = DEFAULT_BALANCE_ANALYTICS_PERIOD,
): BalanceAnalyticsPeriod {
  const getSnapshot = useCallback(
    () => preferredBalanceAnalyticsPeriod ?? fallbackPeriod,
    [fallbackPeriod],
  );

  return useSyncExternalStore(subscribeToPreferredBalanceAnalyticsPeriod, getSnapshot, getSnapshot);
}

export function useSyncedBalanceAnalyticsPeriod({
  defaultPeriod = DEFAULT_BALANCE_ANALYTICS_PERIOD,
  initialPeriod,
}: {
  readonly defaultPeriod?: BalanceAnalyticsPeriod;
  readonly initialPeriod?: string | null;
}): readonly [BalanceAnalyticsPeriod, (period: BalanceAnalyticsPeriod) => void] {
  const preferredPeriod = usePreferredBalanceAnalyticsPeriod(defaultPeriod);
  const [period, setPeriodState] = useState<BalanceAnalyticsPeriod>(() =>
    isBalanceAnalyticsPeriod(initialPeriod) ? initialPeriod : preferredPeriod,
  );
  const previousInitialPeriodRef = useRef<string | null | undefined>(initialPeriod);

  useEffect(() => {
    if (isBalanceAnalyticsPeriod(initialPeriod)) {
      setPreferredBalanceAnalyticsPeriod(initialPeriod);
    }
  }, [initialPeriod]);

  useEffect(() => {
    if (isBalanceAnalyticsPeriod(initialPeriod)) {
      if (previousInitialPeriodRef.current !== initialPeriod) {
        previousInitialPeriodRef.current = initialPeriod;
        setPeriodState(initialPeriod);
      }
      return;
    }

    previousInitialPeriodRef.current = initialPeriod;
    setPeriodState(preferredPeriod);
  }, [initialPeriod, preferredPeriod]);

  const setPeriod = useCallback((nextPeriod: BalanceAnalyticsPeriod) => {
    setPeriodState(nextPeriod);
    setPreferredBalanceAnalyticsPeriod(nextPeriod);
  }, []);

  return [period, setPeriod];
}
