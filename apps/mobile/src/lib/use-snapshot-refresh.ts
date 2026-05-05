import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const MINIMUM_REFRESH_MS = 500;
const MAXIMUM_REFRESH_MS = 8_000;

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
  const { isLoading, refetch } = snapshotQuery;

  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  const onRefresh = useCallback(async () => {
    if (isLoading || refreshing) {
      return;
    }

    const startedAt = Date.now();
    setRefreshing(true);
    const refetchPromise = refetch();
    const timeoutPromise = wait(MAXIMUM_REFRESH_MS);
    void refetchPromise.catch(() => undefined);

    try {
      await Promise.race([refetchPromise, timeoutPromise]);
    } catch {
      // React Query keeps the request error in query state; the refresh affordance should close.
    } finally {
      const elapsedMs = Date.now() - startedAt;
      await wait(Math.max(0, MINIMUM_REFRESH_MS - elapsedMs));
      if (mountedRef.current) {
        setRefreshing(false);
      }
    }
  }, [isLoading, refetch, refreshing]);

  return useMemo(
    () => ({
      label: 'Sincronizando',
      onRefresh,
      refreshing,
    }),
    [onRefresh, refreshing],
  );
}
