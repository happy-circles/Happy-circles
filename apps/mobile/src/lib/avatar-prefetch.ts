import { Image as ExpoImage, type ImageRef } from 'expo-image';

import type { AppSnapshot } from './live-data/types';
import {
  avatarImageCacheKey,
  isAvatarImageReady,
  rememberAvatarImageReady,
  resolveSignedAvatarUrl,
} from './avatar';

const DEFAULT_AVATAR_PREFETCH_TIMEOUT_MS = 900;
const DEFAULT_DEFERRED_AVATAR_PREFETCH_TIMEOUT_MS = 2200;
const CRITICAL_PEOPLE_AVATAR_LIMIT = 8;
const DEFAULT_DEFERRED_AVATAR_PREFETCH_LIMIT = 64;
const DEFERRED_AVATAR_PREFETCH_DELAY_MS = 250;
// 1024px preserves detail in the 240dp viewer on displays up to 4x density.
// Keep at most 16 decoded references (64 MiB at this maximum, 16 MiB for 512px uploads).
const MAX_PREFETCHED_AVATAR_IMAGES = 16;
const MAX_PREFETCHED_AVATAR_SIZE = 1024;
const MAX_CONCURRENT_AVATAR_LOADS = 4;

interface QueuedAvatarLoad {
  readonly load: () => Promise<boolean>;
  readonly resolve: (result: boolean) => void;
}

const prefetchedAvatarImages = new Map<string, ImageRef>();
const criticalAvatarImageKeys = new Set<string>();
const pendingAvatarLoads = new Map<string, Promise<boolean>>();
const queuedAvatarLoads: QueuedAvatarLoad[] = [];
let activeAvatarLoads = 0;

function startQueuedAvatarLoads(): void {
  while (activeAvatarLoads < MAX_CONCURRENT_AVATAR_LOADS && queuedAvatarLoads.length > 0) {
    const job = queuedAvatarLoads.shift();
    if (!job) {
      return;
    }

    activeAvatarLoads += 1;
    void (async () => {
      let result = false;
      try {
        result = await job.load();
      } catch {
        result = false;
      } finally {
        activeAvatarLoads -= 1;
        startQueuedAvatarLoads();
        job.resolve(result);
      }
    })();
  }
}

function enqueueAvatarLoad(load: () => Promise<boolean>): Promise<boolean> {
  return new Promise((resolve) => {
    queuedAvatarLoads.push({ load, resolve });
    startQueuedAvatarLoads();
  });
}

function waitForAvatarLoads(loads: Promise<boolean>, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    void loads.then((result) => {
      clearTimeout(timer);
      resolve(result);
    });
  });
}

function rememberPrefetchedImage(cacheKey: string, image: ImageRef): void {
  // loadAsync writes to disk under cacheKey. Retaining its ImageRef also keeps the
  // decoded image in memory on iOS, where loadAsync itself only uses disk cache.
  prefetchedAvatarImages.set(cacheKey, image);

  while (prefetchedAvatarImages.size > MAX_PREFETCHED_AVATAR_IMAGES) {
    // Deferred people/invite loads must not evict the current user and the first
    // eight visible profiles warmed during startup.
    const oldestKey =
      Array.from(prefetchedAvatarImages.keys()).find((key) => !criticalAvatarImageKeys.has(key)) ??
      prefetchedAvatarImages.keys().next().value;
    if (typeof oldestKey !== 'string') {
      return;
    }
    // A mounted avatar may still use this reference; let GC release it when no
    // component retains it instead of releasing the native resource here.
    prefetchedAvatarImages.delete(oldestKey);
  }
}

export function getPrefetchedAvatarImageRef(path: string | null | undefined): ImageRef | undefined {
  const cacheKey = avatarImageCacheKey(path);
  return cacheKey ? prefetchedAvatarImages.get(cacheKey) : undefined;
}

function loadAvatarImage(path: string): Promise<boolean> {
  const cacheKey = avatarImageCacheKey(path);
  if (!cacheKey || isAvatarImageReady(path) || prefetchedAvatarImages.has(cacheKey)) {
    return Promise.resolve(true);
  }

  const pendingLoad = pendingAvatarLoads.get(cacheKey);
  if (pendingLoad) {
    return pendingLoad;
  }

  const load = enqueueAvatarLoad(async () => {
    try {
      // A queued thumbnail may already have finished before its turn starts.
      if (isAvatarImageReady(path) || prefetchedAvatarImages.has(cacheKey)) {
        return true;
      }

      const url = await resolveSignedAvatarUrl(path);
      if (!url) {
        return false;
      }

      // A thumbnail can finish while the signed URL is being resolved. It now
      // uses the same cache key and memory/disk policy as the viewer.
      if (isAvatarImageReady(path, url)) {
        return true;
      }

      const image = await ExpoImage.loadAsync(
        { uri: url, cacheKey },
        { maxWidth: MAX_PREFETCHED_AVATAR_SIZE, maxHeight: MAX_PREFETCHED_AVATAR_SIZE },
      );
      rememberPrefetchedImage(cacheKey, image);
      rememberAvatarImageReady(path, url);
      return true;
    } catch {
      return false;
    }
  }).finally(() => {
    pendingAvatarLoads.delete(cacheKey);
  });

  pendingAvatarLoads.set(cacheKey, load);
  return load;
}

