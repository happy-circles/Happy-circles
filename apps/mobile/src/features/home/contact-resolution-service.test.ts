import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PeopleTargetResolution } from '@/lib/live-data/types-runtime';

const mocks = vi.hoisted(() => ({
  actor: 'discovery-user',
  invoke:
    vi.fn<
      (
        name: string,
        schema: unknown,
        input: unknown,
        options: unknown,
      ) => Promise<PeopleTargetResolution[]>
    >(),
  manage: vi.fn(async () => ({ status: 'stopped' })),
  getSession: vi.fn(async () => ({ data: { session: { user: { id: 'discovery-user' } } } })),
  save: vi.fn(async () => undefined),
}));
vi.mock('@/lib/live-data/mutations/edge-action', () => ({
  invokeParsedEdgeFunction: mocks.invoke,
}));
vi.mock('@/lib/live-data/client', () => ({
  assertSupabaseClient: () => ({
    auth: { getSession: mocks.getSession },
  }),
  invokeSupabaseFunction: mocks.manage,
}));
vi.mock('./people-target-resolution-cache', () => ({
  savePeopleTargetResolutionsToCache: mocks.save,
}));

import {
  invalidateContactResolutions,
  readContactResolutions,
  setContactRealtimeReady,
} from '@/lib/contact-resolution-state';
import {
  disposeContactResolutionUser,
  resolveContactPhones,
  setContactDiscoverySession,
} from './contact-resolution-service';

function row(status: PeopleTargetResolution['status']): PeopleTargetResolution {
  return {
    phoneE164: '+573001234567',
    status,
    discoveryWatchId: 'opaque-watch',
    accountInviteId: null,
    accountInviteStatus: null,
    avatarPath: null,
    displayName: null,
    friendshipInviteId: null,
    matchedUserId: status === 'active_user' ? 'person' : null,
    relationshipId: null,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  mocks.actor = 'discovery-user';
  mocks.invoke.mockReset();
  mocks.manage.mockReset().mockResolvedValue({ status: 'stopped' });
  mocks.getSession.mockReset().mockImplementation(async () => ({
    data: { session: { user: { id: mocks.actor } } },
  }));
  mocks.save.mockClear();
});
afterEach(() => {
  disposeContactResolutionUser('discovery-user');
  vi.useRealTimers();
});

