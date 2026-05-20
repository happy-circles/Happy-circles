import { describe, expect, it } from 'vitest';

import type { ActivityItemDto } from '@happy-circles/application';

import { notificationViewKeyForItem } from '@/lib/live-data/builders/notifications';
import { buildNotificationSummary } from './notification-summary';

function item(value: Partial<ActivityItemDto> & { readonly id: string }): ActivityItemDto {
  const { id, ...overrides } = value;

  return {
    amountMinor: 0,
    category: 'other',
    counterpartyLabel: null,
    createdAt: '2026-05-05T12:00:00.000Z',
    href: undefined,
    id,
    kind: 'financial_request',
    originRequestId: null,
    originSettlementProposalId: null,
    status: 'requires_you',
    subtitle: '',
    title: 'Item',
    tone: 'neutral',
    ...overrides,
  } as ActivityItemDto;
}

describe('notification summary', () => {
  it('counts only alertable unseen items by category', () => {
    const viewedInvite = item({
      id: 'invite-viewed',
      kind: 'friendship_invite',
      status: 'requires_you_response',
    });
    const summary = buildNotificationSummary(
      [
        item({ id: 'request-unseen' }),
        viewedInvite,
        item({
          id: 'local-device-trust-reminder',
          kind: 'system_note',
          sourceType: 'system',
          status: 'pending',
        }),
        item({
          createdByCurrentUser: true,
          id: 'own-request',
          status: 'requires_you',
        }),
      ],
      new Set([notificationViewKeyForItem(viewedInvite)]),
    );

    expect(summary.unreadCount).toBe(2);
    expect(summary.categoryCounts).toEqual({
      friends: 0,
      reminders: 1,
      transactions: 1,
    });
    expect(summary.reviewedItems.map((entry) => entry.id)).toEqual(['invite-viewed']);
    expect(summary.unviewedItems.map((entry) => entry.id)).toEqual([
      'request-unseen',
      'local-device-trust-reminder',
    ]);
  });
});
