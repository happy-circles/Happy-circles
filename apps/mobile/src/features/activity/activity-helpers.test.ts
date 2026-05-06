import { describe, expect, it, vi } from 'vitest';

import type { ActivityItemDto, PersonCardDto } from '@happy-circles/application';

vi.mock('react-native', () => ({
  Platform: {
    OS: 'web',
    select: (options: Record<string, unknown>) => options.web ?? options.default,
  },
  StyleSheet: {
    create: (styles: unknown) => styles,
    hairlineWidth: 1,
  },
}));

import {
  initialCategoryFromDomain,
  inviteRequestTabForNotification,
  matchesNotificationCategory,
  notificationCategoryForItem,
  parseActivityDomainParam,
  parseNotificationCategoryParam,
  pendingDetailHref,
  personIdFromHref,
} from './activity-helpers';

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

describe('activity helpers', () => {
  it('parses activity category params', () => {
    expect(parseActivityDomainParam('friendships')).toBe('friendships');
    expect(parseActivityDomainParam(['transactions'])).toBe('transactions');
    expect(parseActivityDomainParam('unknown')).toBeNull();
    expect(parseNotificationCategoryParam('reminders')).toBe('reminders');
    expect(parseNotificationCategoryParam('bad')).toBeNull();
    expect(initialCategoryFromDomain('friendships')).toBe('friends');
    expect(initialCategoryFromDomain(null)).toBe('all');
  });

  it('classifies notification items', () => {
    expect(notificationCategoryForItem(item({ kind: 'friendship_invite' }))).toBe('friends');
    expect(notificationCategoryForItem(item({ kind: 'system_note' }))).toBe('reminders');
    expect(notificationCategoryForItem(item({ kind: 'financial_request' }))).toBe('transactions');
    expect(matchesNotificationCategory(item({ kind: 'financial_request' }), 'all')).toBe(true);
    expect(matchesNotificationCategory(item({ kind: 'financial_request' }), 'friends')).toBe(false);
  });

  it('derives notification targets for settlements, invites and transactions', () => {
    expect(
      pendingDetailHref(item({ id: 'settlement-1', kind: 'settlement_proposal' }), []),
    ).toEqual({ href: '/settlements/settlement-1' });
    expect(
      pendingDetailHref(
        item({
          actorRole: 'sender',
          kind: 'friendship_invite',
          status: 'waiting_sender_review',
        } as Partial<ActivityItemDto>),
        [],
      ),
    ).toEqual({
      href: '/home',
      homeIntent: { kind: 'open_invite_requests', tab: 'sent' },
    });
    expect(
      pendingDetailHref(
        item({
          counterpartyLabel: 'Ana',
          id: 'request-1',
          kind: 'financial_request',
          originRequestId: 'origin-1',
          status: 'requires_you',
        }),
        [person({ displayName: 'Ana', userId: 'user-ana' })],
      ),
    ).toEqual({
      href: '/person/user-ana?panel=pending&focus=origin-1',
    });
  });

  it('decodes person ids and invite tabs', () => {
    expect(personIdFromHref('/person/user%2Fencoded?panel=pending')).toBe('user/encoded');
    expect(
      inviteRequestTabForNotification(
        item({ kind: 'account_invite', status: 'pending_activation' }),
      ),
    ).toBe('sent');
    expect(
      inviteRequestTabForNotification(
        item({ kind: 'friendship_invite', status: 'requires_you_response' }),
      ),
    ).toBe('received');
  });
});
