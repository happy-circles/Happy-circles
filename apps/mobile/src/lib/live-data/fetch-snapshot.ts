import { useQuery } from '@tanstack/react-query';

import { useSession } from '@/providers/session-provider';
import { reportAndCreateSupportError } from '../support-errors';
import { buildLiveSnapshot } from './build-snapshot';
import { createSnapshotAbortSignal, invokeSupabaseFunction } from './client';
import { APP_SNAPSHOT_QUERY_KEY } from './constants';
import type { AppSnapshot, LiveSnapshotRows } from './types';

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

    return buildLiveSnapshot({
      ...rows,
      currentUserId,
    });
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

  return useQuery({
    queryKey: [APP_SNAPSHOT_QUERY_KEY, userId ?? 'signed-out'],
    enabled: Boolean(userId),
    queryFn: ({ signal }) => fetchAppSnapshot(userId, signal),
  });
}
