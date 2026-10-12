import type { ActivityItemDto, PendingRequestHistoryStepDto } from '@happy-circles/application';
import type { AppSnapshot, FinancialRequestRow } from './types';
import type { HistorySyncState } from './history-sync';
import {
  buildPendingFinancialRequestItems,
  buildPersonPendingRequest,
  buildPersonTimeline,
} from './builders/financial-requests';
import { buildActivityHistoryItems } from '../history-cases';
import { buildActivitySections } from './presentation';
import { notificationItemCanAlert, notificationViewKeyForItem } from './builders/notifications';
import { sortHistoryItems, sortPeople } from './utils/sorting';

const STATUSES = new Set(['pending', 'accepted', 'rejected', 'amended', 'canceled', 'expired']);

export function authoritativeRows(response: unknown, userId: string): FinancialRequestRow[] {
  if (!response || typeof response !== 'object' || !('financialRequests' in response)) return [];
  if (!Array.isArray(response.financialRequests)) return [];
  return response.financialRequests.filter((value: unknown): value is FinancialRequestRow => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const row = value as Record<string, unknown>;
    return (
      typeof row.id === 'string' &&
      row.id.length > 0 &&
      typeof row.relationship_id === 'string' &&
      typeof row.status === 'string' &&
      STATUSES.has(row.status) &&
      typeof row.updated_at === 'string' &&
      Number.isFinite(Date.parse(row.updated_at)) &&
      typeof row.created_at === 'string' &&
      Number.isFinite(Date.parse(row.created_at)) &&
      typeof row.amount_minor === 'number' &&
      Number.isSafeInteger(row.amount_minor) &&
      row.amount_minor > 0 &&
      [
        row.creator_user_id,
        row.responder_user_id,
        row.debtor_user_id,
        row.creditor_user_id,
      ].includes(userId)
    );
  });
}

function mergeById<T extends { readonly id: string }>(
  before: readonly T[],
  after: readonly T[],
): T[] {
  return [...new Map([...before, ...after].map((value) => [value.id, value])).values()];
}

export function applicableDerivedRows(
  snapshot: AppSnapshot,
  incoming: readonly FinancialRequestRow[],
): FinancialRequestRow[] {
  const people = Object.values(snapshot.peopleById);
  return incoming.filter(
    (row) =>
      !people.some(
        (person) =>
          person.timeline.some(
            (event) =>
              event.id.startsWith(row.id + ':') &&
              event.status !== 'pending' &&
              (row.status === 'pending' ||
                Date.parse(event.happenedAt ?? '') > Date.parse(row.updated_at)),
          ) ||
          (row.status === 'pending' &&
            person.pendingItems.some((item) =>
              item.pendingHistorySteps?.some(
                (step) => step.id === row.id && step.status !== 'pending',
              ),
            )),
      ),
  );
}

/** Rebuild the confirmed request portions of a legacy snapshot, preserving other domains. */
export function reconcileDerivedSnapshot(
  userId: string,
  snapshot: AppSnapshot,
  incoming: readonly FinancialRequestRow[],
): AppSnapshot {
  const rows = applicableDerivedRows(snapshot, incoming);
  const affected = new Set(rows.map((row) => row.id));
  const remove = (item: { readonly id: string; readonly kind: string }) =>
    item.kind === 'financial_request' && affected.has(item.id);
  const names = new Map(snapshot.people.map((person) => [person.userId, person.displayName]));
  names.set(userId, 'Tú');
  const nowMs = Date.now();
  const byId = new Map(rows.map((row) => [row.id, row]));
  const counterparties = new Map(
    rows.flatMap((row) => {
      const counterpart =
        row.creator_user_id === userId ? row.responder_user_id : row.creator_user_id;
      const person = snapshot.peopleById[counterpart];
      return person
        ? [
            [
              row.relationship_id,
              { userId: person.userId, displayName: person.displayName },
            ] as const,
          ]
        : [];
    }),
  );
  const generated = buildPendingFinancialRequestItems({
    financialRequests: rows,
    financialRequestsById: byId,
    counterpartyByRelationshipId: counterparties,
    currentUserId: userId,
    names,
    nowMs,
  });
  const peopleById = Object.fromEntries(
    Object.entries(snapshot.peopleById).map(([id, person]) => {
      const related = rows.filter(
        (row) => row.creator_user_id === id || row.responder_user_id === id,
      );
      const currentItems = generated
        .filter((item) => counterparties.get(byId.get(item.id)!.relationship_id)?.userId === id)
        .map((item) => {
          const request = byId.get(item.id)!;
          const previous = person.pendingItems.find(
            (old) => old.id === request.parent_request_id || old.id === item.id,
          );
          const steps = mergeById<PendingRequestHistoryStepDto>(
            previous?.pendingHistorySteps ?? [],
            item.pendingHistorySteps ?? [],
          ).map((step) => ({
            ...step,
            status: byId.get(step.id)?.status ?? step.status,
            isCurrent: step.id === item.id,
          }));
          return { ...item, pendingHistorySteps: steps };
        });
      const pendingItems = [
        ...person.pendingItems.filter((item) => !remove(item)),
        ...currentItems,
      ];
      const pending = related
        .filter((row) => row.status === 'pending')
        .sort(
          (a, b) =>
            (b.version_number ?? 0) - (a.version_number ?? 0) ||
            Date.parse(b.created_at) - Date.parse(a.created_at),
        )[0];
      const timeline = sortHistoryItems(
        mergeById(
          person.timeline,
          buildPersonTimeline({
            requests: related,
            historyRows: [],
            currentUserId: userId,
            counterpartyName: person.displayName,
            names,
            nowMs,
          }),
        ),
      );
      return [
        id,
        {
          ...person,
          pendingItems,
          pendingCount: pendingItems.length,
          timeline,
          pendingRequest: pending
            ? buildPersonPendingRequest({
                request: pending,
                currentUserId: userId,
                counterpartyName: person.displayName,
                names,
                nowMs,
              })
            : person.pendingRequest && !affected.has(person.pendingRequest.id)
              ? person.pendingRequest
              : undefined,
        },
      ];
    }),
  );
  const previousPending =
    snapshot.activitySections.find((section) => section.key === 'pending')?.items ?? [];
  const generatedById = new Map(
    Object.values(peopleById)
      .flatMap((person) => person.pendingItems)
      .filter((item) => affected.has(item.id))
      .map((item) => [item.id, item]),
  );
  const pendingItems: ActivityItemDto[] = [
    ...previousPending.filter((item) => !remove(item)),
    ...generatedById.values(),
  ];
  const previousHistory =
    snapshot.activitySections.find((section) => section.key === 'history')?.items ?? [];
  const historyItems = sortHistoryItems(
    mergeById(previousHistory, buildActivityHistoryItems(peopleById)),
  );
  const notificationViewedKeys = new Set(snapshot.notificationViewedKeys);
  for (const item of pendingItems)
    if (!notificationItemCanAlert(item))
      notificationViewedKeys.add(notificationViewKeyForItem(item));
  const updateCards = (cards: AppSnapshot['people']) =>
    cards
      .map((card) => ({
        ...card,
        pendingCount: peopleById[card.userId]?.pendingCount ?? card.pendingCount,
      }))
      .sort(sortPeople);
  const top = generated[0];
  const existingTop = snapshot.dashboard.topPendingPreview;
  return {
    ...snapshot,
    peopleById,
    people: updateCards(snapshot.people),
    activitySections: buildActivitySections({ pendingItems, historyItems }),
    pendingCount: pendingItems.length,
    notificationViewedKeys,
    notificationUnreadCount: pendingItems.filter(
      (item) =>
        notificationItemCanAlert(item) &&
        !notificationViewedKeys.has(notificationViewKeyForItem(item)),
    ).length,
    dashboard: {
      ...snapshot.dashboard,
      urgentCount: pendingItems.length,
      activePeople: updateCards(snapshot.dashboard.activePeople),
      topPendingPreview: existingTop && !remove(existingTop) ? existingTop : (top ?? null),
    },
  };
}

