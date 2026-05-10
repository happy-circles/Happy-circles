import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppSnapshot } from './live-data/types';

const mocks = vi.hoisted(() => ({
  prefetch: vi.fn(),
  resolveSignedAvatarUrls: vi.fn(),
}));

vi.mock('expo-image', () => ({
  Image: {
    prefetch: mocks.prefetch,
  },
}));

vi.mock('./avatar', () => ({
  resolveSignedAvatarUrls: mocks.resolveSignedAvatarUrls,
}));

import {
  clearAvatarPrefetchCacheForTests,
  collectCriticalAvatarPaths,
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

describe('avatar-prefetch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAvatarPrefetchCacheForTests();
    mocks.prefetch.mockResolvedValue(true);
  });

  it('collects unique critical avatar paths', () => {
    expect(collectCriticalAvatarPaths(snapshot(['a.jpg', 'b.jpg', 'a.jpg']))).toEqual([
      'a.jpg',
      'b.jpg',
    ]);
  });

  it('does not prefetch signed URLs that were already prefetched', async () => {
    mocks.resolveSignedAvatarUrls.mockResolvedValueOnce([
      'https://signed.test/a',
      'https://signed.test/b',
    ]);
    mocks.resolveSignedAvatarUrls.mockResolvedValueOnce([
      'https://signed.test/a',
      'https://signed.test/b',
    ]);

    await expect(prefetchCriticalAvatarImages(snapshot(['a.jpg', 'b.jpg']))).resolves.toBe(true);
    await expect(prefetchCriticalAvatarImages(snapshot(['a.jpg', 'b.jpg']))).resolves.toBe(true);

    expect(mocks.prefetch).toHaveBeenCalledTimes(1);
    expect(mocks.prefetch).toHaveBeenCalledWith(
      ['https://signed.test/a', 'https://signed.test/b'],
      { cachePolicy: 'disk' },
    );
  });

  it('prefetches again when a refreshed signed URL changes', async () => {
    mocks.resolveSignedAvatarUrls.mockResolvedValueOnce(['https://signed.test/a?token=one']);
    mocks.resolveSignedAvatarUrls.mockResolvedValueOnce(['https://signed.test/a?token=two']);

    await prefetchCriticalAvatarImages(snapshot(['a.jpg']));
    await prefetchCriticalAvatarImages(snapshot(['a.jpg']));

    expect(mocks.prefetch).toHaveBeenCalledTimes(2);
    expect(mocks.prefetch).toHaveBeenLastCalledWith(['https://signed.test/a?token=two'], {
      cachePolicy: 'disk',
    });
  });
});
