import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onlineManager } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({
  setSession: vi.fn(),
  recover: vi.fn(),
  dispose: vi.fn(),
  register: vi.fn(async () => []),
  remove: vi.fn(async () => undefined),
  restore: vi.fn(),
  resolve: vi.fn(async () => []),
  synchronize: vi.fn(async () => ({ recheck: [] })),
  manage: vi.fn(async () => ({ status: 'renewed' })),
  warm: vi.fn(),
}));
vi.mock('expo-crypto', () => ({ randomUUID: () => 'runtime-session' }));
vi.mock('@/features/home/contact-resolution-service', () => ({
  setContactDiscoverySession: mocks.setSession,
  beginContactDiscoveryRecovery: mocks.recover,
  disposeContactResolutionUser: mocks.dispose,
  registerContactDiscoveryPhoneWatches: mocks.register,
  removeContactDiscoveryPhoneWatches: mocks.remove,
  restoreContactDiscoveryPhones: mocks.restore,
  resolveContactPhones: mocks.resolve,
  synchronizeContactDiscoveryPhones: mocks.synchronize,
  manageContactDiscovery: mocks.manage,
}));
vi.mock('@/features/home/add-person-contact-scan-cache', () => ({
  updateWarmContactScanTargetCache: mocks.warm,
}));
import {
  activateContactDiscoveryRuntime,
  suspendContactDiscoveryRuntime,
  disposeContactDiscoveryRuntime,
  replaceContactDiscoveryKnownPhones,
  setContactDiscoveryKnownPhones,
  setContactDiscoveryVisiblePhones,
} from './contact-discovery-runtime';
import {
  clearContactResolutionUser,
  mergeContactResolutions,
  readContactResolutions,
  setContactRealtimeReady,
} from './contact-resolution-state';

const user = 'runtime-user';
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.synchronize.mockReset().mockResolvedValue({ recheck: [] });
  onlineManager.setOnline(true);
  setContactRealtimeReady(user, true);
});
afterEach(() => {
  disposeContactDiscoveryRuntime(user);
  clearContactResolutionUser(user);
  onlineManager.setOnline(true);
  vi.useRealTimers();
});

describe('contact runtime authorization boundary', () => {
  it('queries unknown contacts with Internet even if realtime never subscribed', async () => {
    setContactRealtimeReady(user, false);
    mocks.synchronize.mockImplementation(async () => {
      mergeContactResolutions(user, [
        {
          phoneE164: 'phone-a',
          status: 'no_account',
          matchedUserId: null,
          displayName: null,
          avatarPath: null,
          relationshipId: null,
          friendshipInviteId: null,
          accountInviteId: null,
          accountInviteStatus: null,
        },
      ]);
      return { recheck: [] };
    });
    activateContactDiscoveryRuntime(user);
    setContactDiscoveryKnownPhones(user, ['phone-a']);
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.synchronize).toHaveBeenCalledExactlyOnceWith(user, ['phone-a'], 'background');
    expect(readContactResolutions(user)['phone-a'].status).toBe('no_account');
    expect(mocks.manage).not.toHaveBeenCalled();
  });

  it('prioritizes only this actors unconfirmed cached positives without querying on warm reopen', async () => {
    const otherUser = 'other-runtime-user';
    const phones = Array.from({ length: 10_000 }, (_, index) => `phone-${index}`);
    const positive = {
      phoneE164: phones.at(-1)!,
      status: 'active_user' as const,
      matchedUserId: '00000000-0000-4000-8000-000000000123',
      displayName: null,
      avatarPath: null,
      relationshipId: null,
      friendshipInviteId: null,
      accountInviteId: null,
      accountInviteStatus: null,
      resolvedAt: Date.now() + 1,
      generation: 0,
    };
    mergeContactResolutions(user, [positive], { fromCache: true });
    mergeContactResolutions(otherUser, [{ ...positive, phoneE164: phones.at(-2)! }], {
      fromCache: true,
    });
    onlineManager.setOnline(false);
    activateContactDiscoveryRuntime(user);
    setContactDiscoveryKnownPhones(user, phones);
    onlineManager.setOnline(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.synchronize.mock.calls[0]).toEqual([
      user,
      [phones.at(-1)!, ...phones.slice(0, 59)],
      'background',
    ]);
    expect(mocks.synchronize).toHaveBeenCalledTimes(167);
    setContactDiscoveryVisiblePhones(user, []);
    activateContactDiscoveryRuntime(user);
    setContactDiscoveryKnownPhones(user, phones);
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.synchronize).toHaveBeenCalledTimes(167);
    clearContactResolutionUser(otherUser);
  });

  it('recovers realtime separately from HTTP and ignores repeated readiness notifications', async () => {
    setContactRealtimeReady(user, false);
    activateContactDiscoveryRuntime(user);
    setContactDiscoveryKnownPhones(user, ['phone-a']);
    await vi.advanceTimersByTimeAsync(0);
    setContactRealtimeReady(user, true);
    setContactRealtimeReady(user, true);
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.recover).toHaveBeenCalledTimes(1);
    expect(mocks.synchronize).toHaveBeenCalledTimes(2);
    setContactRealtimeReady(user, false);
    expect(mocks.recover).toHaveBeenCalledTimes(2);
    setContactRealtimeReady(user, true);
    setContactRealtimeReady(user, true);
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.recover).toHaveBeenCalledTimes(2);
    expect(mocks.synchronize).toHaveBeenCalledTimes(3);
  });

  it('waits for HTTP connectivity and keeps paused permission work paused', async () => {
    onlineManager.setOnline(false);
    setContactRealtimeReady(user, false);
    activateContactDiscoveryRuntime(user);
    setContactDiscoveryKnownPhones(user, ['phone-a']);
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.synchronize).not.toHaveBeenCalled();
    onlineManager.setOnline(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.synchronize).toHaveBeenCalledTimes(1);
    suspendContactDiscoveryRuntime(user);
    setContactDiscoveryKnownPhones(user, ['phone-b']);
    setContactRealtimeReady(user, true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mocks.synchronize).toHaveBeenCalledTimes(1);
  });

  it('does not recreate a disposed runtime from late hydration or viewport callbacks', async () => {
    activateContactDiscoveryRuntime(user);
    setContactDiscoveryKnownPhones(user, ['old-phone']);
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.synchronize).toHaveBeenCalledTimes(1);
    disposeContactDiscoveryRuntime(user);
    setContactDiscoveryKnownPhones(user, ['old-phone']);
    setContactDiscoveryVisiblePhones(user, ['old-phone']);
    replaceContactDiscoveryKnownPhones(user, ['old-phone']);
    activateContactDiscoveryRuntime(user);
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.synchronize).toHaveBeenCalledTimes(1);
    expect(mocks.restore).toHaveBeenCalledTimes(1);
  });

  it('updates warm cached state even without a contacts sheet subscriber', () => {
    activateContactDiscoveryRuntime(user);
    setContactDiscoveryVisiblePhones(user, []);
    mergeContactResolutions(user, [
      {
        phoneE164: '+573001234567',
        status: 'active_user',
        matchedUserId: 'person',
        displayName: 'Ana',
        avatarPath: null,
        relationshipId: null,
        friendshipInviteId: null,
        accountInviteId: null,
        accountInviteStatus: null,
      },
    ]);
    expect(mocks.warm).toHaveBeenCalledExactlyOnceWith(user, readContactResolutions(user));
  });
});
