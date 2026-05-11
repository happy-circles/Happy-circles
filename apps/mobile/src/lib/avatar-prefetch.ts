import { Image as ExpoImage } from 'expo-image';

import type { AppSnapshot } from './live-data/types';
import { isAvatarImageReady, rememberAvatarImageReady, resolveSignedAvatarUrl } from './avatar';

const DEFAULT_AVATAR_PREFETCH_TIMEOUT_MS = 900;
const DEFAULT_DEFERRED_AVATAR_PREFETCH_TIMEOUT_MS = 2200;
const CRITICAL_PEOPLE_AVATAR_LIMIT = 8;
const DEFAULT_DEFERRED_AVATAR_PREFETCH_LIMIT = 64;
const DEFERRED_AVATAR_PREFETCH_DELAY_MS = 250;
const MAX_PREFETCHED_AVATAR_URLS = 256;

const prefetchedAvatarUrls = new Set<string>();

function waitForTimeout(ms: number): Promise<false> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(false), ms);
  });
}

function rememberPrefetchedUrls(urls: readonly string[]): void {
  for (const url of urls) {
    prefetchedAvatarUrls.add(url);
  }

  while (prefetchedAvatarUrls.size > MAX_PREFETCHED_AVATAR_URLS) {
    const oldestUrl = prefetchedAvatarUrls.values().next().value;
    if (typeof oldestUrl !== 'string') {
      return;
    }
    prefetchedAvatarUrls.delete(oldestUrl);
  }
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
    .filter((path) => !isAvatarImageReady(path))
    .slice(0, options.maxPaths);
  if (uniquePaths.length === 0) {
    return true;
  }

  const resolvedEntries = (
    await Promise.all(
      uniquePaths.map(async (path) => {
        const url = await resolveSignedAvatarUrl(path);
        return url ? { path, url } : null;
      }),
    )
  ).filter((entry): entry is { readonly path: string; readonly url: string } => Boolean(entry));

  if (resolvedEntries.length === 0) {
    return true;
  }

  for (const entry of resolvedEntries) {
    if (prefetchedAvatarUrls.has(entry.url)) {
      rememberAvatarImageReady(entry.path, entry.url);
    }
  }

  const entriesToPrefetch = resolvedEntries.filter(
    (entry) => !isAvatarImageReady(entry.path, entry.url) && !prefetchedAvatarUrls.has(entry.url),
  );
  const urlsToPrefetch = entriesToPrefetch.map((entry) => entry.url);
  if (urlsToPrefetch.length === 0) {
    return true;
  }

  const prefetchPromise = ExpoImage.prefetch(Array.from(urlsToPrefetch), {
    cachePolicy: 'disk',
  }).then(
    (result) => {
      if (result) {
        rememberPrefetchedUrls(urlsToPrefetch);
        for (const entry of entriesToPrefetch) {
          rememberAvatarImageReady(entry.path, entry.url);
        }
      }
      return result;
    },
    () => false,
  );

  return Promise.race([
    prefetchPromise,
    waitForTimeout(options.timeoutMs ?? DEFAULT_AVATAR_PREFETCH_TIMEOUT_MS),
  ]);
}

export async function prefetchCriticalAvatarImages(
  snapshot: AppSnapshot,
  timeoutMs = DEFAULT_AVATAR_PREFETCH_TIMEOUT_MS,
): Promise<boolean> {
  return prefetchAvatarPaths(collectCriticalAvatarPaths(snapshot), { timeoutMs });
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
  prefetchedAvatarUrls.clear();
}
