import { describe, expect, it } from 'vitest';
import {
  correctFinancialRequestSchema,
  cancelFinancialRequestSchema,
  amendFinancialRequestSchema,
  requestDecisionSchema,
} from '@happy-circles/shared';

const decision = {
  idempotencyKey: 'sender-intention-one',
  requestId: '00000000-0000-4000-8000-000000000001',
};
const correction = { ...decision, amountMinor: 1500, description: '  Corrected lunch  ' };

describe('sender request action input contracts', () => {
  it('normalizes a correction and carries the viewed version without accepting actor or financial direction changes', () => {
    expect(
      correctFinancialRequestSchema.parse({
        ...correction,
        expectedVersion: 3,
        creatorUserId: 'spoofed',
        responderUserId: 'spoofed',
        debtorUserId: 'spoofed',
        creditorUserId: 'spoofed',
        currencyCode: 'USD',
        requestCaseId: 'spoofed',
      }),
    ).toEqual({
      ...decision,
      amountMinor: 1500,
      description: 'Corrected lunch',
      category: 'other',
      expectedVersion: 3,
    });
  });
  it('only sends the original request identity, intention and viewed version for cancellation', () => {
    expect(
      cancelFinancialRequestSchema.parse({
        ...decision,
        expectedVersion: 1,
        amountMinor: 12,
        creatorUserId: 'spoofed',
      }),
    ).toEqual({ ...decision, expectedVersion: 1 });
  });
  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid correction amount %s',
    (amountMinor) => {
      expect(correctFinancialRequestSchema.safeParse({ ...correction, amountMinor }).success).toBe(
        false,
      );
    },
  );
  it.each([0, -1, 1.5, NaN, '1', 2147483648])(
    'rejects invalid expected version %s in both actions',
    (expectedVersion) => {
      expect(
        correctFinancialRequestSchema.safeParse({ ...correction, expectedVersion }).success,
      ).toBe(false);
      expect(cancelFinancialRequestSchema.safeParse({ ...decision, expectedVersion }).success).toBe(
        false,
      );
    },
  );
  it.each([
    { description: '   ' },
    { description: 'a'.repeat(241) },
    { category: 'cycle' },
    { requestId: 'bad' },
    { idempotencyKey: 'short' },
  ])('rejects invalid request content %#', (input) => {
    expect(correctFinancialRequestSchema.safeParse({ ...correction, ...input }).success).toBe(
      false,
    );
  });
  it('preserves legacy receiver contracts and optional-version compatibility', () => {
    expect(correctFinancialRequestSchema.parse(correction)).toEqual(
      amendFinancialRequestSchema.parse(correction),
    );
    expect(cancelFinancialRequestSchema.parse(decision)).toEqual(
      requestDecisionSchema.parse(decision),
    );
  });
});
