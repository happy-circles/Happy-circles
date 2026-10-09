import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PeopleTargetResolution } from '@/lib/live-data/types-runtime';

const mocks = vi.hoisted(() => ({
  actor: 'discovery-user',
  invoke:
    vi.fn<(name: string, schema: unknown, input: unknown, options: unknown) => Promise<unknown>>(),
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
  beginContactResolutionWrite,
  mergeContactResolutions,
  readContactResolutions,
  setContactRealtimeReady,
} from '@/lib/contact-resolution-state';
import {
  disposeContactResolutionUser,
  beginContactDiscoveryRecovery,
  registerContactDiscoveryPhoneWatches,
  removeContactDiscoveryPhoneWatches,
  restoreContactDiscoveryPhones,
  synchronizeContactDiscoveryPhones,
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
  mocks.save.mockReset().mockResolvedValue(undefined);
});
afterEach(() => {
  disposeContactResolutionUser('discovery-user');
  vi.useRealTimers();
});

describe('contact resolution service races', () => {
  it('confirms a fresh disk positive once over HTTP and immediately replaces it with a negative', async () => {
    const phone = row('active_user').phoneE164;
    mergeContactResolutions(
      mocks.actor,
      [
        {
          ...row('active_user'),
          matchedUserId: '00000000-0000-4000-8000-000000000123',
          resolvedAt: Date.now() + 1,
          generation: 0,
        },
      ],
      { fromCache: true },
    );
    expect(readContactResolutions(mocks.actor)[phone].accountMatchConfirmed).toBe(false);
    setContactDiscoverySession(mocks.actor, 'http-fallback-session');
    setContactRealtimeReady(mocks.actor, false);
    mocks.invoke.mockResolvedValue([row('no_account')]);
    const confirmation = synchronizeContactDiscoveryPhones(mocks.actor, [phone]);
    await vi.advanceTimersByTimeAsync(1);
    await confirmation;
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(readContactResolutions(mocks.actor)[phone]).toMatchObject({
      status: 'no_account',
      matchedUserId: null,
    });
    await synchronizeContactDiscoveryPhones(mocks.actor, [phone]);
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
  });

  it('retains a current positive across warm reopening and revokes it only for a genuine recovery', async () => {
    const positive = {
      ...row('active_user'),
      matchedUserId: '00000000-0000-4000-8000-000000000123',
    };
    const phone = positive.phoneE164;
    setContactDiscoverySession(mocks.actor, 'stable-session');
    setContactRealtimeReady(mocks.actor, true);
    mocks.invoke.mockResolvedValue([positive]);
    const initial = synchronizeContactDiscoveryPhones(mocks.actor, [phone]);
    await vi.advanceTimersByTimeAsync(1);
    await initial;
    expect(readContactResolutions(mocks.actor)[phone].accountMatchConfirmed).toBe(true);
    const current = readContactResolutions(mocks.actor)[phone];
    await synchronizeContactDiscoveryPhones(mocks.actor, [phone]);
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(readContactResolutions(mocks.actor)[phone]).toBe(current);
    beginContactDiscoveryRecovery(mocks.actor);
    expect(readContactResolutions(mocks.actor)[phone]).toMatchObject({
      status: 'active_user',
      accountMatchConfirmed: false,
      resolvedAt: 0,
    });
    const recovery = synchronizeContactDiscoveryPhones(mocks.actor, [phone]);
    await vi.advanceTimersByTimeAsync(1);
    await recovery;
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
    expect(readContactResolutions(mocks.actor)[phone].accountMatchConfirmed).toBe(true);
    await synchronizeContactDiscoveryPhones(mocks.actor, [phone]);
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
  });

  it('keeps a malformed live positive unconfirmed without repeating the immediate TTL bypass', async () => {
    const phone = row('active_user').phoneE164;
    setContactDiscoverySession(mocks.actor, 'http-fallback-session');
    setContactRealtimeReady(mocks.actor, false);
    mocks.invoke.mockResolvedValue([{ ...row('active_user'), matchedUserId: null }]);
    const initial = synchronizeContactDiscoveryPhones(mocks.actor, [phone]);
    await vi.advanceTimersByTimeAsync(1);
    await initial;
    expect(readContactResolutions(mocks.actor)[phone].accountMatchConfirmed).toBe(false);
    await synchronizeContactDiscoveryPhones(mocks.actor, [phone]);
    await resolveContactPhones(mocks.actor, [phone], 'visible');
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_001);
    const ordinaryRefresh = synchronizeContactDiscoveryPhones(mocks.actor, [phone]);
    await vi.advanceTimersByTimeAsync(1);
    await ordinaryRefresh;
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
    expect(readContactResolutions(mocks.actor)[phone].accountMatchConfirmed).toBe(false);
  });

  it('resolves immediately over HTTP without creating watches when realtime is unavailable', async () => {
    setContactDiscoverySession(mocks.actor, 'http-fallback-session');
    setContactRealtimeReady(mocks.actor, false);
    mocks.invoke.mockResolvedValue([row('no_account')]);
    const result = synchronizeContactDiscoveryPhones(mocks.actor, [row('no_account').phoneE164]);
    await vi.advanceTimersByTimeAsync(1);
    await result;
    expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith(
      'resolve-people-targets',
      expect.anything(),
      { phoneE164List: [row('no_account').phoneE164], discoverySessionId: undefined },
      { expectedUserId: mocks.actor },
    );
    expect(readContactResolutions(mocks.actor)[row('no_account').phoneE164]).toMatchObject({
      status: 'no_account',
      discoverySessionId: undefined,
      discoveryWatchId: undefined,
    });
    expect(mocks.manage).not.toHaveBeenCalled();
  });

  it('reuses fresh HTTP rows during a realtime gap but requires an observed baseline after reconnect', async () => {
    const phone = row('no_account').phoneE164;
    setContactDiscoverySession(mocks.actor, 'stable-session');
    setContactRealtimeReady(mocks.actor, false);
    beginContactDiscoveryRecovery(mocks.actor);
    mergeContactResolutions(mocks.actor, [row('no_account')]);
    const cached = readContactResolutions(mocks.actor)[phone];
    await synchronizeContactDiscoveryPhones(mocks.actor, [phone]);
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(readContactResolutions(mocks.actor)[phone]).toBe(cached);
    await vi.advanceTimersByTimeAsync(60_001);
    mocks.invoke.mockResolvedValue([row('no_account')]);
    const fallback = synchronizeContactDiscoveryPhones(mocks.actor, [phone]);
    await vi.advanceTimersByTimeAsync(1);
    await fallback;
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    setContactRealtimeReady(mocks.actor, true);
    const baseline = synchronizeContactDiscoveryPhones(mocks.actor, [phone]);
    await vi.advanceTimersByTimeAsync(1);
    await baseline;
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
    expect(mocks.invoke.mock.calls[1][2]).toEqual({
      phoneE164List: [phone],
      discoverySessionId: 'stable-session',
    });
    await synchronizeContactDiscoveryPhones(mocks.actor, [phone]);
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
  });

  it('keeps the 60-phone batches and background budget for 10,000 unobserved HTTP lookups', async () => {
    const phones = Array.from({ length: 10_000 }, (_, index) => `+57300${index}`);
    setContactDiscoverySession(mocks.actor, 'http-fallback-session');
    setContactRealtimeReady(mocks.actor, false);
    const startedAt = Date.now();
    mocks.invoke.mockImplementation(async (_name, _schema, input) =>
      (input as { phoneE164List: string[] }).phoneE164List.map((phoneE164) => ({
        ...row('no_account'),
        phoneE164,
      })),
    );
    const result = resolveContactPhones(mocks.actor, phones, 'background');
    await vi.runAllTimersAsync();
    expect(await result).toHaveLength(10_000);
    expect(mocks.invoke).toHaveBeenCalledTimes(167);
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(3 * 60_000);
    for (const [name, , payload] of mocks.invoke.mock.calls) {
      expect(name).toBe('resolve-people-targets');
      expect((payload as { phoneE164List: string[] }).phoneE164List.length).toBeLessThanOrEqual(60);
      expect((payload as { discoverySessionId?: string }).discoverySessionId).toBeUndefined();
    }
    expect(readContactResolutions(mocks.actor)[phones[0]].discoveryWatchId).toBeUndefined();
  });

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
              : { userId: mocks.actor, phoneE164: row('no_account').phoneE164 },
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

  it('does not recreate the remaining background scan when the app lease is suspended', async () => {
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
    mocks.invoke
      .mockImplementationOnce(async () => {
        setContactDiscoverySession(mocks.actor, currentSession);
        return [row('no_account')];
      })
      .mockResolvedValue([row('no_account')]);
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
      mocks.invoke
        .mockImplementationOnce(async () => {
          setContactDiscoverySession(mocks.actor, null);
          if (when === 'before') setContactDiscoverySession(mocks.actor, sessionId);
          return [row('no_account')];
        })
        .mockResolvedValue([row('no_account')]);
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

  it('registers fresh cached phones without resolving them and deduplicates repeat registration', async () => {
    const phone = row('no_account').phoneE164;
    setContactDiscoverySession(mocks.actor, 'stable-session');
    setContactRealtimeReady(mocks.actor, true);
    mocks.invoke.mockResolvedValue({ watches: [{ phoneE164: phone, discoveryWatchId: 'watch' }] });
    const first = registerContactDiscoveryPhoneWatches(mocks.actor, [phone]);
    const duplicate = registerContactDiscoveryPhoneWatches(mocks.actor, [phone]);
    await vi.runAllTimersAsync();
    await Promise.all([first, duplicate]);
    await registerContactDiscoveryPhoneWatches(mocks.actor, [phone]);
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.invoke.mock.calls[0][0]).toBe('register-contact-discovery');
    expect(readContactResolutions(mocks.actor)).toEqual({});
  });

  it('uses the same observed rows on reopen even after the ordinary TTL expires', async () => {
    const phone = row('no_account').phoneE164;
    setContactDiscoverySession(mocks.actor, 'stable-session');
    setContactRealtimeReady(mocks.actor, true);
    mocks.invoke.mockImplementation(async (name) =>
      name === 'register-contact-discovery'
        ? { watches: [{ phoneE164: phone, discoveryWatchId: 'opaque-watch' }] }
        : [row('no_account')],
    );
    const registration = registerContactDiscoveryPhoneWatches(mocks.actor, [phone]);
    await vi.runAllTimersAsync();
    await registration;
    const initial = resolveContactPhones(mocks.actor, [phone], 'background');
    await vi.runAllTimersAsync();
    await initial;
    await vi.advanceTimersByTimeAsync(4 * 60_000);
    setContactDiscoverySession(mocks.actor, 'stable-session');
    await resolveContactPhones(mocks.actor, [phone], 'visible');
    await registerContactDiscoveryPhoneWatches(mocks.actor, [phone]);
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
    expect(mocks.manage).not.toHaveBeenCalled();
  });

  it('does not restart early batches when a 10,000-phone queue outlives their TTL', async () => {
    const phones = Array.from({ length: 10_000 }, (_, index) => `+57300${index}`);
    setContactDiscoverySession(mocks.actor, 'stable-session');
    setContactRealtimeReady(mocks.actor, true);
    mocks.invoke.mockImplementation(async (_name, _schema, input) =>
      (input as { phoneE164List: string[] }).phoneE164List.map((phoneE164) => ({
        ...row('no_account'),
        phoneE164,
        discoveryWatchId: `watch-${phoneE164}`,
      })),
    );
    const result = resolveContactPhones(mocks.actor, phones, 'background');
    await vi.runAllTimersAsync();
    expect(await result).toHaveLength(10_000);
    expect(mocks.invoke).toHaveBeenCalledTimes(167);
  });

  it('rejects a response started before a connection gap and reconciles it once', async () => {
    setContactDiscoverySession(mocks.actor, 'stable-session');
    setContactRealtimeReady(mocks.actor, true);
    mocks.invoke
      .mockImplementationOnce(async () => {
        beginContactDiscoveryRecovery(mocks.actor);
        return [row('no_account')];
      })
      .mockResolvedValue([row('active_user')]);
    const result = resolveContactPhones(mocks.actor, [row('no_account').phoneE164], 'visible');
    await vi.runAllTimersAsync();
    expect((await result)[0].status).toBe('active_user');
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
  });

  it('keeps a confirmed command result that supersedes a read during persistence', async () => {
    mocks.invoke.mockResolvedValue([row('active_user')]);
    mocks.save.mockImplementationOnce(async () => {
      mergeContactResolutions(mocks.actor, [
        { ...row('pending_friendship'), friendshipInviteId: 'new-invite' },
      ]);
    });
    const result = resolveContactPhones(
      mocks.actor,
      [row('active_user').phoneE164],
      'interactive',
      true,
    );
    await vi.runAllTimersAsync();
    expect((await result)[0].friendshipInviteId).toBe('new-invite');
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
  });

  it('resolves and observes uncached phones in one request per batch', async () => {
    const phones = Array.from({ length: 120 }, (_, index) => `+57300${index}`);
    setContactDiscoverySession(mocks.actor, 'stable-session');
    setContactRealtimeReady(mocks.actor, true);
    mocks.invoke.mockImplementation(async (_name, _schema, input) =>
      (input as { phoneE164List: string[] }).phoneE164List.map((phoneE164) => ({
        ...row('no_account'),
        phoneE164,
        discoveryWatchId: `watch-${phoneE164}`,
      })),
    );
    const sync = synchronizeContactDiscoveryPhones(mocks.actor, phones);
    await vi.runAllTimersAsync();
    await sync;
    await registerContactDiscoveryPhoneWatches(mocks.actor, phones);
    expect(mocks.invoke.mock.calls.map(([name]) => name)).toEqual([
      'resolve-people-targets',
      'resolve-people-targets',
    ]);
  });

  it('only registers a fresh cached phone and schedules its missed-event baseline after TTL', async () => {
    const phone = row('no_account').phoneE164;
    mergeContactResolutions(mocks.actor, [row('no_account')]);
    const resolvedAt = readContactResolutions(mocks.actor)[phone].resolvedAt!;
    setContactDiscoverySession(mocks.actor, 'stable-session');
    setContactRealtimeReady(mocks.actor, true);
    mocks.invoke
      .mockResolvedValueOnce({ watches: [{ phoneE164: phone, discoveryWatchId: 'watch' }] })
      .mockResolvedValue([row('active_user')]);
    const sync = synchronizeContactDiscoveryPhones(mocks.actor, [phone]);
    await vi.runAllTimersAsync();
    expect(await sync).toEqual({ recheck: [{ phoneE164: phone, at: resolvedAt + 60_001 }] });
    expect(mocks.invoke.mock.calls.map(([name]) => name)).toEqual(['register-contact-discovery']);
    await vi.advanceTimersByTimeAsync(60_001);
    const baseline = synchronizeContactDiscoveryPhones(mocks.actor, [phone]);
    await vi.runAllTimersAsync();
    expect((await baseline).recheck).toEqual([]);
    expect(mocks.invoke.mock.calls.map(([name]) => name)).toEqual([
      'register-contact-discovery',
      'resolve-people-targets',
    ]);
  });

  it('does not issue reads while the selected contact has an explicit command pending', async () => {
    const phone = row('active_user').phoneE164;
    mergeContactResolutions(mocks.actor, [row('active_user')]);
    const write = beginContactResolutionWrite(mocks.actor, [phone]);
    expect((await resolveContactPhones(mocks.actor, [phone], 'interactive', true))[0].status).toBe(
      'active_user',
    );
    expect(mocks.invoke).not.toHaveBeenCalled();
    mergeContactResolutions(mocks.actor, [row('pending_friendship')], {
      expectedGenerations: write,
    });
    write.finish();
  });

  it('removes a phone only after its in-flight observed response supplies the watch ID', async () => {
    const phone = row('no_account').phoneE164;
    setContactDiscoverySession(mocks.actor, 'stable-session');
    setContactRealtimeReady(mocks.actor, true);
    let finish!: (rows: PeopleTargetResolution[]) => void;
    mocks.invoke.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const read = resolveContactPhones(mocks.actor, [phone], 'background');
    await vi.advanceTimersByTimeAsync(1);
    const removal = removeContactDiscoveryPhoneWatches(mocks.actor, [phone]);
    await vi.advanceTimersByTimeAsync(1);
    expect(mocks.manage).not.toHaveBeenCalled();
    finish([row('no_account')]);
    await vi.runAllTimersAsync();
    await removal;
    expect(await read).toEqual([]);
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.manage).toHaveBeenCalledExactlyOnceWith(
      'manage-contact-discovery',
      { discoverySessionId: 'stable-session', action: 'remove', watchIds: ['opaque-watch'] },
      { expectedUserId: mocks.actor },
    );
  });

  it('registers a re-added contact after removal finishes instead of trusting the deleted watch', async () => {
    const phone = row('no_account').phoneE164;
    setContactDiscoverySession(mocks.actor, 'stable-session');
    setContactRealtimeReady(mocks.actor, true);
    mocks.invoke
      .mockResolvedValueOnce([row('no_account')])
      .mockResolvedValue({ watches: [{ phoneE164: phone, discoveryWatchId: 'new-watch' }] });
    const initial = resolveContactPhones(mocks.actor, [phone], 'background');
    await vi.runAllTimersAsync();
    await initial;
    let finishRemove!: () => void;
    mocks.manage.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishRemove = () => resolve({ status: 'stopped' });
        }),
    );
    const removal = removeContactDiscoveryPhoneWatches(mocks.actor, [phone]);
    await vi.advanceTimersByTimeAsync(1);
    restoreContactDiscoveryPhones(mocks.actor, [phone]);
    const readded = synchronizeContactDiscoveryPhones(mocks.actor, [phone]);
    await vi.advanceTimersByTimeAsync(1);
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    finishRemove();
    await vi.runAllTimersAsync();
    await Promise.all([removal, readded]);
    expect(mocks.invoke.mock.calls.map(([name]) => name)).toEqual([
      'resolve-people-targets',
      'register-contact-discovery',
    ]);
    invalidateContactResolutions({ userId: mocks.actor, watchIds: ['new-watch'] });
    expect(readContactResolutions(mocks.actor)[phone].resolvedAt).toBe(0);
  });

  it('rechecks only the visible window after five minutes to recover a silently missed event', async () => {
    const phones = Array.from({ length: 120 }, (_, index) => `+57300${index}`);
    setContactDiscoverySession(mocks.actor, 'stable-session');
    setContactRealtimeReady(mocks.actor, true);
    mocks.invoke.mockImplementation(async (_name, _schema, input) =>
      (input as { phoneE164List: string[] }).phoneE164List.map((phoneE164) => ({
        ...row('no_account'),
        phoneE164,
        discoveryWatchId: `watch-${phoneE164}`,
      })),
    );
    const initial = synchronizeContactDiscoveryPhones(mocks.actor, phones);
    await vi.runAllTimersAsync();
    await initial;
    await vi.advanceTimersByTimeAsync(4 * 60_000);
    await resolveContactPhones(mocks.actor, phones.slice(0, 60), 'visible');
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(60_000);
    const visible = resolveContactPhones(mocks.actor, phones.slice(0, 60), 'visible');
    await vi.runAllTimersAsync();
    await visible;
    await resolveContactPhones(mocks.actor, phones, 'background');
    await resolveContactPhones(mocks.actor, phones.slice(0, 60), 'visible');
    expect(mocks.invoke).toHaveBeenCalledTimes(3);
    expect((mocks.invoke.mock.calls[2][2] as { phoneE164List: string[] }).phoneE164List).toEqual(
      phones.slice(0, 60),
    );
  });
});
