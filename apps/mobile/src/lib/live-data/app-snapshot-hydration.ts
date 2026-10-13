import {
  applyConfirmedRequestOverlay,
  cachedSnapshotMatchesBackend,
} from './confirmed-request-overlay';
import { reconcileDerivedSnapshot } from './confirmed-sender-request-state';
import { mergeHistoryWithLiveRows, type HistorySyncState } from './history-sync';
import type { HistoryCacheReceipt } from './history-cache-receipt';
import type { CachedAppSnapshot } from './snapshot-cache';
import type { LiveSnapshotRows } from './types';
import { suppressConfirmedRequestOutcomes } from './confirmed-request-outcomes';

type SnapshotHydrationPlan =
  | { readonly kind: 'derived'; readonly cached: CachedAppSnapshot }
  | { readonly kind: 'raw'; readonly rows: LiveSnapshotRows }
  | { readonly kind: 'empty' };

/** A derived view is safe to display early only for the exact durable raw commit. */
export function canRestoreDerivedSnapshotImmediately(
  cached: CachedAppSnapshot | null,
  receipt: HistoryCacheReceipt | null,
  userId: string,
  backendScope: string,
): boolean {
  const saved = cached?.snapshot.localHistoryCache;
  return Boolean(
    cached &&
    cachedSnapshotMatchesBackend(cached.snapshot, backendScope) &&
    (!cached.snapshot.confirmedRequestOutcomes ||
      cached.snapshot.confirmedRequestOutcomes.userId === userId) &&
    (!cached.snapshot.confirmedAcceptedProjections ||
      cached.snapshot.confirmedAcceptedProjections.userId === userId) &&
    receipt?.generation &&
    saved?.generation === receipt.generation &&
    saved.userId === userId &&
    receipt.userId === userId &&
    saved.backendScope === backendScope &&
    receipt.backendScope === backendScope &&
    saved.bootstrapComplete &&
    receipt.bootstrapComplete &&
    saved.cursor === receipt.cursor &&
    saved.fetchedAt === receipt.fetchedAt,
  );
}

interface SnapshotCacheRestoreOperations {
  readonly userId: string;
  readonly backendScope: string;
  readonly readDerived: () => Promise<CachedAppSnapshot | null>;
  readonly readReceipt: () => Promise<HistoryCacheReceipt | null>;
  readonly readHistory: () => Promise<HistorySyncState | null>;
  readonly buildSnapshot: (rows: LiveSnapshotRows) => CachedAppSnapshot;
  /** Cancels late restore work after an account switch or a newer query/command. */
  readonly canRestore: () => boolean;
}

export async function restoreCachedAppSnapshot(
  operations: SnapshotCacheRestoreOperations,
): Promise<CachedAppSnapshot | null> {
  const [cached, receipt] = await Promise.all([
    operations.readDerived().catch(() => null),
    operations.readReceipt().catch(() => null),
  ]);
  if (!operations.canRestore()) return null;
  if (
    canRestoreDerivedSnapshotImmediately(
      cached,
      receipt,
      operations.userId,
      operations.backendScope,
    )
  ) {
    // The network reader restores the raw journal in the background. Avoid
    // parsing and rebuilding that same history on the path to first display.
    return cached;
  }

  // Older caches and a derived write interrupted after the raw commit must
  // reconcile from the journal before displaying actionable pending items.
  const history = await operations.readHistory().catch(() => null);
  if (!operations.canRestore()) return null;
  // A known newer raw commit cannot fall back to its older derived view when
  // reading the journal fails; that could resurrect a closed request.
  const fallback = receipt?.generation && !history ? null : cached;
  const plan = prepareSnapshotCacheHydration(
    history,
    fallback,
    operations.userId,
    operations.backendScope,
  );
  if (plan.kind === 'derived') return plan.cached;
  if (plan.kind === 'raw') return operations.buildSnapshot(plan.rows);
  return null;
}

export function prepareSnapshotCacheHydration(
  historyState: HistorySyncState | null,
  cached: CachedAppSnapshot | null,
  userId: string,
  backendScope: string,
): SnapshotHydrationPlan {
  const derived =
    cached &&
    cachedSnapshotMatchesBackend(cached.snapshot, backendScope) &&
    (!cached.snapshot.localHistoryCache || cached.snapshot.localHistoryCache.userId === userId) &&
    (!cached.snapshot.confirmedRequestOutcomes ||
      cached.snapshot.confirmedRequestOutcomes.userId === userId) &&
    (!cached.snapshot.confirmedAcceptedProjections ||
      cached.snapshot.confirmedAcceptedProjections.userId === userId)
      ? cached
      : null;
  const restored = historyState
    ? applyConfirmedRequestOverlay(historyState, derived?.snapshot, userId, backendScope)
    : null;
  if (derived && (!restored?.bootstrapComplete || !restored.liveRows)) {
    const snapshot = restored?.liveRows
      ? reconcileDerivedSnapshot(
          userId,
          derived.snapshot,
          mergeHistoryWithLiveRows(restored.liveRows, restored).financialRequests,
        )
      : derived.snapshot;
    return {
      kind: 'derived',
      cached: {
        ...derived,
        snapshot: suppressConfirmedRequestOutcomes(snapshot, [
          ...(restored?.confirmedRequestOutcomes ?? []),
          ...(derived.snapshot.confirmedRequestOutcomes?.outcomes ?? []),
        ]),
      },
    };
  }
  if (restored?.liveRows) {
    return { kind: 'raw', rows: mergeHistoryWithLiveRows(restored.liveRows, restored) };
  }
  return { kind: 'empty' };
}
