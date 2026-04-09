import { describe, expect, it } from 'vitest';

import type { RequestId, UserId } from '@happy-circles/shared';

import { amendFinancialRequest, createFinancialRequest } from './financial-request';

const USER_A = '00000000-0000-0000-0000-0000000000a1' as UserId;
const USER_B = '00000000-0000-0000-0000-0000000000b2' as UserId;

describe('FinancialRequest', () => {
  it('creates a pending request', () => {
    const request = createFinancialRequest({
      id: '00000000-0000-0000-0000-0000000000c3' as RequestId,
      requestKind: 'balance_increase',
      creatorUserId: USER_A,
      responderUserId: USER_B,
      debtorUserId: USER_A,
      creditorUserId: USER_B,
      amountMinor: 2500,
      description: 'Lunch',
    });

    expect(request.status).toBe('pending');
    expect(request.amount.amountMinor).toBe(2500);
  });

  it('closes the original request and creates a new amendment request', () => {
    const original = createFinancialRequest({
      id: '00000000-0000-0000-0000-0000000000c3' as RequestId,
      requestKind: 'balance_increase',
      creatorUserId: USER_A,
      responderUserId: USER_B,
      debtorUserId: USER_A,
      creditorUserId: USER_B,
      amountMinor: 2500,
      description: 'Lunch',
    });
    const counter = createFinancialRequest({
      id: '00000000-0000-0000-0000-0000000000d4' as RequestId,
      requestKind: 'balance_increase',
      creatorUserId: USER_B,
      responderUserId: USER_A,
      debtorUserId: USER_A,
      creditorUserId: USER_B,
      amountMinor: 2000,
      description: 'Updated lunch',
      parentRequestId: original.id,
    });

    const result = amendFinancialRequest(original, counter);

    expect(result.closedRequest.status).toBe('amended');
    expect(result.amendedRequest.parentRequestId).toBe(original.id);
  });
});
