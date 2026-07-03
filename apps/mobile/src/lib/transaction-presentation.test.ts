import { describe, expect, it, vi } from 'vitest';

import type { ActivityItemDto } from '@happy-circles/application';

vi.mock('react-native', () => ({
  Platform: {
    OS: 'web',
    select: (options: Record<string, unknown>) => options.web ?? options.default,
  },
}));

import { theme } from './theme';
import {
  transactionContextLabel,
  transactionShouldSurfaceStatus,
  transactionStatusLabel,
  transactionStatusTone,
  transactionSummaryMetaLabel,
  transactionToneColor,
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
    subtitle: 'Ana | Cafés | hoy',
    title: 'Ana registró cafés',
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
    expect(transactionStatusLabel(item({ status: 'requires_you' }))).toBe('Por responder');
  });

  it('keeps happy circle avatar tones aligned to actionability', () => {
    const circleItem = (status: ActivityItemDto['status']) =>
      item({
        category: 'cycle',
        kind: 'settlement_proposal',
        status,
      });

    expect(transactionStatusTone(circleItem('pending_approvals'))).toBe('warning');
    expect(transactionStatusTone(circleItem('waiting_other_side'))).toBe('cycle');
    expect(transactionStatusTone(circleItem('approved'))).toBe('success');
    expect(transactionStatusTone(circleItem('executed'))).toBe('success');
    expect(transactionStatusTone(circleItem('rejected'))).toBe('danger');
    expect(transactionStatusTone(circleItem('stale'))).toBe('cycle');
    expect(transactionStatusTone(circleItem('expired'))).toBe('danger');
  });

  it('keeps happy circle value colors aligned to state', () => {
    const circleItem = (status: ActivityItemDto['status']) =>
      item({
        category: 'cycle',
        kind: 'settlement_proposal',
        status,
      });

    expect(transactionToneColor(circleItem('pending_approvals'))).toBe(theme.colors.pending);
    expect(transactionToneColor(circleItem('waiting_other_side'))).toBe(theme.colors.cycle);
    expect(transactionToneColor(circleItem('approved'))).toBe(theme.colors.success);
    expect(transactionToneColor(circleItem('executed'))).toBe(theme.colors.success);
    expect(transactionToneColor(circleItem('rejected'))).toBe(theme.colors.danger);
    expect(transactionToneColor(circleItem('stale'))).toBe(theme.colors.cycle);
    expect(transactionToneColor(circleItem('expired'))).toBe(theme.colors.danger);
  });

  it('uses Circle payment copy for posted Circle ledger rows', () => {
    expect(
      transactionContextLabel(
        item({
          category: 'cycle',
          flowLabel: 'Tú -> Sofia',
          kind: 'settlement',
          status: 'posted',
        }),
        'Sofia',
      ),
    ).toBe('Happy Circle con Sofia');

    expect(
      transactionContextLabel(
        item({
          category: 'cycle',
          flowLabel: 'Sofia -> Tú',
          kind: 'settlement',
          status: 'posted',
        }),
        'Sofia',
      ),
    ).toBe('Happy Circle con Sofia');
  });

  it('keeps executed Circle proposal metadata separate from ledger copy', () => {
    const executedProposal = item({
      category: 'cycle',
      kind: 'settlement_proposal',
      status: 'executed',
    });

    expect(transactionStatusLabel(executedProposal)).toBe('Completado');
    expect(transactionContextLabel(executedProposal, 'Sofia')).toBe('Circle cerrado');
  });
});
