import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { triggerAppRefreshStartHaptic } from './app-haptics';

const MINIMUM_REFRESH_MS = 700;
const MAXIMUM_REFRESH_MS = 8_000;
const REFRESHING_FALLBACK_MS = MAXIMUM_REFRESH_MS + MINIMUM_REFRESH_MS + 300;

interface SnapshotRefreshTarget {
  readonly isLoading: boolean;
  readonly refetch: () => Promise<unknown>;
}

interface SnapshotRefreshOptions {
  readonly minimumVisibleMs?: number;
  readonly nativeIndicatorVisible?: boolean;
  readonly nativeIndicatorTopInset?: number;
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
    let fallbackTimeout: ReturnType<typeof setTimeout> | undefined;
    const completeRefresh = () => {
      refreshingRef.current = false;
      if (mountedRef.current) {
        setRefreshing(false);
      }
    };

    refreshingRef.current = true;
    triggerAppRefreshStartHaptic();
    setRefreshing(true);
    fallbackTimeout = setTimeout(completeRefresh, REFRESHING_FALLBACK_MS);

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
      if (fallbackTimeout) {
        clearTimeout(fallbackTimeout);
      }
      const elapsedMs = Date.now() - startedAt;
      await wait(Math.max(0, minimumVisibleMs - elapsedMs));
      completeRefresh();
    }
  }, [isLoading, minimumVisibleMs, refetch]);

  return useMemo(
    () => ({
      label: 'Sincronizando',
      nativeIndicatorVisible: options.nativeIndicatorVisible,
      nativeIndicatorTopInset: options.nativeIndicatorTopInset,
      onRefresh,
      progressViewOffset: options.progressViewOffset,
      refreshing,
    }),
    [
      onRefresh,
      options.nativeIndicatorTopInset,
      options.nativeIndicatorVisible,
      options.progressViewOffset,
      refreshing,
    ],
  );
}
