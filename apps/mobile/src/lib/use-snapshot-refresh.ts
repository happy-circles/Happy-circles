import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const MINIMUM_REFRESH_MS = 500;

interface SnapshotRefreshTarget {
  readonly isLoading: boolean;
  readonly refetch: () => Promise<unknown>;
}

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function useSnapshotRefresh(snapshotQuery: SnapshotRefreshTarget) {
  const [refreshing, setRefreshing] = useState(false);
  const mountedRef = useRef(true);

  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  const onRefresh = useCallback(async () => {
    if (snapshotQuery.isLoading || refreshing) {
      return;
    }

    const startedAt = Date.now();
    setRefreshing(true);

    try {
      await snapshotQuery.refetch();
    } catch {
      // React Query keeps the request error in query state; the refresh affordance should close.
    } finally {
      const elapsedMs = Date.now() - startedAt;
      await wait(Math.max(0, MINIMUM_REFRESH_MS - elapsedMs));
      if (mountedRef.current) {
        setRefreshing(false);
      }
    }
  }, [refreshing, snapshotQuery]);

  return useMemo(
    () => ({
      label: 'Sincronizando',
      onRefresh,
      refreshing,
    }),
    [onRefresh, refreshing],
  );
}
