import { useEffect, useState } from 'react';

import {
  avatarPathIsRemoteUrl,
  normalizeStoredAvatarPath,
} from './avatar-url';
import { supabase } from './supabase';

export const AVATAR_BUCKET = 'avatars';
const SIGNED_URL_TTL_SECONDS = 60 * 60;
const SIGNED_URL_REFRESH_MARGIN_MS = 60 * 1000;

interface CachedSignedAvatarUrl {
  readonly expiresAt: number;
  readonly url: string;
}

interface ResolvedAvatarUrlState {
  readonly path: string;
  readonly url: string | null;
}

const signedAvatarUrlCache = new Map<string, CachedSignedAvatarUrl>();
const signedAvatarUrlRequests = new Map<string, Promise<CachedSignedAvatarUrl | null>>();

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

export function buildAvatarLabel(value: string | null | undefined): string {
  const normalized = value?.trim() ?? '';
  const firstCharacter = normalized.charAt(0);
  return firstCharacter ? firstCharacter.toUpperCase() : '?';
}

export { resolveAvatarUrl } from './avatar-url';

async function createSignedAvatarUrl(path: string): Promise<CachedSignedAvatarUrl | null> {
  const normalizedPath = normalizeStoredAvatarPath(path);
  if (!normalizedPath || avatarPathIsRemoteUrl(normalizedPath) || !supabase) {
    return null;
  }

  const cached = cachedSignedAvatarUrl(normalizedPath);
  if (cached) {
    return cached;
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
      url: cachedSignedAvatarUrl(normalizedPath)?.url ?? null,
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
