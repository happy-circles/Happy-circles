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
  toHistoryFeedItem,
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
    ).toEqual(['settlement-v1:stale']);
  });

  it('does not anchor a Circle case on ledger rows when there is no executed proposal', () => {
    const postedMovement = item({
      category: 'cycle',
      happenedAt: '2026-05-05T12:00:00.000Z',
      happyCircleCaseId: 'case-1',
      id: 'ledger-v2',
      kind: 'settlement',
      originSettlementProposalId: 'settlement-v2',
      status: 'posted',
    });
    const staleProposal = item({
      category: 'cycle',
      happenedAt: '2026-05-05T12:01:00.000Z',
      happyCircleCaseId: 'case-1',
      id: 'settlement-v1:stale',
      kind: 'settlement',
      originSettlementProposalId: 'settlement-v1',
      status: 'stale',
    });

    const cases = buildHistoryCases([staleProposal, postedMovement]);

    expect(cases).toHaveLength(1);
    expect(cases[0]?.latest.id).toBe('settlement-v1:stale');
    expect(
      buildLatestHistoryCaseItems([staleProposal, postedMovement]).map((step) => step.id),
    ).toEqual(['settlement-v1:stale']);
  });

  it('anchors a Circle case on the executed proposal when one exists', () => {
    const staleProposal = item({
      category: 'cycle',
      happenedAt: '2026-05-05T12:03:00.000Z',
      happyCircleCaseId: 'case-1',
      id: 'settlement-v1:stale',
      kind: 'settlement',
      originSettlementProposalId: 'settlement-v1',
      status: 'stale',
    });
    const postedMovement = item({
      category: 'cycle',
      happenedAt: '2026-05-05T12:01:00.000Z',
      happyCircleCaseId: 'case-1',
      id: 'ledger-v2',
      kind: 'settlement',
      originSettlementProposalId: 'settlement-v2',
      status: 'posted',
    });
    const executedProposal = item({
      category: 'cycle',
      happenedAt: '2026-05-05T12:02:00.000Z',
      happyCircleCaseId: 'case-1',
      id: 'settlement-v2:executed',
      kind: 'settlement',
      originSettlementProposalId: 'settlement-v2',
      status: 'executed',
    });

    const cases = buildHistoryCases([staleProposal, postedMovement, executedProposal]);

    expect(cases).toHaveLength(1);
    expect(cases[0]?.latest.id).toBe('settlement-v2:executed');
    expect(cases[0]?.steps.map((step) => step.id)).toEqual([
      'settlement-v1:stale',
      'settlement-v2:executed',
      'ledger-v2',
    ]);
    expect(
      buildLatestHistoryCaseItems([staleProposal, postedMovement, executedProposal]).map(
        (step) => step.id,
      ),
    ).toEqual(['settlement-v2:executed']);
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

  it('preserves Circle grouping metadata when mapping a person timeline item', () => {
    const mapped = toHistoryFeedItem(
      {
        amountMinor: 50_000,
        category: 'cycle',
        detail: 'Version reemplazada',
        flowLabel: 'Happy Circle',
        happenedAt: '2026-05-05T12:00:00.000Z',
        happenedAtLabel: 'hoy',
        happyCircleCaseId: 'case-1',
        id: 'settlement-v1:stale',
        kind: 'settlement',
        originRequestId: undefined,
        originSettlementProposalId: 'settlement-v1',
        replacedByProposalId: 'settlement-v2',
        replacesProposalId: null,
        sourceLabel: 'Happy Circle',
        sourceType: 'system',
        staleReason: 'balance_changed',
        status: 'stale',
        subtitle: 'Happy Circle | Version reemplazada | hoy',
        title: 'Version reemplazada',
        tone: 'neutral',
      },
      'Sofia',
    );

    expect(mapped).toMatchObject({
      happyCircleCaseId: 'case-1',
      originSettlementProposalId: 'settlement-v1',
      replacedByProposalId: 'settlement-v2',
      staleReason: 'balance_changed',
    });
  });
});
