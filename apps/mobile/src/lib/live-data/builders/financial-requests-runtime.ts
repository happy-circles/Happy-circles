import type {
  PendingRequestHistoryStepDto,
  PersonPendingRequestDto,
  PersonTimelineItemDto,
} from '@happy-circles/application';
import type {
  ActionableItem,
  FinancialRequestRow,
  RelationshipHistoryRow,
  SettlementProposalRow,
  TimelineEventDraft,
} from '../types';
import { formatRelativeLabel } from '../utils/dates';
import {
  buildRequestCreatedTitle,
  buildRequestEventSubtitle,
  buildRequestFlowLabelFromRequest,
  buildRequestResolutionTitle,
  requestToneForStatus,
  userLabelForRequest,
} from './financial-request-labels';
import { requestDirectionForUser } from '../utils/money-and-direction';
import {
  buildHistorySubtitle,
  buildMovementFlowLabel,
  buildTimelineStepTitle,
  historyKindForTimeline,
  historyToneForRow,
  sourceTypeForRow,
} from './relationship-history';
import { normalizeTransactionCategory } from '../../transaction-categories';
import { LIVE_DATA_CTA, LIVE_DATA_ROUTES } from '../presentation';
import {
  inferOriginRequestIdFromLedgerRow,
  resolveRootRequestId,
} from './financial-request-inference';

export function buildPendingRequestImpactTitle(input: {
  readonly request: FinancialRequestRow;
  readonly currentUserId: string;
}): string {
  const { request, currentUserId } = input;
  const direction = requestDirectionForUser(request, currentUserId);

  return direction === 'owes_me' ? 'Entrada propuesta' : 'Salida propuesta';
}

export function formatPendingRequestTitle(
  request: FinancialRequestRow,
  currentUserId: string,
): string {
  return buildPendingRequestImpactTitle({
    request,
    currentUserId,
  });
}

export function formatPendingRequestSubtitle(
  request: FinancialRequestRow,
  names: Map<string, string>,
  currentUserId: string,
  counterpartyName: string,
  nowMs: number,
): string {
  const creatorName = userLabelForRequest(
    request.creator_user_id,
    currentUserId,
    counterpartyName,
    names,
    'Persona',
  );
  return [
    creatorName,
    request.description ?? 'Sin descripcion',
    formatRelativeLabel(request.created_at, nowMs),
  ].join(' | ');
}

export function pendingRequestHistoryTitle(index: number, total: number): string {
  if (total <= 1) {
    return 'Propuesta actual';
  }

  if (index === 0) {
    return 'Propuesta inicial';
  }

  if (index === total - 1) {
    return 'Monto actual';
  }

  return 'Cambio propuesto';
}

export function buildPendingRequestHistorySteps(input: {
  readonly request: FinancialRequestRow;
  readonly requestsById: ReadonlyMap<string, FinancialRequestRow>;
  readonly currentUserId: string;
  readonly counterpartyName: string;
  readonly names: Map<string, string>;
  readonly nowMs: number;
}): readonly PendingRequestHistoryStepDto[] {
  const chain: FinancialRequestRow[] = [];
  const seenIds = new Set<string>();
  let currentRequest: FinancialRequestRow | undefined = input.request;

  while (currentRequest && !seenIds.has(currentRequest.id) && chain.length < 20) {
    chain.push(currentRequest);
    seenIds.add(currentRequest.id);
    currentRequest = currentRequest.parent_request_id
      ? input.requestsById.get(currentRequest.parent_request_id)
      : undefined;
  }

  const chronologicalChain = [...chain].reverse();

  return chronologicalChain.map((request, index) => ({
    id: request.id,
    title: pendingRequestHistoryTitle(index, chronologicalChain.length),
    description: request.description ?? 'Sin descripcion',
    amountMinor: request.amount_minor,
    category: normalizeTransactionCategory(request.category),
    createdAtLabel: formatRelativeLabel(request.created_at, input.nowMs),
    createdByLabel: userLabelForRequest(
      request.creator_user_id,
      input.currentUserId,
      input.counterpartyName,
      input.names,
      'Persona',
    ),
    status: request.status,
    isCurrent: request.id === input.request.id,
  }));
}

