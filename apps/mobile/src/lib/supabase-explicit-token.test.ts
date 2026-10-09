import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Database } from '@happy-circles/shared';

import type { invokeParsedEdgeFunction as InvokeParsedEdgeFunction } from './live-data/mutations/edge-action';

const mocks = vi.hoisted(() => ({
  fetch: vi.fn<typeof globalThis.fetch>(),
  storageGet: vi.fn<(key: string) => Promise<string | null>>(),
  storageRemove: vi.fn(),
  storageSet: vi.fn(),
}));

vi.mock('react-native-url-polyfill/auto', () => ({}));
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
vi.mock('./config', () => ({
  appConfig: {
    supabaseUrl: 'https://transport.supabase.co',
    supabaseAnonKey: 'public-anon-key',
  },
}));
vi.mock('./native-webcrypto', () => ({ installNativeWebCryptoShim: vi.fn() }));
vi.mock('./storage', () => ({
  authStorageAdapter: {
    getItem: mocks.storageGet,
    setItem: mocks.storageSet,
    removeItem: mocks.storageRemove,
  },
}));
vi.mock('./query-client', () => ({ queryClient: { invalidateQueries: vi.fn() } }));
vi.mock('./support-errors', () => ({
  createSupportId: () => 'HC-SDK-TEST',
  isJwtAuthError: () => false,
  readFunctionErrorDetails: (error: Error) => Promise.resolve({ message: error.message }),
  reportAndCreateSupportError: (input: { error: Error }) => input.error,
}));

const actorId = 'a87163fc-8e79-4bf4-9321-1b394cfd8540';
const actorToken = 'captured-actor-jwt';
const authStorageKey = 'sb-transport-auth-token';
const storedValues = new Map<string, string>();
let mainClient: SupabaseClient<Database>;
let explicitClient: SupabaseClient<Database>;
let publicClient: SupabaseClient<Database>;
let invokeParsedEdgeFunction: typeof InvokeParsedEdgeFunction;
let sessionReads: ReturnType<typeof vi.spyOn>;

function requestHeaders(index: number): Headers {
  return new Headers(mocks.fetch.mock.calls[index]?.[1]?.headers);
}

function actorSession(accessToken = actorToken, expiresAt = Math.floor(Date.now() / 1000) + 3600) {
  return {
    access_token: accessToken,
    refresh_token: 'refresh-token',
    expires_at: expiresAt,
    expires_in: 3600,
    token_type: 'bearer',
    user: { id: actorId },
  };
}

