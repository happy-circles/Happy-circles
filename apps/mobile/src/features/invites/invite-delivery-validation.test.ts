import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AccountInviteDeliveryResult,
  FriendshipInviteDeliveryResult,
} from '@/lib/live-data/types-runtime';
const invoke = vi.hoisted(() => vi.fn());
vi.mock('@/lib/live-data/mutations/edge-action', () => ({ invokeParsedEdgeFunction: invoke }));
vi.mock('@/lib/live-data/client', () => ({
  assertSupabaseClient: () => ({
    auth: { getSession: async () => ({ data: { session: { user: { id: 'sender' } } } }) },
  }),
}));
import {
  assertAccountDeliveryCurrent,
  assertFriendshipDeliveryCurrent,
} from './invite-delivery-validation';

const delivery: FriendshipInviteDeliveryResult = {
  inviteId: 'invite',
  deliveryId: 'delivery',
  deliveryToken: 'opaque-token',
  flow: 'external',
  status: 'pending_claim',
  channel: 'remote',
  originChannel: 'remote',
  expiresAt: '2099-01-01T00:00:00Z',
  inviteExpiresAt: '2099-01-01T00:00:00Z',
  intendedRecipientAlias: null,
  intendedRecipientPhoneE164: null,
  intendedRecipientPhoneLabel: null,
};
beforeEach(() => invoke.mockReset());
describe('fresh delivery validation before sharing', () => {
  it.each(['canceled', 'rejected', 'expired', 'accepted'])(
    'does not share an original pending replay after %s',
    async (status) => {
      invoke.mockResolvedValue({
        inviteId: 'invite',
        status,
        deliveryStatus: 'revoked',
        expiresAt: delivery.expiresAt,
      });
      await expect(assertFriendshipDeliveryCurrent(delivery)).rejects.toThrow('cambió de estado');
    },
  );
  it('detects a rotated token while the invitation remains pending', async () => {
    invoke.mockResolvedValue({
      inviteId: 'invite',
      status: 'pending_claim',
      deliveryStatus: 'revoked',
      expiresAt: delivery.expiresAt,
    });
    await expect(assertFriendshipDeliveryCurrent(delivery)).rejects.toThrow('cambió de estado');
  });
  it('permits an issued token only after the current preview confirms it', async () => {
    invoke.mockResolvedValue({
      inviteId: 'invite',
      status: 'pending_claim',
      deliveryStatus: 'issued',
      expiresAt: delivery.expiresAt,
    });
    await expect(assertFriendshipDeliveryCurrent(delivery)).resolves.toBeUndefined();
  });
  it('checks an account access without recording the sender as its recipient opening it', async () => {
    invoke.mockResolvedValue({
      inviteId: 'invite',
      status: 'pending_activation',
      deliveryStatus: 'issued',
      expiresAt: delivery.expiresAt,
    });
    const access: AccountInviteDeliveryResult = { ...delivery, status: 'pending_activation' };
    await expect(assertAccountDeliveryCurrent(access)).resolves.toBeUndefined();
    expect(invoke.mock.calls[0]?.[2]).toEqual({
      deliveryToken: 'opaque-token',
      recordAppOpen: false,
    });
  });
});
