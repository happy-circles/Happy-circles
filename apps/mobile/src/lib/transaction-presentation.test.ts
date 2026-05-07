import { describe, expect, it, vi } from 'vitest';

import type { ActivityItemDto } from '@happy-circles/application';

vi.mock('react-native', () => ({
  Platform: {
    OS: 'web',
    select: (options: Record<string, unknown>) => options.web ?? options.default,
  },
}));

import {
  transactionShouldSurfaceStatus,
  transactionStatusLabel,
  transactionSummaryMetaLabel,
} from './transaction-presentation';

function item(value: Partial<ActivityItemDto>): ActivityItemDto {
  return {
    amountMinor: 10_000,
    category: 'other',
    counterpartyLabel: 'Ana',
    createdAt: '2026-05-05T12:00:00.000Z',
    happenedAtLabel: 'hoy',
    href: undefined,
    id: 'item-1',
    kind: 'financial_request',
    originRequestId: null,
    originSettlementProposalId: null,
    status: 'posted',
    subtitle: 'Ana | Cafes | hoy',
    title: 'Ana registro cafes',
    tone: 'positive',
    ...value,
  } as ActivityItemDto;
}

describe('transaction presentation', () => {
  it('keeps home summary status quiet unless it changes the decision', () => {
    expect(transactionShouldSurfaceStatus(item({ status: 'posted' }), { density: 'summary' })).toBe(
      false,
    );
    expect(
      transactionShouldSurfaceStatus(item({ status: 'requires_you' }), { density: 'summary' }),
    ).toBe(true);
    expect(
      transactionShouldSurfaceStatus(item({ status: 'waiting_other_side' }), {
        density: 'summary',
      }),
    ).toBe(true);
    expect(
      transactionShouldSurfaceStatus(
        item({ category: 'cycle', kind: 'settlement_proposal', status: 'pending_approvals' }),
        { density: 'summary' },
      ),
    ).toBe(true);
  });

  it('surfaces all pending and terminal states in transaction lists', () => {
    for (const status of [
      'requires_you',
      'waiting_other_side',
      'pending_approvals',
      'approved',
      'rejected',
      'stale',
      'expired',
      'canceled',
    ]) {
      expect(transactionShouldSurfaceStatus(item({ status }), { density: 'list' }), status).toBe(
        true,
      );
    }
  });

  it('uses a single compact meta line for summary cards', () => {
    expect(transactionSummaryMetaLabel(item({ happenedAtLabel: 'ayer' }))).toBe('ayer');
    expect(transactionStatusLabel(item({ status: 'waiting_other_side' }))).toBe(
      'Esperando respuesta',
    );
  });
});
