import type { ActivityItemDto, PersonCardDto } from '@happy-circles/application';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  Platform: {
    OS: 'web',
    select: (options: Record<string, unknown>) => options.web ?? options.default,
  },
}));

import { queryClient } from '@/lib/query-client';
import { APP_SNAPSHOT_QUERY_KEY, PEOPLE_OVERVIEW_QUERY_KEY } from '../constants';
import { buildActivitySections } from '../presentation';
import type { AppSnapshot, CreateRequestInput, PeopleOverview } from '../types';
import { confirmCreatedRequestInCache } from './confirmed-request-cache';

const userId = 'actor-a';
const personId = 'person-a';
const requestId = 'request-confirmed';
const snapshotKey = [APP_SNAPSHOT_QUERY_KEY, userId];
const overviewKey = [PEOPLE_OVERVIEW_QUERY_KEY, userId];
const response = { requestId, status: 'pending' };
const input: CreateRequestInput = {
  responderUserId: personId,
  debtorUserId: personId,
  creditorUserId: userId,
  amountMinor: 25_000,
  description: 'Cena',
  category: 'food_drinks',
};

function card(): PersonCardDto {
  return {
    userId: personId,
    displayName: 'Ana',
    direction: 'owes_me',
    netAmountMinor: 15_000,
    pendingCount: 0,
    lastActivityLabel: 'Sin movimientos pendientes',
  };
}

function snapshot(): AppSnapshot {
  const person = card();
  return {
    people: [person],
    peopleById: {
      [personId]: {
        ...person,
        headline: 'Ana te debe',
        pendingItems: [],
        timeline: [],
      },
    },
    dashboard: {
      activePeople: [person],
      summary: { netBalanceMinor: 15_000, totalIOweMinor: 0, totalOwedToMeMinor: 15_000 },
      urgentCount: 0,
      topPendingPreview: null,
    },
    balanceOverview: {} as AppSnapshot['balanceOverview'],
    balanceAnalytics: {} as AppSnapshot['balanceAnalytics'],
    currentUserProfile: { displayName: 'Samuel', avatarUrl: null, email: 'samuel@example.com' },
    happyCircleScore: {
      totalFaces: 0,
      closedCircleCount: 0,
      claimableAwards: [],
      recentAwards: [],
      latestAward: null,
    },
    friendshipPendingItems: [],
    friendshipHistoryItems: [],
    friendshipSummary: {
      historyCount: 0,
      requiresResponseCount: 0,
      requiresReviewCount: 0,
      sentOutsideCount: 0,
      waitingSenderReviewCount: 0,
    },
    accountInvitePendingItems: [],
    accountInviteHistoryItems: [],
    accountInviteSummary: {
      historyCount: 0,
      pendingActivationCount: 0,
      requiresReviewCount: 0,
      waitingInviterReviewCount: 0,
    },
    activitySections: buildActivitySections({ pendingItems: [], historyItems: [] }),
    notificationUnreadCount: 0,
    notificationViewedKeys: new Set(),
    pendingCount: 0,
    auditEvents: [],
    settlementsById: {},
  };
}

function seed(data = snapshot()) {
  queryClient.setQueryData(snapshotKey, data);
  queryClient.setQueryData<PeopleOverview>(overviewKey, {
    fetchedAt: '2026-10-09T00:00:00.000Z',
    people: data.people,
  });
  return data;
}

