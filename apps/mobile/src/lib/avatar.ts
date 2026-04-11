import { supabase } from './supabase';

export const AVATAR_BUCKET = 'avatars';

export function buildAvatarLabel(value: string | null | undefined): string {
  const normalized = value?.trim() ?? '';
  const firstCharacter = normalized.charAt(0);
  return firstCharacter ? firstCharacter.toUpperCase() : '?';
}

export function resolveAvatarUrl(path: string | null | undefined, version?: string | null): string | null {
  if (!path || !supabase) {
    return null;
  }

  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  if (!data.publicUrl) {
    return null;
  }

  if (!version) {
    return data.publicUrl;
  }

  return `${data.publicUrl}?v=${encodeURIComponent(version)}`;
}
