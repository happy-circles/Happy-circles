import { authoritativeRows, reconcile } from './confirmed-sender-request-state';
import type { HistorySyncState } from './history-sync';
import type { AppSnapshot } from './types';
import { mergeConfirmedRequestOutcomes } from './confirmed-request-outcomes';
import { reconcileAcceptedProjection } from './accepted-request-projection';

export function cachedSnapshotMatchesBackend(snapshot: AppSnapshot, backendScope: string): boolean {
  const overlay = snapshot.confirmedFinancialRequests;
  return (
    (!overlay || overlay.backendScope === backendScope) &&
    (!snapshot.localHistoryCache || snapshot.localHistoryCache.backendScope === backendScope) &&
    (!snapshot.confirmedRequestOutcomes ||
      snapshot.confirmedRequestOutcomes.backendScope === backendScope) &&
    (!snapshot.confirmedAcceptedProjections ||
      snapshot.confirmedAcceptedProjections.backendScope === backendScope)
  );
}

/** A durable command acknowledgement overrides stale raw data without advancing its cursor. */
export function applyConfirmedRequestOverlay(
  state: HistorySyncState,
  snapshot: AppSnapshot | undefined,
  userId: string,
  backendScope: string,
): HistorySyncState {
  const overlay = snapshot?.confirmedFinancialRequests;
  const rows =
    overlay?.backendScope === backendScope
      ? authoritativeRows({ financialRequests: overlay.rows }, userId)
      : [];
  let next = rows.length ? reconcile(state, rows) : state;
  const outcomes = snapshot?.confirmedRequestOutcomes;
  if (outcomes?.backendScope === backendScope && outcomes.userId === userId)
    next = {
      ...next,
      confirmedRequestOutcomes: mergeConfirmedRequestOutcomes(
        next.confirmedRequestOutcomes ?? [],
        outcomes.outcomes,
      ),
    };
  const projections = snapshot?.confirmedAcceptedProjections;
  if (projections?.backendScope === backendScope && projections.userId === userId) {
    for (const response of projections.responses)
      next = reconcileAcceptedProjection(next, response, userId);
  }
  return next;
}
