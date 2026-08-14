import { getStoredItem, removeStoredItem, setStoredItem } from './storage';

const PENDING_NAVIGATION_INTENT_KEY = 'happy_circles.pending_navigation_intent';
export const PENDING_NAVIGATION_INTENT_TTL_MS = 24 * 60 * 60 * 1000;

export interface PendingNavigationIntent {
  readonly type: 'notification';
  readonly id: string;
  readonly href: string;
  readonly createdAt: string;
}

function isInternalHref(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//');
}

function parsePendingNavigationIntent(value: unknown): PendingNavigationIntent | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (
    record.type !== 'notification' ||
    typeof record.id !== 'string' ||
    record.id.trim().length === 0 ||
    !isInternalHref(record.href) ||
    typeof record.createdAt !== 'string'
  ) {
    return null;
  }

  const createdAtMs = Date.parse(record.createdAt);
  if (
    !Number.isFinite(createdAtMs) ||
    Date.now() - createdAtMs > PENDING_NAVIGATION_INTENT_TTL_MS
  ) {
    return null;
  }

  return {
    type: 'notification',
    id: record.id.trim(),
    href: record.href,
    createdAt: record.createdAt,
  };
}

async function removePendingNavigationIntentSafely(): Promise<void> {
  await removeStoredItem(PENDING_NAVIGATION_INTENT_KEY).catch(() => undefined);
}

export async function readPendingNavigationIntent(): Promise<PendingNavigationIntent | null> {
  try {
    const storedValue = await getStoredItem(PENDING_NAVIGATION_INTENT_KEY);
    if (!storedValue) {
      return null;
    }

    const parsed = parsePendingNavigationIntent(JSON.parse(storedValue) as unknown);
    if (!parsed) {
      await removePendingNavigationIntentSafely();
    }
    return parsed;
  } catch {
    await removePendingNavigationIntentSafely();
    return null;
  }
}

export async function writePendingNavigationIntent(input: {
  readonly id: string;
  readonly href: string;
  readonly createdAt?: string;
}): Promise<void> {
  if (!isInternalHref(input.href) || input.id.trim().length === 0) {
    throw new Error('Invalid pending navigation intent.');
  }

  await setStoredItem(
    PENDING_NAVIGATION_INTENT_KEY,
    JSON.stringify({
      type: 'notification',
      id: input.id.trim(),
      href: input.href,
      createdAt: input.createdAt ?? new Date().toISOString(),
    } satisfies PendingNavigationIntent),
  );
}

export async function clearPendingNavigationIntentIfMatches(id: string): Promise<boolean> {
  const pendingIntent = await readPendingNavigationIntent();
  if (pendingIntent?.id !== id.trim()) {
    return false;
  }

  await removeStoredItem(PENDING_NAVIGATION_INTENT_KEY);
  return true;
}
