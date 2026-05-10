import { createServiceRoleClient, getActorUserId, jsonResponse } from '../_shared/http.ts';

const AVATAR_BUCKET = 'avatars';
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  'image/heic',
  'image/heif',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

interface DetectedImageType {
  readonly extension: string;
  readonly mimeType: string;
}

interface SafeError {
  readonly code: string;
  readonly message: string;
  readonly status: number;
}

function createRequestId(request: Request): string {
  const forwardedRequestId = request.headers.get('x-request-id')?.trim();
  return forwardedRequestId && forwardedRequestId.length <= 128
    ? forwardedRequestId
    : crypto.randomUUID();
}

function normalizeMimeType(value: string): string {
  const normalized = value.split(';')[0]?.trim().toLocaleLowerCase('en-US') ?? '';
  return normalized === 'image/jpg' ? 'image/jpeg' : normalized;
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end));
}

function detectImageType(bytes: Uint8Array): DetectedImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { extension: 'jpg', mimeType: 'image/jpeg' };
  }

  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { extension: 'png', mimeType: 'image/png' };
  }

  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') {
    return { extension: 'webp', mimeType: 'image/webp' };
  }

  if (bytes.length >= 12 && ascii(bytes, 4, 8) === 'ftyp') {
    const brand = ascii(bytes, 8, 12);
    if (['heic', 'heix', 'hevc', 'hevx'].includes(brand)) {
      return { extension: 'heic', mimeType: 'image/heic' };
    }
    if (['heim', 'heis', 'mif1', 'msf1'].includes(brand)) {
      return { extension: 'heif', mimeType: 'image/heif' };
    }
  }

  return null;
}

function isAvatarFile(value: FormDataEntryValue | null): value is File {
  return value instanceof File;
}

function normalizeError(error: unknown): SafeError {
  const detail = error instanceof Error ? error.message : String(error);
  const normalized = detail.trim().toLocaleLowerCase('en-US');

  if (
    normalized.includes('missing authorization header') ||
    normalized.includes('unauthorized') ||
    normalized.includes('invalid jwt') ||
    normalized.includes('jwt expired') ||
    normalized.includes('jwt malformed') ||
    normalized.includes('bad jwt')
  ) {
    return {
      code: 'auth_required',
      message: 'Autenticacion requerida.',
      status: 401,
    };
  }

  if (normalized.includes('too large')) {
    return {
      code: 'payload_too_large',
      message: 'La imagen es demasiado grande.',
      status: 413,
    };
  }

  if (normalized.startsWith('invalid ')) {
    return {
      code: 'validation_failed',
      message: 'Imagen invalida.',
      status: 400,
    };
  }

  if (normalized.includes('permission denied') || normalized.includes('not allowed')) {
    return {
      code: 'forbidden',
      message: 'No tienes permisos para realizar esta accion.',
      status: 403,
    };
  }

  return {
    code: 'request_failed',
    message: 'No se pudo actualizar la foto.',
    status: 400,
  };
}

Deno.serve(async (request) => {
  const requestId = createRequestId(request);

  try {
    if (request.method !== 'POST') {
      return jsonResponse(
        405,
        { error: 'Method not allowed', code: 'method_not_allowed', requestId },
        requestId,
      );
    }

    const contentType = request.headers.get('content-type') ?? '';
    if (!contentType.toLocaleLowerCase('en-US').includes('multipart/form-data')) {
      throw new Error('Invalid content type');
    }

    const actorUserId = await getActorUserId(request);
    const formData = await request.formData();
    const avatar = formData.get('avatar');

    if (!isAvatarFile(avatar)) {
      throw new Error('Invalid avatar');
    }

    if (avatar.size <= 0) {
      throw new Error('Invalid avatar');
    }

    if (avatar.size > MAX_AVATAR_BYTES) {
      throw new Error('Avatar too large');
    }

    const declaredMimeType = normalizeMimeType(avatar.type);
    if (!ALLOWED_MIME_TYPES.has(declaredMimeType)) {
      throw new Error('Invalid avatar type');
    }

    const bytes = new Uint8Array(await avatar.arrayBuffer());
    const detectedType = detectImageType(bytes);
    if (!detectedType || detectedType.mimeType !== declaredMimeType) {
      throw new Error('Invalid avatar content');
    }

    const client = createServiceRoleClient();
    const { data: currentProfile, error: currentProfileError } = await client
      .from('user_profiles')
      .select('avatar_path')
      .eq('id', actorUserId)
      .maybeSingle();

    if (currentProfileError) {
      throw currentProfileError;
    }

    const avatarPath = `${actorUserId}/${crypto.randomUUID()}.${detectedType.extension}`;
    const uploadResult = await client.storage.from(AVATAR_BUCKET).upload(avatarPath, bytes, {
      cacheControl: '604800',
      contentType: detectedType.mimeType,
      upsert: false,
    });

    if (uploadResult.error) {
      throw uploadResult.error;
    }

    const updateResult = await client
      .from('user_profiles')
      .update({ avatar_path: avatarPath })
      .eq('id', actorUserId);

    if (updateResult.error) {
      await client.storage.from(AVATAR_BUCKET).remove([avatarPath]);
      throw updateResult.error;
    }

    const previousAvatarPath =
      typeof currentProfile?.avatar_path === 'string' ? currentProfile.avatar_path.trim() : '';
    if (previousAvatarPath.startsWith(`${actorUserId}/`) && previousAvatarPath !== avatarPath) {
      const removeResult = await client.storage.from(AVATAR_BUCKET).remove([previousAvatarPath]);
      if (removeResult.error) {
        console.warn('avatar_previous_remove_failed', {
          requestId,
          detail: removeResult.error.message,
        });
      }
    }

    return jsonResponse(200, { avatarPath, requestId }, requestId);
  } catch (error) {
    const safeError = normalizeError(error);
    console.error('upload_avatar_error', {
      requestId,
      code: safeError.code,
      detail: error instanceof Error ? error.message : String(error),
    });

    return jsonResponse(
      safeError.status,
      { error: safeError.message, code: safeError.code, requestId },
      requestId,
    );
  }
});
