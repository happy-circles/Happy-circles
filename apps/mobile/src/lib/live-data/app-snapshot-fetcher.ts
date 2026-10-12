import { hydrateSignedAvatarUrlCache } from '../avatar';
import { prefetchCriticalAvatarImages, scheduleDeferredAvatarPrefetch } from '../avatar-prefetch';
import { recordSnapshotNetworkResolved } from '../performance-metrics';
import { appConfig } from '../config';
import { reportAndCreateSupportError } from '../support-errors';
import { buildPeopleOverviewFromAppSnapshot } from './build-people-overview';
import { buildLiveSnapshot } from './build-snapshot';
import { assertSupabaseClient, createSnapshotAbortSignal, invokeSupabaseFunction } from './client';
import { persistCachedPeopleOverview } from './people-overview-cache';
import { persistCachedAppSnapshot } from './snapshot-cache';
import { readCachedHistory, persistCachedHistory, withHistorySyncLock } from './history-sync-cache';
import { synchronizeHistorySnapshot } from './history-sync-runner';
import type { AppSnapshot, LiveSnapshotRows } from './types';

async function fetchLiveSnapshot(
  currentUserId: string,
  requestSignal?: AbortSignal,
): Promise<AppSnapshot> {
  return withHistorySyncLock(currentUserId, appConfig.supabaseUrl, () =>
    fetchLiveSnapshotLocked(currentUserId, requestSignal),
  );
}

async function assertCurrentActor(currentUserId: string, signal?: AbortSignal) {
  if (signal?.aborted) throw new Error('Sincronización cancelada.');
  const { data } = await assertSupabaseClient().auth.getSession();
  if (data.session?.user.id !== currentUserId)
    throw new Error('La sesión cambió. Vuelve a consultar el estado.');
}

async function fetchLiveSnapshotLocked(
  currentUserId: string,
  requestSignal?: AbortSignal,
): Promise<AppSnapshot> {
  const fetchStartedAt = Date.now();

  try {
    const scope = appConfig.supabaseUrl;
    const rows = await synchronizeHistorySnapshot({
      read: () => readCachedHistory(currentUserId, scope),
      persist: (state) => persistCachedHistory(currentUserId, scope, state),
      signal: requestSignal,
      request: async (cursor) => {
        // Bound each page independently. A large first download can resume
        // from its last durable page without one global timeout discarding it.
        const snapshotAbort = createSnapshotAbortSignal(requestSignal);
        try {
          const rowsPromise = invokeSupabaseFunction<Record<string, unknown>, LiveSnapshotRows>(
            'get-app-snapshot',
            { historySync: { protocol: 1, cursor, pageSize: 250 } },
            { expectedUserId: currentUserId },
          );
          return await Promise.race([rowsPromise, snapshotAbort.timeoutPromise]);
        } finally {
          snapshotAbort.cleanup();
        }
      },
    });

    await assertCurrentActor(currentUserId, requestSignal);

    hydrateSignedAvatarUrlCache(rows.avatarSignedUrlsByPath);

    const snapshot = buildLiveSnapshot({
      ...rows,
      currentUserId,
    });
    const peopleOverview = buildPeopleOverviewFromAppSnapshot(snapshot, rows.fetchedAt);
    try {
      await persistCachedPeopleOverview(currentUserId, peopleOverview, rows.avatarSignedUrlsByPath);
    } catch (cacheError) {
      console.warn(
        'Failed to persist people overview from app snapshot',
        cacheError instanceof Error ? cacheError.message : String(cacheError),
      );
    }
    void prefetchCriticalAvatarImages(snapshot).catch(() => undefined);
    scheduleDeferredAvatarPrefetch(snapshot);
    await persistCachedAppSnapshot(currentUserId, snapshot, rows.avatarSignedUrlsByPath).catch(
      () => undefined,
    );
    await assertCurrentActor(currentUserId, requestSignal);
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

    if (requestSignal?.aborted) {
      throw new Error('Sincronizacion cancelada.');
    }

    throw error;
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
