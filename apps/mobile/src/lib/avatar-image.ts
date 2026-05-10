import * as ImageManipulator from 'expo-image-manipulator';

const AVATAR_UPLOAD_MAX_SIZE = 512;
const AVATAR_UPLOAD_COMPRESSION = 0.78;

interface PickedAvatarImage {
  readonly height?: number | null;
  readonly mimeType?: string | null;
  readonly uri: string;
  readonly width?: number | null;
}

export interface PreparedAvatarUpload {
  readonly contentType: string;
  readonly uri: string;
}

function resizeActionForAvatar(asset: PickedAvatarImage): ImageManipulator.Action[] {
  const width = asset.width ?? 0;
  const height = asset.height ?? 0;
  const longestSide = Math.max(width, height);

  if (longestSide <= AVATAR_UPLOAD_MAX_SIZE || longestSide <= 0) {
    return [];
  }

  return width >= height
    ? [{ resize: { width: AVATAR_UPLOAD_MAX_SIZE } }]
    : [{ resize: { height: AVATAR_UPLOAD_MAX_SIZE } }];
}

export async function prepareAvatarImageForUpload(
  asset: PickedAvatarImage,
): Promise<PreparedAvatarUpload> {
  try {
    const result = await ImageManipulator.manipulateAsync(asset.uri, resizeActionForAvatar(asset), {
      compress: AVATAR_UPLOAD_COMPRESSION,
      format: ImageManipulator.SaveFormat.JPEG,
    });

    return {
      contentType: 'image/jpeg',
      uri: result.uri,
    };
  } catch {
    return {
      contentType: asset.mimeType ?? 'image/jpeg',
      uri: asset.uri,
    };
  }
}
