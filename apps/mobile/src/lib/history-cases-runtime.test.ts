import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  Platform: {
    OS: 'web',
    select: (options: Record<string, unknown>) => options.web ?? options.default,
  },
}));

import {
  buildHistoryCases,
  buildLatestHistoryCaseItems,
  type HistoryCaseItem,
} from './history-cases-runtime';

function item(value: Partial<HistoryCaseItem>): HistoryCaseItem {
  return {
    id: 'item-1',
    kind: 'request',
    status: 'accepted',
    subtitle: 'hoy',
    title: 'Movimiento',
    ...value,
  };
}

describe('history case grouping', () => {
  it('collapses request and ledger steps under the same origin request', () => {
    const request = item({
      happenedAt: '2026-05-05T12:01:00.000Z',
      id: 'request-1:accepted',
      originRequestId: 'request-1',
      status: 'accepted',
    });
    const ledger = item({
      happenedAt: '2026-05-05T12:00:00.000Z',
      id: 'ledger-1',
      kind: 'system',
      originRequestId: 'request-1',
      status: 'posted',
    });

    const cases = buildHistoryCases([request, ledger]);

    expect(cases).toHaveLength(1);
    expect(cases[0]?.steps.map((step) => step.id)).toEqual(['ledger-1', 'request-1:accepted']);
    expect(buildLatestHistoryCaseItems([request, ledger]).map((step) => step.id)).toEqual([
      'request-1:accepted',
    ]);
  });

  it('collapses multiple ledger movements from the same settlement proposal', () => {
    const firstMovement = item({
      happenedAt: '2026-05-05T12:00:00.000Z',
      id: 'ledger-a',
      kind: 'settlement',
      originSettlementProposalId: 'settlement-1',
      status: 'posted',
    });
    const secondMovement = item({
      happenedAt: '2026-05-05T12:00:01.000Z',
      id: 'ledger-b',
      kind: 'settlement',
      originSettlementProposalId: 'settlement-1',
      status: 'posted',
    });

    expect(buildHistoryCases([firstMovement, secondMovement])).toHaveLength(1);
    expect(
      buildLatestHistoryCaseItems([firstMovement, secondMovement]).map((step) => step.id),
    ).toEqual(['ledger-b']);
  });

  it('collapses replaced happy circle versions under the same case', () => {
    const staleProposal = item({
      happenedAt: '2026-05-05T12:00:00.000Z',
      happyCircleCaseId: 'case-1',
      id: 'settlement-v1:stale',
      kind: 'settlement',
      originSettlementProposalId: 'settlement-v1',
      replacedByProposalId: 'settlement-v2',
      status: 'stale',
    });
    const postedMovement = item({
      happenedAt: '2026-05-05T12:01:00.000Z',
      happyCircleCaseId: 'case-1',
      id: 'ledger-v2',
      kind: 'settlement',
      originSettlementProposalId: 'settlement-v2',
      replacesProposalId: 'settlement-v1',
      status: 'posted',
    });

    const cases = buildHistoryCases([staleProposal, postedMovement]);

    expect(cases).toHaveLength(1);
    expect(cases[0]?.id).toBe('happy_circle_case:case-1');
    expect(cases[0]?.steps.map((step) => step.id)).toEqual(['settlement-v1:stale', 'ledger-v2']);
    expect(
      buildLatestHistoryCaseItems([staleProposal, postedMovement]).map((step) => step.id),
    ).toEqual(['ledger-v2']);
  });

  it('keeps person metadata when the latest ledger step has less display data', () => {
    const request = item({
      counterpartyLabel: 'Ana Ruiz',
      happenedAt: '2026-05-05T12:00:00.000Z',
      href: '/person/user-a',
      id: 'request-1:accepted',
      originRequestId: 'request-1',
      status: 'accepted',
    });
    const ledger = item({
      happenedAt: '2026-05-05T12:01:00.000Z',
      id: 'ledger-1',
      kind: 'payment',
      originRequestId: 'request-1',
      status: 'posted',
    });

    expect(buildLatestHistoryCaseItems([request, ledger])[0]).toMatchObject({
      counterpartyLabel: 'Ana Ruiz',
      href: '/person/user-a',
      id: 'ledger-1',
    });
  });
});
