import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const storageMocks = vi.hoisted(() => ({
  getStoredItem: vi.fn(),
  removeStoredItem: vi.fn(),
  setStoredItem: vi.fn(),
  values: new Map<string, string>(),
}));

vi.mock('./storage', () => ({
  getStoredItem: storageMocks.getStoredItem,
  removeStoredItem: storageMocks.removeStoredItem,
  setStoredItem: storageMocks.setStoredItem,
}));

import {
  PENDING_NAVIGATION_INTENT_TTL_MS,
  clearPendingNavigationIntentIfMatches,
  readPendingNavigationIntent,
  writePendingNavigationIntent,
} from './pending-navigation-intent';

const STORAGE_KEY = 'happy_circles.pending_navigation_intent';
const NOW = new Date('2026-08-13T12:00:00.000Z');

describe('pending navigation intent storage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    storageMocks.values.clear();
    storageMocks.getStoredItem.mockImplementation(
      async (key: string) => storageMocks.values.get(key) ?? null,
    );
    storageMocks.setStoredItem.mockImplementation(async (key: string, value: string) => {
      storageMocks.values.set(key, value);
    });
    storageMocks.removeStoredItem.mockImplementation(async (key: string) => {
      storageMocks.values.delete(key);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('persists and consumes a notification route by id', async () => {
    await writePendingNavigationIntent({ id: 'notification-1', href: '/activity' });

    await expect(readPendingNavigationIntent()).resolves.toEqual({
      type: 'notification',
      id: 'notification-1',
      href: '/activity',
      createdAt: NOW.toISOString(),
    });
    await expect(clearPendingNavigationIntentIfMatches('notification-1')).resolves.toBe(true);
    await expect(readPendingNavigationIntent()).resolves.toBeNull();
  });

  it('drops expired and external routes instead of navigating them', async () => {
    storageMocks.values.set(
      STORAGE_KEY,
      JSON.stringify({
        type: 'notification',
        id: 'expired',
        href: '/activity',
        createdAt: new Date(NOW.getTime() - PENDING_NAVIGATION_INTENT_TTL_MS - 1).toISOString(),
      }),
    );
    await expect(readPendingNavigationIntent()).resolves.toBeNull();

    storageMocks.values.set(
      STORAGE_KEY,
      JSON.stringify({
        type: 'notification',
        id: 'external',
        href: 'https://example.com',
        createdAt: NOW.toISOString(),
      }),
    );
    await expect(readPendingNavigationIntent()).resolves.toBeNull();
  });

  it('fails closed when secure storage get and cleanup both reject', async () => {
    storageMocks.getStoredItem.mockRejectedValueOnce(new Error('storage unavailable'));
    storageMocks.removeStoredItem.mockRejectedValueOnce(new Error('cleanup unavailable'));

    await expect(readPendingNavigationIntent()).resolves.toBeNull();
  });
});