export function buildPersonPendingRequest(input: {
  readonly request: FinancialRequestRow;
  readonly currentUserId: string;
  readonly counterpartyName: string;
  readonly names: Map<string, string>;
  readonly nowMs: number;
}): PersonPendingRequestDto {
  const { request, currentUserId, counterpartyName, names } = input;
  const requestKind: PersonPendingRequestDto['requestKind'] =
    request.request_type === 'transaction_reversal' ? request.request_type : 'balance_increase';

  return {
    id: request.id,
    requestKind,
    responseState:
      request.responder_user_id === currentUserId ? 'requires_you' : 'waiting_other_side',
    tone: requestDirectionForUser(request, currentUserId) === 'owes_me' ? 'positive' : 'negative',
    category: normalizeTransactionCategory(request.category),
    title: buildPendingRequestImpactTitle({
      request,
      currentUserId,
    }),
    description: request.description ?? 'Sin descripcion',
    amountMinor: request.amount_minor,
    createdAtLabel: formatRelativeLabel(request.created_at, input.nowMs),
    createdByLabel: userLabelForRequest(
      request.creator_user_id,
      currentUserId,
      counterpartyName,
      names,
      'Persona',
    ),
  };
}

export function buildPersonTimeline(input: {
  readonly requests: readonly FinancialRequestRow[];
  readonly historyRows: readonly RelationshipHistoryRow[];
  readonly currentUserId: string;
  readonly counterpartyName: string;
  readonly names: Map<string, string>;
  readonly settlementProposalsById?: ReadonlyMap<string, SettlementProposalRow>;
  readonly nowMs: number;
}): PersonTimelineItemDto[] {
  const requestById = new Map(input.requests.map((request) => [request.id, request]));
  const requestIdsWithChildren = new Set(
    input.requests.flatMap((request) =>
      request.parent_request_id ? [request.parent_request_id] : [],
    ),
  );
  const drafts: TimelineEventDraft[] = [];

  for (const request of input.requests) {
    const rootRequestId = resolveRootRequestId(request.id, requestById);
    const flowLabel = buildRequestFlowLabelFromRequest(
      request,
      input.currentUserId,
      input.counterpartyName,
      input.names,
    );

    drafts.push({
      id: `${request.id}:created`,
      title: buildRequestCreatedTitle(
        request,
        input.currentUserId,
        input.counterpartyName,
        input.names,
      ),
      subtitle: buildRequestEventSubtitle(
        flowLabel,
        request.description,
        request.created_at,
        input.nowMs,
      ),
      amountMinor: request.amount_minor,
      category: normalizeTransactionCategory(request.category),
      tone: requestToneForStatus(request, input.currentUserId, 'pending'),
      kind: 'request',
      status: 'pending',
      sourceType: 'user',
      sourceLabel: 'Usuario',
      originRequestId: rootRequestId,
      originSettlementProposalId: undefined,
      flowLabel,
      detail: request.description ?? undefined,
      happenedAt: request.created_at,
      sortWeight: 1,
    });

    const resolutionTitle = buildRequestResolutionTitle(
      request,
      input.currentUserId,
      input.counterpartyName,
      input.names,
    );
    const resolutionAt = request.resolved_at ?? request.updated_at;
    const shouldAddAmendedFallback =
      request.status === 'amended' && !requestIdsWithChildren.has(request.id);

    if (
      resolutionTitle &&
      resolutionAt &&
      (request.status === 'accepted' ||
        request.status === 'rejected' ||
        request.status === 'canceled' ||
        request.status === 'expired' ||
        shouldAddAmendedFallback)
    ) {
      drafts.push({
        id: `${request.id}:${request.status}`,
        title: resolutionTitle,
        subtitle: buildRequestEventSubtitle(
          flowLabel,
          request.description,
          resolutionAt,
          input.nowMs,
        ),
        amountMinor: request.amount_minor,
        category: normalizeTransactionCategory(request.category),
        tone: requestToneForStatus(request, input.currentUserId, request.status),
        kind: 'request',
        status: request.status,
        sourceType: 'user',
        sourceLabel: 'Usuario',
        originRequestId: rootRequestId,
        originSettlementProposalId: undefined,
        flowLabel,
        detail: request.description ?? undefined,
        happenedAt: resolutionAt,
        sortWeight: 2,
      });
    }
  }

  for (const row of input.historyRows) {
    if (row.item_kind !== 'ledger_transaction') {
      continue;
    }

    const originRequestId = row.origin_request_id
      ? resolveRootRequestId(row.origin_request_id, requestById)
      : inferOriginRequestIdFromLedgerRow({
          row,
          requests: input.requests,
          requestsById: requestById,
        });

    const originSettlementProposalId = row.origin_settlement_proposal_id ?? undefined;
    const settlementProposal = originSettlementProposalId
      ? input.settlementProposalsById?.get(originSettlementProposalId)
      : undefined;

    drafts.push({
      id: row.item_id,
      title: buildTimelineStepTitle(row, input.currentUserId, input.counterpartyName, input.names),
      subtitle: buildHistorySubtitle(
        row,
        input.currentUserId,
        input.counterpartyName,
        input.names,
        input.nowMs,
      ),
      amountMinor: row.amount_minor,
      category: normalizeTransactionCategory(row.category),
      tone: historyToneForRow(row, input.currentUserId),
      kind: historyKindForTimeline(row),
      status: row.status,
      sourceType: sourceTypeForRow(row),
      sourceLabel: sourceTypeForRow(row) === 'system' ? 'Sistema' : 'Usuario',
      originRequestId: originRequestId ?? row.item_id,
      originSettlementProposalId,
      happyCircleCaseId: settlementProposal?.happy_circle_case_id ?? undefined,
      replacesProposalId: settlementProposal?.replaces_proposal_id ?? undefined,
      replacedByProposalId: settlementProposal?.replaced_by_proposal_id ?? undefined,
      staleReason: settlementProposal?.stale_reason ?? undefined,
      flowLabel: buildMovementFlowLabel(row, input.names) ?? undefined,
      detail: row.description ?? undefined,
      happenedAt: row.happened_at,
      sortWeight: 3,
    });
  }

  return drafts
    .sort((left, right) => {
      const timeDiff = Date.parse(right.happenedAt) - Date.parse(left.happenedAt);
      if (timeDiff !== 0) {
        return timeDiff;
      }

      if (left.sortWeight !== right.sortWeight) {
        return right.sortWeight - left.sortWeight;
      }

      return right.id.localeCompare(left.id);
    })
    .map(
      (event): PersonTimelineItemDto => ({
        id: event.id,
        title: event.title,
        subtitle: event.subtitle,
        amountMinor: event.amountMinor,
        category: event.category,
        tone: event.tone,
        kind: event.kind,
        status: event.status,
        sourceType: event.sourceType,
        sourceLabel: event.sourceLabel,
        originRequestId: event.originRequestId,
        originSettlementProposalId: event.originSettlementProposalId,
        happyCircleCaseId: event.happyCircleCaseId,
        replacesProposalId: event.replacesProposalId,
        replacedByProposalId: event.replacedByProposalId,
        staleReason: event.staleReason,
        flowLabel: event.flowLabel,
        detail: event.detail,
        happenedAt: event.happenedAt,
        happenedAtLabel: formatRelativeLabel(event.happenedAt, input.nowMs),
      }),
    );
}

