import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-constants', () => ({
  default: {
    expoConfig: {
      extra: {},
    },
  },
}));

vi.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: {
    SHA256: 'SHA-256',
  },
  digest: vi.fn(async () => new ArrayBuffer(32)),
  getRandomValues: vi.fn((array: Uint8Array) => array),
  randomUUID: vi.fn(() => '00000000-0000-4000-8000-000000000000'),
}));

vi.mock('expo-secure-store', () => ({
  deleteItemAsync: vi.fn(),
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
}));

vi.mock('react-native', () => ({
  Platform: {
    OS: 'web',
    select: (options: Record<string, unknown>) => options.web ?? options.default,
  },
}));

vi.mock('react-native-url-polyfill/auto', () => ({}));

import {
  avatarImageCacheKey,
  clearAvatarImageReadyCacheForTests,
  getCachedResolvedAvatarUrl,
  hydrateSignedAvatarUrlCache,
  isAvatarImageReady,
  rememberAvatarImageReady,
  resolveSignedAvatarUrls,
} from './avatar';
import { resolveAvatarUrl } from './avatar-url';

describe('avatar URL cache', () => {
  it('hydrates signed URLs and reuses only non-expired entries', () => {
    hydrateSignedAvatarUrlCache({
      'avatars/user-a/photo.jpg': {
        expiresAt: '2999-01-01T00:00:00.000Z',
        url: 'https://signed.example/avatar-a',
      },
      'avatars/user-b/photo.jpg': {
        expiresAt: '2000-01-01T00:00:00.000Z',
        url: 'https://signed.example/avatar-b',
      },
    });

    expect(getCachedResolvedAvatarUrl('avatars/user-a/photo.jpg')).toBe(
      'https://signed.example/avatar-a',
    );
    expect(getCachedResolvedAvatarUrl('avatars/user-b/photo.jpg')).toBeNull();
  });

  it('deduplicates paths before resolving critical avatar URLs', async () => {
    hydrateSignedAvatarUrlCache({
      'avatars/user-c/photo.jpg': {
        expiresAt: '2999-01-01T00:00:00.000Z',
        url: 'https://signed.example/avatar-c',
      },
    });

    await expect(
      resolveSignedAvatarUrls([
        'avatars/user-c/photo.jpg',
        'avatars/user-c/photo.jpg',
        'https://cdn.example/avatar.png',
      ]),
    ).resolves.toEqual(['https://signed.example/avatar-c', 'https://cdn.example/avatar.png']);
  });

  it('treats local picker URIs as direct display URLs without version suffixes', () => {
    expect(resolveAvatarUrl('file:///local/avatar.jpg', '2026-05-06T00:00:00.000Z')).toBe(
      'file:///local/avatar.jpg',
    );
  });

  it('derives stable image cache keys from avatar sources', () => {
    expect(avatarImageCacheKey('/avatars/user-d/photo.jpg')).toBe('avatars/user-d/photo.jpg');
    expect(avatarImageCacheKey('')).toBeUndefined();
  });

  it('remembers loaded avatar sources for future mounts', () => {
    clearAvatarImageReadyCacheForTests();

    expect(isAvatarImageReady('avatars/user-d/photo.jpg')).toBe(false);

    rememberAvatarImageReady('avatars/user-d/photo.jpg', 'https://signed.example/avatar-d');

    expect(isAvatarImageReady('avatars/user-d/photo.jpg')).toBe(true);
  });

  it('keeps a storage avatar ready when the signed URL changes', () => {
    clearAvatarImageReadyCacheForTests();

    rememberAvatarImageReady('avatars/user-e/photo.jpg', 'https://signed.example/avatar-e?token=1');

    expect(
      isAvatarImageReady('avatars/user-e/photo.jpg', 'https://signed.example/avatar-e?token=2'),
    ).toBe(true);
  });

  it('does not share readiness across different avatar paths', () => {
    clearAvatarImageReadyCacheForTests();

    rememberAvatarImageReady('avatars/user-f/photo.jpg', 'https://signed.example/avatar-f');

    expect(isAvatarImageReady('avatars/user-g/photo.jpg', 'https://signed.example/avatar-g')).toBe(
      false,
    );
  });

  it('clears loaded avatar state for tests', () => {
    rememberAvatarImageReady('avatars/user-h/photo.jpg', 'https://signed.example/avatar-h');
    clearAvatarImageReadyCacheForTests();

    expect(isAvatarImageReady('avatars/user-h/photo.jpg')).toBe(false);
  });
});
