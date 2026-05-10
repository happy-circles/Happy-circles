import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  manipulateAsync: vi.fn(),
}));

vi.mock('expo-image-manipulator', () => ({
  SaveFormat: {
    JPEG: 'jpeg',
  },
  manipulateAsync: mocks.manipulateAsync,
}));

import { prepareAvatarImageForUpload } from './avatar-image';

describe('prepareAvatarImageForUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.manipulateAsync.mockResolvedValue({ uri: 'file:///prepared-avatar.jpg' });
  });

  it('resizes landscape avatars to 512px wide and writes compressed JPEG', async () => {
    const result = await prepareAvatarImageForUpload({
      height: 1200,
      mimeType: 'image/png',
      uri: 'file:///picked-avatar.png',
      width: 2400,
    });

    expect(mocks.manipulateAsync).toHaveBeenCalledWith(
      'file:///picked-avatar.png',
      [{ resize: { width: 512 } }],
      { compress: 0.78, format: 'jpeg' },
    );
    expect(result).toEqual({
      contentType: 'image/jpeg',
      uri: 'file:///prepared-avatar.jpg',
    });
  });

  it('resizes portrait avatars to 512px high', async () => {
    await prepareAvatarImageForUpload({
      height: 1800,
      uri: 'file:///portrait.jpg',
      width: 900,
    });

    expect(mocks.manipulateAsync).toHaveBeenCalledWith(
      'file:///portrait.jpg',
      [{ resize: { height: 512 } }],
      { compress: 0.78, format: 'jpeg' },
    );
  });

  it('keeps small avatars at their original dimensions while still recompressing', async () => {
    await prepareAvatarImageForUpload({
      height: 400,
      uri: 'file:///small.jpg',
      width: 400,
    });

    expect(mocks.manipulateAsync).toHaveBeenCalledWith('file:///small.jpg', [], {
      compress: 0.78,
      format: 'jpeg',
    });
  });

  it('falls back to the picked image when manipulation fails', async () => {
    mocks.manipulateAsync.mockRejectedValueOnce(new Error('manipulation failed'));

    await expect(
      prepareAvatarImageForUpload({
        height: 1000,
        mimeType: 'image/webp',
        uri: 'file:///picked-avatar.webp',
        width: 1000,
      }),
    ).resolves.toEqual({
      contentType: 'image/webp',
      uri: 'file:///picked-avatar.webp',
    });
  });
});