export function buildPendingFinancialRequestItems(input: {
  readonly financialRequests: readonly FinancialRequestRow[];
  readonly financialRequestsById: ReadonlyMap<string, FinancialRequestRow>;
  readonly counterpartyByRelationshipId: ReadonlyMap<
    string,
    {
      readonly userId: string;
      readonly displayName: string;
    }
  >;
  readonly currentUserId: string;
  readonly names: Map<string, string>;
  readonly nowMs: number;
}): ActionableItem[] {
  return input.financialRequests
    .filter((request) => request.status === 'pending')
    .map((request): ActionableItem => {
      const counterparty = input.counterpartyByRelationshipId.get(request.relationship_id);

      return {
        id: request.id,
        kind: 'financial_request',
        title: formatPendingRequestTitle(request, input.currentUserId),
        subtitle: formatPendingRequestSubtitle(
          request,
          input.names,
          input.currentUserId,
          counterparty?.displayName ?? 'Persona',
          input.nowMs,
        ),
        status:
          request.responder_user_id === input.currentUserId ? 'requires_you' : 'waiting_other_side',
        ctaLabel: LIVE_DATA_CTA.respond,
        href: counterparty
          ? LIVE_DATA_ROUTES.person(counterparty.userId)
          : LIVE_DATA_ROUTES.activity,
        amountMinor: request.amount_minor,
        category: normalizeTransactionCategory(request.category),
        counterpartyLabel: counterparty?.displayName,
        tone:
          requestDirectionForUser(request, input.currentUserId) === 'owes_me'
            ? 'positive'
            : 'negative',
        pendingHistorySteps: buildPendingRequestHistorySteps({
          request,
          requestsById: input.financialRequestsById,
          currentUserId: input.currentUserId,
          counterpartyName: counterparty?.displayName ?? 'Persona',
          names: input.names,
          nowMs: input.nowMs,
        }),
        createdAt: request.created_at,
      };
    });
}
