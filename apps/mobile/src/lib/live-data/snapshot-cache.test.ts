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

import type { AppSnapshot } from './types';
import {
  parseCachedAvatarUrlsPayload,
  parseCachedSnapshotPayload,
  readCachedAppSnapshot,
  replaceCurrentUserAvatarInSnapshot,
  serializeCachedSnapshotPayload,
} from './snapshot-cache';

sqliteMocks.openDatabaseAsync.mockResolvedValue(sqliteMocks.database);
sqliteMocks.database.execAsync.mockResolvedValue(undefined);
sqliteMocks.database.runAsync.mockResolvedValue(undefined);

function snapshot(overrides: Partial<AppSnapshot> = {}): AppSnapshot {
  return {
    accountInviteHistoryItems: [],
    accountInvitePendingItems: [],
    accountInviteSummary: {
      historyCount: 0,
      pendingActivationCount: 0,
      requiresReviewCount: 0,
      waitingInviterReviewCount: 0,
    },
    activitySections: [],
    auditEvents: [],
    balanceAnalytics: {} as AppSnapshot['balanceAnalytics'],
    balanceOverview: {} as AppSnapshot['balanceOverview'],
    currentUserProfile: {
      avatarUrl: 'avatars/user-a/current.jpg',
      displayName: 'Ana',
      email: 'ana@example.com',
    },
    dashboard: {
      activePeople: [],
    } as unknown as AppSnapshot['dashboard'],
    happyCircleScore: {
      totalFaces: 0,
      closedCircleCount: 0,
      claimableAwards: [],
      recentAwards: [],
      latestAward: null,
    },
    friendshipHistoryItems: [],
    friendshipPendingItems: [],
    friendshipSummary: {
      historyCount: 0,
      requiresResponseCount: 0,
      requiresReviewCount: 0,
      sentOutsideCount: 0,
      waitingSenderReviewCount: 0,
    },
    notificationUnreadCount: 0,
    notificationViewedKeys: new Set(['pending:1']),
    pendingCount: 0,
    people: [],
    peopleById: {},
    settlementsById: {},
    ...overrides,
  };
}

describe('snapshot cache payloads', () => {
  it('serializes and restores AppSnapshot payloads with notification sets', () => {
    const restored = parseCachedSnapshotPayload(serializeCachedSnapshotPayload(snapshot()));

    expect(restored?.currentUserProfile).toMatchObject({
      displayName: 'Ana',
      email: 'ana@example.com',
    });
    expect(restored?.notificationViewedKeys.has('pending:1')).toBe(true);
  });

  it('ignores incompatible snapshot payloads', () => {
    expect(parseCachedSnapshotPayload('{')).toBeNull();
    expect(parseCachedSnapshotPayload(JSON.stringify({ currentUserProfile: null }))).toBeNull();
  });

  it('filters incompatible signed avatar URL payloads', () => {
    expect(
      parseCachedAvatarUrlsPayload(
        JSON.stringify({
          'avatars/user-a/photo.jpg': {
            expiresAt: '2999-01-01T00:00:00.000Z',
            url: 'https://signed.example/avatar-a',
          },
          'avatars/user-b/photo.jpg': {
            expiresAt: 42,
            url: 'https://signed.example/avatar-b',
          },
        }),
      ),
    ).toEqual({
      'avatars/user-a/photo.jpg': {
        expiresAt: '2999-01-01T00:00:00.000Z',
        url: 'https://signed.example/avatar-a',
      },
    });
  });

  it('updates the current user avatar inside cached snapshots', () => {
    expect(
      replaceCurrentUserAvatarInSnapshot(
        snapshot(),
        'avatars/user-a/next.jpg',
        '2026-05-06T00:00:00.000Z',
      ).currentUserProfile?.avatarUrl,
    ).toBe('avatars/user-a/next.jpg');
  });

  it('restores cached snapshots by user id and schema version', async () => {
    sqliteMocks.database.getFirstAsync.mockResolvedValueOnce({
      avatar_signed_urls_json: '{}',
      snapshot_json: serializeCachedSnapshotPayload(snapshot()),
      updated_at: '2026-05-06T00:00:00.000Z',
    });

    await expect(readCachedAppSnapshot('user-a')).resolves.toMatchObject({
      updatedAt: '2026-05-06T00:00:00.000Z',
    });
    expect(sqliteMocks.database.getFirstAsync).toHaveBeenCalledWith(
      expect.any(String),
      'user-a',
      2,
    );
  });
});