function readSnapshot() {
  return queryClient.getQueryData<AppSnapshot>(snapshotKey)!;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('server-confirmed request cache', () => {
  beforeEach(() => queryClient.clear());
  afterEach(() => {
    vi.restoreAllMocks();
    queryClient.clear();
  });

  it('shows the confirmed proposal and consistent counts synchronously without changing balances', () => {
    const before = seed();
    expect(confirmCreatedRequestInCache(userId, input, response)).toBeUndefined();
    const updated = readSnapshot();
    const person = updated.peopleById[personId];
    expect(person.pendingItems).toHaveLength(1);
    expect(person.pendingItems[0]).toMatchObject({
      id: requestId,
      kind: 'financial_request',
      status: 'waiting_other_side',
      title: 'Entrada propuesta',
      subtitle: 'Tú | Cena | hace un momento',
      amountMinor: 25_000,
      category: 'food_drinks',
      tone: 'positive',
      createdByCurrentUser: true,
    });
    expect(person.pendingRequest).toMatchObject({
      id: requestId,
      responseState: 'waiting_other_side',
    });
    expect(person.pendingCount).toBe(1);
    expect(updated.people[0].pendingCount).toBe(1);
    expect(updated.dashboard.activePeople[0].pendingCount).toBe(1);
    expect(updated.dashboard.urgentCount).toBe(1);
    expect(updated.pendingCount).toBe(1);
    expect(updated.activitySections[0].items.map((item) => item.id)).toEqual([requestId]);
    expect(updated.dashboard.topPendingPreview?.id).toBe(requestId);
    expect(queryClient.getQueryData<PeopleOverview>(overviewKey)?.people[0].pendingCount).toBe(1);
    expect(person.netAmountMinor).toBe(before.peopleById[personId].netAmountMinor);
    expect(person.direction).toBe(before.peopleById[personId].direction);
    expect(updated.dashboard.summary).toBe(before.dashboard.summary);
    expect(updated.balanceOverview).toBe(before.balanceOverview);
    expect(updated.balanceAnalytics).toBe(before.balanceAnalytics);
    expect(updated.notificationUnreadCount).toBe(before.notificationUnreadCount);
    expect(updated.notificationViewedKeys).toBe(before.notificationViewedKeys);
    expect(before.peopleById[personId].pendingItems).toEqual([]);
  });

  it('represents an outgoing proposal with the default category and keeps the existing balance', () => {
    seed();
    confirmCreatedRequestInCache(
      userId,
      {
        ...input,
        debtorUserId: userId,
        creditorUserId: personId,
        category: undefined,
      },
      response,
    );
    expect(readSnapshot().peopleById[personId].pendingItems[0]).toMatchObject({
      title: 'Salida propuesta',
      tone: 'negative',
      category: 'other',
    });
    expect(readSnapshot().peopleById[personId].netAmountMinor).toBe(15_000);
  });

  it('replaces the all-clear headline when a zero-balance person now has a pending proposal', () => {
    const initial = snapshot();
    seed({
      ...initial,
      peopleById: {
        [personId]: {
          ...initial.peopleById[personId],
          netAmountMinor: 0,
          direction: 'settled',
          headline: 'Con Ana están al día',
          supportText: 'Sin movimientos todavía',
        },
      },
    });
    confirmCreatedRequestInCache(userId, input, response);
    expect(readSnapshot().peopleById[personId]).toMatchObject({
      headline: '1 pendiente por resolver con Ana',
      supportText: 'Tienes 1 pendiente con Ana.',
      netAmountMinor: 0,
      direction: 'settled',
    });
  });

  it('keeps people cards ordered by pending count without changing other people', () => {
    const initial = snapshot();
    const other = { ...card(), userId: 'person-b', displayName: 'Beto', netAmountMinor: 100_000 };
    const people = [other, ...initial.people];
    seed({ ...initial, people, dashboard: { ...initial.dashboard, activePeople: people } });
    confirmCreatedRequestInCache(userId, input, response);
    expect(readSnapshot().people.map((person) => person.userId)).toEqual([personId, 'person-b']);
    expect(readSnapshot().dashboard.activePeople.map((person) => person.userId)).toEqual([
      personId,
      'person-b',
    ]);
    expect(
      queryClient.getQueryData<PeopleOverview>(overviewKey)?.people.map((person) => person.userId),
    ).toEqual([personId, 'person-b']);
    expect(readSnapshot().people[1]).toEqual(other);
  });

  it('does not duplicate a confirmed request or increment counts on the same response again', () => {
    seed();
    confirmCreatedRequestInCache(userId, input, response);
    confirmCreatedRequestInCache(userId, input, response);
    expect(readSnapshot().peopleById[personId].pendingItems).toHaveLength(1);
    expect(readSnapshot().pendingCount).toBe(1);
    expect(readSnapshot().people[0].pendingCount).toBe(1);
    expect(queryClient.getQueryData<PeopleOverview>(overviewKey)?.people[0].pendingCount).toBe(1);
  });

  it.each(['accepted', 'rejected', 'canceled', 'expired', 'amended'])(
    'never reopens a request already resolved as %s in the timeline',
    (status) => {
      const initial = snapshot();
      const before: AppSnapshot = {
        ...initial,
        peopleById: {
          [personId]: {
            ...initial.peopleById[personId],
            timeline: [
              {
                id: `${requestId}:resolved`,
                originRequestId: requestId,
                title: 'Resuelto',
                subtitle: '',
                amountMinor: 25_000,
                tone: 'neutral',
                kind: 'request',
                status,
                sourceType: 'user',
                sourceLabel: 'Persona',
              },
            ],
          },
        },
      };
      seed(before);
      confirmCreatedRequestInCache(userId, input, response);
      expect(readSnapshot().peopleById[personId].pendingItems).toEqual([]);
      expect(readSnapshot().pendingCount).toBe(0);
      expect(queryClient.getQueryData<PeopleOverview>(overviewKey)?.people[0].pendingCount).toBe(0);
    },
  );

  it('keeps higher-priority circles first and does not replace their dashboard preview', () => {
    const before = snapshot();
    const circle: ActivityItemDto = {
      id: 'circle-1',
      kind: 'settlement_proposal',
      title: 'Circle',
      subtitle: '',
      status: 'approved',
    };
    const data = {
      ...before,
      pendingCount: 1,
      activitySections: buildActivitySections({ pendingItems: [circle], historyItems: [] }),
      dashboard: {
        ...before.dashboard,
        urgentCount: 1,
        topPendingPreview: {
          ...circle,
          kind: 'settlement_proposal' as const,
          ctaLabel: 'Completar',
          href: '/circles',
        },
      },
    };
    seed(data);
    confirmCreatedRequestInCache(userId, input, response);
    expect(readSnapshot().activitySections[0].items.map((item) => item.id)).toEqual([
      'circle-1',
      requestId,
    ]);
    expect(readSnapshot().dashboard.topPendingPreview?.id).toBe('circle-1');
    expect(readSnapshot().pendingCount).toBe(2);
    expect(readSnapshot().dashboard.urgentCount).toBe(2);
  });

  it('changes only the actor-scoped cache and cancels only its queries', () => {
    seed();
    const otherSnapshotKey = [APP_SNAPSHOT_QUERY_KEY, 'actor-b'];
    const otherOverviewKey = [PEOPLE_OVERVIEW_QUERY_KEY, 'actor-b'];
    queryClient.setQueryData(otherSnapshotKey, snapshot());
    queryClient.setQueryData(otherOverviewKey, { fetchedAt: '', people: [card()] });
    const otherSnapshot = queryClient.getQueryData(otherSnapshotKey);
    const otherOverview = queryClient.getQueryData(otherOverviewKey);
    const cancel = vi.spyOn(queryClient, 'cancelQueries');
    confirmCreatedRequestInCache(userId, input, response);
    expect(queryClient.getQueryData(otherSnapshotKey)).toBe(otherSnapshot);
    expect(queryClient.getQueryData(otherOverviewKey)).toBe(otherOverview);
    expect(cancel.mock.calls).toEqual([
      [{ queryKey: snapshotKey, exact: true }],
      [{ queryKey: overviewKey, exact: true }],
    ]);
  });

  it('does not create empty snapshot or overview entries or add an unknown person', () => {
    confirmCreatedRequestInCache(userId, input, response);
    expect(queryClient.getQueryData(snapshotKey)).toBeUndefined();
    expect(queryClient.getQueryData(overviewKey)).toBeUndefined();
    queryClient.setQueryData(snapshotKey, { ...snapshot(), peopleById: {} });
    confirmCreatedRequestInCache(userId, input, response);
    expect(readSnapshot().peopleById).toEqual({});
  });

  it('patches an existing snapshot without creating a missing overview cache', () => {
    queryClient.setQueryData(snapshotKey, snapshot());
    confirmCreatedRequestInCache(userId, input, response);
    expect(readSnapshot().pendingCount).toBe(1);
    expect(queryClient.getQueryData(overviewKey)).toBeUndefined();
  });

  it('does not reopen a request resolved in the activity history even if its timeline was trimmed', () => {
    const initial = snapshot();
    seed({
      ...initial,
      activitySections: buildActivitySections({
        pendingItems: [],
        historyItems: [
          {
            id: 'resolution-event',
            originRequestId: requestId,
            kind: 'accepted_request',
            title: 'Aceptado',
            subtitle: '',
            status: 'accepted',
          },
        ],
      }),
    });
    confirmCreatedRequestInCache(userId, input, response);
    expect(readSnapshot().peopleById[personId].pendingItems).toEqual([]);
    expect(readSnapshot().pendingCount).toBe(0);
  });

  it.each([null, {}, { requestId, status: 'accepted' }, { requestId: '', status: 'pending' }])(
    'requires a pending confirmation with an id before changing cache: %j',
    (result) => {
      seed();
      confirmCreatedRequestInCache(userId, input, result);
      expect(readSnapshot().pendingCount).toBe(0);
      expect(readSnapshot().peopleById[personId].pendingItems).toEqual([]);
    },
  );

  it('does not apply another actor or an unrelated counterparty to this cache', () => {
    seed();
    confirmCreatedRequestInCache(userId, { ...input, creditorUserId: 'actor-b' }, response);
    confirmCreatedRequestInCache(userId, { ...input, responderUserId: 'unrelated' }, response);
    expect(readSnapshot().pendingCount).toBe(0);
  });

  it('prevents in-flight stale snapshot and overview responses from overwriting the confirmed proposal', async () => {
    seed();
    const staleSnapshot = deferred<AppSnapshot>();
    const staleOverview = deferred<PeopleOverview>();
    const snapshotFetch = queryClient
      .fetchQuery({
        queryKey: snapshotKey,
        staleTime: 0,
        queryFn: () => staleSnapshot.promise,
      })
      .catch(() => undefined);
    const overviewFetch = queryClient
      .fetchQuery({
        queryKey: overviewKey,
        staleTime: 0,
        queryFn: () => staleOverview.promise,
      })
      .catch(() => undefined);
    confirmCreatedRequestInCache(userId, input, response);
    expect(readSnapshot().peopleById[personId].pendingItems[0].id).toBe(requestId);
    staleSnapshot.resolve(snapshot());
    staleOverview.resolve({ fetchedAt: '', people: [card()] });
    await Promise.all([snapshotFetch, overviewFetch]);
    expect(readSnapshot().peopleById[personId].pendingItems[0].id).toBe(requestId);
    expect(queryClient.getQueryData<PeopleOverview>(overviewKey)?.people[0].pendingCount).toBe(1);
  });

  it('retains confirmed cache when the following snapshot refresh fails', async () => {
    seed();
    confirmCreatedRequestInCache(userId, input, response);
    await expect(
      queryClient.fetchQuery({
        queryKey: snapshotKey,
        staleTime: 0,
        retry: false,
        queryFn: () => Promise.reject(new Error('offline')),
      }),
    ).rejects.toThrow('offline');
    expect(readSnapshot().peopleById[personId].pendingItems[0].id).toBe(requestId);
  });

  it('never throws cache or cancellation failures back into a successful submit', async () => {
    seed();
    vi.spyOn(queryClient, 'cancelQueries').mockRejectedValue(new Error('cancel failed'));
    expect(() => confirmCreatedRequestInCache(userId, input, response)).not.toThrow();
    expect(readSnapshot().pendingCount).toBe(1);
    await Promise.resolve();
    vi.spyOn(queryClient, 'setQueryData').mockImplementationOnce(() => {
      throw new Error('cache failed');
    });
    expect(() =>
      confirmCreatedRequestInCache(userId, input, { ...response, requestId: 'request-2' }),
    ).not.toThrow();
  });
});
