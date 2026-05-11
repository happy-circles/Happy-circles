import { useEffect, useState } from 'react';

import { avatarPathIsRemoteUrl, normalizeStoredAvatarPath } from './avatar-url';
import { supabase } from './supabase';

export const AVATAR_BUCKET = 'avatars';
const SIGNED_URL_TTL_SECONDS = 24 * 60 * 60;
const SIGNED_URL_REFRESH_MARGIN_MS = 15 * 60 * 1000;
const MAX_READY_AVATAR_IMAGE_KEYS = 512;

interface CachedSignedAvatarUrl {
  readonly expiresAt: number;
  readonly url: string;
}

export interface SignedAvatarUrlMetadata {
  readonly expiresAt: string;
  readonly url: string;
}

export type SignedAvatarUrlRecord = Readonly<Record<string, SignedAvatarUrlMetadata>>;

interface ResolvedAvatarUrlState {
  readonly path: string;
  readonly url: string | null;
}

const signedAvatarUrlCache = new Map<string, CachedSignedAvatarUrl>();
const signedAvatarUrlRequests = new Map<string, Promise<CachedSignedAvatarUrl | null>>();
const readyAvatarImageKeys = new Set<string>();

function avatarImageReadyKey(source: string | null | undefined): string {
  return normalizeStoredAvatarPath(source);
}

function addReadyAvatarImageKey(key: string): void {
  if (!key) {
    return;
  }

  readyAvatarImageKeys.add(key);

  while (readyAvatarImageKeys.size > MAX_READY_AVATAR_IMAGE_KEYS) {
    const oldestKey = readyAvatarImageKeys.values().next().value;
    if (typeof oldestKey !== 'string') {
      return;
    }
    readyAvatarImageKeys.delete(oldestKey);
  }
}

function cachedSignedAvatarUrl(path: string): CachedSignedAvatarUrl | null {
  const cached = signedAvatarUrlCache.get(path);
  if (!cached) {
    return null;
  }

  if (cached.expiresAt - SIGNED_URL_REFRESH_MARGIN_MS <= Date.now()) {
    signedAvatarUrlCache.delete(path);
    return null;
  }

  return cached;
}

function parseSignedUrlExpiresAt(value: string): number | null {
  const expiresAt = Date.parse(value);
  return Number.isNaN(expiresAt) ? null : expiresAt;
}

export function hydrateSignedAvatarUrlCache(
  avatarSignedUrlsByPath: SignedAvatarUrlRecord | null | undefined,
): void {
  if (!avatarSignedUrlsByPath) {
    return;
  }

  for (const [rawPath, signedUrl] of Object.entries(avatarSignedUrlsByPath)) {
    const normalizedPath = normalizeStoredAvatarPath(rawPath);
    const expiresAt = parseSignedUrlExpiresAt(signedUrl.expiresAt);

    if (
      !normalizedPath ||
      avatarPathIsRemoteUrl(normalizedPath) ||
      !signedUrl.url ||
      expiresAt === null ||
      expiresAt - SIGNED_URL_REFRESH_MARGIN_MS <= Date.now()
    ) {
      continue;
    }

    signedAvatarUrlCache.set(normalizedPath, {
      expiresAt,
      url: signedUrl.url,
    });
  }
}

export function getCachedResolvedAvatarUrl(path: string | null | undefined): string | null {
  const normalizedPath = normalizeStoredAvatarPath(path);
  if (!normalizedPath) {
    return null;
  }

  if (avatarPathIsRemoteUrl(normalizedPath)) {
    return normalizedPath;
  }

  return cachedSignedAvatarUrl(normalizedPath)?.url ?? null;
}

export function buildAvatarLabel(value: string | null | undefined): string {
  const normalized = value?.trim() ?? '';
  const firstCharacter = normalized.charAt(0);
  return firstCharacter ? firstCharacter.toUpperCase() : '?';
}

export function isAvatarImageReady(
  source: string | null | undefined,
  resolvedUrl?: string | null,
): boolean {
  const sourceKey = avatarImageReadyKey(source);
  const resolvedUrlKey = avatarImageReadyKey(resolvedUrl);

  return Boolean(
    (sourceKey && readyAvatarImageKeys.has(sourceKey)) ||
    (resolvedUrlKey && readyAvatarImageKeys.has(resolvedUrlKey)),
  );
}

export function rememberAvatarImageReady(
  source: string | null | undefined,
  resolvedUrl?: string | null,
): void {
  addReadyAvatarImageKey(avatarImageReadyKey(source));
  addReadyAvatarImageKey(avatarImageReadyKey(resolvedUrl));
}

