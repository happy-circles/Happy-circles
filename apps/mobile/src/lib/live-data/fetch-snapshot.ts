import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useSession } from '@/providers/session-provider';
import { recordBackgroundRefetchFailed } from '../performance-metrics';
import { useAppSnapshotCacheHydration } from './app-snapshot-cache-provider';
import { fetchAppSnapshotForUser } from './app-snapshot-fetcher';
import { APP_SNAPSHOT_QUERY_KEY } from './constants';

export function useAppSnapshot() {
  const { userId } = useSession();
  const cacheHydration = useAppSnapshotCacheHydration();
  const queryKey = useMemo(
    () => [APP_SNAPSHOT_QUERY_KEY, userId ?? 'signed-out'] as const,
    [userId],
  );

  const query = useQuery({
    queryKey,
    enabled: Boolean(userId),
    staleTime: 60_000,
    queryFn: async ({ signal }) => fetchAppSnapshotForUser(userId, signal),
  });
  const hasLiveData = Boolean(
    query.data &&
      (!cacheHydration.cacheUpdatedAtMs ||
        (query.dataUpdatedAt && query.dataUpdatedAt > cacheHydration.cacheUpdatedAtMs + 1)),
  );

  useEffect(() => {
    if (!query.error || !query.data) {
      return;
    }

    recordBackgroundRefetchFailed({
      error: query.error,
      snapshotVersion: cacheHydration.snapshotVersion,
    });
  }, [cacheHydration.snapshotVersion, query.data, query.error]);

  return {
    ...query,
    hasCachedData: cacheHydration.hasCachedData,
    hasLiveData,
    isRestoringCache: Boolean(userId) && !query.data && cacheHydration.isRestoringCache,
    isShowingCachedData: Boolean(query.data && cacheHydration.didRestore && !hasLiveData),
    lastCacheUpdatedAt: cacheHydration.cacheUpdatedAt,
    networkStatus:
      query.fetchStatus === 'fetching'
        ? 'fetching'
        : query.error
          ? 'error'
          : query.data
            ? 'success'
            : cacheHydration.networkStatus,
    snapshotVersion: cacheHydration.snapshotVersion,
  };
}
