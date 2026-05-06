import { describe, expect, it } from 'vitest';

import type { ActivityItemDto } from '@happy-circles/application';

import {
  buildFinancialRequestPendingContent,
  buildFocusCandidates,
  buildPersonRegisterHref,
  matchesFocusedTransaction,
  pendingSnippetTone,
  pendingStatusLabel,
  readNestedStatus,
  readResultStatus,
} from './person-detail-helpers';

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
    status: 'pending',
    subtitle: '',
    title: 'Item',
    tone: 'neutral',
    ...value,
  } as ActivityItemDto;
}

describe('person detail helpers', () => {
  it('reads mutation statuses defensively', () => {
    expect(readResultStatus({ status: 'accepted' })).toBe('accepted');
    expect(readResultStatus(null)).toBeNull();
    expect(readNestedStatus({ settlement: { status: 'executed' } }, 'settlement')).toBe(
      'executed',
    );
  });

  it('derives pending financial request content', () => {
    expect(
      buildFinancialRequestPendingContent(
        item({ subtitle: 'Ana | Cena viernes | hace 2 dias' }),
      ),
    ).toEqual({
      createdAtLabel: 'hace 2 dias',
      createdByLabel: 'Ana',
      detail: 'Cena viernes',
    });
    expect(buildFinancialRequestPendingContent(item({ subtitle: '' })).createdByLabel).toBe(
      'Persona',
    );
  });

  it('matches focus ids across request and settlement origins', () => {
    const candidates = buildFocusCandidates('origin%2Fencoded');
    expect(candidates.has('origin/encoded')).toBe(true);
    expect(
      matchesFocusedTransaction(
        item({ id: 'item-1', originRequestId: 'origin/encoded' }),
        candidates,
      ),
    ).toBe(true);
    expect(
      matchesFocusedTransaction(
        item({ id: 'item-2', originSettlementProposalId: 'other' }),
        candidates,
      ),
    ).toBe(false);
  });

  it('keeps pending labels, tones and register hrefs stable', () => {
    expect(pendingSnippetTone(item({ kind: 'settlement_proposal', status: 'approved' }))).toBe(
      'cycle',
    );
    expect(pendingSnippetTone(item({ status: 'requires_you' }))).toBe('warning');
    expect(pendingStatusLabel('waiting_other_side')).toBe('En espera');
    expect(buildPersonRegisterHref('user-1', 'owes_me')).toEqual({
      pathname: '/register',
      params: {
        direction: 'owes_me',
        personId: 'user-1',
      },
    });
  });
});
