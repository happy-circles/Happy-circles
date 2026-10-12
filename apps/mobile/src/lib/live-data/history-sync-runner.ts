import {
  applyHistorySyncPage,
  emptyHistorySyncState,
  mergeHistoryWithLiveRows,
  type HistorySyncState,
} from './history-sync';
import type { LiveSnapshotRows } from './types';

interface HistorySyncOperations {
  readonly read: () => Promise<HistorySyncState | null>;
  readonly persist: (state: HistorySyncState) => Promise<void>;
  readonly request: (cursor: string | null) => Promise<LiveSnapshotRows>;
  readonly signal?: AbortSignal | undefined;
}

function checkAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new Error('Sincronización cancelada.');
}

/** Caller serializes this operation by account/backend before reading the cursor. */
export async function synchronizeHistorySnapshot(
  operations: HistorySyncOperations,
): Promise<LiveSnapshotRows> {
  checkAborted(operations.signal);
  let state = (await operations.read()) ?? emptyHistorySyncState();
  let savedPages = 0;
  while (true) {
    checkAborted(operations.signal);
    const rows = await operations.request(state.cursor);
    checkAborted(operations.signal);
    // Older servers still return the legacy snapshot. Never acknowledge a
    // cursor when the server did not implement the requested protocol.
    if (!rows.historySync) return rows;
    if (savedPages > 0 && rows.historySync.reset) {
      throw new Error('El historial cambió durante la descarga. Intenta sincronizar de nuevo.');
    }
    const liveRows = { ...rows };
    delete liveRows.historySync;
    const next = {
      ...applyHistorySyncPage(state, rows.historySync),
      liveRows: {
        ...liveRows,
        avatarSignedUrlsByPath: {
          ...(rows.historySync.reset ? {} : state.liveRows?.avatarSignedUrlsByPath),
          ...rows.avatarSignedUrlsByPath,
        },
      },
    };
    await operations.persist(next);
    state = next;
    savedPages += 1;
    checkAborted(operations.signal);
    if (!rows.historySync.hasMore) return mergeHistoryWithLiveRows(next.liveRows, next);
  }
}
