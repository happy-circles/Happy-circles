import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { hydrateSignedAvatarUrlCache } from '../avatar';
import { prefetchCriticalAvatarImages, scheduleDeferredAvatarPrefetch } from '../avatar-prefetch';
import {
  recordSnapshotCacheRestored,
} from '../performance-metrics';
import { useSession } from '@/providers/session-provider';
import { APP_SNAPSHOT_QUERY_KEY } from './constants';
import { readCachedAppSnapshot } from './snapshot-cache';
import type { AppSnapshot } from './types';

interface AppSnapshotCacheHydrationState {
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
  const queryClient = useQueryClient();
  const [state, setState] = useState<AppSnapshotCacheHydrationState>(
    DEFAULT_CACHE_HYDRATION_STATE,
  );
  const queryKey = useMemo(
    () => [APP_SNAPSHOT_QUERY_KEY, userId ?? 'signed-out'] as const,
    [userId],
  );

  useEffect(() => {
    let cancelled = false;
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
      if (cancelled) {
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

    void readCachedAppSnapshot(userId)
      .then((cachedSnapshot) => {
        if (cancelled) {
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
        if (cancelled) {
          return;
        }

        clearTimeout(restoreTimeout);
        setState({
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
  }, [queryClient, queryKey, userId]);

  return (
    <AppSnapshotCacheHydrationContext.Provider value={state}>
      {children}
    </AppSnapshotCacheHydrationContext.Provider>
  );
}

export function useAppSnapshotCacheHydration(): AppSnapshotCacheHydrationState {
  return useContext(AppSnapshotCacheHydrationContext);
}
