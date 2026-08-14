import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const storageMocks = vi.hoisted(() => ({
  getStoredItem: vi.fn(),
  removeStoredItem: vi.fn(),
  setStoredItem: vi.fn(),
  values: new Map<string, string>(),
}));

vi.mock('./storage', () => ({
  getStoredItem: storageMocks.getStoredItem,
  removeStoredItem: storageMocks.removeStoredItem,
  setStoredItem: storageMocks.setStoredItem,
}));

import {
  PENDING_INVITE_INTENT_TTL_MS,
  clearPendingInviteIntentIfMatches,
  readPendingInviteIntent,
  shouldActivateAccountInviteAfterSetup,
  writePendingInviteIntent,
} from './invite-intent';

const STORAGE_KEY = 'happy_circles.pending_invite_intent';
const NOW = new Date('2026-05-07T12:00:00.000Z');

describe('invite intent storage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    storageMocks.values.clear();
    storageMocks.getStoredItem.mockImplementation(
      async (key: string) => storageMocks.values.get(key) ?? null,
    );
    storageMocks.setStoredItem.mockImplementation(async (key: string, value: string) => {
      storageMocks.values.set(key, value);
    });
    storageMocks.removeStoredItem.mockImplementation(async (key: string) => {
      storageMocks.values.delete(key);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('stores account invite intents with source metadata and creation time', async () => {
    await writePendingInviteIntent({
      type: 'account_invite',
      token: '  abcdefghijkl  ',
      source: 'account_invite_link',
    });

    await expect(readPendingInviteIntent()).resolves.toEqual({
      type: 'account_invite',
      token: 'abcdefghijkl',
      source: 'account_invite_link',
      createdAt: NOW.toISOString(),
    });
  });

  it('drops legacy intents without source and creation metadata', async () => {
    storageMocks.values.set(
      STORAGE_KEY,
      JSON.stringify({
        type: 'account_invite',
        token: 'abcdefghijkl',
      }),
    );

    await expect(readPendingInviteIntent()).resolves.toBeNull();
    expect(storageMocks.removeStoredItem).toHaveBeenCalledWith(STORAGE_KEY);
  });

  it('drops expired intents before routing or activation', async () => {
    storageMocks.values.set(
      STORAGE_KEY,
      JSON.stringify({
        type: 'account_invite',
        token: 'abcdefghijkl',
        source: 'account_invite_auth',
        createdAt: new Date(NOW.getTime() - PENDING_INVITE_INTENT_TTL_MS - 1).toISOString(),
      }),
    );

    await expect(readPendingInviteIntent()).resolves.toBeNull();
    expect(storageMocks.removeStoredItem).toHaveBeenCalledWith(STORAGE_KEY);
  });

  it('clears only the matching pending invite intent', async () => {
    await writePendingInviteIntent({
      type: 'account_invite',
      token: 'abcdefghijkl',
      source: 'account_invite_link',
    });

    await expect(
      clearPendingInviteIntentIfMatches({
        type: 'friendship_invite',
        token: 'abcdefghijkl',
      }),
    ).resolves.toBe(false);
    await expect(readPendingInviteIntent()).resolves.toMatchObject({
      type: 'account_invite',
      token: 'abcdefghijkl',
    });

    await expect(
      clearPendingInviteIntentIfMatches({
        type: 'account_invite',
        token: '  abcdefghijkl  ',
      }),
    ).resolves.toBe(true);
    await expect(readPendingInviteIntent()).resolves.toBeNull();
  });

  it('only treats account invite intents as setup activation intents', () => {
    expect(
      shouldActivateAccountInviteAfterSetup({
        type: 'account_invite',
        token: 'abcdefghijkl',
        source: 'account_invite_signup',
        createdAt: NOW.toISOString(),
      }),
    ).toBe(true);
    expect(
      shouldActivateAccountInviteAfterSetup({
        type: 'friendship_invite',
        token: 'abcdefghijkl',
        source: 'friendship_invite_link',
        createdAt: NOW.toISOString(),
      }),
    ).toBe(false);
  });

  it('fails closed when secure storage get and cleanup both reject', async () => {
    storageMocks.getStoredItem.mockRejectedValueOnce(new Error('storage unavailable'));
    storageMocks.removeStoredItem.mockRejectedValueOnce(new Error('cleanup unavailable'));

    await expect(readPendingInviteIntent()).resolves.toBeNull();
  });

  it('does not let failed cleanup turn an invalid intent into a route-guard rejection', async () => {
    storageMocks.values.set(STORAGE_KEY, '{invalid-json');
    storageMocks.removeStoredItem.mockRejectedValueOnce(new Error('cleanup unavailable'));

    await expect(readPendingInviteIntent()).resolves.toBeNull();
  });
});
