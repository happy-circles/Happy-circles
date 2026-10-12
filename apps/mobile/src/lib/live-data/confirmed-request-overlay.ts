import { authoritativeRows, reconcile } from './confirmed-sender-request-state';
import type { HistorySyncState } from './history-sync';
import type { AppSnapshot } from './types';

export function cachedSnapshotMatchesBackend(snapshot: AppSnapshot, backendScope: string): boolean {
  const overlay = snapshot.confirmedFinancialRequests;
  return !overlay || overlay.backendScope === backendScope;
}

/** A durable command acknowledgement overrides stale raw data without advancing its cursor. */
export function applyConfirmedRequestOverlay(
  state: HistorySyncState,
  snapshot: AppSnapshot | undefined,
  userId: string,
  backendScope: string,
): HistorySyncState {
  const overlay = snapshot?.confirmedFinancialRequests;
  if (!overlay || overlay.backendScope !== backendScope) return state;
  const rows = authoritativeRows({ financialRequests: overlay.rows }, userId);
  return rows.length ? reconcile(state, rows) : state;
}
