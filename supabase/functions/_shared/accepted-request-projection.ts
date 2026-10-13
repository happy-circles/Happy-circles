import type { createServiceRoleClient } from './http.ts';

/** Keep these columns identical to get-app-snapshot's public view projections. */
export const ACCEPTED_HISTORY_SELECT = [
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
].join(', ');
export const ACCEPTED_OPEN_DEBT_SELECT = [
  'relationship_id',
  'user_low_id',
  'user_high_id',
  'debtor_user_id',
  'creditor_user_id',
  'amount_minor',
  'currency_code',
].join(', ');

type ProjectionClient = Pick<ReturnType<typeof createServiceRoleClient>, 'from'>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function uuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}
function positiveMinor(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}
function project(row: Record<string, unknown>, selection: string) {
  return Object.fromEntries(selection.split(', ').map((column) => [column, row[column]]));
}

/** An enrichment timeout releases the already committed action, even if a reader ignores abort. */
function boundedRead<T>(read: PromiseLike<T>, signal: AbortSignal): Promise<T | undefined> {
  return new Promise((resolve) => {
    let settled = false;
    function finish(value?: T) {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', abort);
      resolve(value);
    }
    function abort() {
      finish();
    }
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(read).then((value) => finish(signal.aborted ? undefined : value), abort);
    if (signal.aborted) abort();
  });
}

/** Return canonical ledger and balance rows; never calculate a balance from the accepted amount. */
export async function hydrateAcceptedProjection(
  client: ProjectionClient,
  actorUserId: string,
  data: unknown,
  options?: { readonly signal?: AbortSignal; readonly observedAt?: string },
) {
  if (
    !record(data) ||
    data.status !== 'accepted' ||
    !uuid(data.requestId) ||
    !uuid(data.ledgerTransactionId) ||
    !Array.isArray(data.financialRequests)
  )
    return data;
  const request = data.financialRequests.find(
    (value: unknown) => record(value) && value.id === data.requestId && value.status === 'accepted',
  );
  if (
    !record(request) ||
    !uuid(request.relationship_id) ||
    !uuid(request.creator_user_id) ||
    !uuid(request.responder_user_id) ||
    !uuid(request.debtor_user_id) ||
    !uuid(request.creditor_user_id) ||
    request.creator_user_id === request.responder_user_id ||
    ![request.creator_user_id, request.responder_user_id].includes(actorUserId) ||
    ![request.creator_user_id, request.responder_user_id].includes(request.debtor_user_id) ||
    ![request.creator_user_id, request.responder_user_id].includes(request.creditor_user_id) ||
    request.debtor_user_id === request.creditor_user_id ||
    !positiveMinor(request.amount_minor) ||
    typeof request.currency_code !== 'string' ||
    !['balance_increase', 'transaction_reversal'].includes(String(request.request_type))
  )
    return data;

  const observedAt = options?.observedAt ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(observedAt))) return data;
  const signal = options?.signal ?? AbortSignal.timeout(2000);
  if (signal.aborted) return data;
  try {
    const results = await boundedRead(
      Promise.all([
        client
          .from('v_relationship_history')
          .select(ACCEPTED_HISTORY_SELECT)
          .eq('item_kind', 'ledger_transaction')
          .eq('item_id', data.ledgerTransactionId)
          .eq('relationship_id', request.relationship_id)
          .eq('origin_request_id', data.requestId)
          .abortSignal(signal)
          .maybeSingle(),
        client
          .from('v_open_debts')
          .select(ACCEPTED_OPEN_DEBT_SELECT)
          .eq('relationship_id', request.relationship_id)
          .abortSignal(signal)
          .maybeSingle(),
      ]),
      signal,
    );
    if (!results || results.some((result) => result.error)) return data;
    const [historyResult, debtResult] = results;
    const history: unknown = historyResult.data;
    const debt: unknown = debtResult.data;
    if (
      !record(history) ||
      history.item_kind !== 'ledger_transaction' ||
      history.item_id !== data.ledgerTransactionId ||
      history.relationship_id !== request.relationship_id ||
      history.origin_request_id !== data.requestId ||
      history.status !== 'posted' ||
      history.source_type !== 'user' ||
      history.subtype !== `${request.request_type}_acceptance` ||
      history.amount_minor !== request.amount_minor ||
      history.debtor_user_id !== request.debtor_user_id ||
      history.creditor_user_id !== request.creditor_user_id ||
      history.creator_user_id !== request.responder_user_id ||
      history.responder_user_id !== request.responder_user_id ||
      typeof history.happened_at !== 'string' ||
      !Number.isFinite(Date.parse(history.happened_at))
    )
      return data;
    const participants = [request.creator_user_id, request.responder_user_id];
    if (
      debt !== null &&
      (!record(debt) ||
        debt.relationship_id !== request.relationship_id ||
        !uuid(debt.user_low_id) ||
        !uuid(debt.user_high_id) ||
        !uuid(debt.debtor_user_id) ||
        !uuid(debt.creditor_user_id) ||
        !participants.includes(debt.user_low_id) ||
        !participants.includes(debt.user_high_id) ||
        debt.user_low_id === debt.user_high_id ||
        !participants.includes(debt.debtor_user_id) ||
        !participants.includes(debt.creditor_user_id) ||
        debt.debtor_user_id === debt.creditor_user_id ||
        !positiveMinor(debt.amount_minor) ||
        debt.currency_code !== request.currency_code)
    )
      return data;
    return {
      ...data,
      acceptedProjection: {
        requestId: data.requestId,
        relationshipId: request.relationship_id,
        observedAt,
        history: project(history, ACCEPTED_HISTORY_SELECT),
        openDebt: record(debt) ? project(debt, ACCEPTED_OPEN_DEBT_SELECT) : null,
      },
    };
  } catch {
    // RPC success remains success if view hydration or local projection is unavailable.
    return data;
  }
}
