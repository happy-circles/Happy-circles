import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContactCandidate } from '@/features/invites/people-outreach-utils';
import type { PeopleTargetResolution } from '@/lib/live-data/types-runtime';
import type { ContactIndexReadResult } from './add-person-contact-index';

const mocks = vi.hoisted(() => ({
  appState: { currentState: 'active' },
  revision: 0,
  readIndex: vi.fn(),
  loadCache: vi.fn(),
  permission: vi.fn(),
}));
vi.mock('react-native', () => ({
  AppState: mocks.appState,
  Platform: {
    OS: 'ios',
    select: (options: Record<string, unknown>) => options.ios ?? options.default,
  },
}));
vi.mock('./add-person-contact-index', () => ({
  contactIndexRevision: () => mocks.revision,
  readContactIndex: mocks.readIndex,
}));
vi.mock('./people-target-resolution-cache', () => ({
  loadPeopleTargetResolutionCache: mocks.loadCache,
}));
vi.mock('@/lib/contacts-permissions', () => ({
  getContactsPermissionStatus: mocks.permission,
  canReadContactsPermissionStatus: (status: string) => status === 'granted' || status === 'limited',
}));
// A bootstrap must never import or wait for either network discovery or native agenda scanning.
vi.mock('@/lib/contact-discovery-runtime', () => {
  throw new Error('Network runtime in local bootstrap');
});

