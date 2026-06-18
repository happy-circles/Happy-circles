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
  inviteRequestEmptyDescription,
  isReceivedInvite,
  isSentInvite,
  isVisibleInviteHistory,
  shouldSurfaceHomePendingPreview,
  sortInviteRequestItems,
  statusLabelForHomePendingPreview,
  statusLabelForInvite,
  type InviteRequestItem,
} from './dashboard-helpers';
import {
  compareEnrichedContacts,
  isFreshQrDelivery,
  type EnrichedContact,
} from './contacts-sheet-helpers';
import { buildDashboardTransactionPreview } from './dashboard-transaction-preview';
import type { ActivityItemDto } from '@happy-circles/application';

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
    expect(statusLabelForInvite(newer)).toBe('Por responder');
    expect(statusLabelForInvite(sent)).toBe('Pendiente de abrir');
    expect(inviteRequestEmptyDescription('sent')).toBe(
      'Las invitaciones que envíes quedarán en esta pestaña.',
    );
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
    expect(balanceFocusHref('balance')).toBe('/transactions');
    expect(balanceFocusHref('people')).toBe('/people?filter=movements');
    expect(balanceFocusHref('categories')).toBe('/categories');
    expect(balanceFocusHref('circles')).toBe('/circles');
  });

  it('surfaces non-transaction pending previews on home', () => {
    expect(
      shouldSurfaceHomePendingPreview({
        id: 'account-review',
        kind: 'account_invite',
        title: 'Esperando validacion',
        subtitle: 'Ya activaste este acceso',
        status: 'waiting_sender_review',
        ctaLabel: 'Ver',
        href: '/activity?domain=friendships',
      }),
    ).toBe(true);
    expect(
      shouldSurfaceHomePendingPreview({
        id: 'request-1',
        kind: 'financial_request',
        title: 'Solicitud pendiente',
        subtitle: 'Ben | hoy',
        status: 'requires_you',
        ctaLabel: 'Responder',
        href: '/person/user-ben',
      }),
    ).toBe(false);
    expect(
      statusLabelForHomePendingPreview({
        kind: 'account_invite',
        status: 'waiting_sender_review',
      }),
    ).toBe('Esperando validaci\u00f3n');
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

describe('dashboard transaction preview', () => {
  function activityItem(
    value: Partial<ActivityItemDto> & { readonly id: string },
  ): ActivityItemDto {
    const { id, ...overrides } = value;

    return {
      id,
      kind: 'payment',
      title: 'Movimiento',
      subtitle: 'Ben | hoy',
      status: 'posted',
      amountMinor: 1000,
      category: 'food_drinks',
      counterpartyLabel: 'Ben',
      happenedAt: '2026-05-01T12:00:00.000Z',
      tone: 'positive',
      ...overrides,
    };
  }

  it('keeps pending previews ahead of date-sorted history', () => {
    const unviewedPending = activityItem({
      id: 'pending-new',
      kind: 'financial_request',
      status: 'requires_you',
      title: 'Ben te pidio revisar',
      happenedAt: undefined,
    }) as ActivityItemDto & { readonly createdAt: string };
    const viewedPending = activityItem({
      id: 'pending-viewed',
      kind: 'financial_request',
      status: 'requires_you',
      title: 'Carla te pidio revisar',
      happenedAt: undefined,
    }) as ActivityItemDto & { readonly createdAt: string };
    const history = activityItem({
      id: 'history-new',
      happenedAt: '2026-05-04T12:00:00.000Z',
      status: 'posted',
    });
    const olderHistory = activityItem({
      id: 'history-old',
      happenedAt: '2026-05-02T12:00:00.000Z',
      status: 'posted',
    });

    Object.assign(unviewedPending, { createdAt: '2026-05-05T12:00:00.000Z' });
    Object.assign(viewedPending, { createdAt: '2026-05-03T12:00:00.000Z' });

    const preview = buildDashboardTransactionPreview({
      historyItems: [olderHistory, history],
      limit: 4,
      notificationViewedKeys: new Set(['financial_request:pending-viewed:requires_you']),
      pendingItems: [viewedPending, unviewedPending],
    });

    expect(
      preview.visibleItems.map(({ highlightPending, isPending, item, unread }) => ({
        highlightPending,
        id: item.id,
        isPending,
        unread,
      })),
    ).toEqual([
      { highlightPending: true, id: 'pending-new', isPending: true, unread: true },
      { highlightPending: true, id: 'pending-viewed', isPending: true, unread: false },
      { highlightPending: false, id: 'history-new', isPending: false, unread: false },
      { highlightPending: false, id: 'history-old', isPending: false, unread: false },
    ]);
  });

  it('does not show a replaced happy circle history item next to its active version', () => {
    const pendingCircle = activityItem({
      happyCircleCaseId: 'case-1',
      id: 'settlement-v2',
      kind: 'settlement_proposal',
      originSettlementProposalId: 'settlement-v2',
      replacesProposalId: 'settlement-v1',
      status: 'pending_approvals',
    }) as ActivityItemDto & { readonly createdAt: string };
    const staleCircle = activityItem({
      happyCircleCaseId: 'case-1',
      id: 'settlement-v1:stale',
      kind: 'settlement',
      originSettlementProposalId: 'settlement-v1',
      replacedByProposalId: 'settlement-v2',
      status: 'stale',
    });

    Object.assign(pendingCircle, { createdAt: '2026-05-05T12:00:00.000Z' });

    const preview = buildDashboardTransactionPreview({
      historyItems: [staleCircle],
      limit: 4,
      notificationViewedKeys: new Set(),
      pendingItems: [pendingCircle],
    });

    expect(preview.visibleItems.map(({ item }) => item.id)).toEqual(['settlement-v2']);
  });

  it('normalizes history item kinds before building the home preview', () => {
    const manualPayment = activityItem({
      id: 'manual-payment',
      kind: 'manual_payment',
      status: 'posted',
    });

    const preview = buildDashboardTransactionPreview({
      historyItems: [manualPayment],
      limit: 4,
      notificationViewedKeys: new Set(),
      pendingItems: [],
    });

    expect(preview.visibleItems.map(({ item }) => [item.id, item.kind])).toEqual([
      ['manual-payment', 'payment'],
    ]);
  });

  it('keeps both direct closed Circle ledger movements in the preview', () => {
    const outgoingMovement = activityItem({
      amountMinor: 25_000,
      category: 'cycle',
      flowLabel: 'Tu -> Sofia',
      happenedAt: '2026-05-05T12:00:00.000Z',
      id: 'ledger-outgoing',
      kind: 'settlement',
      originSettlementProposalId: 'settlement-1',
      status: 'posted',
      tone: 'negative',
    });
    const incomingMovement = activityItem({
      amountMinor: 25_000,
      category: 'cycle',
      flowLabel: 'Mateo -> Tu',
      happenedAt: '2026-05-05T12:01:00.000Z',
      id: 'ledger-incoming',
      kind: 'settlement',
      originSettlementProposalId: 'settlement-1',
      status: 'posted',
      tone: 'positive',
    });
    const executedProposal = activityItem({
      amountMinor: 50_000,
      category: 'cycle',
      happenedAt: '2026-05-05T12:02:00.000Z',
      id: 'settlement-1:executed',
      kind: 'settlement',
      originSettlementProposalId: 'settlement-1',
      status: 'executed',
      tone: 'neutral',
    });

    const preview = buildDashboardTransactionPreview({
      historyItems: [outgoingMovement, incomingMovement, executedProposal],
      limit: 4,
      notificationViewedKeys: new Set(),
      pendingItems: [],
    });

    expect(preview.visibleItems.map(({ item }) => item.id)).toEqual([
      'ledger-incoming',
      'ledger-outgoing',
    ]);
  });
});
