import { describe, expect, it } from 'vitest';

import { buildPeopleOverview, buildPeopleOverviewFromAppSnapshot } from './build-people-overview';
import type { AppSnapshot, PeopleOverviewRows } from './types';

const FETCHED_AT = '2026-06-25T15:00:00.000Z';

describe('buildPeopleOverview', () => {
  it('normalizes database values and sorts actionable people first', () => {
    const rows: PeopleOverviewRows = {
      avatarSignedUrlsByPath: {},
      fetchedAt: FETCHED_AT,
      people: [
        {
          avatar_path: null,
          avatar_updated_at: null,
          direction: 'settled',
          display_name: 'Bea',
          last_activity_at: null,
          net_amount_minor: '0',
          pending_count: 0,
          user_id: 'user-bea',
        },
        {
          avatar_path: 'avatars/user-ana/current.jpg',
          avatar_updated_at: FETCHED_AT,
          direction: 'owes_me',
          display_name: 'Ana',
          last_activity_at: '2026-06-25T14:00:00.000Z',
          net_amount_minor: '125000',
          pending_count: 2,
          user_id: 'user-ana',
        },
      ],
    };

    expect(buildPeopleOverview(rows)).toEqual({
      fetchedAt: FETCHED_AT,
      people: [
        {
          avatarUrl: 'avatars/user-ana/current.jpg',
          direction: 'owes_me',
          displayName: 'Ana',
          lastActivityLabel: 'Último movimiento hace 1 h',
          netAmountMinor: 125000,
          pendingCount: 2,
          userId: 'user-ana',
        },
        {
          avatarUrl: null,
          direction: 'settled',
          displayName: 'Bea',
          lastActivityLabel: 'Sin movimientos todavía',
          netAmountMinor: 0,
          pendingCount: 0,
          userId: 'user-bea',
        },
      ],
    });
  });

  it('derives the compact overview from the full snapshot without rebuilding people', () => {
    const people = [
      {
        direction: 'settled' as const,
        displayName: 'Ana',
        lastActivityLabel: 'Sin movimientos todavía',
        netAmountMinor: 0,
        pendingCount: 0,
        userId: 'user-ana',
      },
    ];
    const snapshot = { people } as unknown as AppSnapshot;

    expect(buildPeopleOverviewFromAppSnapshot(snapshot, FETCHED_AT)).toEqual({
      fetchedAt: FETCHED_AT,
      people,
    });
  });
});
