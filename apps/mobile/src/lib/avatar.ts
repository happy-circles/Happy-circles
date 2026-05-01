import { useEffect, useState } from 'react';

import { supabase } from './supabase';

export const AVATAR_BUCKET = 'avatars';
const SIGNED_URL_TTL_SECONDS = 60 * 60;
const SIGNED_URL_REFRESH_MARGIN_MS = 60 * 1000;

interface CachedSignedAvatarUrl {
  readonly expiresAt: number;
  readonly url: string;
}

const signedAvatarUrlCache = new Map<string, CachedSignedAvatarUrl>();

function normalizeAvatarPath(path: string | null | undefined): string {
  return (path?.trim() ?? '').replace(/^\/+/, '');
}

function isRemoteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export function buildAvatarLabel(value: string | null | undefined): string {
  const normalized = value?.trim() ?? '';
  const firstCharacter = normalized.charAt(0);
  return firstCharacter ? firstCharacter.toUpperCase() : '?';
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

async function createSignedAvatarUrl(path: string): Promise<CachedSignedAvatarUrl | null> {
  const normalizedPath = normalizeAvatarPath(path);
  if (!normalizedPath || isRemoteUrl(normalizedPath) || !supabase) {
    return null;
  }

  const cached = signedAvatarUrlCache.get(normalizedPath);
  if (cached && cached.expiresAt - SIGNED_URL_REFRESH_MARGIN_MS > Date.now()) {
    return cached;
  }

  const { data, error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .createSignedUrl(normalizedPath, SIGNED_URL_TTL_SECONDS);

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
}

export function useResolvedAvatarUrl(path: string | null | undefined): string | null {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(() => {
    const normalizedPath = normalizeAvatarPath(path);
    return normalizedPath && isRemoteUrl(normalizedPath) ? normalizedPath : null;
  });

  useEffect(() => {
    const normalizedPath = normalizeAvatarPath(path);
    let cancelled = false;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;

    if (!normalizedPath) {
      setResolvedUrl(null);
      return undefined;
    }

    if (isRemoteUrl(normalizedPath)) {
      setResolvedUrl(normalizedPath);
      return undefined;
    }

    const refreshSignedUrl = async () => {
      const signedUrl = await createSignedAvatarUrl(normalizedPath);
      if (cancelled) {
        return;
      }

      setResolvedUrl(signedUrl?.url ?? null);

      if (signedUrl) {
        const refreshInMs = Math.max(
          1000,
          signedUrl.expiresAt - Date.now() - SIGNED_URL_REFRESH_MARGIN_MS,
        );
        refreshTimer = setTimeout(refreshSignedUrl, refreshInMs);
      }
    };

    setResolvedUrl(null);
    void refreshSignedUrl();

    return () => {
      cancelled = true;
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }
    };
  }, [path]);

  return resolvedUrl;
}
