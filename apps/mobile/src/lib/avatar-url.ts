function normalizeAvatarPath(path: string | null | undefined): string {
  return (path?.trim() ?? '').replace(/^\/+/, '');
}

function isDirectAvatarUri(value: string): boolean {
  return /^(https?:|file:|content:|asset:|data:|blob:|ph:)/i.test(value);
}

function isVersionableRemoteUri(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export function resolveAvatarUrl(
  path: string | null | undefined,
  version?: string | null,
): string | null {
  const normalizedPath = normalizeAvatarPath(path);
  if (!normalizedPath) {
    return null;
  }

  const appendVersion = (value: string): string =>
    version ? `${value}${value.includes('?') ? '&' : '?'}v=${encodeURIComponent(version)}` : value;

  if (isDirectAvatarUri(normalizedPath)) {
    return isVersionableRemoteUri(normalizedPath) ? appendVersion(normalizedPath) : normalizedPath;
  }

  return normalizedPath;
}

export function normalizeStoredAvatarPath(path: string | null | undefined): string {
  return normalizeAvatarPath(path);
}

export function avatarPathIsRemoteUrl(value: string): boolean {
  return isDirectAvatarUri(value);
}
