import { describe, expect, it, vi } from 'vitest';

const sqliteMocks = vi.hoisted(() => ({
  database: {
    execAsync: vi.fn(),
    getFirstAsync: vi.fn(),
    runAsync: vi.fn(),
  },
  openDatabaseAsync: vi.fn(),
}));

vi.mock('expo-sqlite', () => ({
  openDatabaseAsync: sqliteMocks.openDatabaseAsync,
}));

import type { PeopleOverview } from './types';
import { persistCachedPeopleOverview, readCachedPeopleOverview } from './people-overview-cache';

sqliteMocks.openDatabaseAsync.mockResolvedValue(sqliteMocks.database);
sqliteMocks.database.execAsync.mockResolvedValue(undefined);
sqliteMocks.database.runAsync.mockResolvedValue(undefined);

const overview: PeopleOverview = {
  fetchedAt: '2026-06-25T15:00:00.000Z',
  people: [
    {
      direction: 'settled',
      displayName: 'Ana',
      lastActivityLabel: 'Sin movimientos todavía',
      netAmountMinor: 0,
      pendingCount: 0,
      userId: 'user-ana',
    },
  ],
};

describe('people overview cache', () => {
  it('persists a compact per-user payload with its schema version', async () => {
    await persistCachedPeopleOverview('user-a', overview, {});

    expect(sqliteMocks.database.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO people_overview_cache'),
      'user-a',
      1,
      JSON.stringify(overview),
      '{}',
      overview.fetchedAt,
    );
  });

  it('restores a valid payload and signed avatar metadata', async () => {
    sqliteMocks.database.getFirstAsync.mockResolvedValueOnce({
      avatar_signed_urls_json: JSON.stringify({
        'avatars/user-ana/current.jpg': {
          expiresAt: '2026-06-26T15:00:00.000Z',
          url: 'https://signed.example/ana',
        },
      }),
      overview_json: JSON.stringify(overview),
      updated_at: overview.fetchedAt,
    });

    await expect(readCachedPeopleOverview('user-a')).resolves.toEqual({
      avatarSignedUrlsByPath: {
        'avatars/user-ana/current.jpg': {
          expiresAt: '2026-06-26T15:00:00.000Z',
          url: 'https://signed.example/ana',
        },
      },
      overview,
      updatedAt: overview.fetchedAt,
    });
  });

  it('deletes incompatible payloads instead of repeatedly failing hydration', async () => {
    sqliteMocks.database.getFirstAsync.mockResolvedValueOnce({
      avatar_signed_urls_json: '{}',
      overview_json: JSON.stringify({ fetchedAt: overview.fetchedAt, people: [{}] }),
      updated_at: overview.fetchedAt,
    });

    await expect(readCachedPeopleOverview('user-a')).resolves.toBeNull();
    expect(sqliteMocks.database.runAsync).toHaveBeenCalledWith(
      'DELETE FROM people_overview_cache WHERE user_id = ?',
      'user-a',
    );
  });
});
