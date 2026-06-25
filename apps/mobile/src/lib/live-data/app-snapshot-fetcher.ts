import { hydrateSignedAvatarUrlCache } from '../avatar';
import { prefetchCriticalAvatarImages, scheduleDeferredAvatarPrefetch } from '../avatar-prefetch';
import { recordSnapshotNetworkResolved } from '../performance-metrics';
import { reportAndCreateSupportError } from '../support-errors';
import { buildPeopleOverviewFromAppSnapshot } from './build-people-overview';
import { buildLiveSnapshot } from './build-snapshot';
import { createSnapshotAbortSignal, invokeSupabaseFunction } from './client';
import { persistCachedPeopleOverview } from './people-overview-cache';
import { persistCachedAppSnapshot } from './snapshot-cache';
import type { AppSnapshot, LiveSnapshotRows } from './types';

async function fetchLiveSnapshot(
  currentUserId: string,
  requestSignal?: AbortSignal,
): Promise<AppSnapshot> {
  const snapshotAbort = createSnapshotAbortSignal(requestSignal);
  const fetchStartedAt = Date.now();

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
    const peopleOverview = buildPeopleOverviewFromAppSnapshot(snapshot, rows.fetchedAt);
    try {
      await persistCachedPeopleOverview(
        currentUserId,
        peopleOverview,
        rows.avatarSignedUrlsByPath,
      );
    } catch (cacheError) {
      console.warn(
        'Failed to persist people overview from app snapshot',
        cacheError instanceof Error ? cacheError.message : String(cacheError),
      );
    }
    void prefetchCriticalAvatarImages(snapshot).catch(() => undefined);
    scheduleDeferredAvatarPrefetch(snapshot);
    void persistCachedAppSnapshot(currentUserId, snapshot, rows.avatarSignedUrlsByPath).catch(
      () => undefined,
    );
    recordSnapshotNetworkResolved({
      durationMs: Date.now() - fetchStartedAt,
      snapshotVersion: new Date().toISOString(),
      status: 'success',
    });

    return snapshot;
  } catch (error) {
    recordSnapshotNetworkResolved({
      durationMs: Date.now() - fetchStartedAt,
      status: 'error',
    });

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

export async function fetchAppSnapshotForUser(userId: string | null, signal?: AbortSignal) {
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
