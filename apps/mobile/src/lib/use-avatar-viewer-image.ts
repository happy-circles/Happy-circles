import { useEffect, useState } from 'react';
import type { ImageRef } from 'expo-image';

import { avatarImageCacheKey } from './avatar';
import { ensureAvatarImageRef, getPrefetchedAvatarImageRef } from './avatar-prefetch';

interface LoadedViewerImage {
  readonly cacheKey: string;
  readonly image: ImageRef;
}

export function useAvatarViewerImage(
  path: string | null | undefined,
  visible: boolean,
): ImageRef | undefined {
  const cacheKey = avatarImageCacheKey(path);
  const [loadedImage, setLoadedImage] = useState<LoadedViewerImage | null>(null);

  useEffect(() => {
    if (!path || !cacheKey) {
      return;
    }

    let cancelled = false;
    // The viewer component is mounted on the profile before its native modal opens.
    // Opening it again also makes this avatar recent in the bounded prefetch cache.
    void ensureAvatarImageRef(path).then((image) => {
      if (!cancelled && image) {
        setLoadedImage({ cacheKey, image });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [cacheKey, path, visible]);

  // Retain a completed load for this profile, including when background prefetch
  // evicts its cache entry. Never show the previous profile while its successor loads.
  return loadedImage && loadedImage.cacheKey === cacheKey
    ? loadedImage.image
    : getPrefetchedAvatarImageRef(path);
}
