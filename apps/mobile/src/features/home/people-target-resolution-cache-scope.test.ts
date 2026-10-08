import { beforeEach, describe, expect, it, vi } from 'vitest';
const storage = vi.hoisted(() => {
  type Row = {
    phone_hash: string;
    resolution_json: string;
    resolved_at: number;
    generation: number;
  };
  const rows = new Map<string, Row>();
  const database = {
    execAsync: vi.fn(async () => undefined),
    withTransactionAsync: vi.fn(async (callback: () => Promise<void>) => callback()),
    runAsync: vi.fn(async (sql: string, params: readonly unknown[]) => {
      if (sql.startsWith('INSERT'))
        rows.set(String(params[1]), {
          phone_hash: String(params[1]),
          resolution_json: String(params[2]),
          resolved_at: Number(params[3]),
          generation: Number(params[4]),
        });
      else if (sql.startsWith('DELETE')) {
        if (sql.includes('IN (')) for (const hash of params.slice(1)) rows.delete(String(hash));
        else
          for (const hash of rows.keys())
            if (hash.startsWith(String(params[0]) + ':')) rows.delete(hash);
      }
    }),
    getAllAsync: vi.fn(async (_sql: string, params: readonly unknown[]) =>
      params.slice(2).flatMap((hash) => (rows.has(String(hash)) ? [rows.get(String(hash))!] : [])),
    ),
  };
  return { rows, database, digest: vi.fn(async (_algorithm: string, source: string) => source) };
});
vi.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA256' },
  digestStringAsync: storage.digest,
}));
vi.mock('expo-sqlite', () => ({ openDatabaseAsync: vi.fn(async () => storage.database) }));
vi.mock('react-native', () => ({ Platform: { OS: 'android', select: () => null } }));
import {
  clearContactResolutionUser,
  mergeContactResolutions,
} from '@/lib/contact-resolution-state';
import {
  createPeopleTargetResolutionCacheKey,
  clearPeopleTargetResolutionMemory,
  loadPeopleTargetResolutionCache,
  invalidatePeopleTargetResolutionCache,
  savePeopleTargetResolutionsToCache,
} from './people-target-resolution-cache';
const userId = 'cache-scope';
beforeEach(() => {
  clearContactResolutionUser(userId);
  clearPeopleTargetResolutionMemory(userId);
  storage.rows.clear();
  storage.digest.mockClear();
  storage.database.runAsync.mockClear();
});
describe('cached contact keys and selective disk invalidation', () => {
  it('hashes a phone once per account and clears that memory at logout', async () => {
    const input = { userId, phoneE164: '+573001234567' };
    await Promise.all(Array.from({ length: 8 }, () => createPeopleTargetResolutionCacheKey(input)));
    expect(storage.digest).toHaveBeenCalledTimes(1);
    clearPeopleTargetResolutionMemory(userId);
    await createPeopleTargetResolutionCacheKey(input);
    expect(storage.digest).toHaveBeenCalledTimes(2);
  });
  it('deletes only the contact matching an invitation and reuses hashes for reads', async () => {
    const rows = mergeContactResolutions(
      userId,
      ['+573001234567', '+573011234567'].map((phoneE164, index) => ({
        phoneE164,
        status: 'pending_friendship' as const,
        friendshipInviteId: 'invite-' + index,
        matchedUserId: 'person-' + index,
        displayName: null,
        avatarPath: null,
        accountInviteId: null,
        accountInviteStatus: null,
        relationshipId: null,
      })),
    );
    await savePeopleTargetResolutionsToCache(userId, rows);
    const cached = await loadPeopleTargetResolutionCache(
      userId,
      rows.map((row) => row.phoneE164),
    );
    expect(Object.keys(cached)).toHaveLength(2);
    expect(storage.digest).toHaveBeenCalledTimes(2);
    await invalidatePeopleTargetResolutionCache(userId, { inviteId: 'invite-0' });
    expect(storage.rows.has(userId + ':' + rows[0].phoneE164)).toBe(false);
    expect(storage.rows.has(userId + ':' + rows[1].phoneE164)).toBe(true);
    expect(storage.database.runAsync.mock.calls.at(-1)?.[1]).toHaveLength(2);
  });
});
