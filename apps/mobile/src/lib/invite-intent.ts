import type { Href } from 'expo-router';

import { getStoredItem, removeStoredItem, setStoredItem } from './storage';

const INVITE_INTENT_KEY = 'happy_circles.pending_invite_intent';

export type PendingInviteIntent =
  | {
      readonly type: 'friendship_invite';
      readonly token: string;
    }
  | {
      readonly type: 'account_invite';
      readonly token: string;
    };

function isPendingInviteIntent(value: unknown): value is PendingInviteIntent {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const type = (value as Record<string, unknown>)['type'];
  const token = (value as Record<string, unknown>)['token'];

  return (
    (type === 'friendship_invite' || type === 'account_invite') &&
    typeof token === 'string' &&
    token.trim().length >= 12
  );
}

export function hrefForPendingInviteIntent(intent: PendingInviteIntent): Href {
  if (intent.type === 'account_invite') {
    return {
      pathname: '/join/[token]',
      params: { token: intent.token },
    } as unknown as Href;
  }

  return {
    pathname: '/invite/[token]',
    params: { token: intent.token },
  } as Href;
}

export async function readPendingInviteIntent(): Promise<PendingInviteIntent | null> {
  const storedValue = await getStoredItem(INVITE_INTENT_KEY);
  if (!storedValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(storedValue) as unknown;
    if (!isPendingInviteIntent(parsed)) {
      await removeStoredItem(INVITE_INTENT_KEY);
      return null;
    }

    return {
      type: parsed.type,
      token: parsed.token.trim(),
    } as PendingInviteIntent;
  } catch {
    await removeStoredItem(INVITE_INTENT_KEY);
    return null;
  }
}

export async function writePendingInviteIntent(intent: PendingInviteIntent): Promise<void> {
  await setStoredItem(INVITE_INTENT_KEY, JSON.stringify(intent));
}

export async function clearPendingInviteIntent(): Promise<void> {
  await removeStoredItem(INVITE_INTENT_KEY);
}
