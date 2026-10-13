import { beforeEach, describe, expect, it } from 'vitest';

import { queryClient } from './query-client';
import {
  assertSessionDataGeneration,
  captureSessionDataGeneration,
  invalidateSessionData,
  setSessionDataIdentity,
} from './session-data-boundary';

beforeEach(() => {
  setSessionDataIdentity(null);
  queryClient.clear();
});

describe('session data boundary', () => {
  it('cancels pending private queries and removes only the previous account memory', async () => {
    setSessionDataIdentity({ userId: 'a', sessionId: 'a-session' });
    queryClient.setQueryData(['people-overview', 'a'], { secret: 'a' });
    queryClient.setQueryData(['people-overview', 'b'], { secret: 'b' });
    queryClient.setQueryData(['public-preview', 'a'], { public: true });
    let signal: AbortSignal | undefined;
    const pending = queryClient
      .fetchQuery({
        queryKey: ['app-snapshot', 'a'],
        queryFn: (context) => {
          signal = context.signal;
          return new Promise<never>(() => undefined);
        },
      })
      .catch(() => undefined);
    setSessionDataIdentity({ userId: 'b', sessionId: 'b-session' });
    await pending;
    expect(signal?.aborted).toBe(true);
    expect(queryClient.getQueryData(['app-snapshot', 'a'])).toBeUndefined();
    expect(queryClient.getQueryData(['people-overview', 'a'])).toBeUndefined();
    expect(queryClient.getQueryData(['people-overview', 'b'])).toEqual({ secret: 'b' });
    expect(queryClient.getQueryData(['public-preview', 'a'])).toEqual({ public: true });
  });

  it('invalidates old work after A -> B -> A even with the original session ID', () => {
    const a = { userId: 'a', sessionId: 'a-session' };
    setSessionDataIdentity(a);
    const generation = captureSessionDataGeneration();
    setSessionDataIdentity({ userId: 'b', sessionId: 'b-session' });
    setSessionDataIdentity(a);
    expect(() => assertSessionDataGeneration(generation)).toThrow('La sesión cambió');
  });

  it('keeps a token refresh in the same session, but invalidates revocation and sign-out', () => {
    const a = { userId: 'a', sessionId: 'a-session' };
    setSessionDataIdentity(a);
    const first = captureSessionDataGeneration();
    setSessionDataIdentity({ ...a });
    expect(captureSessionDataGeneration()).toBe(first);
    queryClient.setQueryData(['people-overview', 'a'], { secret: 'a' });
    invalidateSessionData();
    expect(() => assertSessionDataGeneration(first)).toThrow('La sesión cambió');
    expect(queryClient.getQueryData(['people-overview', 'a'])).toBeUndefined();
    const second = captureSessionDataGeneration();
    setSessionDataIdentity(null);
    expect(() => assertSessionDataGeneration(second)).toThrow('La sesión cambió');
  });
});
