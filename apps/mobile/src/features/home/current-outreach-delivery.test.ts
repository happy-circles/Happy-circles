import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccountInviteDeliveryResult } from '@/lib/live-data/types-runtime';

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), preview: vi.fn() }));
vi.mock('@/lib/live-data/client', () => ({
  assertSupabaseClient: () => ({ auth: { getSession: mocks.getSession } }),
}));
vi.mock('@/features/invites/invite-delivery-validation', () => ({
  assertAccountDeliveryCurrent: mocks.preview,
}));

import { assertCurrentOutreachDelivery } from './current-outreach-delivery';

const now = Date.parse('2026-10-09T04:00:00Z');
const phoneE164 = '+573001234567';
const delivery: AccountInviteDeliveryResult = {
  inviteId: 'invite',
  deliveryId: 'delivery',
  deliveryToken: 'private-token',
  status: 'pending_activation',
  channel: 'remote',
  originChannel: 'remote',
  expiresAt: '2099-01-01T00:00:00Z',
  inviteExpiresAt: '2099-01-01T00:00:00Z',
  intendedRecipientAlias: 'Ana',
  intendedRecipientPhoneE164: phoneE164,
  intendedRecipientPhoneLabel: null,
};
const validation = {
  status: 'current',
  ownerUserId: 'sender',
  inviteId: delivery.inviteId,
  deliveryId: delivery.deliveryId,
  phoneE164,
  channel: 'remote',
  deliveryStatus: 'issued',
  validatedAt: new Date(now).toISOString(),
  expiresAt: delivery.expiresAt,
  inviteExpiresAt: delivery.inviteExpiresAt,
};
const input = { delivery, validation, expectedUserId: 'sender', phoneE164 };
const session = (id: string | null) => ({
  data: { session: id ? { user: { id } } : null },
  error: null,
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  mocks.getSession.mockReset().mockResolvedValue(session('sender'));
  mocks.preview.mockReset().mockResolvedValue(undefined);
});
afterEach(() => vi.useRealTimers());

describe('fresh contact outreach delivery', () => {
  it.each(['issued', 'authenticated'])(
    'uses the server validation for a current %s delivery',
    async (deliveryStatus) => {
      await assertCurrentOutreachDelivery({
        ...input,
        validation: { ...validation, deliveryStatus },
      });
      expect(mocks.getSession).toHaveBeenCalledOnce();
      expect(mocks.preview).not.toHaveBeenCalled();
    },
  );

  it('preserves preview validation for a legacy response', async () => {
    await assertCurrentOutreachDelivery({ ...input, validation: undefined });
    expect(mocks.preview).toHaveBeenCalledExactlyOnceWith(delivery);
    expect(mocks.getSession).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['different owner', { ownerUserId: 'other' }],
    ['different contact', { phoneE164: '+573009876543' }],
    ['missing contact', { phoneE164: undefined }],
    ['different invite', { inviteId: 'old-invite' }],
    ['different delivery', { deliveryId: 'old-delivery' }],
    ['QR channel', { channel: 'qr' }],
    ['revoked delivery', { deliveryStatus: 'revoked' }],
    ['wrong status', { status: 'expired' }],
    ['different expiry', { expiresAt: '2099-02-01T00:00:00Z' }],
    ['different invite expiry', { inviteExpiresAt: '2099-02-01T00:00:00Z' }],
    ['invalid validation time', { validatedAt: 'invalid' }],
    ['future validation time', { validatedAt: new Date(now + 1).toISOString() }],
    ['stale validation time', { validatedAt: new Date(now - 15_001).toISOString() }],
  ])('falls back to the preview for %s', async (_label, patch) => {
    await assertCurrentOutreachDelivery({ ...input, validation: { ...validation, ...patch } });
    expect(mocks.preview).toHaveBeenCalledExactlyOnceWith(delivery);
  });

  it.each([null, [], 'current', { status: 'current' }])(
    'does not trust malformed validation %j',
    async (proof) => {
      await assertCurrentOutreachDelivery({ ...input, validation: proof });
      expect(mocks.preview).toHaveBeenCalledOnce();
    },
  );

  it.each([
    { intendedRecipientPhoneE164: '+573009876543' },
    { deliveryToken: '' },
    { status: 'accepted' },
    { channel: 'qr' as const },
    { originChannel: 'qr' as const },
  ])('does not reuse proof with a different result %j', async (patch) => {
    await assertCurrentOutreachDelivery({ ...input, delivery: { ...delivery, ...patch } });
    expect(mocks.preview).toHaveBeenCalledOnce();
  });

  it('revalidates a proof that aged while the system share dialog was open', async () => {
    await assertCurrentOutreachDelivery(input);
    vi.setSystemTime(now + 15_001);
    await assertCurrentOutreachDelivery(input);
    expect(mocks.preview).toHaveBeenCalledExactlyOnceWith(delivery);
  });

  it('rejects an expired delivery instead of treating its old proof as current', async () => {
    const expiresAt = new Date(now + 1000).toISOString();
    const expiringInput = {
      ...input,
      delivery: { ...delivery, expiresAt, inviteExpiresAt: expiresAt },
      validation: { ...validation, expiresAt, inviteExpiresAt: expiresAt },
    };
    await assertCurrentOutreachDelivery(expiringInput);
    vi.setSystemTime(now + 1001);
    mocks.preview.mockRejectedValue(new Error('El acceso venció.'));
    await expect(assertCurrentOutreachDelivery(expiringInput)).rejects.toThrow('venció');
    expect(mocks.preview).toHaveBeenCalledOnce();
  });

  it.each([null, 'new-account'])(
    'blocks a changed actor %s before using the token',
    async (actor) => {
      mocks.getSession.mockResolvedValue(session(actor));
      await expect(assertCurrentOutreachDelivery(input)).rejects.toThrow('sesión cambió');
      expect(mocks.preview).not.toHaveBeenCalled();
    },
  );

  it('detects an account switch while a legacy preview was pending', async () => {
    mocks.getSession
      .mockResolvedValueOnce(session('sender'))
      .mockResolvedValueOnce(session('other'));
    await expect(
      assertCurrentOutreachDelivery({ ...input, validation: undefined }),
    ).rejects.toThrow('sesión cambió');
    expect(mocks.preview).toHaveBeenCalledOnce();
  });

  it('propagates revoked legacy delivery errors', async () => {
    mocks.preview.mockRejectedValue(new Error('El acceso fue revocado.'));
    await expect(
      assertCurrentOutreachDelivery({ ...input, validation: undefined }),
    ).rejects.toThrow('revocado');
  });
});
