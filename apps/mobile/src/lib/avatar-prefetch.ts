import { Image as ExpoImage } from 'expo-image';

import type { AppSnapshot } from './live-data/types';
import { resolveSignedAvatarUrls } from './avatar';

const DEFAULT_AVATAR_PREFETCH_TIMEOUT_MS = 900;
const CRITICAL_PEOPLE_AVATAR_LIMIT = 8;

function waitForTimeout(ms: number): Promise<false> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(false), ms);
  });
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
  if (urls.length === 0) {
    return true;
  }

  const prefetchPromise = ExpoImage.prefetch(Array.from(urls), { cachePolicy: 'disk' }).catch(
    () => false,
  );

  return Promise.race([prefetchPromise, waitForTimeout(timeoutMs)]);
}
