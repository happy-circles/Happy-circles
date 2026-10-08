import { describe, expect, it, vi } from 'vitest';

import { isPushEventCurrent } from '../../supabase/functions/send-push-notifications/eligibility';

describe('friendship push delivery eligibility', () => {
  const event = { id: 'event-1', source_kind: 'friendship_invite' };

  it('suppresses a queued notification after cancellation or expiry', async () => {
    const check = vi.fn().mockResolvedValue({ data: false, error: null });
    expect(await isPushEventCurrent(event, check)).toBe(false);
    expect(check).toHaveBeenCalledWith('event-1');
  });

  it('allows a valid invitation or reminder without claiming it was delivered', async () => {
    expect(await isPushEventCurrent(event, async () => ({ data: true, error: null }))).toBe(true);
  });

  it('fails closed on missing data and retries verification errors', async () => {
    expect(await isPushEventCurrent(event, async () => ({ data: null, error: null }))).toBe(false);
    await expect(
      isPushEventCurrent(event, async () => ({ data: null, error: new Error('offline') })),
    ).rejects.toThrow('offline');
  });

  it('preserves other notification workflows', async () => {
    const check = vi.fn();
    expect(await isPushEventCurrent({ ...event, source_kind: 'financial_request' }, check)).toBe(
      true,
    );
    expect(check).not.toHaveBeenCalled();
  });
});
