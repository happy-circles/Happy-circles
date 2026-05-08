import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useSession } from '@/providers/session-provider';
import { hydrateSignedAvatarUrlCache } from '../avatar';
import { prefetchCriticalAvatarImages } from '../avatar-prefetch';
import { reportAndCreateSupportError } from '../support-errors';
import { buildLiveSnapshot } from './build-snapshot';
import { createSnapshotAbortSignal, invokeSupabaseFunction } from './client';
import { APP_SNAPSHOT_QUERY_KEY } from './constants';
import { persistCachedAppSnapshot, readCachedAppSnapshot } from './snapshot-cache';
import type { AppSnapshot, LiveSnapshotRows } from './types';

interface CacheRestoreState {
  readonly didRestore: boolean;
  readonly status: 'idle' | 'restored' | 'restoring';
  readonly userId: string | null;
}

async function fetchLiveSnapshot(
  currentUserId: string,
  requestSignal?: AbortSignal,
): Promise<AppSnapshot> {
  const snapshotAbort = createSnapshotAbortSignal(requestSignal);

  try {
    const rowsPromise = invokeSupabaseFunction<Record<string, never>, LiveSnapshotRows>(
      'get-app-snapshot',
      {},
    );
    void rowsPromise.catch(() => undefined);

    const rows = await Promise.race([rowsPromise, snapshotAbort.timeoutPromise]);

    if (snapshotAbort.wasTimedOut()) {
      throw new Error('La sincronizacion tardo demasiado. Revisa tu conexion e intenta de nuevo.');
    }

    if (requestSignal?.aborted) {
      throw new Error('Sincronizacion cancelada.');
    }

    hydrateSignedAvatarUrlCache(rows.avatarSignedUrlsByPath);

    const snapshot = buildLiveSnapshot({
      ...rows,
      currentUserId,
    });
    void prefetchCriticalAvatarImages(snapshot).catch(() => undefined);
    void persistCachedAppSnapshot(
      currentUserId,
      snapshot,
      rows.avatarSignedUrlsByPath,
    ).catch(() => undefined);

    return snapshot;
  } catch (error) {
    if (snapshotAbort.wasTimedOut()) {
      throw new Error('La sincronizacion tardo demasiado. Revisa tu conexion e intenta de nuevo.');
    }

    if (requestSignal?.aborted) {
      throw new Error('Sincronizacion cancelada.');
    }

    throw error;
  } finally {
    snapshotAbort.cleanup();
  }
}

async function fetchAppSnapshot(userId: string | null, signal?: AbortSignal) {
  if (!userId) {
    throw new Error('No hay una sesion lista para cargar datos.');
  }

  try {
    return await fetchLiveSnapshot(userId, signal);
  } catch (error) {
    throw reportAndCreateSupportError({
      error,
      fallbackMessage: 'No pudimos sincronizar tus datos.',
      kind: 'data_sync',
      metadata: { operation: 'fetch_app_snapshot' },
    });
  }
}

export function useAppSnapshot() {
  const { userId } = useSession();
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => [APP_SNAPSHOT_QUERY_KEY, userId ?? 'signed-out'] as const,
    [userId],
  );
  const [cacheRestore, setCacheRestore] = useState<CacheRestoreState>({
    didRestore: false,
    status: 'idle',
    userId: null,
  });
  const [hasLiveData, setHasLiveData] = useState(false);

  useEffect(() => {
    let cancelled = false;

    setHasLiveData(false);

    if (!userId) {
      setCacheRestore({
        didRestore: false,
        status: 'restored',
        userId: null,
      });
      return () => {
        cancelled = true;
      };
    }

    setCacheRestore({
      didRestore: false,
      status: 'restoring',
      userId,
    });

    void readCachedAppSnapshot(userId)
      .then((cachedSnapshot) => {
        if (cancelled) {
          return;
        }

        const existingSnapshot = queryClient.getQueryData<AppSnapshot>(queryKey);
        if (cachedSnapshot) {
          hydrateSignedAvatarUrlCache(cachedSnapshot.avatarSignedUrlsByPath);
          if (!existingSnapshot) {
            queryClient.setQueryData(queryKey, cachedSnapshot.snapshot, {
              updatedAt: Date.parse(cachedSnapshot.updatedAt) || 0,
            });
          }
          void prefetchCriticalAvatarImages(cachedSnapshot.snapshot, 700).catch(() => undefined);
        }

        setCacheRestore({
          didRestore: Boolean(cachedSnapshot),
          status: 'restored',
          userId,
        });
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setCacheRestore({
          didRestore: false,
          status: 'restored',
          userId,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [queryClient, queryKey, userId]);

  const cacheRestoreComplete =
    cacheRestore.status === 'restored' && cacheRestore.userId === (userId ?? null);

  const query = useQuery({
    queryKey,
    enabled: Boolean(userId),
    queryFn: async ({ signal }) => {
      const snapshot = await fetchAppSnapshot(userId, signal);
      setHasLiveData(true);
      return snapshot;
    },
  });

  return {
    ...query,
    hasLiveData,
    isRestoringCache: Boolean(userId) && !query.data && !cacheRestoreComplete,
    isShowingCachedData: Boolean(query.data && cacheRestore.didRestore && !hasLiveData),
  };
}
