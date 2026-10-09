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
  ensureAvatarImageRef,
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
    mocks.isAvatarImageReady.mockReturnValue(true);
    await prefetchAvatarPaths(Array.from({ length: 16 }, (_, index) => `other-${index}.jpg`));
    expect(getPrefetchedAvatarImageRef('a.jpg')).toBeUndefined();

    mocks.resolveSignedAvatarUrl.mockResolvedValueOnce('https://signed.test/a?token=two');
    await ensureAvatarImageRef('a.jpg');

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

  it('does not decode evicted background images again when a warmed snapshot is prefetched repeatedly', async () => {
    const paths = Array.from({ length: 64 }, (_, index) => `person-${index}.jpg`);
    await prefetchAvatarPaths(paths);
    expect(mocks.loadAsync).toHaveBeenCalledTimes(64);
    expect(paths.filter((path) => getPrefetchedAvatarImageRef(path))).toHaveLength(16);

    await expect(prefetchAvatarPaths(paths)).resolves.toBe(true);
    await expect(prefetchAvatarPaths(paths)).resolves.toBe(true);
    expect(mocks.loadAsync).toHaveBeenCalledTimes(64);
    expect(mocks.resolveSignedAvatarUrl).toHaveBeenCalledTimes(64);

    mocks.isAvatarImageReady.mockReturnValue(true);
    await expect(ensureAvatarImageRef(paths[0])).resolves.toBeDefined();
    expect(mocks.loadAsync).toHaveBeenCalledTimes(65);
    expect(getPrefetchedAvatarImageRef(paths[0])).toBeDefined();
  });

  it('bounds session warm bookkeeping and can warm a key again after that bookkeeping expires', async () => {
    const paths = Array.from({ length: 513 }, (_, index) => `person-${index}.jpg`);
    await prefetchAvatarPaths(paths);
    expect(mocks.loadAsync).toHaveBeenCalledTimes(513);

    await prefetchAvatarPaths([paths[0], paths[1], paths[512]]);

    expect(mocks.loadAsync).toHaveBeenCalledTimes(514);
    expect(mocks.loadAsync).toHaveBeenLastCalledWith(
      { uri: `https://signed.test/${paths[0]}`, cacheKey: paths[0] },
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

  it('preserves eight recent selections through background loads within the shared sixteen-reference bound', async () => {
    const criticalPaths = Array.from({ length: 9 }, (_, index) => `critical-${index}.jpg`);
    const recentPaths = Array.from({ length: 8 }, (_, index) => `recent-${index}.jpg`);
    const backgroundPaths = Array.from({ length: 64 }, (_, index) => `background-${index}.jpg`);
    await prefetchCriticalAvatarImages(snapshot(criticalPaths));
    const recentImages = await Promise.all(recentPaths.map(ensureAvatarImageRef));
    await prefetchAvatarPaths(backgroundPaths);

    for (const [index, path] of recentPaths.entries()) {
      expect(getPrefetchedAvatarImageRef(path)).toBe(recentImages[index]);
    }
    expect(criticalPaths.filter((path) => getPrefetchedAvatarImageRef(path))).toHaveLength(8);
    expect(getPrefetchedAvatarImageRef(criticalPaths[0])).toBeUndefined();
    expect(
      [...criticalPaths, ...recentPaths, ...backgroundPaths].filter((path) =>
        getPrefetchedAvatarImageRef(path),
      ),
    ).toHaveLength(16);
  });

  it('updates recency on explicit selection while getter reads and background hits remain pure', async () => {
    const initialPaths = Array.from({ length: 16 }, (_, index) => `person-${index}.jpg`);
    const backgroundPaths = Array.from({ length: 20 }, (_, index) => `background-${index}.jpg`);
    await prefetchAvatarPaths(initialPaths);
    for (const path of initialPaths.slice(0, 8)) {
      await ensureAvatarImageRef(path);
    }
    // Reopening person-0 moves it to the end of the eight recent selections.
    await ensureAvatarImageRef(initialPaths[0]);
    await ensureAvatarImageRef(initialPaths[8]);
    expect(getPrefetchedAvatarImageRef(initialPaths[1])).toBeDefined();
    await prefetchAvatarPaths([initialPaths[1]]);
    await prefetchAvatarPaths(backgroundPaths);

    expect(getPrefetchedAvatarImageRef(initialPaths[0])).toBeDefined();
    expect(getPrefetchedAvatarImageRef(initialPaths[1])).toBeUndefined();
    expect(initialPaths.slice(2, 9).every((path) => getPrefetchedAvatarImageRef(path))).toBe(true);
    expect(
      [...initialPaths, ...backgroundPaths].filter((path) => getPrefetchedAvatarImageRef(path)),
    ).toHaveLength(16);
  });

  it('returns the eventual reference to each requesting caller even after cache eviction', async () => {
    const criticalPaths = Array.from({ length: 9 }, (_, index) => `critical-${index}.jpg`);
    const requestedPaths = Array.from({ length: 9 }, (_, index) => `requested-${index}.jpg`);
    mocks.loadAsync.mockImplementation(async ({ cacheKey }: { cacheKey: string }) => ({
      width: 512,
      height: 512,
      cacheKey,
    }));
    await prefetchCriticalAvatarImages(snapshot(criticalPaths));
    const images = await Promise.all(requestedPaths.map(ensureAvatarImageRef));

    expect(images[0]).toEqual({ width: 512, height: 512, cacheKey: requestedPaths[0] });
    expect(getPrefetchedAvatarImageRef(requestedPaths[0])).toBeUndefined();
    expect(requestedPaths.slice(1).every((path) => getPrefetchedAvatarImageRef(path))).toBe(true);
  });

  it('loads a retained reference even when the thumbnail was already marked ready', async () => {
    mocks.isAvatarImageReady.mockReturnValue(true);

    await expect(prefetchAvatarPaths(['a.jpg'])).resolves.toBe(true);

    expect(mocks.resolveSignedAvatarUrl).toHaveBeenCalledExactlyOnceWith('a.jpg');
    expect(mocks.loadAsync).toHaveBeenCalledTimes(1);
    const image = getPrefetchedAvatarImageRef('a.jpg');
    expect(image).toBeDefined();
    await expect(ensureAvatarImageRef('/a.jpg')).resolves.toBe(image);
    expect(mocks.loadAsync).toHaveBeenCalledTimes(1);
  });

  it('loads a retained reference when a thumbnail finishes during URL resolution', async () => {
    const signedUrl = deferred<string>();
    mocks.resolveSignedAvatarUrl.mockReturnValue(signedUrl.promise);
    const result = prefetchAvatarPaths(['a.jpg']);

    mocks.isAvatarImageReady.mockReturnValue(true);
    signedUrl.resolve('https://signed.test/a.jpg');
    await expect(result).resolves.toBe(true);

    expect(mocks.loadAsync).toHaveBeenCalledTimes(1);
    expect(getPrefetchedAvatarImageRef('a.jpg')).toBeDefined();
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

  it('promotes a queued preload requested by the user without duplicating its promise or load', async () => {
    const image = { width: 512, height: 512 };
    const activePaths = ['active-a.jpg', 'active-b.jpg', 'active-c.jpg', 'active-d.jpg'];
    const activeLoads = new Map(activePaths.map((path) => [path, deferred<typeof image>()]));
    const selectedLoad = deferred<typeof image>();
    mocks.loadAsync.mockImplementation(({ cacheKey }: { cacheKey: string }) => {
      return (
        activeLoads.get(cacheKey)?.promise ??
        (cacheKey === 'selected.jpg' ? selectedLoad.promise : Promise.resolve(image))
      );
    });
    const background = prefetchAvatarPaths([
      ...activePaths,
      'background-a.jpg',
      'background-b.jpg',
      'selected.jpg',
    ]);
    const critical = prefetchCriticalAvatarImages(snapshot(['critical.jpg']));
    const selected = ensureAvatarImageRef('selected.jpg');
    const duplicate = ensureAvatarImageRef('/selected.jpg');
    expect(duplicate).toBe(selected);
    await Promise.resolve();
    expect(mocks.loadAsync).toHaveBeenCalledTimes(4);

    activeLoads.get(activePaths[0])?.resolve(image);
    await vi.waitFor(() => expect(mocks.loadAsync).toHaveBeenCalledTimes(5));
    expect(mocks.resolveSignedAvatarUrl).toHaveBeenNthCalledWith(5, 'selected.jpg');
    expect(mocks.loadAsync).toHaveBeenLastCalledWith(
      { uri: 'https://signed.test/selected.jpg', cacheKey: 'selected.jpg' },
      { maxWidth: 1024, maxHeight: 1024 },
    );
    selectedLoad.resolve(image);
    for (const load of activeLoads.values()) {
      load.resolve(image);
    }

    await expect(background).resolves.toBe(true);
    await expect(critical).resolves.toBe(true);
    await expect(selected).resolves.toBe(image);
    await expect(duplicate).resolves.toBe(image);
    expect(mocks.resolveSignedAvatarUrl).toHaveBeenNthCalledWith(6, 'critical.jpg');
    expect(mocks.loadAsync).toHaveBeenCalledTimes(8);
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

  it('loads a queued reference when its thumbnail finishes before the load starts', async () => {
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
    expect(mocks.resolveSignedAvatarUrl).toHaveBeenCalledTimes(5);
    expect(mocks.loadAsync).toHaveBeenCalledTimes(5);
    expect(getPrefetchedAvatarImageRef('queued.jpg')).toBe(image);
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

    const retry = ensureAvatarImageRef('queued.jpg');
    activeLoad.resolve(image);
    await expect(first).resolves.toBe(true);
    await expect(retry).resolves.toBe(image);
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

  it('returns undefined on explicit request failures and allows a successful retry', async () => {
    mocks.resolveSignedAvatarUrl.mockRejectedValueOnce(new Error('URL resolution failed'));
    await expect(ensureAvatarImageRef('a.jpg')).resolves.toBeUndefined();
    expect(mocks.loadAsync).not.toHaveBeenCalled();
    mocks.loadAsync.mockRejectedValueOnce(new Error('Image download failed'));
    await expect(ensureAvatarImageRef('a.jpg')).resolves.toBeUndefined();
    expect(mocks.rememberAvatarImageReady).not.toHaveBeenCalled();
    expect(getPrefetchedAvatarImageRef('a.jpg')).toBeUndefined();

    const image = { width: 512, height: 512 };
    mocks.loadAsync.mockResolvedValue(image);
    await expect(ensureAvatarImageRef('a.jpg')).resolves.toBe(image);
    expect(mocks.loadAsync).toHaveBeenCalledTimes(2);
    expect(mocks.rememberAvatarImageReady).toHaveBeenCalledTimes(1);
  });

  it('does not resolve or load empty explicit requests', async () => {
    for (const path of [null, undefined, '', '  ']) {
      await expect(ensureAvatarImageRef(path)).resolves.toBeUndefined();
    }
    expect(mocks.resolveSignedAvatarUrl).not.toHaveBeenCalled();
    expect(mocks.loadAsync).not.toHaveBeenCalled();
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

  it('applies the path limit after skipping references already retained', async () => {
    await prefetchAvatarPaths(['a.jpg']);
    mocks.resolveSignedAvatarUrl.mockClear();
    mocks.loadAsync.mockClear();

    await prefetchAvatarPaths(['a.jpg', 'b.jpg', 'c.jpg'], { maxPaths: 1 });

    expect(mocks.resolveSignedAvatarUrl).toHaveBeenCalledExactlyOnceWith('b.jpg');
    expect(mocks.loadAsync).toHaveBeenCalledTimes(1);
  });
});
