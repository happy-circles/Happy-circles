import { Image as ExpoImage, type ImageRef } from 'expo-image';

import type { AppSnapshot } from './live-data/types';
import { avatarImageCacheKey, rememberAvatarImageReady, resolveSignedAvatarUrl } from './avatar';

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
const MAX_RECENT_AVATAR_IMAGES = 8;
const MAX_WARMED_AVATAR_KEYS = 512;
const BACKGROUND_LOAD_PRIORITY = 0;
const CRITICAL_LOAD_PRIORITY = 1;
const USER_LOAD_PRIORITY = 2;
type AvatarLoadPriority = 0 | 1 | 2;

interface QueuedAvatarLoad {
  readonly cacheKey: string;
  priority: AvatarLoadPriority;
  readonly load: () => Promise<ImageRef | undefined>;
  readonly resolve: (result: ImageRef | undefined) => void;
}

const prefetchedAvatarImages = new Map<string, ImageRef>();
const criticalAvatarImageKeys = new Set<string>();
const recentAvatarImageKeys = new Set<string>();
const warmedAvatarImageKeys = new Set<string>();
const pendingAvatarLoads = new Map<string, Promise<ImageRef | undefined>>();
const queuedAvatarLoads: QueuedAvatarLoad[] = [];
let activeAvatarLoads = 0;

function startQueuedAvatarLoads(): void {
  while (activeAvatarLoads < MAX_CONCURRENT_AVATAR_LOADS && queuedAvatarLoads.length > 0) {
    let nextJobIndex = 0;
    for (let index = 1; index < queuedAvatarLoads.length; index += 1) {
      if (queuedAvatarLoads[index].priority > queuedAvatarLoads[nextJobIndex].priority) {
        nextJobIndex = index;
      }
    }
    const [job] = queuedAvatarLoads.splice(nextJobIndex, 1);
    if (!job) {
      return;
    }

    activeAvatarLoads += 1;
    void (async () => {
      let result: ImageRef | undefined;
      try {
        result = await job.load();
      } catch {
        result = undefined;
      } finally {
        activeAvatarLoads -= 1;
        startQueuedAvatarLoads();
        job.resolve(result);
      }
    })();
  }
}

function enqueueAvatarLoad(
  cacheKey: string,
  priority: AvatarLoadPriority,
  load: () => Promise<ImageRef | undefined>,
): Promise<ImageRef | undefined> {
  return new Promise((resolve) => {
    queuedAvatarLoads.push({ cacheKey, priority, load, resolve });
    startQueuedAvatarLoads();
  });
}

function promoteQueuedAvatarLoad(cacheKey: string, priority: AvatarLoadPriority): void {
  const job = queuedAvatarLoads.find((entry) => entry.cacheKey === cacheKey);
  if (job && job.priority < priority) {
    job.priority = priority;
  }
}

function rememberRecentAvatarImageKey(cacheKey: string): void {
  recentAvatarImageKeys.delete(cacheKey);
  recentAvatarImageKeys.add(cacheKey);
  while (recentAvatarImageKeys.size > MAX_RECENT_AVATAR_IMAGES) {
    const oldestKey = recentAvatarImageKeys.values().next().value;
    if (typeof oldestKey !== 'string') {
      return;
    }
    recentAvatarImageKeys.delete(oldestKey);
  }
}

function rememberWarmedAvatarImageKey(cacheKey: string): void {
  warmedAvatarImageKeys.delete(cacheKey);
  warmedAvatarImageKeys.add(cacheKey);
  while (warmedAvatarImageKeys.size > MAX_WARMED_AVATAR_KEYS) {
    const oldestKey = warmedAvatarImageKeys.values().next().value;
    if (typeof oldestKey !== 'string') {
      return;
    }
    warmedAvatarImageKeys.delete(oldestKey);
  }
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
    // Recent profiles explicitly opened by the user take precedence over the
    // startup set. Together both tiers still share the same 16-reference limit.
    const keys = Array.from(prefetchedAvatarImages.keys());
    const oldestKey =
      keys.find((key) => !recentAvatarImageKeys.has(key) && !criticalAvatarImageKeys.has(key)) ??
      keys.find((key) => !recentAvatarImageKeys.has(key)) ??
      keys[0];
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

export function ensureAvatarImageRef(
  path: string | null | undefined,
): Promise<ImageRef | undefined> {
  const cacheKey = avatarImageCacheKey(path);
  if (!path || !cacheKey) {
    return Promise.resolve(undefined);
  }

  // Only explicit profile/viewer requests update recency; render-time reads and
  // background prefetch hits cannot displace the last eight selected profiles.
  rememberRecentAvatarImageKey(cacheKey);
  const image = prefetchedAvatarImages.get(cacheKey);
  if (image) {
    prefetchedAvatarImages.delete(cacheKey);
    prefetchedAvatarImages.set(cacheKey, image);
    return Promise.resolve(image);
  }

  return loadAvatarImage(path, USER_LOAD_PRIORITY);
}

function loadAvatarImage(
  path: string,
  priority: AvatarLoadPriority,
): Promise<ImageRef | undefined> {
  const cacheKey = avatarImageCacheKey(path);
  if (!cacheKey) {
    return Promise.resolve(undefined);
  }

  const cachedImage = prefetchedAvatarImages.get(cacheKey);
  if (cachedImage) {
    return Promise.resolve(cachedImage);
  }

  const pendingLoad = pendingAvatarLoads.get(cacheKey);
  if (pendingLoad) {
    promoteQueuedAvatarLoad(cacheKey, priority);
    return pendingLoad;
  }

  const load = enqueueAvatarLoad(cacheKey, priority, async () => {
    try {
      const existingImage = prefetchedAvatarImages.get(cacheKey);
      if (existingImage) {
        return existingImage;
      }

      const url = await resolveSignedAvatarUrl(path);
      if (!url) {
        return undefined;
      }

      // A thumbnail-ready flag does not retain an ImageRef. Always load a real
      // reference when absent, reusing the native cache through the stable key.
      const image = await ExpoImage.loadAsync(
        { uri: url, cacheKey },
        { maxWidth: MAX_PREFETCHED_AVATAR_SIZE, maxHeight: MAX_PREFETCHED_AVATAR_SIZE },
      );
      rememberPrefetchedImage(cacheKey, image);
      rememberWarmedAvatarImageKey(cacheKey);
      rememberAvatarImageReady(path, url);
      return image;
    } catch {
      return undefined;
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
    .filter(
      (path) =>
        !getPrefetchedAvatarImageRef(path) &&
        !warmedAvatarImageKeys.has(avatarImageCacheKey(path) ?? ''),
    )
    .slice(0, options.maxPaths);
  if (uniquePaths.length === 0) {
    return true;
  }

  // Keep only booleans in the batch so completed references can be released
  // after eviction instead of retaining all 64 until the slowest load finishes.
  const loads = Promise.all(
    uniquePaths.map((path) =>
      loadAvatarImage(
        path,
        criticalAvatarImageKeys.has(avatarImageCacheKey(path) ?? '')
          ? CRITICAL_LOAD_PRIORITY
          : BACKGROUND_LOAD_PRIORITY,
      ).then((image) => Boolean(image)),
    ),
  ).then((results) => results.every(Boolean));

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
  recentAvatarImageKeys.clear();
  warmedAvatarImageKeys.clear();
  pendingAvatarLoads.clear();
  queuedAvatarLoads.length = 0;
  activeAvatarLoads = 0;
}
