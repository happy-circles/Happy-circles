import type { HistorySyncState } from './history-sync';

/** Local commit identity; it never acknowledges a server journal revision. */
export interface HistoryCacheReceipt {
  readonly userId: string;
  readonly backendScope: string;
  readonly generation: string | null;
  readonly cursor: string | null;
  readonly bootstrapComplete: boolean;
  readonly fetchedAt: string | null;
}

export function historyCacheReceipt(
  userId: string,
  backendScope: string,
  generation: string | null,
  state: HistorySyncState,
): HistoryCacheReceipt {
  return {
    userId,
    backendScope,
    generation,
    cursor: state.cursor,
    bootstrapComplete: state.bootstrapComplete === true,
    fetchedAt: state.liveRows?.fetchedAt ?? null,
  };
}
