import { describe, expect, it, vi } from 'vitest';

const sqlite = vi.hoisted(() => {
  const rows = new Map<string, unknown>();
  let release: (() => void) | null = null;
  let shouldBlock = false;
  const database = {
    execAsync: vi.fn(async () => undefined),
    withTransactionAsync: vi.fn(async (work: () => Promise<void>) => work()),
    runAsync: vi.fn(async (sql: string, params: unknown[]) => {
      if (sql.startsWith('INSERT')) {
        if (shouldBlock) {
          shouldBlock = false;
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        }
        rows.set(String(params[0]), params[2]);
      } else if (sql.startsWith('DELETE')) rows.delete(String(params[0]));
    }),
  };
  return {
    database,
    rows,
    blockNext: () => {
      shouldBlock = true;
    },
    release: () => {
      release?.();
    },
  };
});
vi.mock('expo-sqlite', () => ({ openDatabaseAsync: vi.fn(async () => sqlite.database) }));
vi.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: vi.fn(async (_algorithm: string, input: string) => input),
}));
vi.mock('react-native', () => ({
  Platform: {
    OS: 'web',
    select: (options: Record<string, unknown>) => options.web ?? options.default,
  },
}));

import { applyContactActionResult, mergeContactResolutions } from '@/lib/contact-resolution-state';
import {
  invalidatePeopleTargetResolutionCache,
  savePeopleTargetResolutionsToCache,
} from './people-target-resolution-cache';

describe('persistent contact invalidation', () => {
  it('serializes cancellation after an older write and refuses later stale saves', async () => {
    const user = 'sqlite-race';
    const [pending] = mergeContactResolutions(user, [
      {
        phoneE164: '+57300',
        status: 'pending_friendship',
        friendshipInviteId: 'invite',
        matchedUserId: 'person',
        accountInviteId: null,
        accountInviteStatus: null,
        avatarPath: null,
        displayName: null,
        relationshipId: null,
      },
    ]);
    sqlite.blockNext();
    const write = savePeopleTargetResolutionsToCache(user, [pending]);
    await vi.waitFor(() => expect(sqlite.database.runAsync).toHaveBeenCalled());
    applyContactActionResult({ userId: user, inviteId: 'invite' }, 'canceled');
    const invalidation = invalidatePeopleTargetResolutionCache(user);
    sqlite.release();
    await Promise.all([write, invalidation]);
    expect(sqlite.rows.has(user)).toBe(false);
    await savePeopleTargetResolutionsToCache(user, [pending]);
    expect(sqlite.rows.has(user)).toBe(false);
  });
});
