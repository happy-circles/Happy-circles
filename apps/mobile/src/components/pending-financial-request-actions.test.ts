import { describe, expect, it } from 'vitest';

import {
  assertCancellationAcknowledged,
  canCorrectSenderFinancialRequest,
  pendingFinancialRequestActionRole,
} from './pending-financial-request-actions';

describe('pending request action ownership', () => {
  it('offers sender editing and cancellation only for their current waiting proposal', () => {
    expect(
      pendingFinancialRequestActionRole({
        createdByCurrentUser: true,
        responseState: 'waiting_other_side',
      }),
    ).toBe('sender');
    for (const status of ['accepted', 'amended', 'canceled', 'requires_you']) {
      expect(
        pendingFinancialRequestActionRole({ createdByCurrentUser: true, responseState: status }),
      ).toBe('none');
    }
  });

  it('keeps responding and counterproposing available only to the receiver', () => {
    expect(
      pendingFinancialRequestActionRole({
        createdByCurrentUser: false,
        responseState: 'requires_you',
      }),
    ).toBe('receiver');
    expect(
      pendingFinancialRequestActionRole({
        createdByCurrentUser: false,
        responseState: 'waiting_other_side',
      }),
    ).toBe('none');
    expect(pendingFinancialRequestActionRole({ responseState: 'waiting_other_side' })).toBe('none');
  });

  it('allows sender editing only for a known balance request while reversals remain cancelable', () => {
    const sender = { createdByCurrentUser: true, responseState: 'waiting_other_side' };
    expect(canCorrectSenderFinancialRequest({ ...sender, requestKind: 'balance_increase' })).toBe(
      true,
    );
    for (const requestKind of ['transaction_reversal', undefined]) {
      expect(canCorrectSenderFinancialRequest({ ...sender, requestKind })).toBe(false);
      expect(pendingFinancialRequestActionRole(sender)).toBe('sender');
    }
    expect(
      canCorrectSenderFinancialRequest({
        requestKind: 'balance_increase',
        createdByCurrentUser: false,
        responseState: 'requires_you',
      }),
    ).toBe(false);
  });

  it('requires a cancellation acknowledgement for the same request before reporting success', () => {
    expect(() =>
      assertCancellationAcknowledged('current', { requestId: 'current', status: 'canceled' }),
    ).not.toThrow();
    expect(() =>
      assertCancellationAcknowledged('current', { requestId: 'another', status: 'canceled' }),
    ).toThrow('no confirmó');
    expect(() =>
      assertCancellationAcknowledged('current', { requestId: 'current', status: 'pending' }),
    ).toThrow();
    expect(() => assertCancellationAcknowledged('current', null)).toThrow();
  });
});
