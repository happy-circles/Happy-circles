import { queryClient } from '../query-client';
import { hydrateSignedAvatarUrlCache } from '../avatar';
import { prefetchCriticalAvatarImages, scheduleDeferredAvatarPrefetch } from '../avatar-prefetch';
import { buildLiveSnapshot } from './build-snapshot';
import { createSnapshotAbortSignal, invokeSupabaseFunction } from './client';
import { APP_SNAPSHOT_QUERY_KEY } from './constants';
import { persistCachedAppSnapshot } from './snapshot-cache';
import type { AppSnapshot, LiveSnapshotRows } from './types';

async function fetchPrefetchedAppSnapshot(
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
    scheduleDeferredAvatarPrefetch(snapshot);
    void persistCachedAppSnapshot(currentUserId, snapshot, rows.avatarSignedUrlsByPath).catch(
      () => undefined,
    );

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

export async function prefetchAppSnapshot(userId: string) {
  await queryClient.prefetchQuery({
    queryKey: [APP_SNAPSHOT_QUERY_KEY, userId] as const,
    staleTime: 60_000,
    queryFn: ({ signal }) => fetchPrefetchedAppSnapshot(userId, signal),
  });
}