function uniqueAvatarPaths(paths: readonly (string | null | undefined)[]): readonly string[] {
  return Array.from(
    new Set(paths.filter((path): path is string => Boolean(path && path.trim().length > 0))),
  );
}

function collectInviteAvatarPaths(snapshot: AppSnapshot): readonly string[] {
  const paths: (string | null | undefined)[] = [];

  for (const item of [...snapshot.friendshipPendingItems, ...snapshot.friendshipHistoryItems]) {
    paths.push(
      item.claimantSnapshot?.avatarPath,
      item.profileAvatarUrl,
      item.respondingProfileAvatarUrl,
    );
  }

  for (const item of [
    ...snapshot.accountInvitePendingItems,
    ...snapshot.accountInviteHistoryItems,
  ]) {
    paths.push(item.activatedUserAvatarUrl, item.profileAvatarUrl, item.respondingProfileAvatarUrl);
  }

  return uniqueAvatarPaths(paths);
}

export function collectCriticalAvatarPaths(snapshot: AppSnapshot): readonly string[] {
  const paths = [
    snapshot.currentUserProfile?.avatarUrl ?? null,
    ...snapshot.dashboard.activePeople
      .slice(0, CRITICAL_PEOPLE_AVATAR_LIMIT)
      .map((person) => person.avatarUrl ?? null),
  ];

  return uniqueAvatarPaths(paths);
}

export function collectDeferredAvatarPaths(snapshot: AppSnapshot): readonly string[] {
  const paths = [
    snapshot.currentUserProfile?.avatarUrl ?? null,
    ...snapshot.dashboard.activePeople.map((person) => person.avatarUrl ?? null),
    ...snapshot.people.map((person) => person.avatarUrl ?? null),
    ...Object.values(snapshot.peopleById).map((person) => person.avatarUrl ?? null),
    ...collectInviteAvatarPaths(snapshot),
  ];

  return uniqueAvatarPaths(paths);
}

export async function prefetchAvatarPaths(
  paths: readonly (string | null | undefined)[],
  options: {
    readonly maxPaths?: number;
    readonly timeoutMs?: number;
  } = {},
): Promise<boolean> {
  const uniquePaths = uniqueAvatarPaths(paths)
    .filter((path) => !isAvatarImageReady(path) && !getPrefetchedAvatarImageRef(path))
    .slice(0, options.maxPaths);
  if (uniquePaths.length === 0) {
    return true;
  }

  const loads = Promise.all(uniquePaths.map(loadAvatarImage)).then((results) =>
    results.every(Boolean),
  );

  // Include URL resolution in the deadline. The shared load can finish in the
  // background after timeout, so later callers still reuse that work.
  return waitForAvatarLoads(loads, options.timeoutMs ?? DEFAULT_AVATAR_PREFETCH_TIMEOUT_MS);
}

export async function prefetchCriticalAvatarImages(
  snapshot: AppSnapshot,
  timeoutMs = DEFAULT_AVATAR_PREFETCH_TIMEOUT_MS,
): Promise<boolean> {
  const criticalPaths = collectCriticalAvatarPaths(snapshot);
  criticalAvatarImageKeys.clear();
  for (const path of criticalPaths) {
    const cacheKey = avatarImageCacheKey(path);
    if (cacheKey) {
      criticalAvatarImageKeys.add(cacheKey);
    }
  }
  return prefetchAvatarPaths(criticalPaths, { timeoutMs });
}

export function scheduleDeferredAvatarPrefetch(
  snapshot: AppSnapshot,
  options: {
    readonly delayMs?: number;
    readonly maxPaths?: number;
    readonly timeoutMs?: number;
  } = {},
): () => void {
  const timer = setTimeout(() => {
    void prefetchAvatarPaths(collectDeferredAvatarPaths(snapshot), {
      maxPaths: options.maxPaths ?? DEFAULT_DEFERRED_AVATAR_PREFETCH_LIMIT,
      timeoutMs: options.timeoutMs ?? DEFAULT_DEFERRED_AVATAR_PREFETCH_TIMEOUT_MS,
    }).catch(() => undefined);
  }, options.delayMs ?? DEFERRED_AVATAR_PREFETCH_DELAY_MS);

  return () => clearTimeout(timer);
}

export function clearAvatarPrefetchCacheForTests(): void {
  prefetchedAvatarImages.clear();
  criticalAvatarImageKeys.clear();
  pendingAvatarLoads.clear();
  queuedAvatarLoads.length = 0;
  activeAvatarLoads = 0;
}
