import type { HistoryRow, HistorySyncState } from './history-sync';
import type {
  FinancialRequestRow,
  LiveSnapshotRows,
  OpenDebtRow,
  RelationshipHistoryRow,
} from './types';

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function identity(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 256 &&
    !['__proto__', 'constructor', 'prototype'].includes(value)
  );
}
function positiveMinor(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}
function timestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}
function historyKey(row: RelationshipHistoryRow) {
  return `${row.item_kind}:${row.relationship_id}:${row.item_id}`;
}

export interface AcceptedProjection {
  readonly requestId: string;
  readonly relationshipId: string;
  readonly observedAt: string;
  readonly history: RelationshipHistoryRow;
  readonly openDebt: OpenDebtRow | null;
}

export interface AcceptedProjectionResponse {
  readonly status: 'accepted';
  readonly requestId: string;
  readonly ledgerTransactionId: string;
  readonly financialRequests: readonly FinancialRequestRow[];
  readonly acceptedProjection: AcceptedProjection;
}

const REQUEST_COLUMNS = [
  'id',
  'relationship_id',
  'request_type',
  'status',
  'creator_user_id',
  'responder_user_id',
  'debtor_user_id',
  'creditor_user_id',
  'amount_minor',
  'currency_code',
  'description',
  'category',
  'parent_request_id',
  'target_ledger_transaction_id',
  'created_at',
  'updated_at',
  'resolved_at',
  'request_case_id',
  'version_number',
  'resolved_by_user_id',
  'amendment_kind',
] as const;
const HISTORY_COLUMNS = [
  'relationship_id',
  'item_id',
  'item_kind',
  'status',
  'subtype',
  'source_type',
  'creator_user_id',
  'responder_user_id',
  'debtor_user_id',
  'creditor_user_id',
  'amount_minor',
  'description',
  'category',
  'origin_request_id',
  'origin_settlement_proposal_id',
  'happened_at',
  'request_case_id',
  'version_number',
  'resolved_by_user_id',
  'amendment_kind',
  'parent_request_id',
  'resolved_at',
] as const;
const DEBT_COLUMNS = [
  'relationship_id',
  'user_low_id',
  'user_high_id',
  'debtor_user_id',
  'creditor_user_id',
  'amount_minor',
  'currency_code',
] as const;

function project<T>(row: object, columns: readonly string[]): T {
  return Object.fromEntries(
    columns.map((column) => [column, (row as Record<string, unknown>)[column]]),
  ) as T;
}

function publicRowIsScalar(row: object, columns: readonly string[]): boolean {
  return columns.every((column) => {
    const value = (row as Record<string, unknown>)[column];
    return (
      value === null ||
      value === undefined ||
      (column === 'amount_minor' || column === 'version_number'
        ? typeof value === 'number' && Number.isSafeInteger(value)
        : typeof value === 'string')
    );
  });
}

/** Persist only an actor-validated canonical response and the public row allowlists. */
export function acceptedProjectionResponse(
  response: unknown,
  userId: string,
): AcceptedProjectionResponse | null {
  const projection = readProjection(response, userId);
  if (!projection || !record(response) || !Array.isArray(response.financialRequests)) return null;
  const request: unknown = response.financialRequests.find(
    (row: unknown) => record(row) && row.id === projection.requestId && row.status === 'accepted',
  );
  if (!record(request) || !timestamp(request.created_at) || !timestamp(request.updated_at))
    return null;
  if (
    !publicRowIsScalar(request, REQUEST_COLUMNS) ||
    !publicRowIsScalar(projection.history, HISTORY_COLUMNS) ||
    (projection.openDebt && !publicRowIsScalar(projection.openDebt, DEBT_COLUMNS))
  )
    return null;
  return {
    status: 'accepted',
    requestId: projection.requestId,
    ledgerTransactionId: projection.history.item_id,
    financialRequests: [project<FinancialRequestRow>(request, REQUEST_COLUMNS)],
    acceptedProjection: {
      requestId: projection.requestId,
      relationshipId: projection.relationshipId,
      observedAt: projection.observedAt,
      history: project<RelationshipHistoryRow>(projection.history, HISTORY_COLUMNS),
      openDebt: projection.openDebt
        ? project<OpenDebtRow>(projection.openDebt, DEBT_COLUMNS)
        : null,
    },
  };
}

