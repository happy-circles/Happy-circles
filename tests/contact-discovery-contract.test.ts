import { describe, expect, it } from 'vitest';

import {
  manageContactDiscoverySchema,
  remindFriendshipInviteSchema,
  resolvePeopleTargetsSchema,
} from '../packages/shared/src/contracts/schemas';
import {
  readDiscoverySessionId,
  validateContactPhoneBatch,
} from '../supabase/functions/_shared/contact-discovery';
import { readRpcErrorMessage } from '../supabase/functions/_shared/rpc-error-message';

const sessionId = '00000000-0000-4000-8000-000000000001';

describe('contact discovery contract', () => {
  it('recognizes structured database rate-limit errors as well as thrown errors', () => {
    expect(
      readRpcErrorMessage({ code: 'P0001', message: 'rate_limited: discovery contacts' }),
    ).toContain('rate_limited');
    expect(readRpcErrorMessage(new Error('Invalid phoneE164List'))).toBe('Invalid phoneE164List');
    expect(readRpcErrorMessage({ message: { secret: 'not a message' } })).toBe('Unexpected error');
  });
  it('keeps the old resolver request valid and accepts a private observation session', () => {
    expect(resolvePeopleTargetsSchema.parse({ phoneE164List: ['+573000000001'] })).toEqual({
      phoneE164List: ['+573000000001'],
    });
    expect(readDiscoverySessionId(undefined)).toBeNull();
    expect(readDiscoverySessionId(sessionId)).toBe(sessionId);
    expect(
      resolvePeopleTargetsSchema.parse({
        phoneE164List: ['+573000000001'],
        discoverySessionId: sessionId,
      }).discoverySessionId,
    ).toBe(sessionId);
  });

  it('rejects malformed phones and oversized batches at the server boundary', () => {
    expect(() =>
      validateContactPhoneBatch(
        Array.from({ length: 60 }, (_, index) => `+57300000${String(index).padStart(4, '0')}`),
      ),
    ).not.toThrow();
    for (const phones of [
      [],
      ['3000000001'],
      ['+57300 garbage'],
      Array(61).fill('+573000000001'),
    ]) {
      expect(() => validateContactPhoneBatch(phones)).toThrow('Invalid phoneE164List');
    }
    expect(() => readDiscoverySessionId('user:someone-else')).toThrow();
    expect(() => readDiscoverySessionId(undefined, true)).toThrow();
  });

  it('keeps renewal and reminder intent explicit', () => {
    expect(
      manageContactDiscoverySchema.safeParse({ discoverySessionId: sessionId, action: 'stop' })
        .success,
    ).toBe(true);
    expect(
      manageContactDiscoverySchema.safeParse({
        discoverySessionId: sessionId,
        action: 'subscribe-everyone',
      }).success,
    ).toBe(false);
    expect(remindFriendshipInviteSchema.safeParse({ inviteId: sessionId }).success).toBe(false);
  });
});
