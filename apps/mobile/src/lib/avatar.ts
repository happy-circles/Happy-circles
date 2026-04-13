import { supabase } from './supabase';

export const AVATAR_BUCKET = 'avatars';

export function buildAvatarLabel(value: string | null | undefined): string {
  const normalized = value?.trim() ?? '';
  const firstCharacter = normalized.charAt(0);
  return firstCharacter ? firstCharacter.toUpperCase() : '?';
}

export function resolveAvatarUrl(path: string | null | undefined, version?: string | null): string | null {
  const normalizedPath = path?.trim() ?? '';
  if (!normalizedPath) {
    return null;
  }

  const appendVersion = (value: string): string =>
    version
      ? `${value}${value.includes('?') ? '&' : '?'}v=${encodeURIComponent(version)}`
      : value;

  if (/^https?:\/\//i.test(normalizedPath)) {
    return appendVersion(normalizedPath);
  }

  if (!supabase) {
    return null;
  }

  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(normalizedPath);
  if (!data.publicUrl) {
    return null;
  }

  return appendVersion(data.publicUrl);
}
