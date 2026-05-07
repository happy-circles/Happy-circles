import type { FinancialRequestRow, RelationshipHistoryRow } from '../types';

export function resolveRootRequestId(
  requestId: string,
  requestsById: ReadonlyMap<string, FinancialRequestRow>,
): string {
  let currentId = requestId;
  let guard = 0;

  while (guard < 20) {
    const request = requestsById.get(currentId);
    if (!request?.parent_request_id) {
      return request?.id ?? currentId;
    }

    currentId = request.parent_request_id;
    guard += 1;
  }

  return currentId;
}

export function normalizeComparableText(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLocaleLowerCase('es-CO');
  return normalized && normalized.length > 0 ? normalized : null;
}

export function requestTypeFromAcceptanceSubtype(
  subtype: RelationshipHistoryRow['subtype'],
): FinancialRequestRow['request_type'] | null {
  if (subtype === 'balance_increase_acceptance') {
    return 'balance_increase';
  }

  if (subtype === 'transaction_reversal_acceptance') {
    return 'transaction_reversal';
  }

  return null;
}

export function inferOriginRequestIdFromLedgerRow(input: {
  readonly row: RelationshipHistoryRow;
  readonly requests: readonly FinancialRequestRow[];
  readonly requestsById: ReadonlyMap<string, FinancialRequestRow>;
}): string | null {
  const requestType = requestTypeFromAcceptanceSubtype(input.row.subtype);
  if (!requestType) {
    return null;
  }

  const happenedAt = Date.parse(input.row.happened_at);
  if (Number.isNaN(happenedAt)) {
    return null;
  }

  const normalizedDescription = normalizeComparableText(input.row.description);
  const candidates = input.requests
    .filter((request) => {
      if (request.status !== 'accepted' || request.request_type !== requestType) {
        return false;
      }

      if (request.amount_minor !== input.row.amount_minor) {
        return false;
      }

      if (
        request.debtor_user_id !== input.row.debtor_user_id ||
        request.creditor_user_id !== input.row.creditor_user_id
      ) {
        return false;
      }

      const resolvedAt = Date.parse(
        request.resolved_at ?? request.updated_at ?? request.created_at,
      );
      if (Number.isNaN(resolvedAt) || Math.abs(resolvedAt - happenedAt) > 60_000) {
        return false;
      }

      const requestDescription = normalizeComparableText(request.description);
      return !normalizedDescription || requestDescription === normalizedDescription;
    })
    .sort((left, right) => {
      const leftResolvedAt = Date.parse(left.resolved_at ?? left.updated_at ?? left.created_at);
      const rightResolvedAt = Date.parse(right.resolved_at ?? right.updated_at ?? right.created_at);
      return Math.abs(leftResolvedAt - happenedAt) - Math.abs(rightResolvedAt - happenedAt);
    });

  if (candidates.length === 0) {
    return null;
  }

  return resolveRootRequestId(candidates[0].id, input.requestsById);
}