describe('contact resolution service races', () => {
  it.each(['watch', 'mutation'] as const)(
    'immediately rechecks a first response invalidated by a %s before delivery',
    async (kind) => {
      setContactDiscoverySession(mocks.actor, 'c8176506-336f-49b7-a7f2-0ebd3d78ec76');
      setContactRealtimeReady(mocks.actor, true);
      mocks.invoke
        .mockImplementationOnce(async () => {
          invalidateContactResolutions(
            kind === 'watch'
              ? { userId: mocks.actor, watchIds: ['opaque-watch'] }
              : { userId: mocks.actor, inviteId: 'unknown-invite' },
          );
          return [row('no_account')];
        })
        .mockResolvedValue([row('active_user')]);
      const result = resolveContactPhones(mocks.actor, [row('no_account').phoneE164], 'visible');
      await vi.advanceTimersByTimeAsync(10);
      expect((await result)[0].status).toBe('active_user');
      expect(mocks.invoke).toHaveBeenCalledTimes(2);
      expect(readContactResolutions(mocks.actor)[row('no_account').phoneE164].status).toBe(
        'active_user',
      );
    },
  );

  it('refuses an in-flight response after switching accounts', async () => {
    mocks.invoke.mockImplementationOnce(async () => {
      mocks.actor = 'other-user';
      return [row('active_user')];
    });
    const result = resolveContactPhones(
      'discovery-user',
      [row('no_account').phoneE164],
      'interactive',
    ).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(10);
    expect(await result).toBeInstanceOf(Error);
    expect(readContactResolutions('discovery-user')).toEqual({});
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('does not recreate the remaining background scan when the contacts sheet closes', async () => {
    setContactDiscoverySession(mocks.actor, 'c8176506-336f-49b7-a7f2-0ebd3d78ec76');
    setContactRealtimeReady(mocks.actor, true);
    let release!: (rows: PeopleTargetResolution[]) => void;
    mocks.invoke.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const phones = Array.from({ length: 120 }, (_, index) => `+57300${index}`);
    const result = resolveContactPhones(mocks.actor, phones, 'background').catch(
      (error: unknown) => error,
    );
    await vi.advanceTimersByTimeAsync(1);
    setContactDiscoverySession(mocks.actor, null);
    release(phones.slice(0, 60).map((phoneE164) => ({ ...row('no_account'), phoneE164 })));
    await vi.runAllTimersAsync();
    expect(await result).toBeInstanceOf(Error);
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.manage).toHaveBeenCalledExactlyOnceWith(
      'manage-contact-discovery',
      { discoverySessionId: 'c8176506-336f-49b7-a7f2-0ebd3d78ec76', action: 'stop' },
      { expectedUserId: 'discovery-user' },
    );
  });

  it.each(['success', 'failure'] as const)(
    'repeats stop after a closed session finishes its in-flight read with %s',
    async (outcome) => {
      const sessionId = 'c8176506-336f-49b7-a7f2-0ebd3d78ec76';
      const readError = new Error('Network response lost');
      setContactDiscoverySession(mocks.actor, sessionId);
      setContactRealtimeReady(mocks.actor, true);
      let finish!: () => void;
      mocks.invoke.mockImplementationOnce(
        () =>
          new Promise((resolve, reject) => {
            finish = () =>
              outcome === 'success' ? resolve([row('no_account')]) : reject(readError);
          }),
      );
      const result = resolveContactPhones(
        mocks.actor,
        [row('no_account').phoneE164],
        'visible',
      ).catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(1);
      setContactDiscoverySession(mocks.actor, null);
      expect(mocks.manage).not.toHaveBeenCalled();
      finish();
      await vi.runAllTimersAsync();
      if (outcome === 'success') expect(await result).toHaveLength(1);
      else expect(await result).toBe(readError);
      expect(mocks.manage).toHaveBeenCalledExactlyOnceWith(
        'manage-contact-discovery',
        { discoverySessionId: sessionId, action: 'stop' },
        { expectedUserId: 'discovery-user' },
      );
    },
  );

  it('stops only the old session when another consumer has opened a new one', async () => {
    const previousSession = 'c8176506-336f-49b7-a7f2-0ebd3d78ec76';
    const currentSession = '97f85926-c91c-47fd-8da9-0cb6f2305463';
    setContactDiscoverySession(mocks.actor, previousSession);
    setContactRealtimeReady(mocks.actor, true);
    mocks.invoke.mockImplementationOnce(async () => {
      setContactDiscoverySession(mocks.actor, currentSession);
      return [row('no_account')];
    });
    const result = resolveContactPhones(mocks.actor, [row('no_account').phoneE164], 'visible');
    await vi.runAllTimersAsync();
    await result;
    expect(mocks.manage).toHaveBeenCalledExactlyOnceWith(
      'manage-contact-discovery',
      { discoverySessionId: previousSession, action: 'stop' },
      { expectedUserId: 'discovery-user' },
    );
  });

  it.each(['before', 'during'] as const)(
    'keeps a session reactivated %s the cleanup auth lookup',
    async (when) => {
      const sessionId = 'c8176506-336f-49b7-a7f2-0ebd3d78ec76';
      setContactDiscoverySession(mocks.actor, sessionId);
      setContactRealtimeReady(mocks.actor, true);
      mocks.invoke.mockImplementationOnce(async () => {
        setContactDiscoverySession(mocks.actor, null);
        if (when === 'before') setContactDiscoverySession(mocks.actor, sessionId);
        return [row('no_account')];
      });
      let authReads = 0;
      mocks.getSession.mockImplementation(async () => {
        authReads += 1;
        if (when === 'during' && authReads === 3)
          setContactDiscoverySession(mocks.actor, sessionId);
        return { data: { session: { user: { id: mocks.actor } } } };
      });
      const result = resolveContactPhones(mocks.actor, [row('no_account').phoneE164], 'visible');
      await vi.runAllTimersAsync();
      expect(await result).toHaveLength(1);
      expect(mocks.manage).not.toHaveBeenCalled();
    },
  );

  it('does not send cleanup under a different signed-in account', async () => {
    setContactDiscoverySession(mocks.actor, 'c8176506-336f-49b7-a7f2-0ebd3d78ec76');
    setContactRealtimeReady(mocks.actor, true);
    mocks.invoke.mockImplementationOnce(async () => {
      setContactDiscoverySession(mocks.actor, null);
      mocks.actor = 'other-user';
      return [row('no_account')];
    });
    const result = resolveContactPhones(
      'discovery-user',
      [row('no_account').phoneE164],
      'visible',
    ).catch((error: unknown) => error);
    await vi.runAllTimersAsync();
    expect(await result).toBeInstanceOf(Error);
    expect(mocks.manage).not.toHaveBeenCalled();
  });

  it('preserves a successful read when the follow-up stop fails', async () => {
    setContactDiscoverySession(mocks.actor, 'c8176506-336f-49b7-a7f2-0ebd3d78ec76');
    setContactRealtimeReady(mocks.actor, true);
    mocks.invoke.mockImplementationOnce(async () => {
      setContactDiscoverySession(mocks.actor, null);
      return [row('no_account')];
    });
    mocks.manage.mockRejectedValueOnce(new Error('Offline during cleanup'));
    const result = resolveContactPhones(mocks.actor, [row('no_account').phoneE164], 'visible');
    await vi.runAllTimersAsync();
    expect(await result).toHaveLength(1);
    expect(mocks.manage).toHaveBeenCalledTimes(1);
  });
});
