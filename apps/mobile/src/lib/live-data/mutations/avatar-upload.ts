import {
  createSupportId,
  readFunctionErrorDetails,
  reportAndCreateSupportError,
} from '../../support-errors';

interface AvatarUploadInput {
  readonly contentType?: string | null;
  readonly uri: string;
}

interface AvatarUploadClient {
  readonly functions: {
    invoke<TResult>(
      name: string,
      options: {
        readonly body: FormData;
        readonly headers: Record<string, string>;
      },
    ): Promise<{
      readonly data: TResult | null;
      readonly error: unknown | null;
    }>;
  };
}

export function resolveAvatarUploadMetadata(input: AvatarUploadInput): {
  readonly contentType: string;
  readonly fileExtension: 'heic' | 'heif' | 'jpg' | 'png' | 'webp';
} {
  const uriLower = input.uri.toLocaleLowerCase('en-US');
  const inputContentType = input.contentType?.trim().toLocaleLowerCase('en-US') ?? '';
  const contentType =
    inputContentType ||
    (uriLower.endsWith('.png')
      ? 'image/png'
      : uriLower.endsWith('.webp')
        ? 'image/webp'
        : uriLower.endsWith('.heic')
          ? 'image/heic'
          : uriLower.endsWith('.heif')
            ? 'image/heif'
            : 'image/jpeg');
  const fileExtension = contentType.includes('png')
    ? 'png'
    : contentType.includes('heic')
      ? 'heic'
      : contentType.includes('heif')
        ? 'heif'
        : contentType.includes('webp')
          ? 'webp'
          : 'jpg';

  return { contentType, fileExtension };
}

export function createAvatarFormData(input: AvatarUploadInput): FormData {
  const { contentType, fileExtension } = resolveAvatarUploadMetadata(input);
  const formData = new FormData();
  formData.append('avatar', {
    name: `avatar.${fileExtension}`,
    type: contentType,
    uri: input.uri,
  } as unknown as Blob);

  return formData;
}

export async function uploadAvatar(
  client: AvatarUploadClient,
  input: AvatarUploadInput,
): Promise<string> {
  const supportId = createSupportId();
  const result = await client.functions.invoke<{ avatarPath: string }>('upload-avatar', {
    body: createAvatarFormData(input),
    headers: {
      'x-client-info': 'happy-circles-mobile',
      'x-request-id': supportId,
    },
  });

  if (result.error) {
    const details = await readFunctionErrorDetails(result.error);
    throw reportAndCreateSupportError({
      error: new Error(details.message),
      errorCode: details.code,
      functionName: 'upload-avatar',
      kind: 'edge_function',
      metadata: { status: details.status ?? null },
      requestId: details.requestId ?? supportId,
      status: details.status,
      supportId,
    });
  }

  if (!result.data?.avatarPath) {
    throw reportAndCreateSupportError({
      error: new Error('No se pudo actualizar la foto.'),
      errorCode: 'empty_payload',
      functionName: 'upload-avatar',
      kind: 'edge_function',
      metadata: { status: 'empty_payload' },
      requestId: supportId,
      supportId,
    });
  }

  return result.data.avatarPath;
}
