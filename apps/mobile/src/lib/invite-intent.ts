import type { Href } from 'expo-router';

import { getStoredItem, removeStoredItem, setStoredItem } from './storage';

const INVITE_INTENT_KEY = 'happy_circles.pending_invite_intent';
export const PENDING_INVITE_INTENT_TTL_MS = 24 * 60 * 60 * 1000;

export type AccountInviteIntentSource =
  | 'account_invite_auth'
  | 'account_invite_link'
  | 'account_invite_signup';

export type FriendshipInviteIntentSource = 'friendship_invite_link';

export type PendingInviteIntent =
  | {
      readonly type: 'friendship_invite';
      readonly token: string;
      readonly source: FriendshipInviteIntentSource;
      readonly createdAt: string;
    }
  | {
      readonly type: 'account_invite';
      readonly token: string;
      readonly source: AccountInviteIntentSource;
      readonly createdAt: string;
    };

export type PendingInviteIntentInput =
  | {
      readonly type: 'friendship_invite';
      readonly token: string;
      readonly source: FriendshipInviteIntentSource;
      readonly createdAt?: string;
    }
  | {
      readonly type: 'account_invite';
      readonly token: string;
      readonly source: AccountInviteIntentSource;
      readonly createdAt?: string;
    };

function isPendingInviteIntent(value: unknown): value is PendingInviteIntent {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const type = (value as Record<string, unknown>)['type'];
  const token = (value as Record<string, unknown>)['token'];
  const source = (value as Record<string, unknown>)['source'];
  const createdAt = (value as Record<string, unknown>)['createdAt'];

  if (typeof token !== 'string' || token.trim().length < 12 || typeof createdAt !== 'string') {
    return false;
  }

  if (type === 'account_invite') {
    return (
      source === 'account_invite_auth' ||
      source === 'account_invite_link' ||
      source === 'account_invite_signup'
    );
  }

  return type === 'friendship_invite' && source === 'friendship_invite_link';
}

function isFreshInviteIntent(intent: PendingInviteIntent): boolean {
  const createdAtMs = Date.parse(intent.createdAt);
  return Number.isFinite(createdAtMs) && Date.now() - createdAtMs <= PENDING_INVITE_INTENT_TTL_MS;
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

    if (!isFreshInviteIntent(parsed)) {
      await removeStoredItem(INVITE_INTENT_KEY);
      return null;
    }

    return {
      type: parsed.type,
      token: parsed.token.trim(),
      source: parsed.source,
      createdAt: parsed.createdAt,
    } as PendingInviteIntent;
  } catch {
    await removeStoredItem(INVITE_INTENT_KEY);
    return null;
  }
}

export function shouldActivateAccountInviteAfterSetup(
  intent: PendingInviteIntent | null,
): intent is Extract<PendingInviteIntent, { readonly type: 'account_invite' }> {
  return intent?.type === 'account_invite';
}

export async function writePendingInviteIntent(intent: PendingInviteIntentInput): Promise<void> {
  await setStoredItem(
    INVITE_INTENT_KEY,
    JSON.stringify({
      ...intent,
      token: intent.token.trim(),
      createdAt: intent.createdAt ?? new Date().toISOString(),
    }),
  );
}

export async function clearPendingInviteIntent(): Promise<void> {
  await removeStoredItem(INVITE_INTENT_KEY);
}
