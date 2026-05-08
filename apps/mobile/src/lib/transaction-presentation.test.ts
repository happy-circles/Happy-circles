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
  transactionStatusTone,
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
      'amended',
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
    expect(transactionStatusLabel(item({ status: 'amended' }))).toBe('Monto modificado');
  });

  it('keeps happy circle avatar tones aligned to actionability', () => {
    const circleItem = (status: ActivityItemDto['status']) =>
      item({
        category: 'cycle',
        kind: 'settlement_proposal',
        status,
      });

    expect(transactionStatusTone(circleItem('pending_approvals'))).toBe('warning');
    expect(transactionStatusTone(circleItem('waiting_other_side'))).toBe('neutral');
    expect(transactionStatusTone(circleItem('approved'))).toBe('cycle');
    expect(transactionStatusTone(circleItem('executed'))).toBe('success');
    expect(transactionStatusTone(circleItem('rejected'))).toBe('danger');
    expect(transactionStatusTone(circleItem('stale'))).toBe('neutral');
    expect(transactionStatusTone(circleItem('expired'))).toBe('neutral');
  });
});
