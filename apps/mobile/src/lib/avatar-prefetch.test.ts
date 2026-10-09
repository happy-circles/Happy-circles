import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppSnapshot } from './live-data/types';

const mocks = vi.hoisted(() => ({
  avatarImageCacheKey: vi.fn(),
  isAvatarImageReady: vi.fn(),
  loadAsync: vi.fn(),
  rememberAvatarImageReady: vi.fn(),
  resolveSignedAvatarUrl: vi.fn(),
}));

vi.mock('expo-image', () => ({
  Image: {
    loadAsync: mocks.loadAsync,
  },
}));

vi.mock('./avatar', () => ({
  avatarImageCacheKey: mocks.avatarImageCacheKey,
  isAvatarImageReady: mocks.isAvatarImageReady,
  rememberAvatarImageReady: mocks.rememberAvatarImageReady,
  resolveSignedAvatarUrl: mocks.resolveSignedAvatarUrl,
}));

import {
  clearAvatarPrefetchCacheForTests,
  collectCriticalAvatarPaths,
  collectDeferredAvatarPaths,
  getPrefetchedAvatarImageRef,
  prefetchAvatarPaths,
  prefetchCriticalAvatarImages,
} from './avatar-prefetch';

function snapshot(avatarUrls: readonly string[]): AppSnapshot {
  return {
    currentUserProfile: { avatarUrl: avatarUrls[0] ?? null },
    dashboard: {
      activePeople: avatarUrls.slice(1).map((avatarUrl, index) => ({
        avatarUrl,
        id: `person-${index}`,
      })),
    },
  } as unknown as AppSnapshot;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('avatar-prefetch', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    clearAvatarPrefetchCacheForTests();
    mocks.avatarImageCacheKey.mockImplementation((path?: string | null) => {
      return path?.trim().replace(/^\/+/, '') || undefined;
    });
    mocks.isAvatarImageReady.mockReturnValue(false);
    mocks.loadAsync.mockResolvedValue({ width: 512, height: 512 });
    mocks.resolveSignedAvatarUrl.mockImplementation(async (path: string) => {
      return `https://signed.test/${path}`;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('collects unique critical avatar paths', () => {
    expect(collectCriticalAvatarPaths(snapshot(['a.jpg', 'b.jpg', 'a.jpg']))).toEqual([
      'a.jpg',
      'b.jpg',
    ]);
  });

  it('loads each avatar under the stable key shared with the thumbnail and viewer', async () => {
    await expect(prefetchCriticalAvatarImages(snapshot(['a.jpg', 'b.jpg']))).resolves.toBe(true);

    expect(mocks.loadAsync).toHaveBeenCalledTimes(2);
    expect(mocks.loadAsync).toHaveBeenCalledWith(
      { uri: 'https://signed.test/a.jpg', cacheKey: 'a.jpg' },
      { maxWidth: 1024, maxHeight: 1024 },
    );
    expect(mocks.rememberAvatarImageReady).toHaveBeenCalledWith(
      'a.jpg',
      'https://signed.test/a.jpg',
    );
    expect(getPrefetchedAvatarImageRef('/a.jpg')).toEqual({ width: 512, height: 512 });
  });

  it('reuses the prefetched image even when its signed URL would be renewed', async () => {
    const image = { width: 512, height: 512 };
    mocks.loadAsync.mockResolvedValue(image);
    mocks.resolveSignedAvatarUrl.mockResolvedValueOnce('https://signed.test/a?token=one');

    await prefetchCriticalAvatarImages(snapshot(['a.jpg']));
    mocks.resolveSignedAvatarUrl.mockResolvedValue('https://signed.test/a?token=two');
    await prefetchCriticalAvatarImages(snapshot(['a.jpg']));

    expect(mocks.loadAsync).toHaveBeenCalledTimes(1);
    expect(mocks.resolveSignedAvatarUrl).toHaveBeenCalledTimes(1);
    expect(getPrefetchedAvatarImageRef('a.jpg')).toBe(image);
  });

  it('keeps the disk cache key stable after memory eviction and URL renewal', async () => {
    mocks.resolveSignedAvatarUrl.mockResolvedValueOnce('https://signed.test/a?token=one');
    await prefetchAvatarPaths(['a.jpg']);
    await prefetchAvatarPaths(Array.from({ length: 16 }, (_, index) => `other-${index}.jpg`));
    expect(getPrefetchedAvatarImageRef('a.jpg')).toBeUndefined();

    mocks.resolveSignedAvatarUrl.mockResolvedValueOnce('https://signed.test/a?token=two');
    await prefetchAvatarPaths(['a.jpg']);

    expect(mocks.loadAsync).toHaveBeenNthCalledWith(
      1,
      { uri: 'https://signed.test/a?token=one', cacheKey: 'a.jpg' },
      { maxWidth: 1024, maxHeight: 1024 },
    );
    expect(mocks.loadAsync).toHaveBeenLastCalledWith(
      { uri: 'https://signed.test/a?token=two', cacheKey: 'a.jpg' },
      { maxWidth: 1024, maxHeight: 1024 },
    );
  });

  it('retains all nine critical avatars through deferred loads while respecting the memory bound', async () => {
    const criticalPaths = Array.from({ length: 9 }, (_, index) => `critical-${index}.jpg`);
    const deferredPaths = Array.from({ length: 20 }, (_, index) => `deferred-${index}.jpg`);
    await prefetchCriticalAvatarImages(snapshot(criticalPaths));
    await prefetchAvatarPaths(deferredPaths);

    expect(criticalPaths.every((path) => Boolean(getPrefetchedAvatarImageRef(path)))).toBe(true);
    expect(
      [...criticalPaths, ...deferredPaths].filter((path) => getPrefetchedAvatarImageRef(path)),
    ).toHaveLength(16);
  });

  it('replaces the protected avatar set when the critical snapshot changes', async () => {
    const previousPaths = Array.from({ length: 9 }, (_, index) => `previous-${index}.jpg`);
    const currentPaths = Array.from({ length: 9 }, (_, index) => `current-${index}.jpg`);
    await prefetchCriticalAvatarImages(snapshot(previousPaths));
    await prefetchCriticalAvatarImages(snapshot(currentPaths));
    await prefetchAvatarPaths(Array.from({ length: 20 }, (_, index) => `deferred-${index}.jpg`));

    expect(previousPaths.every((path) => !getPrefetchedAvatarImageRef(path))).toBe(true);
    expect(currentPaths.every((path) => Boolean(getPrefetchedAvatarImageRef(path)))).toBe(true);
  });

  it('does not resolve or prefetch paths already marked ready', async () => {
    mocks.isAvatarImageReady.mockReturnValue(true);

    await expect(prefetchAvatarPaths(['a.jpg'])).resolves.toBe(true);

    expect(mocks.resolveSignedAvatarUrl).not.toHaveBeenCalled();
    expect(mocks.loadAsync).not.toHaveBeenCalled();
    expect(getPrefetchedAvatarImageRef('a.jpg')).toBeUndefined();
  });

  it('reuses a thumbnail that finishes while the URL is being resolved', async () => {
    const signedUrl = deferred<string>();
    mocks.resolveSignedAvatarUrl.mockReturnValue(signedUrl.promise);
    const result = prefetchAvatarPaths(['a.jpg']);

    mocks.isAvatarImageReady.mockReturnValue(true);
    signedUrl.resolve('https://signed.test/a.jpg');
    await expect(result).resolves.toBe(true);

    expect(mocks.loadAsync).not.toHaveBeenCalled();
  });

  it('shares in-flight work between concurrent callers and normalized path aliases', async () => {
    const load = deferred<{ width: number; height: number }>();
    mocks.loadAsync.mockReturnValue(load.promise);

    const first = prefetchAvatarPaths(['a.jpg', '/a.jpg']);
    const second = prefetchAvatarPaths(['a.jpg']);
    await Promise.resolve();

    expect(mocks.resolveSignedAvatarUrl).toHaveBeenCalledTimes(1);
    expect(mocks.loadAsync).toHaveBeenCalledTimes(1);
    expect(mocks.rememberAvatarImageReady).not.toHaveBeenCalled();
    load.resolve({ width: 512, height: 512 });

    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(true);
    expect(mocks.rememberAvatarImageReady).toHaveBeenCalledTimes(1);
  });

  it('limits image loads to four globally across concurrent callers', async () => {
    const image = { width: 512, height: 512 };
    const loads = new Map<string, ReturnType<typeof deferred<typeof image>>>();
    let activeLoads = 0;
    let peakLoads = 0;
    mocks.loadAsync.mockImplementation(({ cacheKey }: { cacheKey: string }) => {
      const load = deferred<typeof image>();
      loads.set(cacheKey, load);
      activeLoads += 1;
      peakLoads = Math.max(peakLoads, activeLoads);
      return load.promise.finally(() => {
        activeLoads -= 1;
      });
    });

    const first = prefetchAvatarPaths(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg']);
    const second = prefetchAvatarPaths(['e.jpg', 'f.jpg', 'g.jpg', 'h.jpg']);
    await vi.waitFor(() => expect(mocks.loadAsync).toHaveBeenCalledTimes(4));

    expect(mocks.resolveSignedAvatarUrl).toHaveBeenCalledTimes(4);
    expect(peakLoads).toBe(4);
    for (const load of loads.values()) {
      load.resolve(image);
    }
    await vi.waitFor(() => expect(mocks.loadAsync).toHaveBeenCalledTimes(8));
    expect(peakLoads).toBe(4);
    for (const load of loads.values()) {
      load.resolve(image);
    }

    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(true);
    expect(activeLoads).toBe(0);
    expect(peakLoads).toBe(4);
  });

  it('counts URL resolution against the same global concurrency limit', async () => {
    const signedUrls = new Map<string, ReturnType<typeof deferred<string>>>();
    mocks.resolveSignedAvatarUrl.mockImplementation((path: string) => {
      const signedUrl = deferred<string>();
      signedUrls.set(path, signedUrl);
      return signedUrl.promise;
    });

    const first = prefetchAvatarPaths(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg']);
    const second = prefetchAvatarPaths(['e.jpg']);
    expect(mocks.resolveSignedAvatarUrl).toHaveBeenCalledTimes(4);
    expect(mocks.loadAsync).not.toHaveBeenCalled();
    for (const [path, signedUrl] of signedUrls) {
      signedUrl.resolve(`https://signed.test/${path}`);
    }

    await vi.waitFor(() => expect(mocks.resolveSignedAvatarUrl).toHaveBeenCalledTimes(5));
    signedUrls.get('e.jpg')?.resolve('https://signed.test/e.jpg');
    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(true);
    expect(mocks.loadAsync).toHaveBeenCalledTimes(5);
  });

  it('skips a queued avatar when its thumbnail finishes before the load starts', async () => {
    const image = { width: 512, height: 512 };
    const activeLoad = deferred<typeof image>();
    mocks.loadAsync.mockReturnValue(activeLoad.promise);
    const first = prefetchAvatarPaths(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg']);
    const queued = prefetchAvatarPaths(['queued.jpg']);
    const duplicate = prefetchAvatarPaths(['/queued.jpg']);
    await Promise.resolve();
    expect(mocks.loadAsync).toHaveBeenCalledTimes(4);

    mocks.isAvatarImageReady.mockImplementation((path: string) => path.endsWith('queued.jpg'));
    activeLoad.resolve(image);

    await expect(first).resolves.toBe(true);
    await expect(queued).resolves.toBe(true);
    await expect(duplicate).resolves.toBe(true);
    expect(mocks.resolveSignedAvatarUrl).toHaveBeenCalledTimes(4);
    expect(mocks.loadAsync).toHaveBeenCalledTimes(4);
    expect(getPrefetchedAvatarImageRef('queued.jpg')).toBeUndefined();
  });

  it('includes queue wait in the timeout while preserving queued work for another caller', async () => {
    vi.useFakeTimers();
    const image = { width: 512, height: 512 };
    const activeLoad = deferred<typeof image>();
    mocks.loadAsync.mockImplementation(({ cacheKey }: { cacheKey: string }) => {
      return cacheKey === 'queued.jpg' ? Promise.resolve(image) : activeLoad.promise;
    });
    const first = prefetchAvatarPaths(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg'], { timeoutMs: 50 });
    const queued = prefetchAvatarPaths(['queued.jpg'], { timeoutMs: 10 });

    await vi.advanceTimersByTimeAsync(10);
    await expect(queued).resolves.toBe(false);
    expect(mocks.resolveSignedAvatarUrl).toHaveBeenCalledTimes(4);
    expect(mocks.rememberAvatarImageReady).not.toHaveBeenCalled();

    const retry = prefetchAvatarPaths(['queued.jpg'], { timeoutMs: 50 });
    activeLoad.resolve(image);
    await expect(first).resolves.toBe(true);
    await expect(retry).resolves.toBe(true);
    expect(mocks.resolveSignedAvatarUrl).toHaveBeenCalledTimes(5);
    expect(mocks.loadAsync).toHaveBeenCalledTimes(5);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('bounds the wait for URL resolution and lets later callers reuse the eventual image', async () => {
    vi.useFakeTimers();
    const signedUrl = deferred<string>();
    mocks.resolveSignedAvatarUrl.mockReturnValue(signedUrl.promise);
    const first = prefetchAvatarPaths(['a.jpg'], { timeoutMs: 50 });

    await vi.advanceTimersByTimeAsync(50);
    await expect(first).resolves.toBe(false);
    expect(mocks.loadAsync).not.toHaveBeenCalled();
    expect(mocks.rememberAvatarImageReady).not.toHaveBeenCalled();

    const second = prefetchAvatarPaths(['a.jpg'], { timeoutMs: 50 });
    signedUrl.resolve('https://signed.test/a.jpg');
    await expect(second).resolves.toBe(true);

    expect(mocks.resolveSignedAvatarUrl).toHaveBeenCalledTimes(1);
    expect(mocks.loadAsync).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('bounds a slow image load without marking it ready before it succeeds', async () => {
    vi.useFakeTimers();
    const load = deferred<{ width: number; height: number }>();
    mocks.loadAsync.mockReturnValue(load.promise);
    const first = prefetchAvatarPaths(['a.jpg'], { timeoutMs: 50 });

    await vi.advanceTimersByTimeAsync(50);
    await expect(first).resolves.toBe(false);
    expect(mocks.rememberAvatarImageReady).not.toHaveBeenCalled();
    expect(getPrefetchedAvatarImageRef('a.jpg')).toBeUndefined();

    const second = prefetchAvatarPaths(['a.jpg'], { timeoutMs: 50 });
    load.resolve({ width: 512, height: 512 });
    await expect(second).resolves.toBe(true);
    expect(mocks.loadAsync).toHaveBeenCalledTimes(1);
    expect(mocks.rememberAvatarImageReady).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reports partial failures, retains successful images and retries failed loads', async () => {
    mocks.loadAsync.mockImplementation(async ({ cacheKey }: { cacheKey: string }) => {
      if (cacheKey === 'b.jpg') {
        throw new Error('Image download failed');
      }
      return { width: 512, height: 512 };
    });

    await expect(prefetchAvatarPaths(['a.jpg', 'b.jpg'])).resolves.toBe(false);
    expect(getPrefetchedAvatarImageRef('a.jpg')).toBeDefined();
    expect(getPrefetchedAvatarImageRef('b.jpg')).toBeUndefined();
    expect(mocks.rememberAvatarImageReady).toHaveBeenCalledTimes(1);

    mocks.loadAsync.mockResolvedValue({ width: 512, height: 512 });
    await expect(prefetchAvatarPaths(['a.jpg', 'b.jpg'])).resolves.toBe(true);
    expect(mocks.loadAsync).toHaveBeenCalledTimes(3);
    expect(mocks.loadAsync).toHaveBeenLastCalledWith(
      { uri: 'https://signed.test/b.jpg', cacheKey: 'b.jpg' },
      { maxWidth: 1024, maxHeight: 1024 },
    );
  });

  it('handles rejected or missing signed URLs without claiming readiness', async () => {
    mocks.resolveSignedAvatarUrl.mockRejectedValueOnce(new Error('URL resolution failed'));
    mocks.resolveSignedAvatarUrl.mockResolvedValueOnce(null);

    await expect(prefetchAvatarPaths(['a.jpg', 'b.jpg'])).resolves.toBe(false);

    expect(mocks.loadAsync).not.toHaveBeenCalled();
    expect(mocks.rememberAvatarImageReady).not.toHaveBeenCalled();
    await expect(prefetchAvatarPaths(['a.jpg'])).resolves.toBe(true);
    expect(mocks.loadAsync).toHaveBeenCalledTimes(1);
  });

  it('collects deferred avatar paths from people and invite surfaces', () => {
    const deferredSnapshot = {
      accountInviteHistoryItems: [],
      accountInvitePendingItems: [
        {
          activatedUserAvatarUrl: 'activated.jpg',
          profileAvatarUrl: 'account-profile.jpg',
          respondingProfileAvatarUrl: 'account-response.jpg',
        },
      ],
      currentUserProfile: { avatarUrl: 'me.jpg' },
      dashboard: {
        activePeople: [{ avatarUrl: 'active.jpg' }],
      },
      friendshipHistoryItems: [],
      friendshipPendingItems: [
        {
          claimantSnapshot: { avatarPath: 'claimant.jpg' },
          profileAvatarUrl: 'friend-profile.jpg',
          respondingProfileAvatarUrl: 'friend-response.jpg',
        },
      ],
      people: [{ avatarUrl: 'person.jpg' }],
      peopleById: {
        userA: { avatarUrl: 'detail.jpg' },
      },
    } as unknown as AppSnapshot;

    expect(collectDeferredAvatarPaths(deferredSnapshot)).toEqual([
      'me.jpg',
      'active.jpg',
      'person.jpg',
      'detail.jpg',
      'claimant.jpg',
      'friend-profile.jpg',
      'friend-response.jpg',
      'activated.jpg',
      'account-profile.jpg',
      'account-response.jpg',
    ]);
  });

  it('respects the deferred prefetch path limit', async () => {
    await prefetchAvatarPaths(['a.jpg', 'b.jpg', 'c.jpg'], { maxPaths: 2 });

    expect(mocks.resolveSignedAvatarUrl).toHaveBeenCalledTimes(2);
    expect(mocks.resolveSignedAvatarUrl).toHaveBeenNthCalledWith(1, 'a.jpg');
    expect(mocks.resolveSignedAvatarUrl).toHaveBeenNthCalledWith(2, 'b.jpg');
    expect(mocks.loadAsync).toHaveBeenCalledTimes(2);
    expect(mocks.loadAsync).toHaveBeenLastCalledWith(
      { uri: 'https://signed.test/b.jpg', cacheKey: 'b.jpg' },
      { maxWidth: 1024, maxHeight: 1024 },
    );
  });

  it('applies the path limit after skipping thumbnails already ready', async () => {
    mocks.isAvatarImageReady.mockImplementation((path: string) => path === 'a.jpg');

    await prefetchAvatarPaths(['a.jpg', 'b.jpg', 'c.jpg'], { maxPaths: 1 });

    expect(mocks.resolveSignedAvatarUrl).toHaveBeenCalledExactlyOnceWith('b.jpg');
    expect(mocks.loadAsync).toHaveBeenCalledTimes(1);
  });
});
