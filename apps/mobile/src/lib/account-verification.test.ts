import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const storageMocks = vi.hoisted(() => ({
  values: new Map<string, string>(),
  getStoredItem: vi.fn(),
  removeStoredItem: vi.fn(),
  setStoredItem: vi.fn(),
}));

vi.mock('./storage', () => ({
  getStoredItem: storageMocks.getStoredItem,
  removeStoredItem: storageMocks.removeStoredItem,
  setStoredItem: storageMocks.setStoredItem,
}));

import {
  PENDING_ACCOUNT_VERIFICATION_TTL_MS,
  clearPendingAccountVerificationIfMatches,
  pendingVerificationMatchesSessionEmail,
  readPendingAccountVerification,
  reconcilePendingAccountVerificationForSession,
  writePendingAccountVerification,
} from './account-verification';

const KEY = 'happy_circles.pending_account_verification';
const NOW = new Date('2026-08-13T21:00:00.000Z');

function storedVerification(input?: {
  readonly createdAt?: string;
  readonly email?: string;
  readonly token?: string;
}) {
  return JSON.stringify({
    createdAt: input?.createdAt ?? NOW.toISOString(),
    email: input?.email ?? 'ana@example.com',
    resendAvailableAt: NOW.getTime() + 60_000,
    token: input?.token ?? 'abcdefghijkl',
  });
}

describe('pending account verification', () => {
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

  it('stores only normalized email, invite token, timestamps and never a password', async () => {
    await writePendingAccountVerification({
      email: '  ANA@Example.COM ',
      resendAvailableAt: NOW.getTime() + 60_000,
      token: '  abcdefghijkl  ',
    });

    const raw = storageMocks.values.get(KEY) ?? '';
    expect(raw).not.toContain('password');
    await expect(readPendingAccountVerification('abcdefghijkl')).resolves.toEqual({
      createdAt: NOW.toISOString(),
      email: 'ana@example.com',
      resendAvailableAt: NOW.getTime() + 60_000,
      token: 'abcdefghijkl',
    });
  });

  it('matches the confirmed session owner using normalized emails', () => {
    expect(
      pendingVerificationMatchesSessionEmail({
        pendingEmail: ' ANA@Example.COM ',
        sessionEmail: 'ana@example.com',
      }),
    ).toBe(true);
    expect(
      pendingVerificationMatchesSessionEmail({
        pendingEmail: 'ana@example.com',
        sessionEmail: 'otra@example.com',
      }),
    ).toBe(false);
    expect(
      pendingVerificationMatchesSessionEmail({
        pendingEmail: 'ana@example.com',
        sessionEmail: null,
      }),
    ).toBe(false);
  });

  it('does not restore another invitation and does not erase it', async () => {
    storageMocks.values.set(KEY, storedVerification());
    await expect(readPendingAccountVerification('mnopqrstuvwx')).resolves.toBeNull();
    expect(storageMocks.values.has(KEY)).toBe(true);
  });

  it('expires and removes stale verification state', async () => {
    storageMocks.values.set(
      KEY,
      JSON.stringify({
        createdAt: new Date(NOW.getTime() - PENDING_ACCOUNT_VERIFICATION_TTL_MS - 1).toISOString(),
        email: 'ana@example.com',
        resendAvailableAt: NOW.getTime(),
        token: 'abcdefghijkl',
      }),
    );

    await expect(readPendingAccountVerification('abcdefghijkl')).resolves.toBeNull();
    expect(storageMocks.removeStoredItem).toHaveBeenCalledWith(KEY);
  });

  it('clears only the matching token, email and version timestamp', async () => {
    storageMocks.values.set(KEY, storedVerification());
    await expect(
      clearPendingAccountVerificationIfMatches({
        createdAt: NOW.toISOString(),
        email: 'ana@example.com',
        token: 'mnopqrstuvwx',
      }),
    ).resolves.toBe(false);
    await expect(
      clearPendingAccountVerificationIfMatches({
        createdAt: NOW.toISOString(),
        email: 'otra@example.com',
        token: 'abcdefghijkl',
      }),
    ).resolves.toBe(false);
    await expect(
      clearPendingAccountVerificationIfMatches({
        createdAt: new Date(NOW.getTime() - 1).toISOString(),
        email: 'ana@example.com',
        token: 'abcdefghijkl',
      }),
    ).resolves.toBe(false);
    expect(storageMocks.values.has(KEY)).toBe(true);
    await expect(
      clearPendingAccountVerificationIfMatches({
        createdAt: NOW.toISOString(),
        email: 'ANA@example.com',
        token: 'abcdefghijkl',
      }),
    ).resolves.toBe(true);
    expect(storageMocks.values.has(KEY)).toBe(false);
  });

  it('reconciles only a confirmed matching session', async () => {
    storageMocks.values.set(KEY, storedVerification());
    await expect(
      reconcilePendingAccountVerificationForSession({
        isEmailConfirmed: false,
        sessionEmail: 'ana@example.com',
      }),
    ).resolves.toBe(false);
    await expect(
      reconcilePendingAccountVerificationForSession({
        isEmailConfirmed: true,
        sessionEmail: 'otra@example.com',
      }),
    ).resolves.toBe(false);
    expect(storageMocks.values.has(KEY)).toBe(true);
    await expect(
      reconcilePendingAccountVerificationForSession({
        isEmailConfirmed: true,
        sessionEmail: ' ANA@example.com ',
      }),
    ).resolves.toBe(true);
    expect(storageMocks.values.has(KEY)).toBe(false);
  });

  it('serializes reconciliation with a newer resend for the same token and email', async () => {
    storageMocks.values.set(KEY, storedVerification());
    let signalRemoveStarted: (() => void) | undefined;
    const removeStarted = new Promise<void>((resolve) => {
      signalRemoveStarted = resolve;
    });
    let releaseRemove: (() => void) | undefined;
    const removeReleased = new Promise<void>((resolve) => {
      releaseRemove = resolve;
    });
    storageMocks.removeStoredItem.mockImplementationOnce(async (key: string) => {
      signalRemoveStarted?.();
      await removeReleased;
      storageMocks.values.delete(key);
    });

    const reconciliation = reconcilePendingAccountVerificationForSession({
      isEmailConfirmed: true,
      sessionEmail: 'ana@example.com',
    });
    await removeStarted;
    const newerCreatedAt = new Date(NOW.getTime() + 1_000).toISOString();
    const newerWrite = writePendingAccountVerification({
      createdAt: newerCreatedAt,
      email: 'ana@example.com',
      resendAvailableAt: NOW.getTime() + 61_000,
      token: 'abcdefghijkl',
    });
    releaseRemove?.();

    await expect(reconciliation).resolves.toBe(true);
    await expect(newerWrite).resolves.toMatchObject({ createdAt: newerCreatedAt });
    expect(JSON.parse(storageMocks.values.get(KEY) ?? '{}')).toMatchObject({
      createdAt: newerCreatedAt,
      email: 'ana@example.com',
      token: 'abcdefghijkl',
    });
  });
});