/** Retain every immutable ledger fact while replaying balances from oldest to newest observation. */
export function mergeAcceptedProjectionResponses(
  before: readonly AcceptedProjectionResponse[],
  after: readonly AcceptedProjectionResponse[],
): AcceptedProjectionResponse[] {
  const byLedger = new Map<string, AcceptedProjectionResponse>();
  const candidates: readonly unknown[] = [
    ...(Array.isArray(before) ? (before as readonly unknown[]) : []),
    ...(Array.isArray(after) ? (after as readonly unknown[]) : []),
  ];
  for (const candidate of candidates) {
    const firstRequest: unknown =
      record(candidate) && Array.isArray(candidate.financialRequests)
        ? candidate.financialRequests[0]
        : undefined;
    const actor: unknown = record(firstRequest) ? firstRequest.responder_user_id : undefined;
    const incoming =
      typeof actor === 'string' ? acceptedProjectionResponse(candidate, actor) : null;
    if (!incoming) continue;
    const previous = byLedger.get(incoming.ledgerTransactionId);
    if (!previous) {
      byLedger.set(incoming.ledgerTransactionId, incoming);
      continue;
    }
    if (
      previous.requestId !== incoming.requestId ||
      previous.acceptedProjection.relationshipId !== incoming.acceptedProjection.relationshipId ||
      previous.acceptedProjection.history.amount_minor !==
        incoming.acceptedProjection.history.amount_minor ||
      previous.acceptedProjection.history.debtor_user_id !==
        incoming.acceptedProjection.history.debtor_user_id ||
      previous.acceptedProjection.history.creditor_user_id !==
        incoming.acceptedProjection.history.creditor_user_id ||
      previous.acceptedProjection.history.subtype !== incoming.acceptedProjection.history.subtype ||
      Date.parse(previous.acceptedProjection.observedAt) >=
        Date.parse(incoming.acceptedProjection.observedAt)
    )
      continue;
    byLedger.set(incoming.ledgerTransactionId, {
      ...previous,
      acceptedProjection: {
        ...previous.acceptedProjection,
        observedAt: incoming.acceptedProjection.observedAt,
        openDebt: incoming.acceptedProjection.openDebt,
      },
    });
  }
  return [...byLedger.values()].sort(
    (left, right) =>
      Date.parse(left.acceptedProjection.observedAt) -
        Date.parse(right.acceptedProjection.observedAt) ||
      left.ledgerTransactionId.localeCompare(right.ledgerTransactionId),
  );
}

