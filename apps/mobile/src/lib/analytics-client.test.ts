import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const storage = new Map<string, string>();

  return {
    fetch: vi.fn(),
    getSession: vi.fn(),
    getStoredItem: vi.fn((key: string) => Promise.resolve(storage.get(key) ?? null)),
    removeStoredItem: vi.fn((key: string) => {
      storage.delete(key);
      return Promise.resolve();
    }),
    setStoredItem: vi.fn((key: string, value: string) => {
      storage.set(key, value);
      return Promise.resolve();
    }),
    storage,
  };
});

vi.mock('expo-constants', () => ({
  default: { expoConfig: { extra: {} } },
}));

vi.mock('react-native', () => ({
  Platform: {
    OS: 'web',
    select: (options: Record<string, unknown>) => options.web ?? options.default,
  },
}));

vi.mock('./config', () => ({
  appConfig: {
    appWebOrigin: 'https://app.happy-circles.com',
    authRedirectMode: 'universal-link',
    googleAndroidClientId: '',
    googleIosClientId: '',
    googleWebClientId: '',
    supabaseAnonKey: 'anon-key',
    supabaseUrl: 'https://supabase.test',
  },
}));

vi.mock('./storage', () => ({
  getStoredItem: mocks.getStoredItem,
  removeStoredItem: mocks.removeStoredItem,
  setStoredItem: mocks.setStoredItem,
}));

vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
    },
  },
}));

import {
  flushProductAnalyticsEvents,
  recordProductEvent,
  recordProductEventSafe,
  resetProductAnalyticsSession,
  startProductAnalyticsSession,
} from './analytics-client';

const queueKey = 'happy-circles.analytics.queue.v1';

function readStoredQueue(): readonly unknown[] {
  return JSON.parse(mocks.storage.get(queueKey) ?? '[]') as readonly unknown[];
}

function fetchJsonBodies(): readonly Record<string, unknown>[] {
  return mocks.fetch.mock.calls.map(
    ([, init]) => JSON.parse((init as { readonly body: string }).body) as Record<string, unknown>,
  );
}

describe('analytics-client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    mocks.storage.clear();
    vi.stubGlobal('fetch', mocks.fetch);
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: 'access-token' } } });
    mocks.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            acceptedEventCount: 0,
            eventIds: [],
            sessionId: '11111111-1111-4111-8111-111111111111',
          }),
        ),
    });
    resetProductAnalyticsSession();
  });

  it('queues events before a session and flushes them through analytics-ingest', async () => {
    await recordProductEvent({
      eventName: 'screen_viewed',
      metadata: { route: 'home' },
      screenName: 'home',
    });
    await recordProductEvent({
      eventName: 'financial_request_started',
      metadata: { category: 'food_drinks' },
      screenName: 'register',
    });

    expect(readStoredQueue()).toHaveLength(2);

    await startProductAnalyticsSession({
      appVersion: '1.0.0',
      clientSessionId: 'mobile-session:test',
      deviceId: 'device-1',
      platform: 'ios',
      startedAt: new Date().toISOString(),
    });
    await flushProductAnalyticsEvents();

    const bodies = fetchJsonBodies();
    expect(
      (bodies[0]?.clientSession as { readonly clientSessionId?: unknown }).clientSessionId,
    ).toBe('mobile-session:test');
    expect(bodies[0]?.events).toEqual([]);
    expect(
      (bodies[1]?.clientSession as { readonly clientSessionId?: unknown }).clientSessionId,
    ).toBe('mobile-session:test');
    expect(bodies[1]?.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventName: 'screen_viewed' }),
        expect.objectContaining({ eventName: 'financial_request_started' }),
      ]),
    );
    expect(readStoredQueue()).toHaveLength(0);
  });

  it('rejects metadata keys that are not allowed for the event', async () => {
    await expect(
      recordProductEvent({
        eventName: 'screen_viewed',
        metadata: { category: 'food_drinks', route: 'home' },
        screenName: 'home',
      }),
    ).rejects.toThrow('Metadata key category is not allowed');

    expect(readStoredQueue()).toHaveLength(0);
    expect(() =>
      recordProductEventSafe({
        eventName: 'screen_viewed',
        metadata: { category: 'food_drinks', route: 'home' },
        screenName: 'home',
      }),
    ).not.toThrow();
  });

  it('keeps only the latest 100 queued events', async () => {
    for (let index = 0; index < 105; index += 1) {
      await recordProductEvent({
        eventName: 'screen_viewed',
        metadata: { route: `home-${index}` },
        screenName: 'home',
      });
    }

    const queue = readStoredQueue();
    expect(queue).toHaveLength(100);
    expect(queue[0]).toEqual(expect.objectContaining({ metadata: { route: 'home-5' } }));
  });

  it('drops expired queued events and flushes in batches of 20', async () => {
    const oldOccurredAt = new Date(Date.now() - 73 * 60 * 60 * 1000).toISOString();
    const freshOccurredAt = new Date().toISOString();
    const queuedEvents = [
      {
        clientEventId: 'old-screen-event',
        eventName: 'screen_viewed',
        metadata: { route: 'old' },
        occurredAt: oldOccurredAt,
        screenName: 'home',
      },
      ...Array.from({ length: 25 }, (_, index) => ({
        clientEventId: `fresh-screen-event-${index}`,
        eventName: 'screen_viewed',
        metadata: { route: `fresh-${index}` },
        occurredAt: freshOccurredAt,
        screenName: 'home',
      })),
    ];

    await mocks.setStoredItem(queueKey, JSON.stringify(queuedEvents));

    await startProductAnalyticsSession({
      appVersion: '1.0.0',
      clientSessionId: 'mobile-session:test',
      deviceId: 'device-1',
      platform: 'ios',
      startedAt: new Date().toISOString(),
    });
    await flushProductAnalyticsEvents();

    const eventBatches = fetchJsonBodies()
      .map((body) => body.events as readonly unknown[])
      .filter((events) => events.length > 0);

    expect(eventBatches).toHaveLength(2);
    expect(eventBatches[0]).toHaveLength(20);
    expect(eventBatches[1]).toHaveLength(5);
    expect(JSON.stringify(eventBatches)).not.toContain('old-screen-event');
    expect(readStoredQueue()).toHaveLength(0);
  });

  it('debounces event flushes while a session is active', async () => {
    vi.useFakeTimers();

    await startProductAnalyticsSession({
      appVersion: '1.0.0',
      clientSessionId: 'mobile-session:test',
      deviceId: 'device-1',
      platform: 'ios',
      startedAt: new Date().toISOString(),
    });

    await recordProductEvent({
      eventName: 'screen_viewed',
      metadata: { route: 'home' },
      screenName: 'home',
    });

    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it('flushes immediately and clears the pending debounce when requested', async () => {
    vi.useFakeTimers();

    await startProductAnalyticsSession({
      appVersion: '1.0.0',
      clientSessionId: 'mobile-session:test',
      deviceId: 'device-1',
      platform: 'ios',
      startedAt: new Date().toISOString(),
    });

    await recordProductEvent({
      eventName: 'app_backgrounded',
      metadata: { route: 'home' },
      screenName: 'home',
    });
    await flushProductAnalyticsEvents();

    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });
});
