import type { AppSnapshot, FinancialRequestRow } from './types';
import { notificationItemCanAlert, notificationViewKeyForItem } from './builders/notifications';
import { sortPeople } from './utils/sorting';

export interface ConfirmedRequestOutcome {
  readonly requestId: string;
  readonly status: 'accepted' | 'rejected' | 'canceled' | 'amended';
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Rows must already have passed authoritativeRows' actor and field validation. */
export function outcomesForConfirmedRows(
  rows: readonly FinancialRequestRow[],
): ConfirmedRequestOutcome[] {
  return rows.flatMap((row) =>
    UUID.test(row.id) &&
    (row.status === 'accepted' ||
      row.status === 'rejected' ||
      row.status === 'canceled' ||
      row.status === 'amended')
      ? [{ requestId: row.id, status: row.status }]
      : [],
  );
}

/** Read only after the authenticated RPC succeeded, never from a local intention. */
export function readConfirmedRequestOutcomes(response: unknown): ConfirmedRequestOutcome[] {
  if (!response || typeof response !== 'object' || Array.isArray(response)) return [];
  const ack = response as Record<string, unknown>;
  if (
    typeof ack.requestId === 'string' &&
    UUID.test(ack.requestId) &&
    (ack.status === 'accepted' || ack.status === 'rejected' || ack.status === 'canceled')
  )
    return [{ requestId: ack.requestId, status: ack.status }];
  const child = ack.amendedRequestId ?? ack.correctedRequestId;
  if (
    ack.status === 'pending' &&
    typeof ack.originalRequestId === 'string' &&
    UUID.test(ack.originalRequestId) &&
    typeof child === 'string' &&
    UUID.test(child) &&
    ack.originalRequestId !== child
  )
    return [{ requestId: ack.originalRequestId, status: 'amended' }];
  return [];
}

export function mergeConfirmedRequestOutcomes(
  before: readonly ConfirmedRequestOutcome[],
  after: readonly ConfirmedRequestOutcome[],
): ConfirmedRequestOutcome[] {
  return [
    ...new Map([...before, ...after].map((outcome) => [outcome.requestId, outcome])).values(),
  ];
}

/** Hide only the exact closed pending version; retain all history and confirmed balances. */
export function suppressConfirmedRequestOutcomes(
  snapshot: AppSnapshot,
  outcomes: readonly ConfirmedRequestOutcome[],
): AppSnapshot {
  if (!outcomes.length) return snapshot;
  const ids = new Set(outcomes.map((outcome) => outcome.requestId));
  const remove = (item: { readonly kind: string; readonly id: string }) =>
    item.kind === 'financial_request' && ids.has(item.id);
  const previousPending =
    snapshot.activitySections.find((section) => section.key === 'pending')?.items ?? [];
  const removed = previousPending.filter(remove);
  const pendingItems = previousPending.filter((item) => !remove(item));
  const peopleById = Object.fromEntries(
    Object.entries(snapshot.peopleById).map(([id, person]) => {
      const pendingItems = person.pendingItems.filter((item) => !remove(item));
      return [
        id,
        {
          ...person,
          pendingItems,
          pendingCount: pendingItems.length,
          pendingRequest:
            person.pendingRequest && ids.has(person.pendingRequest.id)
              ? undefined
              : person.pendingRequest,
        },
      ];
    }),
  );
  const updateCards = (cards: AppSnapshot['people']) =>
    cards
      .map((card) => ({
        ...card,
        pendingCount: peopleById[card.userId]?.pendingCount ?? card.pendingCount,
      }))
      .sort(sortPeople);
  const projection = snapshot.balanceOverview.projection;
  const incoming = removed
    .filter((item) => item.tone === 'positive')
    .reduce((total, item) => total + (item.amountMinor ?? 0), 0);
  const outgoing = removed
    .filter((item) => item.tone === 'negative')
    .reduce((total, item) => total + (item.amountMinor ?? 0), 0);
  const impactMinor = projection.impactMinor - incoming + outgoing;
  const top = snapshot.dashboard.topPendingPreview;
  return {
    ...snapshot,
    peopleById,
    people: updateCards(snapshot.people),
    pendingCount: pendingItems.length,
    activitySections: snapshot.activitySections.map((section) =>
      section.key === 'pending' ? { ...section, items: pendingItems } : section,
    ),
    notificationUnreadCount: pendingItems.filter(
      (item) =>
        notificationItemCanAlert(item) &&
        !snapshot.notificationViewedKeys.has(notificationViewKeyForItem(item)),
    ).length,
    dashboard: {
      ...snapshot.dashboard,
      urgentCount: pendingItems.length,
      activePeople: updateCards(snapshot.dashboard.activePeople),
      topPendingPreview: top && remove(top) ? null : top,
    },
    balanceOverview: {
      ...snapshot.balanceOverview,
      projection: {
        ...projection,
        pendingCount: Math.max(0, projection.pendingCount - removed.length),
        pendingAmountMinor: Math.max(0, projection.pendingAmountMinor - incoming - outgoing),
        pendingIncomingMinor: Math.max(0, projection.pendingIncomingMinor - incoming),
        pendingOutgoingMinor: Math.max(0, projection.pendingOutgoingMinor - outgoing),
        impactMinor,
        projectedNetBalanceMinor: snapshot.balanceOverview.summary.netBalanceMinor + impactMinor,
      },
    },
  };
}
