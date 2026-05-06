import { afterEach, describe, expect, it, vi } from 'vitest';

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
  balanceFocusHref,
  isReceivedInvite,
  isSentInvite,
  isVisibleInviteHistory,
  sortInviteRequestItems,
  type InviteRequestItem,
} from './dashboard-helpers';
import {
  compareEnrichedContacts,
  isFreshQrDelivery,
  type EnrichedContact,
} from './contacts-sheet-helpers';

function invite(value: Partial<InviteRequestItem>): InviteRequestItem {
  return {
    id: 'invite-1',
    inviteId: 'invite-1',
    kind: 'friendship_invite',
    flow: 'internal',
    actorRole: 'recipient',
    originChannel: 'internal',
    actionState: 'requires_you_response',
    title: 'Ben quiere conectar contigo',
    subtitle: 'Solicitud de amistad',
    status: 'requires_you_response',
    ctaLabel: 'Responder',
    href: '/activity',
    createdAt: '2026-05-05T12:00:00.000Z',
    ...value,
  } as InviteRequestItem;
}

function enriched(value: {
  readonly alias: string;
  readonly phone: string;
  readonly status: string | null;
}): EnrichedContact {
  return {
    contact: {
      alias: value.alias,
      contactId: value.alias,
      searchKey: value.alias.toLocaleLowerCase('es-CO'),
      phoneOptions: [
        {
          id: `${value.alias}-phone`,
          label: 'mobile',
          maskedPhone: value.phone,
          phoneE164: value.phone,
        },
      ],
      primaryPhone: {
        id: `${value.alias}-phone`,
        label: 'mobile',
        maskedPhone: value.phone,
        phoneE164: value.phone,
      },
    },
    resolution: value.status ? ({ status: value.status } as EnrichedContact['resolution']) : null,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('dashboard invite helpers', () => {
  it('sorts and buckets invite requests without screen state', () => {
    const older = invite({ id: 'older', createdAt: '2026-05-01T12:00:00.000Z' });
    const newer = invite({ id: 'newer', createdAt: '2026-05-03T12:00:00.000Z' });
    const sent = invite({
      id: 'sent',
      actorRole: 'sender',
      actionState: 'pending_claim',
      originChannel: 'qr',
    });

    expect(sortInviteRequestItems([older, newer]).map((item) => item.id)).toEqual([
      'newer',
      'older',
    ]);
    expect(isReceivedInvite(newer)).toBe(true);
    expect(isSentInvite(sent)).toBe(true);
  });

  it('hides anonymous QR history and keeps balance focus routes stable', () => {
    expect(
      isVisibleInviteHistory(
        invite({
          actionState: 'history',
          originChannel: 'qr',
          status: 'expired',
          counterpartyLabel: undefined,
          profileUserId: undefined,
        }),
      ),
    ).toBe(false);
    expect(balanceFocusHref('categories')).toBe('/categories');
    expect(balanceFocusHref('settlements')).toBe('/balance?segment=settlements');
  });
});

describe('contact sheet helpers', () => {
  it('ranks in-app contacts ahead of pending activations and external invites', () => {
    const sorted = [
      enriched({ alias: 'Zoe', phone: '+573003', status: 'no_account' }),
      enriched({ alias: 'Ana', phone: '+573001', status: 'active_user' }),
      enriched({ alias: 'Ben', phone: '+573002', status: 'pending_activation' }),
    ].sort(compareEnrichedContacts);

    expect(sorted.map((item) => item.contact.alias)).toEqual(['Ana', 'Ben', 'Zoe']);
  });

  it('treats QR deliveries as reusable only while fresh', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-05T12:00:00.000Z'));

    expect(
      isFreshQrDelivery({
        deliveryToken: 'token',
        expiresAt: '2026-05-05T12:02:00.000Z',
        channel: 'qr',
      } as never),
    ).toBe(true);
    expect(
      isFreshQrDelivery({
        deliveryToken: 'token',
        expiresAt: '2026-05-05T12:00:30.000Z',
        channel: 'qr',
      } as never),
    ).toBe(false);
  });
});
