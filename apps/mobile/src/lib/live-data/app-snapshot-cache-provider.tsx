import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { hydrateSignedAvatarUrlCache } from '../avatar';
import { isSessionDataGenerationCurrent, useSessionDataGeneration } from '../session-data-boundary';
import { prefetchCriticalAvatarImages, scheduleDeferredAvatarPrefetch } from '../avatar-prefetch';
import { recordSnapshotCacheRestored } from '../performance-metrics';
import { useSession } from '@/providers/session-provider';
import { APP_SNAPSHOT_QUERY_KEY } from './constants';
import { appConfig } from '../config';
import { buildLiveSnapshot } from './build-snapshot';
import { readCachedHistory, readCachedHistoryReceipt } from './history-sync-cache';
import { readCachedAppSnapshot } from './snapshot-cache';
import { restoreCachedAppSnapshot } from './app-snapshot-hydration';
import type { AppSnapshot } from './types';

interface AppSnapshotCacheHydrationState {
  readonly generation: number;
  readonly cacheUpdatedAt: string | null;
  readonly cacheUpdatedAtMs: number | null;
  readonly didRestore: boolean;
  readonly hasCachedData: boolean;
  readonly isRestoringCache: boolean;
  readonly networkStatus: 'idle' | 'fetching' | 'success' | 'error';
  readonly snapshotVersion: string | null;
  readonly userId: string | null;
}

const DEFAULT_CACHE_HYDRATION_STATE: AppSnapshotCacheHydrationState = {
  generation: -1,
  cacheUpdatedAt: null,
  cacheUpdatedAtMs: null,
  didRestore: false,
  hasCachedData: false,
  isRestoringCache: false,
  networkStatus: 'idle',
  snapshotVersion: null,
  userId: null,
};

const AppSnapshotCacheHydrationContext = createContext<AppSnapshotCacheHydrationState>(
  DEFAULT_CACHE_HYDRATION_STATE,
);

const SNAPSHOT_CACHE_RESTORE_SOFT_TIMEOUT_MS = 1_200;

function parsedUpdatedAt(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function AppSnapshotCacheProvider({ children }: PropsWithChildren) {
  const { userId } = useSession();
  const generation = useSessionDataGeneration();
  const queryClient = useQueryClient();
  const [state, setState] = useState<AppSnapshotCacheHydrationState>(DEFAULT_CACHE_HYDRATION_STATE);
  const queryKey = useMemo(
    () => [APP_SNAPSHOT_QUERY_KEY, userId ?? 'signed-out'] as const,
    [userId],
  );

  useEffect(() => {
    let cancelled = false;
    const isCurrent = () => !cancelled && isSessionDataGenerationCurrent(generation);
    let cancelDeferredAvatarPrefetch: (() => void) | null = null;
    const restoreStartedAt = Date.now();

    if (!userId) {
      setState(DEFAULT_CACHE_HYDRATION_STATE);
      return () => {
        cancelled = true;
        cancelDeferredAvatarPrefetch?.();
      };
    }

    setState({
      generation,
      cacheUpdatedAt: null,
      cacheUpdatedAtMs: null,
      didRestore: false,
      hasCachedData: false,
      isRestoringCache: true,
      networkStatus: 'idle',
      snapshotVersion: null,
      userId,
    });

    const restoreTimeout = setTimeout(() => {
      if (!isCurrent()) {
        return;
      }

      setState((current) =>
        current.isRestoringCache && current.userId === userId
          ? {
              ...current,
              isRestoringCache: false,
            }
          : current,
      );
    }, SNAPSHOT_CACHE_RESTORE_SOFT_TIMEOUT_MS);

    void restoreCachedAppSnapshot({
      userId,
      backendScope: appConfig.supabaseUrl,
      readDerived: () => readCachedAppSnapshot(userId),
      readReceipt: () => readCachedHistoryReceipt(userId, appConfig.supabaseUrl),
      readHistory: () => readCachedHistory(userId, appConfig.supabaseUrl),
      canRestore: () => isCurrent() && !queryClient.getQueryData<AppSnapshot>(queryKey),
      buildSnapshot: (rows) => {
        hydrateSignedAvatarUrlCache(rows.avatarSignedUrlsByPath);
        return {
          snapshot: buildLiveSnapshot({ ...rows, currentUserId: userId }),
          updatedAt: rows.fetchedAt,
          avatarSignedUrlsByPath: rows.avatarSignedUrlsByPath,
        };
      },
    })
      .then((cachedSnapshot) => {
        if (!isCurrent()) {
          return;
        }

        clearTimeout(restoreTimeout);

        if (cachedSnapshot) {
          const existingSnapshot = queryClient.getQueryData<AppSnapshot>(queryKey);
          hydrateSignedAvatarUrlCache(cachedSnapshot.avatarSignedUrlsByPath);

          if (!existingSnapshot) {
            queryClient.setQueryData(queryKey, cachedSnapshot.snapshot, {
              updatedAt: parsedUpdatedAt(cachedSnapshot.updatedAt) ?? 0,
            });
          }

          void prefetchCriticalAvatarImages(cachedSnapshot.snapshot, 700).catch(() => undefined);
          cancelDeferredAvatarPrefetch = scheduleDeferredAvatarPrefetch(cachedSnapshot.snapshot);
        }

        const cacheUpdatedAt = cachedSnapshot?.updatedAt ?? null;
        const nextState: AppSnapshotCacheHydrationState = {
          generation,
          cacheUpdatedAt,
          cacheUpdatedAtMs: parsedUpdatedAt(cacheUpdatedAt),
          didRestore: Boolean(cachedSnapshot),
          hasCachedData: Boolean(cachedSnapshot),
          isRestoringCache: false,
          networkStatus: 'idle',
          snapshotVersion: cacheUpdatedAt,
          userId,
        };

        setState(nextState);
        recordSnapshotCacheRestored({
          cacheHit: nextState.hasCachedData,
          durationMs: Date.now() - restoreStartedAt,
          updatedAt: cacheUpdatedAt,
        });
      })
      .catch(() => {
        if (!isCurrent()) {
          return;
        }

        clearTimeout(restoreTimeout);
        setState({
          generation,
          cacheUpdatedAt: null,
          cacheUpdatedAtMs: null,
          didRestore: false,
          hasCachedData: false,
          isRestoringCache: false,
          networkStatus: 'idle',
          snapshotVersion: null,
          userId,
        });
        recordSnapshotCacheRestored({
          cacheHit: false,
          durationMs: Date.now() - restoreStartedAt,
          updatedAt: null,
        });
      });

    return () => {
      cancelled = true;
      clearTimeout(restoreTimeout);
      cancelDeferredAvatarPrefetch?.();
    };
  }, [queryClient, queryKey, userId, generation]);

  return (
    <AppSnapshotCacheHydrationContext.Provider
      value={
        state.generation === generation
          ? state
          : {
              ...DEFAULT_CACHE_HYDRATION_STATE,
              generation,
              userId,
              isRestoringCache: Boolean(userId),
            }
      }
    >
      {children}
    </AppSnapshotCacheHydrationContext.Provider>
  );
}

export function useAppSnapshotCacheHydration(): AppSnapshotCacheHydrationState {
  return useContext(AppSnapshotCacheHydrationContext);
}
