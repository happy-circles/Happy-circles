import { Image as ExpoImage } from 'expo-image';

import type { AppSnapshot } from './live-data/types';
import { resolveSignedAvatarUrls } from './avatar';

const DEFAULT_AVATAR_PREFETCH_TIMEOUT_MS = 900;
const CRITICAL_PEOPLE_AVATAR_LIMIT = 8;
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

export function collectCriticalAvatarPaths(snapshot: AppSnapshot): readonly string[] {
  const paths = [
    snapshot.currentUserProfile?.avatarUrl ?? null,
    ...snapshot.dashboard.activePeople
      .slice(0, CRITICAL_PEOPLE_AVATAR_LIMIT)
      .map((person) => person.avatarUrl ?? null),
  ];

  return Array.from(
    new Set(paths.filter((path): path is string => Boolean(path && path.trim().length > 0))),
  );
}

export async function prefetchCriticalAvatarImages(
  snapshot: AppSnapshot,
  timeoutMs = DEFAULT_AVATAR_PREFETCH_TIMEOUT_MS,
): Promise<boolean> {
  const urls = await resolveSignedAvatarUrls(collectCriticalAvatarPaths(snapshot));
  const urlsToPrefetch = urls.filter((url) => !prefetchedAvatarUrls.has(url));
  if (urlsToPrefetch.length === 0) {
    return true;
  }

  const prefetchPromise = ExpoImage.prefetch(Array.from(urlsToPrefetch), {
    cachePolicy: 'disk',
  }).then(
    (result) => {
      if (result) {
        rememberPrefetchedUrls(urlsToPrefetch);
      }
      return result;
    },
    () => false,
  );

  return Promise.race([prefetchPromise, waitForTimeout(timeoutMs)]);
}

export function clearAvatarPrefetchCacheForTests(): void {
  prefetchedAvatarUrls.clear();
}
