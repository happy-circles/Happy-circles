import { describe, expect, it, vi } from 'vitest';

import type { ActivityItemDto, PersonCardDto } from '@happy-circles/application';

vi.mock('react-native', () => ({
  Platform: {
    OS: 'web',
    select: (options: Record<string, unknown>) => options.web ?? options.default,
  },
}));

import { transactionCircleHref, transactionDetailHref } from './transaction-people';

function item(value: Partial<ActivityItemDto>): ActivityItemDto {
  return {
    amountMinor: 0,
    category: 'other',
    counterpartyLabel: null,
    createdAt: '2026-05-05T12:00:00.000Z',
    href: undefined,
    id: 'item-1',
    kind: 'financial_request',
    originRequestId: null,
    originSettlementProposalId: null,
    status: 'posted',
    subtitle: '',
    title: 'Item',
    tone: 'neutral',
    ...value,
  } as ActivityItemDto;
}

function person(value: Partial<PersonCardDto>): PersonCardDto {
  return {
    avatarUrl: null,
    displayName: 'Ana',
    netBalanceMinor: 0,
    pendingCount: 0,
    statusLabel: '',
    userId: 'user-ana',
    ...value,
  } as PersonCardDto;
}

describe('transaction people routing', () => {
  it('routes circle ledger movements to the settlement detail instead of the person href', () => {
    const circleItem = item({
      category: 'cycle',
      href: '/person/user-ana',
      kind: 'settlement',
      originSettlementProposalId: 'settlement-1',
    });

    expect(transactionCircleHref(circleItem)).toBe('/settlements/settlement-1');
    expect(transactionDetailHref([person({ userId: 'user-ana' })], circleItem, 'history')).toBe(
      '/settlements/settlement-1',
    );
  });

  it('keeps regular transaction movements pointed at the person profile panel', () => {
    const requestItem = item({
      counterpartyLabel: 'Ana',
      id: 'request-copy',
      kind: 'financial_request',
      originRequestId: 'request-1',
    });

    expect(transactionDetailHref([person({ displayName: 'Ana' })], requestItem, 'pending')).toBe(
      '/person/user-ana?panel=pending&focus=request-1',
    );
  });
});
