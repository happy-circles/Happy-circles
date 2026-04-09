import { describe, expect, it } from 'vitest';

import type {
  LedgerAccountId,
  LedgerTransactionId,
  RequestId,
  UserId,
} from '@happy-circles/shared';

import { createFinancialRequest } from '../requests/financial-request';
import { accountBalance, buildAcceptedRequestTransaction } from './ledger';

const USER_A = '00000000-0000-0000-0000-0000000000a1' as UserId;
const USER_B = '00000000-0000-0000-0000-0000000000b2' as UserId;

describe('Ledger', () => {
  it('builds balanced entries for an accepted balance increase request', () => {
    const request = createFinancialRequest({
      id: '00000000-0000-0000-0000-0000000000c3' as RequestId,
      requestKind: 'balance_increase',
      creatorUserId: USER_A,
      responderUserId: USER_B,
      debtorUserId: USER_A,
      creditorUserId: USER_B,
      amountMinor: 5000,
      description: 'Dinner',
    });

    const transaction = buildAcceptedRequestTransaction(
      '00000000-0000-0000-0000-0000000000d4' as LedgerTransactionId,
      request,
      {
        debtorPayableAccount: {
          id: '00000000-0000-0000-0000-0000000000e5' as LedgerAccountId,
          ownerUserId: USER_A,
          counterpartyUserId: USER_B,
          accountKind: 'payable',
          currencyCode: 'COP',
        },
        creditorReceivableAccount: {
          id: '00000000-0000-0000-0000-0000000000f6' as LedgerAccountId,
          ownerUserId: USER_B,
          counterpartyUserId: USER_A,
          accountKind: 'receivable',
          currencyCode: 'COP',
        },
      },
    );

    expect(transaction.entries).toHaveLength(2);
    expect(accountBalance('receivable', [transaction.entries[0]!])).toBe(5000);
    expect(accountBalance('payable', [transaction.entries[1]!])).toBe(5000);
  });
});
