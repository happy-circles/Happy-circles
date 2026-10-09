import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContactCandidate } from '@/features/invites/people-outreach-utils';
import type { PeopleTargetResolution } from '@/lib/live-data/types-runtime';
import type { ContactIndexReadResult } from './add-person-contact-index';

const harness = vi.hoisted(() => ({
  cursor: 0,
  slots: [] as unknown[],
  effects: new Map<number, { dependencies: readonly unknown[]; cleanup?: () => void }>(),
  pendingEffects: [] as Array<() => void>,
  session: { userId: 'list-user', status: 'signed_in_unlocked', accountAccessState: 'active' },
  appState: { currentState: 'active' },
  appListeners: new Set<(state: string) => void>(),
  revision: 0,
  readIndex: vi.fn(),
  loadCache: vi.fn(),
  permission: vi.fn(),
  activate: vi.fn(),
  known: vi.fn(),
  startIndex: vi.fn(),
}));
vi.mock('react', () => ({
  useState: (initial: unknown) => {
    const index = harness.cursor++;
    if (!(index in harness.slots)) {
      const state = {
        value: initial,
        set: (value: unknown) => {
          state.value =
            typeof value === 'function'
              ? (value as (previous: unknown) => unknown)(state.value)
              : value;
        },
      };
      harness.slots[index] = state;
    }
    const state = harness.slots[index] as { value: unknown; set: (value: unknown) => void };
    return [state.value, state.set];
  },
  useRef: (current: unknown) => {
    const index = harness.cursor++;
    if (!(index in harness.slots)) harness.slots[index] = { current };
    return harness.slots[index];
  },
  useCallback: (callback: unknown, dependencies: readonly unknown[]) => {
    const index = harness.cursor++;
    const previous = harness.slots[index] as
      | { callback: unknown; dependencies: readonly unknown[] }
      | undefined;
    if (
      !previous ||
      dependencies.some((value, offset) => !Object.is(value, previous.dependencies[offset]))
    ) {
      harness.slots[index] = { callback, dependencies };
    }
    return (harness.slots[index] as { callback: unknown }).callback;
  },
  useEffect: (callback: () => (() => void) | undefined, dependencies: readonly unknown[]) => {
    const index = harness.cursor++;
    const previous = harness.effects.get(index);
    if (
      !previous ||
      dependencies.some((value, offset) => !Object.is(value, previous.dependencies[offset]))
    ) {
      harness.pendingEffects.push(() => {
        previous?.cleanup?.();
        harness.effects.set(index, { dependencies, cleanup: callback() });
      });
    }
  },
}));
vi.mock('react-native', () => ({
  AppState: {
    get currentState() {
      return harness.appState.currentState;
    },
    addEventListener: (_event: string, listener: (state: string) => void) => {
      harness.appListeners.add(listener);
      return { remove: () => harness.appListeners.delete(listener) };
    },
  },
  Platform: {
    OS: 'ios',
    select: (options: Record<string, unknown>) => options.ios ?? options.default,
  },
}));
vi.mock('@/providers/session-provider', () => ({ useSession: () => harness.session }));
vi.mock('./add-person-contact-index', () => ({
  contactIndexRevision: () => harness.revision,
  readContactIndex: harness.readIndex,
  startContactIndexing: harness.startIndex,
  subscribeContactIndex: () => () => undefined,
}));
vi.mock('./people-target-resolution-cache', () => ({
  loadPeopleTargetResolutionCache: harness.loadCache,
}));
vi.mock('@/lib/contacts-permissions', () => ({
  getContactsPermissionStatus: harness.permission,
  canReadContactsPermissionStatus: (status: string) => status === 'granted' || status === 'limited',
}));
vi.mock('@/lib/contact-discovery-runtime', () => ({
  activateContactDiscoveryRuntime: harness.activate,
  disposeContactDiscoveryRuntime: vi.fn(),
  replaceContactDiscoveryKnownPhones: vi.fn(),
  setContactDiscoveryKnownPhones: harness.known,
}));

import { useAddPersonContactList } from './use-add-person-contact-list';
import { bootstrapWarmContactSnapshot } from './add-person-contact-warm-bootstrap';
import {
  clearWarmContactScanCache,
  readWarmContactScanCache,
  writeWarmContactScanCache,
} from './add-person-contact-scan-cache';
import { clearContactResolutionUser, readContactResolutions } from '@/lib/contact-resolution-state';

