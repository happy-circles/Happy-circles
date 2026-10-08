import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  setContactRealtimeReady(user, true);
});
afterEach(() => {
  disposeContactDiscoveryRuntime(user);
  clearContactResolutionUser(user);
  vi.useRealTimers();
});

describe('contact runtime authorization boundary', () => {
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
