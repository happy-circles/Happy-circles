function normalizeAvatarPath(path: string | null | undefined): string {
  return (path?.trim() ?? '').replace(/^\/+/, '');
}

function isRemoteUrl(value: string): boolean {
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

  if (isRemoteUrl(normalizedPath)) {
    return appendVersion(normalizedPath);
  }

  return normalizedPath;
}

export function normalizeStoredAvatarPath(path: string | null | undefined): string {
  return normalizeAvatarPath(path);
}

export function avatarPathIsRemoteUrl(value: string): boolean {
  return isRemoteUrl(value);
}
