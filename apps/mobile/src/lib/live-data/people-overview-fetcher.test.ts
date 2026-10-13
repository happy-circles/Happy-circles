import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  actor: 'a',
  invoke: vi.fn(),
  refresh: vi.fn(),
  signOut: vi.fn(),
  persist: vi.fn(),
  hydrate: vi.fn(),
  report: vi.fn(({ error }: { error: Error }) => error),
}));
vi.mock('../supabase', () => ({
  explicitTokenEdgeSupabase: null,
  publicEdgeSupabase: null,
  supabase: {
    auth: {
      getSession: async () => ({
        data: { session: { user: { id: mocks.actor }, access_token: `token-${mocks.actor}` } },
      }),
      refreshSession: mocks.refresh,
      signOut: mocks.signOut,
    },
    functions: { invoke: mocks.invoke },
  },
}));
vi.mock('../avatar', () => ({ hydrateSignedAvatarUrlCache: mocks.hydrate }));
vi.mock('../support-errors', () => ({
  createSupportId: () => 'test',
  readFunctionErrorDetails: async () => ({ message: 'jwt expired' }),
  isJwtAuthError: () => true,
  reportAndCreateSupportError: mocks.report,
}));
vi.mock('./people-overview-cache', () => ({ persistCachedPeopleOverview: mocks.persist }));
vi.mock('./build-people-overview', () => ({
  buildPeopleOverview: () => ({ fetchedAt: 'now', people: [] }),
}));

import { fetchPeopleOverviewForUser } from './people-overview-fetcher';
import { setSessionDataIdentity } from '../session-data-boundary';

function switchAccount(actor: string) {
  mocks.actor = actor;
  setSessionDataIdentity({ userId: actor, sessionId: `session-${actor}` });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.report.mockImplementation(({ error }: { error: Error }) => error);
  mocks.persist.mockResolvedValue(undefined);
  switchAccount('a');
});

describe('account-bound people overview reads', () => {
  it('pins the bearer token and forwards cancellation through the real client', async () => {
    const controller = new AbortController();
    mocks.invoke.mockResolvedValue({ data: { avatarSignedUrlsByPath: {} }, error: null });
    await expect(fetchPeopleOverviewForUser('a', controller.signal)).resolves.toEqual({
      fetchedAt: 'now',
      people: [],
    });
    expect(mocks.invoke).toHaveBeenCalledWith(
      'get-people-overview',
      expect.objectContaining({
        signal: controller.signal,
        headers: expect.objectContaining({ Authorization: 'Bearer token-a' }) as Record<
          string,
          string
        >,
      }),
    );
    expect(mocks.persist).toHaveBeenCalledWith(
      'a',
      expect.any(Object),
      {},
      { assertCurrent: expect.any(Function) as () => void },
    );
  });

  it('never caches or publishes a previous account response after A -> B -> A', async () => {
    mocks.invoke.mockImplementation(async () => {
      switchAccount('b');
      switchAccount('a');
      return { data: { avatarSignedUrlsByPath: {} }, error: null };
    });
    await expect(fetchPeopleOverviewForUser('a')).rejects.toThrow('La sesión cambió');
    expect(mocks.persist).not.toHaveBeenCalled();
    expect(mocks.hydrate).not.toHaveBeenCalled();
    expect(mocks.report).not.toHaveBeenCalled();
  });

  it('never retries an expired A request with B after token renewal', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: new Error('jwt expired') });
    mocks.refresh.mockImplementation(async () => {
      switchAccount('b');
      return { data: { session: { user: { id: 'b' }, access_token: 'token-b' } }, error: null };
    });
    await expect(fetchPeopleOverviewForUser('a')).rejects.toThrow('La sesión cambió');
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.persist).not.toHaveBeenCalled();
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it('does not sign out B when an old refresh fails', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: new Error('jwt expired') });
    mocks.refresh.mockImplementation(async () => {
      switchAccount('b');
      return { data: { session: null }, error: new Error('expired') };
    });
    await expect(fetchPeopleOverviewForUser('a')).rejects.toThrow('La sesión cambió');
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.persist).not.toHaveBeenCalled();
  });

  it('discards a canceled response even if transport still resolves', async () => {
    const controller = new AbortController();
    mocks.invoke.mockImplementation(async () => {
      controller.abort();
      return { data: { avatarSignedUrlsByPath: {} }, error: null };
    });
    await expect(fetchPeopleOverviewForUser('a', controller.signal)).rejects.toThrow('cancelada');
    expect(mocks.persist).not.toHaveBeenCalled();
    expect(mocks.hydrate).not.toHaveBeenCalled();
  });
});
