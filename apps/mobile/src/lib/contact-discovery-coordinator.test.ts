import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContactDiscoveryCoordinator } from './contact-discovery-coordinator';

function fixture() {
  let connected = true;
  let realtimeReady = true;
  let sessions = 0;
  const dependencies = {
    createSessionId: vi.fn(() => `session-${++sessions}`),
    isConnected: () => connected,
    isRealtimeReady: () => realtimeReady,
    setSession: vi.fn<(sessionId: string | null) => void>(),
    beginRecovery: vi.fn(),
    register: vi
      .fn<(phones: readonly string[], priority: string) => Promise<void>>()
      .mockResolvedValue(undefined),
    resolve: vi
      .fn<(phones: readonly string[], priority: string) => Promise<void>>()
      .mockResolvedValue(undefined),
    renew: vi
      .fn<(sessionId: string) => Promise<{ status: string }>>()
      .mockResolvedValue({ status: 'renewed' }),
    stop: vi.fn<(sessionId: string) => Promise<void>>().mockResolvedValue(undefined),
  };
  const coordinator = new ContactDiscoveryCoordinator(dependencies);
  return {
    coordinator,
    dependencies,
    setConnected: (value: boolean) => {
      connected = value;
    },
    setRealtimeReady: (value: boolean) => {
      realtimeReady = value;
    },
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('app-scoped contact discovery lease', () => {
  it('resolves over HTTP before the first realtime subscription and establishes its baseline once', async () => {
    const { coordinator, dependencies, setRealtimeReady } = fixture();
    setRealtimeReady(false);
    coordinator.activate();
    coordinator.addPhones(['phone-a', 'phone-b']);
    await vi.advanceTimersByTimeAsync(0);
    expect(dependencies.register).not.toHaveBeenCalled();
    expect(dependencies.resolve).toHaveBeenCalledExactlyOnceWith(
      ['phone-a', 'phone-b'],
      'background',
    );
    setRealtimeReady(true);
    coordinator.connectionChanged();
    coordinator.connectionChanged();
    await vi.advanceTimersByTimeAsync(0);
    expect(dependencies.beginRecovery).toHaveBeenCalledTimes(1);
    expect(dependencies.register).toHaveBeenCalledTimes(1);
    expect(dependencies.resolve).toHaveBeenCalledTimes(2);
    coordinator.addPhones(['phone-a', 'phone-b']);
    await vi.advanceTimersByTimeAsync(0);
    expect(dependencies.resolve).toHaveBeenCalledTimes(2);
    coordinator.dispose();
  });

  it('fences a realtime-only gap while HTTP remains online and reconciles it once', async () => {
    const { coordinator, dependencies, setRealtimeReady } = fixture();
    coordinator.activate();
    coordinator.addPhones(['phone-a', 'phone-b']);
    coordinator.setVisiblePhones(['phone-b']);
    await vi.advanceTimersByTimeAsync(0);
    dependencies.beginRecovery.mockClear();
    dependencies.resolve.mockClear();
    dependencies.register.mockClear();
    setRealtimeReady(false);
    coordinator.connectionChanged();
    coordinator.connectionChanged();
    expect(dependencies.beginRecovery).toHaveBeenCalledTimes(1);
    coordinator.addPhones(['phone-c']);
    await vi.advanceTimersByTimeAsync(0);
    expect(dependencies.resolve).toHaveBeenCalledExactlyOnceWith(['phone-c'], 'background');
    expect(dependencies.register).not.toHaveBeenCalled();
    setRealtimeReady(true);
    coordinator.connectionChanged();
    coordinator.connectionChanged();
    await vi.advanceTimersByTimeAsync(0);
    expect(dependencies.beginRecovery).toHaveBeenCalledTimes(1);
    expect(dependencies.resolve.mock.calls[1]).toEqual([
      ['phone-b', 'phone-a', 'phone-c'],
      'visible',
    ]);
    expect(dependencies.register).toHaveBeenCalledTimes(1);
    expect(dependencies.createSessionId).toHaveBeenCalledTimes(1);
    coordinator.dispose();
  });

  it('does not renew or rotate unused observation leases during a long HTTP fallback', async () => {
    const { coordinator, dependencies, setRealtimeReady } = fixture();
    setRealtimeReady(false);
    coordinator.activate();
    coordinator.addPhones(['phone-a']);
    await vi.advanceTimersByTimeAsync(45 * 60_000);
    expect(dependencies.resolve).toHaveBeenCalledTimes(1);
    expect(dependencies.register).not.toHaveBeenCalled();
    expect(dependencies.renew).not.toHaveBeenCalled();
    expect(dependencies.createSessionId).toHaveBeenCalledTimes(1);
    setRealtimeReady(true);
    coordinator.connectionChanged();
    await vi.advanceTimersByTimeAsync(0);
    expect(dependencies.createSessionId).toHaveBeenCalledTimes(2);
    expect(dependencies.beginRecovery).toHaveBeenCalledTimes(1);
    expect(dependencies.register).toHaveBeenCalledTimes(1);
    expect(dependencies.resolve).toHaveBeenCalledTimes(2);
    coordinator.dispose();
  });

  it('resumes HTTP work when Internet returns before realtime', async () => {
    const { coordinator, dependencies, setConnected, setRealtimeReady } = fixture();
    setConnected(false);
    setRealtimeReady(false);
    coordinator.activate();
    coordinator.addPhones(['phone-a']);
    await vi.advanceTimersByTimeAsync(45 * 60_000);
    expect(dependencies.resolve).not.toHaveBeenCalled();
    expect(dependencies.createSessionId).toHaveBeenCalledTimes(1);
    setConnected(true);
    coordinator.connectionChanged();
    await vi.advanceTimersByTimeAsync(0);
    expect(dependencies.resolve).toHaveBeenCalledTimes(1);
    expect(dependencies.register).not.toHaveBeenCalled();
    coordinator.dispose();
  });

  it('does not rotate a lease when an expired renewal arrives after realtime disconnects', async () => {
    const { coordinator, dependencies, setRealtimeReady } = fixture();
    let finishRenew!: (result: { status: string }) => void;
    dependencies.renew.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishRenew = resolve;
        }),
    );
    coordinator.activate();
    coordinator.addPhones(['phone-a']);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(dependencies.renew).toHaveBeenCalledTimes(1);
    setRealtimeReady(false);
    coordinator.connectionChanged();
    finishRenew({ status: 'expired' });
    await vi.advanceTimersByTimeAsync(30 * 60_000);
    expect(dependencies.createSessionId).toHaveBeenCalledTimes(1);
    expect(dependencies.register).toHaveBeenCalledTimes(1);
    setRealtimeReady(true);
    coordinator.connectionChanged();
    await vi.advanceTimersByTimeAsync(0);
    expect(dependencies.createSessionId).toHaveBeenCalledTimes(2);
    expect(dependencies.register).toHaveBeenCalledTimes(2);
    coordinator.dispose();
  });

  it('keeps registration and the session across modal close/reopen and renews only the lease', async () => {
    const { coordinator, dependencies } = fixture();
    coordinator.addPhones(['phone-a', 'phone-b']);
    coordinator.activate();
    await vi.advanceTimersByTimeAsync(0);
    coordinator.setVisiblePhones([]); // Modal close has no lifecycle effect.
    coordinator.addPhones(['phone-a', 'phone-b']);
    coordinator.activate();
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(dependencies.createSessionId).toHaveBeenCalledTimes(1);
    expect(dependencies.register).toHaveBeenCalledTimes(1);
    expect(dependencies.resolve).toHaveBeenCalledTimes(1);
    expect(dependencies.renew).toHaveBeenCalledExactlyOnceWith('session-1');
    expect(dependencies.stop).not.toHaveBeenCalled();
    coordinator.dispose();
  });

  it('starts cached recovery with visible phones and continues in batches of 60', async () => {
    const { coordinator, dependencies } = fixture();
    const phones = Array.from({ length: 10_000 }, (_, index) => `phone-${index}`);
    coordinator.addPhones(phones);
    coordinator.setVisiblePhones(['phone-9999']);
    coordinator.activate();
    await vi.advanceTimersByTimeAsync(0);
    expect(dependencies.register.mock.calls[0][0][0]).toBe('phone-9999');
    expect(dependencies.register.mock.calls[0][1]).toBe('visible');
    expect(dependencies.register).toHaveBeenCalledTimes(167);
    expect(Math.max(...dependencies.register.mock.calls.map(([phones]) => phones.length))).toBe(60);
    expect(dependencies.resolve).toHaveBeenCalledTimes(167);
    coordinator.dispose();
  });

  it('confirms late cached positives ahead of queued negatives without overtaking user priorities', async () => {
    const { dependencies } = fixture();
    const phones = Array.from({ length: 10_000 }, (_, index) => `phone-${index}`);
    const positives = new Set(phones.slice(-38));
    let finishFirst!: () => void;
    const synchronize = vi
      .fn<(phones: readonly string[], priority: string) => Promise<{ recheck: never[] }>>()
      .mockResolvedValue({ recheck: [] })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishFirst = () => resolve({ recheck: [] });
          }),
      );
    const coordinator = new ContactDiscoveryCoordinator({
      ...dependencies,
      synchronize,
      isUnconfirmedCachedPositive: (phone) => positives.has(phone),
    });
    coordinator.activate();
    coordinator.addPhones(phones.slice(0, 60));
    coordinator.addPhones(phones.slice(60));
    coordinator.setVisiblePhones(['phone-9000']);
    coordinator.handleInvalidation(['phone-9001']);
    coordinator.addPhones(['interactive-phone'], 'interactive');
    finishFirst();
    await vi.advanceTimersByTimeAsync(0);
    expect(synchronize.mock.calls[1][0].slice(0, 3)).toEqual([
      'interactive-phone',
      'phone-9001',
      'phone-9000',
    ]);
    expect(synchronize.mock.calls[1][0].slice(3, 41)).toEqual([...positives]);
    expect(Math.max(...synchronize.mock.calls.map(([batch]) => batch.length))).toBe(60);
    const resolved = synchronize.mock.calls.flatMap(([batch]) => [...batch]);
    expect(new Set(resolved).size).toBe(10_001);
    expect(resolved).toHaveLength(10_001);
    positives.clear();
    coordinator.setVisiblePhones([]);
    coordinator.addPhones(phones);
    coordinator.activate();
    await vi.advanceTimersByTimeAsync(0);
    expect(synchronize).toHaveBeenCalledTimes(167);
    coordinator.dispose();
  });

  it('registers only new phones in a healthy existing app session', async () => {
    const { coordinator, dependencies } = fixture();
    coordinator.activate();
    coordinator.addPhones(['phone-a', 'phone-b']);
    await vi.advanceTimersByTimeAsync(0);
    coordinator.addPhones(['phone-a', 'phone-b', 'phone-c']);
    await vi.advanceTimersByTimeAsync(0);
    expect(dependencies.register.mock.calls.map(([phones]) => phones)).toEqual([
      ['phone-a', 'phone-b'],
      ['phone-c'],
    ]);
    coordinator.dispose();
  });

  it('reconciles a connection gap once without replacing the session or clearing display state', async () => {
    const { coordinator, dependencies, setConnected } = fixture();
    coordinator.addPhones(['phone-a', 'phone-b']);
    coordinator.setVisiblePhones(['phone-b']);
    coordinator.activate();
    await vi.advanceTimersByTimeAsync(0);
    dependencies.register.mockClear();
    dependencies.resolve.mockClear();
    dependencies.beginRecovery.mockClear();
    setConnected(false);
    coordinator.connectionChanged();
    setConnected(true);
    coordinator.connectionChanged();
    coordinator.connectionChanged();
    await vi.advanceTimersByTimeAsync(0);
    expect(dependencies.beginRecovery).toHaveBeenCalledTimes(1);
    expect(dependencies.setSession).toHaveBeenCalledExactlyOnceWith('session-1');
    expect(dependencies.resolve).toHaveBeenCalledExactlyOnceWith(['phone-b', 'phone-a'], 'visible');
    expect(dependencies.stop).not.toHaveBeenCalled();
    coordinator.dispose();
  });

  it('pauses background or revoked-permission work and does not resolve a registration finishing later', async () => {
    const { coordinator, dependencies } = fixture();
    let finish!: () => void;
    dependencies.register.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    coordinator.addPhones(Array.from({ length: 120 }, (_, index) => `phone-${index}`));
    coordinator.activate();
    coordinator.suspend();
    finish();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(dependencies.register).toHaveBeenCalledTimes(1);
    expect(dependencies.resolve).not.toHaveBeenCalled();
    expect(dependencies.renew).not.toHaveBeenCalled();
    expect(dependencies.stop).toHaveBeenCalledExactlyOnceWith('session-1');
    expect(dependencies.setSession.mock.calls.map(([session]) => session)).toEqual([
      'session-1',
      null,
    ]);
    coordinator.dispose();
  });

  it('recreates an expired lease and recovers existing phones once', async () => {
    const { coordinator, dependencies } = fixture();
    dependencies.renew.mockResolvedValueOnce({ status: 'expired' });
    coordinator.addPhones(['phone-a']);
    coordinator.activate();
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(dependencies.setSession.mock.calls.map(([session]) => session)).toEqual([
      'session-1',
      'session-2',
    ]);
    expect(dependencies.register).toHaveBeenCalledTimes(2);
    expect(dependencies.resolve).toHaveBeenCalledTimes(2);
    coordinator.dispose();
  });

  it('forgets contact phones after logout instead of registering them on a later sign-in', async () => {
    const { coordinator, dependencies } = fixture();
    coordinator.addPhones(['phone-a']);
    coordinator.activate();
    await vi.advanceTimersByTimeAsync(0);
    coordinator.dispose();
    coordinator.activate();
    await vi.advanceTimersByTimeAsync(0);
    expect(dependencies.register).toHaveBeenCalledTimes(1);
    coordinator.dispose();
  });

  it('rechecks a newly observed cached baseline once after TTL without waiting for modal open', async () => {
    const { dependencies } = fixture();
    const at = Date.now() + 60_001;
    const synchronize = vi
      .fn(async () => ({ recheck: [] as { phoneE164: string; at: number }[] }))
      .mockResolvedValueOnce({ recheck: [{ phoneE164: 'phone-a', at }] });
    const coordinator = new ContactDiscoveryCoordinator({ ...dependencies, synchronize });
    coordinator.activate();
    coordinator.addPhones(['phone-a']);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(synchronize).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(synchronize).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(synchronize).toHaveBeenCalledTimes(2);
    coordinator.dispose();
  });

  it('prunes deleted agenda numbers without recreating the lease or re-reading retained phones', async () => {
    const { dependencies } = fixture();
    const remove = vi
      .fn<(phones: readonly string[]) => Promise<void>>()
      .mockResolvedValue(undefined);
    const coordinator = new ContactDiscoveryCoordinator({ ...dependencies, remove });
    coordinator.activate();
    coordinator.addPhones(['phone-a', 'phone-b']);
    await vi.advanceTimersByTimeAsync(0);
    coordinator.replaceKnownPhones(['phone-b']);
    await vi.advanceTimersByTimeAsync(0);
    expect(remove).toHaveBeenCalledExactlyOnceWith(['phone-a']);
    expect(dependencies.createSessionId).toHaveBeenCalledTimes(1);
    expect(dependencies.resolve).toHaveBeenCalledTimes(1);
    coordinator.suspend();
    coordinator.activate();
    await vi.advanceTimersByTimeAsync(0);
    expect(dependencies.register.mock.calls[1][0]).toEqual(['phone-b']);
    coordinator.dispose();
  });

  it('retries failed watch retirement with backoff while retaining the same app lease', async () => {
    const { dependencies } = fixture();
    const remove = vi
      .fn<(phones: readonly string[]) => Promise<void>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined);
    const coordinator = new ContactDiscoveryCoordinator({ ...dependencies, remove });
    coordinator.activate();
    coordinator.addPhones(['phone-a']);
    await vi.advanceTimersByTimeAsync(0);
    coordinator.replaceKnownPhones([]);
    await vi.advanceTimersByTimeAsync(29_999);
    expect(remove).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(remove).toHaveBeenCalledTimes(2);
    expect(dependencies.createSessionId).toHaveBeenCalledTimes(1);
    coordinator.dispose();
  });

  it('does not call the first realtime connection a lost-event gap', async () => {
    const { coordinator, dependencies, setConnected } = fixture();
    setConnected(false);
    coordinator.activate();
    coordinator.addPhones(['phone-a']);
    setConnected(true);
    coordinator.connectionChanged();
    await vi.advanceTimersByTimeAsync(0);
    expect(dependencies.beginRecovery).not.toHaveBeenCalled();
    expect(dependencies.register).toHaveBeenCalledTimes(1);
    coordinator.dispose();
  });

  it('stops trusting an unrenewed lease at its 15-minute lifetime', async () => {
    const { coordinator, dependencies } = fixture();
    dependencies.renew.mockRejectedValue(new Error('renew unavailable'));
    coordinator.activate();
    coordinator.addPhones(['phone-a']);
    await vi.advanceTimersByTimeAsync(15 * 60_000);
    expect(dependencies.createSessionId).toHaveBeenCalledTimes(2);
    expect(dependencies.beginRecovery).toHaveBeenCalledTimes(1);
    coordinator.dispose();
  });
});
