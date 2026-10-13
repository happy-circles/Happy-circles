import { hydrateSignedAvatarUrlCache } from '../avatar';
import { queryClient } from '../query-client';
import { prefetchCriticalAvatarImages, scheduleDeferredAvatarPrefetch } from '../avatar-prefetch';
import { recordSnapshotNetworkResolved } from '../performance-metrics';
import { appConfig } from '../config';
import { reportAndCreateSupportError } from '../support-errors';
import { buildPeopleOverviewFromAppSnapshot } from './build-people-overview';
import { buildLiveSnapshot } from './build-snapshot';
import { assertSupabaseClient, createSnapshotAbortSignal, invokeSupabaseFunction } from './client';
import { persistCachedPeopleOverview } from './people-overview-cache';
import { readCachedAppSnapshot, persistCachedAppSnapshot } from './snapshot-cache';
import {
  readCachedHistory,
  readCachedHistoryReceipt,
  persistCachedHistory,
  withHistorySyncLock,
} from './history-sync-cache';
import type { HistoryCacheReceipt } from './history-cache-receipt';
import { APP_SNAPSHOT_QUERY_KEY } from './constants';
import { applyConfirmedRequestOverlay } from './confirmed-request-overlay';
import { emptyHistorySyncState } from './history-sync';
import { synchronizeHistorySnapshot } from './history-sync-runner';
import {
  acceptedProjectionResponse,
  mergeAcceptedProjectionResponses,
  reconcileAcceptedProjection,
  type AcceptedProjectionResponse,
} from './accepted-request-projection';
import type { AppSnapshot, FinancialRequestRow, LiveSnapshotRows } from './types';

function hasUnobservedConfirmedRows(
  snapshot: AppSnapshot | undefined,
  canonical: readonly FinancialRequestRow[],
  scope: string,
  userId: string,
): boolean {
  const outcomes = snapshot?.confirmedRequestOutcomes;
  if (
    outcomes?.backendScope === scope &&
    outcomes.userId === userId &&
    outcomes.outcomes.some(
      (outcome) =>
        !canonical.some((row) => row.id === outcome.requestId && row.status === outcome.status),
    )
  )
    return true;
  const overlay = snapshot?.confirmedFinancialRequests;
  if (!overlay || overlay.backendScope !== scope) return false;
  const byId = new Map(canonical.map((row) => [row.id, row]));
  const immutableFields = [
    'relationship_id',
    'request_type',
    'creator_user_id',
    'responder_user_id',
    'debtor_user_id',
    'creditor_user_id',
    'amount_minor',
    'currency_code',
    'description',
    'category',
    'parent_request_id',
    'target_ledger_transaction_id',
    'request_case_id',
    'version_number',
    'created_at',
  ] as const;
  return overlay.rows.some((confirmed) => {
    const current = byId.get(confirmed.id);
    if (!current) return true;
    const currentAt = Date.parse(current.updated_at);
    const confirmedAt = Date.parse(confirmed.updated_at);
    return (
      !Number.isFinite(currentAt) ||
      !Number.isFinite(confirmedAt) ||
      currentAt < confirmedAt ||
      (confirmed.status !== 'pending' && current.status !== confirmed.status) ||
      immutableFields.some(
        (field) => confirmed[field] !== undefined && current[field] !== confirmed[field],
      )
    );
  });
}

function acceptedProjectionFallbacks(
  snapshot: AppSnapshot | undefined,
  userId: string,
  scope: string,
): AcceptedProjectionResponse[] {
  const overlay = snapshot?.confirmedAcceptedProjections;
  return overlay?.backendScope === scope && overlay.userId === userId
    ? overlay.responses.flatMap((response) => {
        const sanitized = acceptedProjectionResponse(response, userId);
        return sanitized ? [sanitized] : [];
      })
    : [];
}

