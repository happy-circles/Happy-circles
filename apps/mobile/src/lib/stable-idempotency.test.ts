import { describe, expect, it } from 'vitest';

import { resolveStableIdempotencyKey } from './stable-idempotency';

describe('resolveStableIdempotencyKey', () => {
  it('keeps the key stable for retries of the same logical operation', () => {
    const first = resolveStableIdempotencyKey(null, 'invite-a:device-a', 'activate_invite');
    const retry = resolveStableIdempotencyKey(first, 'invite-a:device-a', 'activate_invite');

    expect(retry).toBe(first);
    expect(retry.key).toBe(first.key);
  });

  it('creates a new key when the invite or device changes', () => {
    const first = resolveStableIdempotencyKey(null, 'invite-a:device-a', 'activate_invite');
    const next = resolveStableIdempotencyKey(first, 'invite-b:device-a', 'activate_invite');

    expect(next.signature).toBe('invite-b:device-a');
    expect(next).not.toBe(first);
  });
});