export function clearAvatarImageReadyCacheForTests(): void {
  readyAvatarImageKeys.clear();
}

export { resolveAvatarUrl } from './avatar-url';

async function createSignedAvatarUrl(path: string): Promise<CachedSignedAvatarUrl | null> {
  const normalizedPath = normalizeStoredAvatarPath(path);
  if (!normalizedPath || avatarPathIsRemoteUrl(normalizedPath)) {
    return null;
  }

  const cached = cachedSignedAvatarUrl(normalizedPath);
  if (cached) {
    return cached;
  }

  if (!supabase) {
    return null;
  }

  const pendingRequest = signedAvatarUrlRequests.get(normalizedPath);
  if (pendingRequest) {
    return pendingRequest;
  }

  const request = supabase.storage
    .from(AVATAR_BUCKET)
    .createSignedUrl(normalizedPath, SIGNED_URL_TTL_SECONDS)
    .then(({ data, error }) => {
      if (error || !data?.signedUrl) {
        signedAvatarUrlCache.delete(normalizedPath);
        return null;
      }

      const signedUrl = {
        expiresAt: Date.now() + SIGNED_URL_TTL_SECONDS * 1000,
        url: data.signedUrl,
      };
      signedAvatarUrlCache.set(normalizedPath, signedUrl);

      return signedUrl;
    })
    .finally(() => {
      signedAvatarUrlRequests.delete(normalizedPath);
    });

  signedAvatarUrlRequests.set(normalizedPath, request);

  return request;
}

export async function resolveSignedAvatarUrl(
  path: string | null | undefined,
): Promise<string | null> {
  const normalizedPath = normalizeStoredAvatarPath(path);
  if (!normalizedPath) {
    return null;
  }

  if (avatarPathIsRemoteUrl(normalizedPath)) {
    return normalizedPath;
  }

  const signedUrl = await createSignedAvatarUrl(normalizedPath);
  return signedUrl?.url ?? null;
}

export async function resolveSignedAvatarUrls(
  paths: readonly (string | null | undefined)[],
): Promise<readonly string[]> {
  const uniquePaths = Array.from(
    new Set(paths.map((path) => normalizeStoredAvatarPath(path)).filter((path) => path.length > 0)),
  );
  const resolvedUrls = await Promise.all(uniquePaths.map(resolveSignedAvatarUrl));

  return resolvedUrls.filter((url): url is string => Boolean(url));
}

export function useResolvedAvatarUrl(path: string | null | undefined): string | null {
  const [resolvedUrl, setResolvedUrl] = useState<ResolvedAvatarUrlState>(() => {
    const normalizedPath = normalizeStoredAvatarPath(path);
    if (!normalizedPath) {
      return { path: '', url: null };
    }

    if (avatarPathIsRemoteUrl(normalizedPath)) {
      return { path: normalizedPath, url: normalizedPath };
    }

    return {
      path: normalizedPath,
      url: getCachedResolvedAvatarUrl(normalizedPath),
    };
  });

  useEffect(() => {
    const normalizedPath = normalizeStoredAvatarPath(path);
    let cancelled = false;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;

    if (!normalizedPath) {
      setResolvedUrl({ path: '', url: null });
      return undefined;
    }

    if (avatarPathIsRemoteUrl(normalizedPath)) {
      setResolvedUrl({ path: normalizedPath, url: normalizedPath });
      return undefined;
    }

    function scheduleRefresh(signedUrl: CachedSignedAvatarUrl) {
      const refreshInMs = Math.max(
        1000,
        signedUrl.expiresAt - Date.now() - SIGNED_URL_REFRESH_MARGIN_MS,
      );
      refreshTimer = setTimeout(refreshSignedUrl, refreshInMs);
    }

    async function refreshSignedUrl() {
      const signedUrl = await createSignedAvatarUrl(normalizedPath);
      if (cancelled) {
        return;
      }

      setResolvedUrl({ path: normalizedPath, url: signedUrl?.url ?? null });

      if (signedUrl) {
        scheduleRefresh(signedUrl);
      }
    }

    const cached = cachedSignedAvatarUrl(normalizedPath);
    if (cached) {
      setResolvedUrl({ path: normalizedPath, url: cached.url });
      scheduleRefresh(cached);
      return () => {
        cancelled = true;
        if (refreshTimer) {
          clearTimeout(refreshTimer);
        }
      };
    }

    setResolvedUrl({ path: normalizedPath, url: null });
    void refreshSignedUrl();

    return () => {
      cancelled = true;
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }
    };
  }, [path]);

  const normalizedPath = normalizeStoredAvatarPath(path);
  return resolvedUrl.path === normalizedPath ? resolvedUrl.url : null;
}
