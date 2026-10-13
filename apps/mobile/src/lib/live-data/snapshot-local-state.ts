import type { ConfirmedRequestOutcome } from './confirmed-request-outcomes';
import type { HistoryCacheReceipt } from './history-cache-receipt';
import type { FinancialRequestRow } from './financial-request-types';
import type { AcceptedProjectionResponse } from './accepted-request-projection';

/** Rebuildable views retain confirmations when a redundant cache write fails. */
export interface AppSnapshotLocalState {
  readonly localHistoryCache?: HistoryCacheReceipt;
  readonly confirmedRequestOutcomes?: {
    readonly backendScope: string;
    readonly userId: string;
    readonly outcomes: readonly ConfirmedRequestOutcome[];
  };
  readonly confirmedFinancialRequests?: {
    readonly backendScope: string;
    readonly rows: readonly FinancialRequestRow[];
  };
  readonly confirmedAcceptedProjections?: {
    readonly backendScope: string;
    readonly userId: string;
    readonly responses: readonly AcceptedProjectionResponse[];
  };
}
