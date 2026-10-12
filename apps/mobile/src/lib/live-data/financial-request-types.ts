import type { Database } from '@happy-circles/shared';

/** Older on-device snapshots predate the version and resolution metadata. */
export type FinancialRequestRow = Omit<
  Database['public']['Tables']['financial_requests']['Row'],
  'request_case_id' | 'version_number' | 'resolved_by_user_id' | 'amendment_kind'
> & {
  readonly request_case_id?: string;
  readonly version_number?: number;
  readonly resolved_by_user_id?: string | null;
  readonly amendment_kind?: 'sender_correction' | 'counterproposal' | null;
};
