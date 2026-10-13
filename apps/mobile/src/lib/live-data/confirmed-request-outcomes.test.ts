import { describe, expect, it, vi } from 'vitest';
import {
  readConfirmedRequestOutcomes,
  mergeConfirmedRequestOutcomes,
  outcomesForConfirmedRows,
} from './confirmed-request-outcomes';
import type { FinancialRequestRow } from './types';

vi.mock('react-native', () => ({
  Platform: { OS: 'web', select: (value: Record<string, unknown>) => value.web ?? value.default },
}));

const ORIGINAL = '00000000-0000-4000-8000-000000000011';
const CHILD = '00000000-0000-4000-8000-000000000012';

describe('minimal committed request outcomes', () => {
  it.each(['accepted', 'rejected', 'canceled'] as const)(
    'records only exact ID and terminal %s proof',
    (status) => {
      expect(
        readConfirmedRequestOutcomes({
          requestId: ORIGINAL,
          status,
          ledgerTransactionId: 'unknown-ledger',
        }),
      ).toEqual([{ requestId: ORIGINAL, status }]);
    },
  );

  it.each(['amendedRequestId', 'correctedRequestId'])(
    'closes only the original version for %s',
    (field) => {
      expect(
        readConfirmedRequestOutcomes({
          originalRequestId: ORIGINAL,
          [field]: CHILD,
          status: 'pending',
        }),
      ).toEqual([{ requestId: ORIGINAL, status: 'amended' }]);
    },
  );

  it.each([
    null,
    undefined,
    [],
    'accepted',
    {},
    { requestId: ORIGINAL, status: 'pending' },
    { requestId: ORIGINAL, status: 'amended' },
    { requestId: 'not-a-uuid', status: 'accepted' },
    { originalRequestId: ORIGINAL, status: 'pending' },
    { originalRequestId: ORIGINAL, amendedRequestId: ORIGINAL, status: 'pending' },
    { originalRequestId: ORIGINAL, amendedRequestId: CHILD, status: 'error' },
  ])('ignores incomplete or unrelated response proof (%j)', (response) => {
    expect(readConfirmedRequestOutcomes(response)).toEqual([]);
  });

  it('deduplicates repeated acknowledgements and never creates outcomes for an unseen pending child', () => {
    const first = readConfirmedRequestOutcomes({
      originalRequestId: ORIGINAL,
      amendedRequestId: CHILD,
      status: 'pending',
    });
    expect(mergeConfirmedRequestOutcomes(first, first)).toEqual(first);
    const complete = outcomesForConfirmedRows([
      { id: ORIGINAL, status: 'amended' },
      { id: CHILD, status: 'accepted' },
      { id: '00000000-0000-4000-8000-000000000013', status: 'pending' },
    ] as FinancialRequestRow[]);
    expect(complete).toEqual([
      { requestId: ORIGINAL, status: 'amended' },
      { requestId: CHILD, status: 'accepted' },
    ]);
  });
});
