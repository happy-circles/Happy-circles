import type { ActivityItemDto, PersonCardDto } from '@happy-circles/application';

import { queryClient } from '@/lib/query-client';
import { DEFAULT_TRANSACTION_CATEGORY } from '../../transaction-categories';
import { APP_SNAPSHOT_QUERY_KEY, PEOPLE_OVERVIEW_QUERY_KEY } from '../constants';
import { buildActivitySections, LIVE_DATA_CTA, LIVE_DATA_ROUTES } from '../presentation';
import type { AppSnapshot, CreateRequestInput, PeopleOverview } from '../types';
import { sortPeople } from '../utils/sorting';

const RESOLVED_REQUEST_STATUSES = new Set([
  'accepted',
  'rejected',
  'canceled',
  'expired',
  'amended',
]);

function confirmedPendingRequestId(response: unknown): string | null {
  if (!response || typeof response !== 'object' || Array.isArray(response)) return null;
  const { requestId, status } = response as Record<string, unknown>;
  return status === 'pending' && typeof requestId === 'string' && requestId.trim().length > 0
    ? requestId
    : null;
}

function referencesRequest(
  item: { readonly id: string; readonly originRequestId?: string | null },
  requestId: string,
): boolean {
  return (
    item.id === requestId ||
    item.originRequestId === requestId ||
    item.id.startsWith(`${requestId}:`)
  );
}

function updateCards(
  cards: readonly PersonCardDto[],
  personId: string,
  pendingCount: number,
): readonly PersonCardDto[] {
  return cards
    .map((card) =>
      card.userId === personId
        ? { ...card, pendingCount, lastActivityLabel: 'Propuesta pendiente hace un momento' }
        : card,
    )
    .sort(sortPeople);
}

/** Publish a server-confirmed proposal without waiting for the full snapshot refresh. */
export function confirmCreatedRequestInCache(
  userId: string,
  input: CreateRequestInput,
  response: unknown,
): void {
  try {
    const requestId = confirmedPendingRequestId(response);
    const personId = input.responderUserId;
    if (
      !requestId ||
      personId === userId ||
      !(
        (input.debtorUserId === userId && input.creditorUserId === personId) ||
        (input.creditorUserId === userId && input.debtorUserId === personId)
      )
    ) {
      return;
    }

    const snapshotKey = [APP_SNAPSHOT_QUERY_KEY, userId] as const;
    const overviewKey = [PEOPLE_OVERVIEW_QUERY_KEY, userId] as const;
    if (!queryClient.getQueryData<AppSnapshot>(snapshotKey)?.peopleById[personId]) return;

    // cancelQueries aborts and reverts existing fetches synchronously; no network wait is needed.
    void queryClient.cancelQueries({ queryKey: snapshotKey, exact: true }).catch(() => undefined);
    void queryClient.cancelQueries({ queryKey: overviewKey, exact: true }).catch(() => undefined);

    let confirmedPendingCount: number | null = null;
    queryClient.setQueryData<AppSnapshot>(snapshotKey, (snapshot) => {
      const person = snapshot?.peopleById[personId];
      if (!snapshot || !person) return snapshot;
      if (
        person.pendingItems.some((item) => referencesRequest(item, requestId)) ||
        person.timeline.some(
          (item) =>
            referencesRequest(item, requestId) && RESOLVED_REQUEST_STATUSES.has(item.status),
        ) ||
        snapshot.activitySections.some(
          (section) =>
            section.key === 'history' &&
            section.items.some(
              (item) =>
                referencesRequest(item, requestId) && RESOLVED_REQUEST_STATUSES.has(item.status),
            ),
        )
      ) {
        return snapshot;
      }

      const description = input.description.trim() || 'Sin descripcion';
      const category = input.category ?? DEFAULT_TRANSACTION_CATEGORY;
      const tone = input.creditorUserId === userId ? 'positive' : 'negative';
      const item: ActivityItemDto = {
        id: requestId,
        kind: 'financial_request',
        title: tone === 'positive' ? 'Entrada propuesta' : 'Salida propuesta',
        subtitle: `Tú | ${description} | hace un momento`,
        status: 'waiting_other_side',
        amountMinor: input.amountMinor,
        category,
        tone,
        href: LIVE_DATA_ROUTES.person(personId),
        counterpartyLabel: person.displayName,
        createdByCurrentUser: true,
        pendingHistorySteps: [
          {
            id: requestId,
            title: 'Propuesta actual',
            description,
            amountMinor: input.amountMinor,
            category,
            createdAtLabel: 'hace un momento',
            createdByLabel: 'Tú',
            status: 'pending',
            isCurrent: true,
          },
        ],
      };
      const pendingSection = snapshot.activitySections.find((section) => section.key === 'pending');
      const alreadyInActivity = pendingSection?.items.some((entry) =>
        referencesRequest(entry, requestId),
      );
      const activityItems = [...(pendingSection?.items ?? [])];
      if (!alreadyInActivity) {
        const insertionIndex = activityItems.findIndex(
          (entry) => entry.kind !== 'settlement_proposal',
        );
        activityItems.splice(insertionIndex < 0 ? activityItems.length : insertionIndex, 0, item);
      }
      const activitySections = pendingSection
        ? snapshot.activitySections.map((section) =>
            section.key === 'pending' ? { ...section, items: activityItems } : section,
          )
        : [
            buildActivitySections({ pendingItems: activityItems, historyItems: [] })[0],
            ...snapshot.activitySections,
          ];
      confirmedPendingCount = person.pendingCount + 1;
      const pendingLabel = `${confirmedPendingCount} pendiente${confirmedPendingCount > 1 ? 's' : ''}`;
      const globalCountDelta = alreadyInActivity ? 0 : 1;
      const firstActivityItem = activityItems[0];

      return {
        ...snapshot,
        peopleById: {
          ...snapshot.peopleById,
          [personId]: {
            ...person,
            pendingCount: confirmedPendingCount,
            headline:
              person.netAmountMinor === 0
                ? `${pendingLabel} por resolver con ${person.displayName}`
                : person.headline,
            supportText: `Tienes ${pendingLabel} con ${person.displayName}.`,
            pendingItems: [item, ...person.pendingItems],
            pendingRequest: {
              id: requestId,
              requestKind: 'balance_increase',
              responseState: 'waiting_other_side',
              tone,
              title: item.title,
              description,
              category,
              amountMinor: input.amountMinor,
              createdAtLabel: 'hace un momento',
              createdByLabel: 'Tú',
            },
          },
        },
        people: updateCards(snapshot.people, personId, confirmedPendingCount),
        dashboard: {
          ...snapshot.dashboard,
          urgentCount: snapshot.dashboard.urgentCount + globalCountDelta,
          activePeople: updateCards(
            snapshot.dashboard.activePeople,
            personId,
            confirmedPendingCount,
          ),
          topPendingPreview:
            firstActivityItem.id === requestId
              ? {
                  ...item,
                  kind: 'financial_request',
                  ctaLabel: LIVE_DATA_CTA.respond,
                  href: item.href!,
                }
              : snapshot.dashboard.topPendingPreview,
        },
        activitySections,
        pendingCount: snapshot.pendingCount + globalCountDelta,
      };
    });

    if (confirmedPendingCount !== null) {
      const pendingCount = confirmedPendingCount;
      queryClient.setQueryData<PeopleOverview>(overviewKey, (overview) =>
        overview
          ? { ...overview, people: updateCards(overview.people, personId, pendingCount) }
          : overview,
      );
    }
  } catch {
    // Cache/observer failures must not turn a successfully created movement into a failed submit.
  }
}
