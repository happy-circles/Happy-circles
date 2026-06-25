import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  Platform: {
    OS: 'web',
    select: (options: Record<string, unknown>) => options.web ?? options.default,
  },
}));

import type { HistoryCase, HistoryCaseItem } from '@/lib/history-cases';
import { buildPersonHistoryConversationSteps } from './person-detail-runtime-utils';

function item(value: Partial<HistoryCaseItem>): HistoryCaseItem {
  return {
    amountMinor: 50_000,
    category: 'food',
    happenedAtLabel: 'hoy',
    id: 'step',
    kind: 'request',
    originRequestId: 'request-1',
    status: 'pending',
    subtitle: 'Usuario | hoy',
    title: 'Movimiento',
    ...value,
  };
}

function itemCase(steps: readonly HistoryCaseItem[]): HistoryCase<HistoryCaseItem> {
  return {
    earliest: steps[0],
    id: 'request:request-1',
    isCycleSnippet: false,
    latest: steps[steps.length - 1],
    steps,
  };
}

describe('person history conversation', () => {
  it('merges an accepted request with its successful ledger registration', () => {
    const steps = buildPersonHistoryConversationSteps({
      caseAmountLabel: '$ 50.000',
      counterpartyLabel: 'Pablo',
      itemCase: itemCase([
        item({
          detail: 'Cena',
          id: 'created',
          title: 'Pablo propuso una salida',
        }),
        item({
          id: 'accepted',
          status: 'accepted',
          title: 'Tú aceptó la propuesta',
        }),
        item({
          id: 'posted',
          kind: 'system',
          sourceType: 'system',
          status: 'posted',
          title: 'Sistema registró la salida',
        }),
      ]),
    });

    expect(steps).toHaveLength(2);
    expect(steps[1]?.title).toBe('Aceptaste y se registró la salida');
  });

  it('keeps unsuccessful outcomes as their own event', () => {
    const steps = buildPersonHistoryConversationSteps({
      caseAmountLabel: '$ 50.000',
      counterpartyLabel: 'Pablo',
      itemCase: itemCase([
        item({
          detail: 'Cena',
          id: 'created',
          title: 'Pablo propuso una salida',
        }),
        item({
          id: 'rejected',
          status: 'rejected',
          title: 'Tú no aceptó la propuesta',
        }),
      ]),
    });

    expect(steps).toHaveLength(2);
    expect(steps[1]?.title).toBe('No aceptaste la propuesta');
  });
});