function hasUnobservedAcceptedProjection(
  snapshot: AppSnapshot | undefined,
  rows: LiveSnapshotRows,
  userId: string,
  scope: string,
): boolean {
  return acceptedProjectionFallbacks(snapshot, userId, scope).some((response) => {
    const projection = response.acceptedProjection;
    const ledger = rows.history.find(
      (row) =>
        row.item_kind === 'ledger_transaction' &&
        row.item_id === response.ledgerTransactionId &&
        row.relationship_id === projection.relationshipId,
    );
    const fullAt = Date.parse(rows.fetchedAt);
    const partialAt = Date.parse(
      rows.acceptedProjectionObservedAtByRelationshipId?.[projection.relationshipId] ?? '',
    );
    const requiredAt = Date.parse(projection.observedAt);
    return (
      !ledger ||
      ledger.origin_request_id !== response.requestId ||
      ledger.amount_minor !== projection.history.amount_minor ||
      ledger.debtor_user_id !== projection.history.debtor_user_id ||
      ledger.creditor_user_id !== projection.history.creditor_user_id ||
      !(
        (Number.isFinite(fullAt) && fullAt >= requiredAt) ||
        (Number.isFinite(partialAt) && partialAt >= requiredAt)
      )
    );
  });
}

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
    const durableReceipt: { value: HistoryCacheReceipt | null } = { value: null };
    const projectionFallbacks: { value: readonly AcceptedProjectionResponse[] } = { value: [] };
    const rows = await synchronizeHistorySnapshot({
      read: async () => {
        const state = (await readCachedHistory(currentUserId, scope)) ?? emptyHistorySyncState();
        const memory = queryClient.getQueryData<AppSnapshot>([
          APP_SNAPSHOT_QUERY_KEY,
          currentUserId,
        ]);
        const cached = await readCachedAppSnapshot(currentUserId).catch(() => null);
        projectionFallbacks.value = mergeAcceptedProjectionResponses(
          acceptedProjectionFallbacks(cached?.snapshot, currentUserId, scope),
          acceptedProjectionFallbacks(memory, currentUserId, scope),
        );
        return applyConfirmedRequestOverlay(
          applyConfirmedRequestOverlay(state, cached?.snapshot, currentUserId, scope),
          memory,
          currentUserId,
          scope,
        );
      },
      persist: async (state) => {
        durableReceipt.value = await persistCachedHistory(currentUserId, scope, state);
      },
      reconcile: (state) =>
        projectionFallbacks.value.reduce(
          (previous, response) => reconcileAcceptedProjection(previous, response, currentUserId),
          state,
        ),
      signal: requestSignal,
      request: async (cursor) => {
        // Bound each page independently. A large first download can resume
        // from its last durable page without one global timeout discarding it.
        const snapshotAbort = createSnapshotAbortSignal(requestSignal);
        try {
          const rowsPromise = invokeSupabaseFunction<Record<string, unknown>, LiveSnapshotRows>(
            'get-app-snapshot',
            { historySync: { protocol: 1, cursor, pageSize: 250 } },
            {
              expectedUserId: currentUserId,
              ...(snapshotAbort.signal ? { signal: snapshotAbort.signal } : {}),
            },
          );
          return await Promise.race([rowsPromise, snapshotAbort.timeoutPromise]);
        } finally {
          snapshotAbort.cleanup();
        }
      },
    });

    await assertCurrentActor(currentUserId, requestSignal);

    hydrateSignedAvatarUrlCache(rows.avatarSignedUrlsByPath);

    const snapshot: AppSnapshot = {
      ...buildLiveSnapshot({ ...rows, currentUserId }),
      ...(durableReceipt.value ? { localHistoryCache: durableReceipt.value } : {}),
    };
    void prefetchCriticalAvatarImages(snapshot).catch(() => undefined);
    scheduleDeferredAvatarPrefetch(snapshot);
    await assertCurrentActor(currentUserId, requestSignal);

    // Queue before releasing the raw journal lock, but let the screen receive
    // its confirmed snapshot without waiting for these rebuildable copies.
    const receipt = durableReceipt.value;
    void withHistorySyncLock(currentUserId, scope, async () => {
      await assertCurrentActor(currentUserId);
      const currentReceipt = await readCachedHistoryReceipt(currentUserId, scope);
      if (receipt?.generation && currentReceipt?.generation !== receipt.generation) return;
      const memory = queryClient.getQueryData<AppSnapshot>([APP_SNAPSHOT_QUERY_KEY, currentUserId]);
      if (hasUnobservedConfirmedRows(memory, rows.financialRequests, scope, currentUserId)) return;
      if (hasUnobservedAcceptedProjection(memory, rows, currentUserId, scope)) return;
      const cached = await readCachedAppSnapshot(currentUserId).catch(() => null);
      // A command queued ahead of us may have only its fallback derived
      // acknowledgement durable. Preserve it if the raw write failed.
      if (
        hasUnobservedConfirmedRows(cached?.snapshot, rows.financialRequests, scope, currentUserId)
      )
        return;
      if (hasUnobservedAcceptedProjection(cached?.snapshot, rows, currentUserId, scope)) return;
      const peopleOverview = buildPeopleOverviewFromAppSnapshot(snapshot, rows.fetchedAt);
      await persistCachedPeopleOverview(
        currentUserId,
        peopleOverview,
        rows.avatarSignedUrlsByPath,
      ).catch((cacheError: unknown) => {
        console.warn(
          'Failed to persist people overview from app snapshot',
          cacheError instanceof Error ? cacheError.message : String(cacheError),
        );
      });
      await persistCachedAppSnapshot(currentUserId, snapshot, rows.avatarSignedUrlsByPath).catch(
        () => undefined,
      );
    }).catch(() => undefined);
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