import {
  bootstrapWarmContactSnapshot,
  retainUnchangedContactRows,
} from './add-person-contact-warm-bootstrap';
import {
  clearWarmContactScanCache,
  readWarmContactScanCache,
  subscribeWarmContactScanCache,
  writeWarmContactScanCache,
} from './add-person-contact-scan-cache';
import {
  clearContactResolutionUser,
  invalidateContactResolutions,
  readContactResolutions,
} from '@/lib/contact-resolution-state';

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
  permissionStatus: 'granted' | 'limited' = 'granted',
): ContactIndexReadResult {
  return {
    contacts,
    permissionStatus,
    loadedCount: 10_000,
    matchingCount: 10_000,
    status: 'ready',
    lastCompletedAt: 1,
  };
}
function resolution(phoneE164: string): PeopleTargetResolution {
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

let sequence = 0;
let userId: string;
beforeEach(() => {
  userId = `bootstrap-${++sequence}`;
  vi.clearAllMocks();
  mocks.appState.currentState = 'active';
  mocks.revision = 0;
  mocks.permission.mockResolvedValue('granted');
  mocks.readIndex.mockResolvedValue(result([contact(1)]));
  mocks.loadCache.mockResolvedValue({
    [contact(1).primaryPhone.phoneE164]: resolution(contact(1).primaryPhone.phoneE164),
  });
});
afterEach(() => {
  clearWarmContactScanCache(userId);
  clearContactResolutionUser(userId);
});
const bootstrap = (
  isAuthorized = () => true,
  permissionStatus: 'granted' | 'limited' = 'granted',
) => bootstrapWarmContactSnapshot({ userId, permissionStatus, isAuthorized });

describe('local contact warm bootstrap', () => {
  it('publishes the first disk page with its saved states, without reading a whole agenda or waiting for network', async () => {
    const rows = Array.from({ length: 120 }, (_, index) => contact(index));
    const cached = Object.fromEntries(
      rows.map((row) => [row.primaryPhone.phoneE164, resolution(row.primaryPhone.phoneE164)]),
    );
    const pendingCache = deferred<typeof cached>();
    mocks.readIndex.mockResolvedValue(result(rows));
    mocks.loadCache.mockReturnValue(pendingCache.promise);
    const firstPaint = vi.fn(() => {
      const warm = readWarmContactScanCache(userId)!;
      expect(warm.contacts).toHaveLength(120);
      expect(warm.targetCache).toBe(readContactResolutions(userId));
      expect(
        warm.contacts.every(
          (row) => warm.targetCache[row.primaryPhone.phoneE164]?.status === 'no_account',
        ),
      ).toBe(true);
    });
    const unsubscribe = subscribeWarmContactScanCache(userId, firstPaint);
    const pending = bootstrap();
    await vi.waitFor(() => expect(mocks.loadCache).toHaveBeenCalledOnce());
    expect(readWarmContactScanCache(userId)).toBeNull();
    expect(firstPaint).not.toHaveBeenCalled();
    pendingCache.resolve(cached);
    const warm = await pending;
    expect(firstPaint).toHaveBeenCalledOnce();
    expect(mocks.readIndex).toHaveBeenCalledExactlyOnceWith({ userId, limit: 120 });
    expect(mocks.loadCache).toHaveBeenCalledExactlyOnceWith(
      userId,
      rows.map((row) => row.primaryPhone.phoneE164),
    );
    expect(warm?.matchingCount).toBe(10_000);
    expect(warm?.scanComplete).toBe(true);
    unsubscribe();
  });

  it('deduplicates bridge and immediate sheet reads without cancelling a still authorized consumer', async () => {
    const page = deferred<ContactIndexReadResult>();
    mocks.readIndex.mockReturnValue(page.promise);
    let bridgeAllowed = true;
    const bridge = bootstrap(() => bridgeAllowed);
    const sheet = bootstrap();
    bridgeAllowed = false;
    page.resolve(result([contact(1)]));
    expect(await bridge).toBeNull();
    expect(await sheet).toBe(readWarmContactScanCache(userId));
    expect(mocks.readIndex).toHaveBeenCalledOnce();
    expect(mocks.loadCache).toHaveBeenCalledOnce();
  });

  it.each(['actor_changed', 'suspended', 'permission_revoked', 'epoch_changed'] as const)(
    'discards a late disk completion after %s',
    async (event) => {
      const page = deferred<ContactIndexReadResult>();
      mocks.readIndex.mockReturnValue(page.promise);
      let authorized = true;
      const pending = bootstrap(() => authorized);
      if (event === 'actor_changed') authorized = false;
      if (event === 'suspended') mocks.appState.currentState = 'background';
      if (event === 'permission_revoked') mocks.permission.mockResolvedValue('denied');
      if (event === 'epoch_changed') clearContactResolutionUser(userId);
      page.resolve(result([contact(1)]));
      expect(await pending).toBeNull();
      expect(readWarmContactScanCache(userId)).toBeNull();
      expect(readContactResolutions(userId)).toEqual({});
    },
  );

  it('rejects cached contacts from a wider permission scope', async () => {
    mocks.permission.mockResolvedValue('limited');
    expect(await bootstrap(() => true, 'limited')).toBeNull();
    expect(mocks.loadCache).not.toHaveBeenCalled();
    expect(readWarmContactScanCache(userId)).toBeNull();
  });

  it('preserves a newer, larger warm list when a smaller read completes', async () => {
    const cached = deferred<Record<string, PeopleTargetResolution>>();
    mocks.loadCache.mockReturnValue(cached.promise);
    const pending = bootstrap();
    await vi.waitFor(() => expect(mocks.loadCache).toHaveBeenCalledOnce());
    mocks.revision = 2;
    const larger = Array.from({ length: 240 }, (_, index) => contact(index));
    writeWarmContactScanCache({
      userId,
      contacts: larger,
      contactsPermissionStatus: 'granted',
      targetCache: readContactResolutions(userId),
      indexRevision: 2,
      scanComplete: true,
    });
    const latest = readWarmContactScanCache(userId);
    cached.resolve({});
    expect(await pending).toBe(latest);
    expect(readWarmContactScanCache(userId)?.contacts).toBe(larger);
  });

  it('retains last-known display data if an index scan advances during hydration', async () => {
    const cached = deferred<Record<string, PeopleTargetResolution>>();
    mocks.loadCache.mockReturnValue(cached.promise);
    const pending = bootstrap();
    await vi.waitFor(() => expect(mocks.loadCache).toHaveBeenCalledOnce());
    mocks.revision = 1;
    cached.resolve({});
    expect((await pending)?.indexRevision).toBe(0);
    expect(readWarmContactScanCache(userId)?.contacts).toHaveLength(1);
  });

  it('does not resurrect a cached status invalidated while its local read was pending', async () => {
    const cached = deferred<Record<string, PeopleTargetResolution>>();
    mocks.loadCache.mockReturnValue(cached.promise);
    const pending = bootstrap();
    await vi.waitFor(() => expect(mocks.loadCache).toHaveBeenCalledOnce());
    const phone = contact(1).primaryPhone.phoneE164;
    invalidateContactResolutions({ userId, phoneE164: phone });
    cached.resolve({ [phone]: resolution(phone) });
    const warm = await pending;
    expect(warm?.contacts).toHaveLength(1);
    expect(warm?.targetCache[phone]).toBeUndefined();
  });

  it('reuses a successful warm snapshot on reopening without another disk read', async () => {
    const first = await bootstrap();
    expect(await bootstrap()).toBe(first);
    expect(mocks.readIndex).toHaveBeenCalledOnce();
    expect(mocks.loadCache).toHaveBeenCalledOnce();
  });
});

describe('stable local contact rows', () => {
  it('preserves array and row references for unchanged disk data', () => {
    const previous = [contact(1), contact(2)];
    expect(
      retainUnchangedContactRows(
        previous,
        JSON.parse(JSON.stringify(previous)) as ContactCandidate[],
      ),
    ).toBe(previous);
    const changed = { ...contact(2), alias: 'Nuevo alias' };
    const next = retainUnchangedContactRows(previous, [contact(1), changed]);
    expect(next[0]).toBe(previous[0]);
    expect(next[1]).toBe(changed);
  });

  it('does not serialize an existing warm list or unchanged prefix while appending', () => {
    const previous = [contact(1), contact(2)];
    const stringify = vi.spyOn(JSON, 'stringify');
    expect(retainUnchangedContactRows(previous, previous)).toBe(previous);
    expect(retainUnchangedContactRows(previous, [...previous, contact(3)])[0]).toBe(previous[0]);
    expect(stringify).not.toHaveBeenCalled();
    stringify.mockRestore();
  });
});