function olderThan(incoming: FinancialRequestRow, current: FinancialRequestRow): boolean {
  return (
    (incoming.status === 'pending' && current.status !== 'pending') ||
    Date.parse(incoming.updated_at) < Date.parse(current.updated_at) ||
    (incoming.version_number ?? 0) < (current.version_number ?? 0)
  );
}

export function mergeConfirmedRows(
  before: readonly FinancialRequestRow[],
  after: readonly FinancialRequestRow[],
): FinancialRequestRow[] {
  const byId = new Map<string, FinancialRequestRow>();
  for (const row of [...before, ...after]) {
    const previous = byId.get(row.id);
    if (!previous || !olderThan(row, previous)) byId.set(row.id, row);
  }
  const maximum = new Map<string, number>();
  for (const row of byId.values())
    if (row.request_case_id)
      maximum.set(
        row.request_case_id,
        Math.max(maximum.get(row.request_case_id) ?? 0, row.version_number ?? 0),
      );
  return [...byId.values()].filter(
    (row) =>
      row.status !== 'pending' ||
      !row.request_case_id ||
      (row.version_number ?? 0) >= (maximum.get(row.request_case_id) ?? 0),
  );
}

export function reconcile(
  state: HistorySyncState,
  incoming: readonly FinancialRequestRow[],
): HistorySyncState {
  const known = new Map<string, FinancialRequestRow>();
  for (const row of Object.values(state.collections.financialRequests)) {
    known.set(String(row.id), row as unknown as FinancialRequestRow);
  }
  for (const row of state.liveRows?.financialRequests ?? []) {
    const current = known.get(row.id);
    if (!current || !olderThan(row, current)) known.set(row.id, row);
  }
  const latestVersion = new Map<string, number>();
  for (const row of known.values()) {
    if (row.request_case_id) {
      latestVersion.set(
        row.request_case_id,
        Math.max(latestVersion.get(row.request_case_id) ?? 0, row.version_number ?? 0),
      );
    }
  }
  const accepted = incoming.filter((row) => {
    const current = known.get(row.id);
    return (
      !(current && olderThan(row, current)) &&
      !(
        row.status === 'pending' &&
        row.request_case_id &&
        (row.version_number ?? 0) < (latestVersion.get(row.request_case_id) ?? 0)
      )
    );
  });
  const financialRequests = { ...state.collections.financialRequests };
  for (const row of accepted) {
    known.set(row.id, row);
    if (row.status !== 'pending') financialRequests[row.id] = row;
    else delete financialRequests[row.id];
  }
  const affected = new Set(accepted.map((row) => row.id));
  return {
    ...state,
    collections: { ...state.collections, financialRequests },
    ...(state.liveRows
      ? {
          liveRows: {
            ...state.liveRows,
            fetchedAt: new Date(
              Math.max(
                Date.parse(state.liveRows.fetchedAt),
                ...accepted.map((row) => Date.parse(row.updated_at)),
              ),
            ).toISOString(),
            financialRequests: [...known.values()],
            history: state.liveRows.history.filter(
              (row) => row.item_kind !== 'financial_request' || !affected.has(row.item_id),
            ),
            inboxItems: state.liveRows.inboxItems.filter(
              (row) => row.item_kind !== 'financial_request' || !affected.has(row.item_id),
            ),
          },
        }
      : {}),
  };
}
