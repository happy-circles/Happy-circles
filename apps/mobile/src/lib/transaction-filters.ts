export const TRANSACTION_ROOT_FILTERS = [
  'all',
  'current_balance',
  'owed_to_me',
  'i_owe',
  'pending',
  'pending_incoming',
  'pending_outgoing',
  'projection',
] as const;

export type TransactionRootFilter = (typeof TRANSACTION_ROOT_FILTERS)[number];

export type ProjectionChartFilter = Extract<
  TransactionRootFilter,
  | 'current_balance'
  | 'owed_to_me'
  | 'i_owe'
  | 'pending_incoming'
  | 'pending_outgoing'
  | 'projection'
>;

const TRANSACTION_ROOT_FILTER_SET = new Set<string>(TRANSACTION_ROOT_FILTERS);

export function normalizeTransactionFilter(
  value: string | readonly string[] | undefined,
): TransactionRootFilter {
  const rawValue = typeof value === 'string' ? value : value?.[0];
  return rawValue && TRANSACTION_ROOT_FILTER_SET.has(rawValue)
    ? (rawValue as TransactionRootFilter)
    : 'all';
}

export function primaryTransactionFilter(
  filter: TransactionRootFilter,
): Extract<TransactionRootFilter, 'all' | 'current_balance' | 'owed_to_me' | 'i_owe' | 'pending'> {
  if (filter === 'pending_incoming' || filter === 'pending_outgoing' || filter === 'projection') {
    return 'pending';
  }

  return filter;
}
