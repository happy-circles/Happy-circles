import {
  applyConfirmedRequestOverlay,
  cachedSnapshotMatchesBackend,
} from './confirmed-request-overlay';
import { reconcileDerivedSnapshot } from './confirmed-sender-request-state';
import { mergeHistoryWithLiveRows, type HistorySyncState } from './history-sync';
import type { CachedAppSnapshot } from './snapshot-cache';
import type { LiveSnapshotRows } from './types';

type SnapshotHydrationPlan =
  | { readonly kind: 'derived'; readonly cached: CachedAppSnapshot }
  | { readonly kind: 'raw'; readonly rows: LiveSnapshotRows }
  | { readonly kind: 'empty' };

export function prepareSnapshotCacheHydration(
  historyState: HistorySyncState | null,
  cached: CachedAppSnapshot | null,
  userId: string,
  backendScope: string,
): SnapshotHydrationPlan {
  const derived =
    cached && cachedSnapshotMatchesBackend(cached.snapshot, backendScope) ? cached : null;
  const restored = historyState
    ? applyConfirmedRequestOverlay(historyState, derived?.snapshot, userId, backendScope)
    : null;
  if (derived && !restored?.bootstrapComplete) {
    return {
      kind: 'derived',
      cached: restored?.liveRows
        ? {
            ...derived,
            snapshot: reconcileDerivedSnapshot(
              userId,
              derived.snapshot,
              mergeHistoryWithLiveRows(restored.liveRows, restored).financialRequests,
            ),
          }
        : derived,
    };
  }
  if (restored?.liveRows) {
    return { kind: 'raw', rows: mergeHistoryWithLiveRows(restored.liveRows, restored) };
  }
  return derived ? { kind: 'derived', cached: derived } : { kind: 'empty' };
}