function contact(index: number): ContactCandidate {
  const phone = {
    id: `phone-${index}`,
    label: null,
    maskedPhone: '***0100',
    phoneE164: `+1202555${String(index).padStart(4, '0')}`,
  };
  return {
    contactId: `contact-${index}`,
    alias: `Persona ${index}`,
    searchKey: `persona ${index}`,
    phoneOptions: [phone],
    primaryPhone: phone,
  };
}
function result(
  contacts: readonly ContactCandidate[],
  matchingCount = contacts.length,
): ContactIndexReadResult {
  return {
    contacts,
    matchingCount,
    loadedCount: matchingCount,
    permissionStatus: 'granted',
    status: 'ready',
    lastCompletedAt: 1,
  };
}
function cached(phoneE164: string): PeopleTargetResolution {
  return {
    phoneE164,
    status: 'no_account',
    matchedUserId: null,
    displayName: null,
    avatarPath: null,
    relationshipId: null,
    friendshipInviteId: null,
    accountInviteId: null,
    accountInviteStatus: null,
    resolvedAt: Date.now() - 1000,
    generation: 0,
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const bridge = {
  loadCachedTargetResolutionsForPhones: vi.fn(async () => undefined),
  resetResolutionState: vi.fn(),
  resolvePhoneStatusesNow: vi.fn(async () => []),
  scanRunIdRef: { current: 0 },
  setTargetCache: vi.fn(),
  targetCacheRef: { current: {} as Record<string, PeopleTargetResolution> },
  visibleResolutionPhonesRef: { current: new Set<string>() },
};
let userSequence = 0;
function flushEffects() {
  for (const effect of harness.pendingEffects.splice(0)) effect();
}
function render(searchValue = '', flush = true) {
  harness.cursor = 0;
  bridge.targetCacheRef.current = readContactResolutions(harness.session.userId);
  const list = useAddPersonContactList({
    ...bridge,
    userId: harness.session.userId,
    searchValue,
    visible: true,
    busyKey: null,
    setBusyKey: vi.fn(),
    setMessage: vi.fn(),
  });
  if (flush) flushEffects();
  return list;
}
function publish(rows: readonly ContactCandidate[], revision = harness.revision) {
  writeWarmContactScanCache({
    userId: harness.session.userId,
    contacts: rows,
    targetCache: readContactResolutions(harness.session.userId),
    contactsPermissionStatus: 'granted',
    indexRevision: revision,
    loadedCount: rows.length,
    matchingCount: rows.length,
    scanComplete: true,
  });
}
function appState(state: string) {
  harness.appState.currentState = state;
  for (const listener of harness.appListeners) listener(state);
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  harness.slots = [];
  harness.effects.clear();
  harness.pendingEffects = [];
  harness.appListeners.clear();
  harness.session = {
    userId: `list-${++userSequence}`,
    status: 'signed_in_unlocked',
    accountAccessState: 'active',
  };
  harness.appState.currentState = 'active';
  harness.revision = 0;
  harness.permission.mockResolvedValue('granted');
  harness.readIndex.mockResolvedValue(result([contact(1)]));
  harness.loadCache.mockResolvedValue({
    [contact(1).primaryPhone.phoneE164]: cached(contact(1).primaryPhone.phoneE164),
  });
  harness.startIndex.mockResolvedValue(undefined);
});
afterEach(() => {
  for (const effect of harness.effects.values()) effect.cleanup?.();
  clearWarmContactScanCache(harness.session.userId);
  clearContactResolutionUser(harness.session.userId);
  vi.useRealTimers();
});

describe('contact list local cold start', () => {
  it('updates a sheet mounted before bootstrap completes with states already available on its first rows', async () => {
    expect(render().contacts).toEqual([]);
    const index = deferred<ContactIndexReadResult>();
    harness.readIndex.mockReturnValue(index.promise);
    const bootstrap = bootstrapWarmContactSnapshot({
      userId: harness.session.userId,
      permissionStatus: 'granted',
      isAuthorized: () => true,
    });
    index.resolve(result([contact(1)], 10_000));
    await bootstrap;
    const firstRows = render();
    expect(firstRows.contacts).toHaveLength(1);
    expect(
      readContactResolutions(harness.session.userId)[firstRows.contacts[0].primaryPhone.phoneE164]
        ?.status,
    ).toBe('no_account');
    expect(firstRows.canReadContacts).toBe(true);
    expect(firstRows.contactsLoading).toBe(false);
    expect(harness.activate).not.toHaveBeenCalled();
    expect(harness.startIndex).not.toHaveBeenCalled();
  });

  it('shares the cold read when the user opens immediately and does not await network discovery', async () => {
    const index = deferred<ContactIndexReadResult>();
    harness.readIndex.mockReturnValue(index.promise);
    harness.activate.mockImplementation(() => new Promise(() => undefined));
    const list = render();
    const opening = list.loadContacts();
    await Promise.resolve();
    const bootstrap = bootstrapWarmContactSnapshot({
      userId: harness.session.userId,
      permissionStatus: 'granted',
      isAuthorized: () => true,
    });
    index.resolve(result([contact(1)]));
    await Promise.all([opening, bootstrap]);
    expect(render().contacts).toHaveLength(1);
    expect(harness.readIndex).toHaveBeenCalledOnce();
    expect(harness.loadCache).toHaveBeenCalledOnce();
    expect(harness.activate).toHaveBeenCalledOnce();
  });

  it('keeps a warm agenda until the refreshed disk pages are complete, including a deletion', async () => {
    const rows = Array.from({ length: 480 }, (_, index) => contact(index));
    publish(rows);
    const list = render();
    expect(list.contacts).toBe(rows);
    harness.revision = 1;
    const refreshed = rows.slice(0, 479).map((row) => ({ ...row }));
    harness.readIndex.mockImplementation(async ({ offset = 0 }: { offset?: number }) =>
      result(refreshed.slice(offset, offset + 120), 479),
    );
    await list.loadContacts('app_active');
    expect(render().contacts).toBe(rows);
    expect(readWarmContactScanCache(harness.session.userId)?.contacts).toBe(rows);
    expect(readWarmContactScanCache(harness.session.userId)?.indexRevision).toBe(0);

    await vi.advanceTimersByTimeAsync(700);
    expect(render().contacts).toBe(rows);
    expect(readWarmContactScanCache(harness.session.userId)?.contacts).toBe(rows);
    await vi.advanceTimersByTimeAsync(80);
    expect(render().contacts).toBe(rows);
    await vi.advanceTimersByTimeAsync(80);
    const complete = render().contacts;
    expect(complete).toHaveLength(479);
    expect(complete.every((row, index) => row === rows[index])).toBe(true);
    expect(readWarmContactScanCache(harness.session.userId)?.contacts).toHaveLength(479);
    expect(readWarmContactScanCache(harness.session.userId)?.indexRevision).toBe(1);
    expect(
      harness.readIndex.mock.calls.map(([input]) => (input as { offset?: number }).offset ?? 0),
    ).toEqual([0, 120, 240, 360]);
  });

  it('keeps a larger list and row references when a warm first page arrives later', () => {
    const rows = Array.from({ length: 240 }, (_, index) => contact(index));
    publish(rows);
    expect(render().contacts).toBe(rows);
    publish(rows.slice(0, 120));
    expect(render().contacts).toBe(rows);
    publish(rows.map((row) => ({ ...row })));
    expect(render().contacts).toBe(rows);
  });

  it('keeps search results outside the warm first page on snapshot writes and foregrounding', async () => {
    publish([contact(1)]);
    const hits = [contact(999)];
    harness.readIndex.mockResolvedValue(result(hits));
    await render('persona 999').loadContacts();
    const before = render('persona 999').contacts;
    expect(before[0].contactId).toBe('contact-999');
    publish([contact(2)]);
    await render('persona 999').loadContacts('app_active');
    expect(render('persona 999').contacts).toBe(before);
  });

  it('does not adopt an old account snapshot before its passive subscription cleanup runs', () => {
    render();
    const previousActor = harness.session.userId;
    harness.session.userId = `list-${++userSequence}`;
    render('', false);
    writeWarmContactScanCache({
      userId: previousActor,
      contacts: [contact(9)],
      targetCache: {},
      contactsPermissionStatus: 'granted',
    });
    expect(render('', false).contacts).toEqual([]);
    flushEffects();
    clearWarmContactScanCache(previousActor);
    clearContactResolutionUser(previousActor);
  });

  it('does not publish contacts while the same account is locked', () => {
    render();
    harness.session.status = 'signed_in_locked';
    render();
    publish([contact(1)]);
    expect(render().contacts).toEqual([]);
  });

  it('discards a permission check from before suspension even after resuming', async () => {
    const permission = deferred<string>();
    harness.permission.mockReturnValueOnce(permission.promise).mockResolvedValue('denied');
    const oldOpen = render().loadContacts();
    appState('background');
    appState('active');
    await Promise.resolve();
    permission.resolve('granted');
    await oldOpen;
    expect(render().contacts).toEqual([]);
    expect(harness.activate).not.toHaveBeenCalled();
    expect(harness.readIndex).not.toHaveBeenCalled();
  });
});