function readProjection(response: unknown, userId: string): AcceptedProjection | null {
  if (
    !record(response) ||
    response.status !== 'accepted' ||
    !record(response.acceptedProjection) ||
    !identity(response.requestId) ||
    !identity(response.ledgerTransactionId) ||
    !Array.isArray(response.financialRequests)
  )
    return null;
  const projection = response.acceptedProjection;
  if (
    projection.requestId !== response.requestId ||
    !identity(projection.relationshipId) ||
    !timestamp(projection.observedAt) ||
    !record(projection.history)
  )
    return null;
  const request = response.financialRequests.find(
    (row: unknown) => record(row) && row.id === projection.requestId && row.status === 'accepted',
  ) as FinancialRequestRow | undefined;
  if (
    !request ||
    request.relationship_id !== projection.relationshipId ||
    !identity(request.creator_user_id) ||
    !identity(request.responder_user_id) ||
    request.creator_user_id === request.responder_user_id ||
    ![request.creator_user_id, request.responder_user_id].includes(userId) ||
    ![request.creator_user_id, request.responder_user_id].includes(request.debtor_user_id) ||
    ![request.creator_user_id, request.responder_user_id].includes(request.creditor_user_id) ||
    request.debtor_user_id === request.creditor_user_id ||
    !positiveMinor(request.amount_minor) ||
    typeof request.currency_code !== 'string' ||
    !['balance_increase', 'transaction_reversal'].includes(request.request_type)
  )
    return null;
  const history = projection.history;
  if (
    history.item_kind !== 'ledger_transaction' ||
    history.item_id !== response.ledgerTransactionId ||
    history.relationship_id !== projection.relationshipId ||
    history.origin_request_id !== projection.requestId ||
    history.status !== 'posted' ||
    history.source_type !== 'user' ||
    history.subtype !== `${request.request_type}_acceptance` ||
    history.amount_minor !== request.amount_minor ||
    history.debtor_user_id !== request.debtor_user_id ||
    history.creditor_user_id !== request.creditor_user_id ||
    history.creator_user_id !== request.responder_user_id ||
    history.responder_user_id !== request.responder_user_id ||
    !timestamp(history.happened_at)
  )
    return null;
  const debt = projection.openDebt;
  const participants = [request.creator_user_id, request.responder_user_id];
  if (
    debt !== null &&
    (!record(debt) ||
      debt.relationship_id !== projection.relationshipId ||
      !identity(debt.user_low_id) ||
      !identity(debt.user_high_id) ||
      !identity(debt.debtor_user_id) ||
      !identity(debt.creditor_user_id) ||
      !participants.includes(String(debt.user_low_id)) ||
      !participants.includes(String(debt.user_high_id)) ||
      debt.user_low_id === debt.user_high_id ||
      !participants.includes(String(debt.debtor_user_id)) ||
      !participants.includes(String(debt.creditor_user_id)) ||
      debt.debtor_user_id === debt.creditor_user_id ||
      !positiveMinor(debt.amount_minor) ||
      debt.currency_code !== request.currency_code)
  )
    return null;
  return projection as unknown as AcceptedProjection;
}

/** Apply only server rows, without acknowledging any journal revision or touching inbox state. */
export function reconcileAcceptedProjection(
  state: HistorySyncState,
  response: unknown,
  userId: string,
): HistorySyncState {
  const projection = readProjection(response, userId);
  if (!projection) return state;
  const key = historyKey(projection.history);
  const history = {
    ...state.collections.history,
    [key]: projection.history as unknown as HistoryRow,
  };
  if (!state.liveRows) return { ...state, collections: { ...state.collections, history } };
  const liveRows = state.liveRows;
  const relationship = liveRows.relationships.find((row) => row.id === projection.relationshipId);
  if (
    !relationship ||
    relationship.user_low_id === relationship.user_high_id ||
    ![relationship.user_low_id, relationship.user_high_id].includes(userId) ||
    ![relationship.user_low_id, relationship.user_high_id].includes(
      projection.history.debtor_user_id ?? '',
    ) ||
    ![relationship.user_low_id, relationship.user_high_id].includes(
      projection.history.creditor_user_id ?? '',
    )
  )
    return state;
  const historyByKey = new Map(liveRows.history.map((row) => [historyKey(row), row]));
  historyByKey.set(key, projection.history);
  const observedAt = Date.parse(projection.observedAt);
  const observations = record(liveRows.acceptedProjectionObservedAtByRelationshipId)
    ? liveRows.acceptedProjectionObservedAtByRelationshipId
    : {};
  const previousObservation = observations[projection.relationshipId];
  const freshEnough =
    Date.parse(liveRows.fetchedAt) < observedAt &&
    (!timestamp(previousObservation) || Date.parse(previousObservation) < observedAt);
  const nextLiveRows: LiveSnapshotRows = {
    ...liveRows,
    history: [...historyByKey.values()],
    ...(freshEnough
      ? {
          openDebts: [
            ...liveRows.openDebts.filter(
              (row) => row.relationship_id !== projection.relationshipId,
            ),
            ...(projection.openDebt ? [projection.openDebt] : []),
          ],
          acceptedProjectionObservedAtByRelationshipId: {
            ...observations,
            [projection.relationshipId]: projection.observedAt,
          },
        }
      : {}),
  };
  return { ...state, collections: { ...state.collections, history }, liveRows: nextLiveRows };
}
