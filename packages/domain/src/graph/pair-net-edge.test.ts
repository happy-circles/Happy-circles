import { describe, expect, it } from 'vitest';

import type { UserId } from '@happy-circles/shared';

import { detectAnchoredCycleSettlementDraft, detectCycleSettlementDrafts } from './pair-net-edge';

const USER_A = '00000000-0000-0000-0000-0000000000a1' as UserId;
const USER_B = '00000000-0000-0000-0000-0000000000b2' as UserId;
const USER_C = '00000000-0000-0000-0000-0000000000c3' as UserId;
const USER_D = '00000000-0000-0000-0000-0000000000d4' as UserId;

describe('detectCycleSettlementDrafts', () => {
  it('finds deterministic cycle settlements', () => {
    const drafts = detectCycleSettlementDrafts([
      { debtorUserId: USER_A, creditorUserId: USER_B, amountMinor: 1000 },
      { debtorUserId: USER_B, creditorUserId: USER_C, amountMinor: 700 },
      { debtorUserId: USER_C, creditorUserId: USER_A, amountMinor: 900 },
      { debtorUserId: USER_D, creditorUserId: USER_A, amountMinor: 150 },
    ]);

    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.amountMinor).toBe(700);
    expect(drafts[0]!.movements).toEqual([
      { debtorUserId: USER_B, creditorUserId: USER_A, amountMinor: 700 },
      { debtorUserId: USER_C, creditorUserId: USER_B, amountMinor: 700 },
      { debtorUserId: USER_A, creditorUserId: USER_C, amountMinor: 700 },
    ]);
  });

  it('selects the highest nettable amount for the anchored edge', () => {
    const draft = detectAnchoredCycleSettlementDraft(
      [
        { debtorUserId: USER_A, creditorUserId: USER_B, amountMinor: 1000 },
        { debtorUserId: USER_B, creditorUserId: USER_C, amountMinor: 400 },
        { debtorUserId: USER_C, creditorUserId: USER_A, amountMinor: 400 },
        { debtorUserId: USER_B, creditorUserId: USER_D, amountMinor: 900 },
        { debtorUserId: USER_D, creditorUserId: USER_A, amountMinor: 800 },
      ],
      { debtorUserId: USER_A, creditorUserId: USER_B, amountMinor: 1000 },
    );

    expect(draft?.amountMinor).toBe(800);
    expect(draft?.movements).toEqual([
      { debtorUserId: USER_B, creditorUserId: USER_A, amountMinor: 800 },
      { debtorUserId: USER_D, creditorUserId: USER_B, amountMinor: 800 },
      { debtorUserId: USER_A, creditorUserId: USER_D, amountMinor: 800 },
    ]);
  });

  it('returns no anchored draft when there is no path back to the debtor', () => {
    const draft = detectAnchoredCycleSettlementDraft(
      [
        { debtorUserId: USER_A, creditorUserId: USER_B, amountMinor: 1000 },
        { debtorUserId: USER_B, creditorUserId: USER_C, amountMinor: 900 },
      ],
      { debtorUserId: USER_A, creditorUserId: USER_B, amountMinor: 1000 },
    );

    expect(draft).toBeNull();
  });
});
