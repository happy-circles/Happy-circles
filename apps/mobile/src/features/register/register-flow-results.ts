import type { Href } from 'expo-router';

export function buildRegisterSuccessHref(input: {
  readonly focusId?: string | null;
  readonly panel: 'pending' | 'history';
  readonly personId: string;
}): Href {
  const focusParam = input.focusId ? `&focus=${encodeURIComponent(input.focusId)}` : '';
  return `/person/${encodeURIComponent(input.personId)}?panel=${input.panel}${focusParam}` as Href;
}

export function readStringField(value: unknown, key: string): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === 'string' && field.length > 0 ? field : null;
}