describe('explicit-token Edge transport with the installed Supabase SDK', () => {
  beforeAll(async () => {
    storedValues.set(authStorageKey, JSON.stringify(actorSession()));
    mocks.storageGet.mockImplementation((key) => Promise.resolve(storedValues.get(key) ?? null));
    mocks.storageSet.mockImplementation((key: string, value: string) => {
      storedValues.set(key, value);
      return Promise.resolve();
    });
    mocks.storageRemove.mockImplementation((key: string) => {
      storedValues.delete(key);
      return Promise.resolve();
    });
    vi.stubGlobal('fetch', mocks.fetch);
    const clients = await import('./supabase');
    if (!clients.supabase || !clients.explicitTokenEdgeSupabase || !clients.publicEdgeSupabase)
      throw new Error('Expected configured Supabase clients in the SDK fixture.');
    mainClient = clients.supabase;
    explicitClient = clients.explicitTokenEdgeSupabase;
    publicClient = clients.publicEdgeSupabase;
    // Finish the real AuthClient's recovery before measuring request-time reads.
    await mainClient.auth.getSession();
    await mainClient.auth.stopAutoRefresh();
    sessionReads = vi.spyOn(mainClient.auth, 'getSession');
    ({ invokeParsedEdgeFunction } = await import('./live-data/mutations/edge-action'));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    storedValues.set(authStorageKey, JSON.stringify(actorSession()));
    mocks.fetch.mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ status: 'pending' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
  });

  afterAll(async () => {
    await mainClient?.auth.stopAutoRefresh();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('preserves the explicit JWT and API key at HTTP without accessing auth storage', async () => {
    const response = await explicitClient.functions.invoke('create-people-outreach', {
      body: { idempotencyKey: 'intent-a' },
      headers: { Authorization: `Bearer ${actorToken}`, 'x-request-id': 'sdk-request-a' },
    });

    expect(response.error).toBeNull();
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(requestHeaders(0).get('Authorization')).toBe(`Bearer ${actorToken}`);
    expect(requestHeaders(0).get('apikey')).toBe('public-anon-key');
    expect(requestHeaders(0).get('x-request-id')).toBe('sdk-request-a');
    expect(mocks.storageGet).not.toHaveBeenCalled();
    expect(sessionReads).not.toHaveBeenCalled();
    expect(() => explicitClient.auth.getSession()).toThrow(
      'configured with the accessToken option',
    );
  });

  it('keeps the public transport authorization-free even when a JWT is supplied', async () => {
    await publicClient.functions.invoke('public-preview', {
      headers: { Authorization: `Bearer ${actorToken}` },
    });

    expect(requestHeaders(0).has('Authorization')).toBe(false);
    expect(requestHeaders(0).get('apikey')).toBe('public-anon-key');
    expect(mocks.storageGet).not.toHaveBeenCalled();
  });

  it('does not share captured JWTs between concurrent invocations', async () => {
    await Promise.all([
      explicitClient.functions.invoke('create-people-outreach', {
        headers: { Authorization: 'Bearer actor-a-jwt' },
      }),
      explicitClient.functions.invoke('create-people-outreach', {
        headers: { Authorization: 'Bearer actor-b-jwt' },
      }),
    ]);

    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect([
      requestHeaders(0).get('Authorization'),
      requestHeaders(1).get('Authorization'),
    ]).toEqual(['Bearer actor-a-jwt', 'Bearer actor-b-jwt']);
    expect(mocks.storageGet).not.toHaveBeenCalled();
  });

  it('reduces actor-bound invitation session reads from four to three while keeping one HTTP command', async () => {
    const payload = { idempotencyKey: 'fixture-intention', targetUserId: actorId };
    const schema = { parse: () => payload };

    // The unchanged invitation transport is the control: signature, pre/post
    // checks, plus fetchWithAuth's redundant session lookup despite a JWT header.
    await invokeParsedEdgeFunction('create-internal-friendship-invite', schema, payload, {
      expectedUserId: actorId,
    });
    expect(sessionReads).toHaveBeenCalledTimes(4);
    expect(mocks.storageGet).toHaveBeenCalledTimes(4);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(requestHeaders(0).get('Authorization')).toBe(`Bearer ${actorToken}`);

    vi.clearAllMocks();
    await invokeParsedEdgeFunction('create-people-outreach', schema, payload, {
      expectedUserId: actorId,
    });

    expect(sessionReads).toHaveBeenCalledTimes(3);
    expect(mocks.storageGet).toHaveBeenCalledTimes(3);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.fetch.mock.calls[0]?.[0]).toBe(
      'https://transport.supabase.co/functions/v1/create-people-outreach',
    );
    expect(requestHeaders(0).get('Authorization')).toBe(`Bearer ${actorToken}`);
    expect(requestHeaders(0).get('apikey')).toBe('public-anon-key');
  });

  it('lets the main AuthClient refresh an expired stored session before capturing the outreach JWT', async () => {
    storedValues.set(
      authStorageKey,
      JSON.stringify(actorSession('expired-actor-jwt', Math.floor(Date.now() / 1000) - 10)),
    );
    mocks.fetch.mockImplementation((input) =>
      Promise.resolve(
        new Response(
          JSON.stringify(
            input === 'https://transport.supabase.co/auth/v1/token?grant_type=refresh_token'
              ? actorSession('renewed-actor-jwt')
              : { status: 'pending' },
          ),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const payload = { idempotencyKey: 'expired-session-intention' };

    await expect(
      invokeParsedEdgeFunction('create-people-outreach', { parse: () => payload }, payload, {
        expectedUserId: actorId,
      }),
    ).resolves.toEqual({ status: 'pending' });

    expect(sessionReads).toHaveBeenCalledTimes(3);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.fetch.mock.calls[0]?.[0]).toBe(
      'https://transport.supabase.co/auth/v1/token?grant_type=refresh_token',
    );
    expect(mocks.fetch.mock.calls[1]?.[0]).toBe(
      'https://transport.supabase.co/functions/v1/create-people-outreach',
    );
    expect(requestHeaders(1).get('Authorization')).toBe('Bearer renewed-actor-jwt');
    expect(mocks.storageSet).toHaveBeenCalled();
  });
});
