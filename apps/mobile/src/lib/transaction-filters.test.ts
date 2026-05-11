import { describe, expect, it } from 'vitest';

import {
  normalizeTransactionFilter,
  primaryTransactionFilter,
  TRANSACTION_ROOT_FILTERS,
} from './transaction-filters';

describe('transaction filters', () => {
  it('normalizes and surfaces the rejected root filter', () => {
    expect(TRANSACTION_ROOT_FILTERS).toContain('rejected');
    expect(normalizeTransactionFilter('rejected')).toBe('rejected');
    expect(primaryTransactionFilter('rejected')).toBe('rejected');
  });
});
