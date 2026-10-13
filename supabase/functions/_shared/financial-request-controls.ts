/** Matches the snapshot and durable journal allowlist. */
export const FINANCIAL_REQUEST_SELECT = [
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
].join(', ');

const CATEGORIES = new Set([
  'food_drinks',
  'transport',
  'entertainment',
  'services',
  'home',
  'other',
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function readControlRequest(body: Record<string, unknown>) {
  if (typeof body.requestId !== 'string' || !UUID.test(body.requestId))
    throw new Error('Invalid requestId');
  if (
    typeof body.idempotencyKey !== 'string' ||
    body.idempotencyKey.length < 8 ||
    body.idempotencyKey.length > 128
  ) {
    throw new Error('Invalid idempotencyKey');
  }
  const expectedVersion = body.expectedVersion;
  if (
    expectedVersion !== undefined &&
    expectedVersion !== null &&
    (typeof expectedVersion !== 'number' ||
      !Number.isSafeInteger(expectedVersion) ||
      expectedVersion < 1 ||
      expectedVersion > 2147483647)
  ) {
    throw new Error('Invalid expectedVersion');
  }
  return {
    requestId: body.requestId,
    idempotencyKey: body.idempotencyKey,
    expectedVersion: expectedVersion ?? null,
  };
}

export function readCorrection(body: Record<string, unknown>) {
  const request = readControlRequest(body);
  if (
    typeof body.amountMinor !== 'number' ||
    !Number.isSafeInteger(body.amountMinor) ||
    body.amountMinor <= 0
  ) {
    throw new Error('Invalid amountMinor');
  }
  if (
    typeof body.description !== 'string' ||
    !body.description.trim() ||
    body.description.length > 240
  ) {
    throw new Error('Invalid description');
  }
  const category = body.category ?? 'other';
  if (typeof category !== 'string' || !CATEGORIES.has(category))
    throw new Error('Invalid category');
  return { ...request, amountMinor: body.amountMinor, description: body.description, category };
}

type RequestReader = (ids: string[]) => Promise<{ data: unknown; error: unknown }>;

/** An action has committed when this runs. A failed enrichment cannot turn the
 * confirmed financial action into an error; RPC already hydrated durable rows. */
export async function hydrateControlResponse(
  readRequests: RequestReader,
  actorUserId: string,
  data: unknown,
) {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return data;
  const ack = data as Record<string, unknown>;
  const ids = [
    ack.requestId,
    ack.originalRequestId,
    ack.correctedRequestId,
    ack.amendedRequestId,
  ].filter((id): id is string => typeof id === 'string' && UUID.test(id));
  if (!ids.length) return data;
  try {
    const result = await readRequests(ids);
    if (result.error || !Array.isArray(result.data)) return data;
    const requestedIds = new Set(ids);
    const rows = result.data.filter(
      (row) =>
        typeof row === 'object' &&
        row !== null &&
        requestedIds.has(row.id) &&
        (row.creator_user_id === actorUserId || row.responder_user_id === actorUserId),
    );
    if (
      rows.length !== requestedIds.size ||
      new Set(rows.map((row) => row.id)).size !== rows.length
    )
      return data;
    return { ...ack, financialRequests: rows };
  } catch {
    return data;
  }
}
