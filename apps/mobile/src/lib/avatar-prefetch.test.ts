import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppSnapshot } from './live-data/types';

const mocks = vi.hoisted(() => ({
  isAvatarImageReady: vi.fn(),
  prefetch: vi.fn(),
  rememberAvatarImageReady: vi.fn(),
  resolveSignedAvatarUrl: vi.fn(),
}));

vi.mock('expo-image', () => ({
  Image: {
    prefetch: mocks.prefetch,
  },
}));

vi.mock('./avatar', () => ({
  isAvatarImageReady: mocks.isAvatarImageReady,
  rememberAvatarImageReady: mocks.rememberAvatarImageReady,
  resolveSignedAvatarUrl: mocks.resolveSignedAvatarUrl,
}));

import {
  clearAvatarPrefetchCacheForTests,
  collectCriticalAvatarPaths,
  collectDeferredAvatarPaths,
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

describe('avatar-prefetch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAvatarPrefetchCacheForTests();
    mocks.isAvatarImageReady.mockReturnValue(false);
    mocks.prefetch.mockResolvedValue(true);
    mocks.resolveSignedAvatarUrl.mockImplementation(async (path: string) => {
      return `https://signed.test/${path}`;
    });
  });

  it('collects unique critical avatar paths', () => {
    expect(collectCriticalAvatarPaths(snapshot(['a.jpg', 'b.jpg', 'a.jpg']))).toEqual([
      'a.jpg',
      'b.jpg',
    ]);
  });

  it('does not prefetch signed URLs that were already prefetched', async () => {
    mocks.resolveSignedAvatarUrl.mockImplementation(async (path: string) => {
      return `https://signed.test/${path}`;
    });

    await expect(prefetchCriticalAvatarImages(snapshot(['a.jpg', 'b.jpg']))).resolves.toBe(true);
    await expect(prefetchCriticalAvatarImages(snapshot(['a.jpg', 'b.jpg']))).resolves.toBe(true);

    expect(mocks.prefetch).toHaveBeenCalledTimes(1);
    expect(mocks.prefetch).toHaveBeenCalledWith(
      ['https://signed.test/a.jpg', 'https://signed.test/b.jpg'],
      { cachePolicy: 'disk' },
    );
  });

  it('prefetches again when a refreshed signed URL changes', async () => {
    mocks.resolveSignedAvatarUrl.mockResolvedValueOnce('https://signed.test/a?token=one');
    mocks.resolveSignedAvatarUrl.mockResolvedValueOnce('https://signed.test/a?token=two');

    await prefetchCriticalAvatarImages(snapshot(['a.jpg']));
    await prefetchCriticalAvatarImages(snapshot(['a.jpg']));

    expect(mocks.prefetch).toHaveBeenCalledTimes(2);
    expect(mocks.prefetch).toHaveBeenLastCalledWith(['https://signed.test/a?token=two'], {
      cachePolicy: 'disk',
    });
  });

  it('does not resolve or prefetch paths already marked ready', async () => {
    mocks.isAvatarImageReady.mockReturnValue(true);

    await expect(prefetchAvatarPaths(['a.jpg'])).resolves.toBe(true);

    expect(mocks.resolveSignedAvatarUrl).not.toHaveBeenCalled();
    expect(mocks.prefetch).not.toHaveBeenCalled();
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
    expect(mocks.prefetch).toHaveBeenCalledWith(
      ['https://signed.test/a.jpg', 'https://signed.test/b.jpg'],
      { cachePolicy: 'disk' },
    );
  });
});
