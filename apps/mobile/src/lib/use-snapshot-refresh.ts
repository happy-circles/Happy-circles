import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const MINIMUM_REFRESH_MS = 500;
const MAXIMUM_REFRESH_MS = 8_000;

interface SnapshotRefreshTarget {
  readonly isLoading: boolean;
  readonly refetch: () => Promise<unknown>;
}

interface SnapshotRefreshOptions {
  readonly minimumVisibleMs?: number;
  readonly nativeIndicatorVisible?: boolean;
  readonly progressViewOffset?: number;
}

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function useSnapshotRefresh(
  snapshotQuery: SnapshotRefreshTarget,
  options: SnapshotRefreshOptions = {},
) {
  const [refreshing, setRefreshing] = useState(false);
  const mountedRef = useRef(true);
  const refreshingRef = useRef(false);
  const { isLoading, refetch } = snapshotQuery;
  const minimumVisibleMs = options.minimumVisibleMs ?? MINIMUM_REFRESH_MS;

  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  const onRefresh = useCallback(async () => {
    if (refreshingRef.current) {
      return;
    }

    const startedAt = Date.now();
    refreshingRef.current = true;
    setRefreshing(true);

    try {
      if (!isLoading) {
        const refetchPromise = Promise.resolve().then(() => refetch());
        const timeoutPromise = wait(MAXIMUM_REFRESH_MS);
        void refetchPromise.catch(() => undefined);

        await Promise.race([refetchPromise, timeoutPromise]);
      }
    } catch {
      // React Query keeps the request error in query state; the refresh affordance should close.
    } finally {
      const elapsedMs = Date.now() - startedAt;
      await wait(Math.max(0, minimumVisibleMs - elapsedMs));
      refreshingRef.current = false;
      if (mountedRef.current) {
        setRefreshing(false);
      }
    }
  }, [isLoading, minimumVisibleMs, refetch]);

  return useMemo(
    () => ({
      label: 'Sincronizando',
      nativeIndicatorVisible: options.nativeIndicatorVisible,
      onRefresh,
      progressViewOffset: options.progressViewOffset,
      refreshing,
    }),
    [onRefresh, options.nativeIndicatorVisible, options.progressViewOffset, refreshing],
  );
}
