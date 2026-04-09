import { useMutation, useQuery } from '@tanstack/react-query';

import type {
  ActivityItemDto,
  ActivitySectionDto,
  DashboardDto,
  PendingActionDto,
  PersonCardDto,
  PersonDetailDto,
  PersonPendingRequestDto,
  PersonTimelineItemDto,
} from '@happy-circles/application';
import {
  amendFinancialRequestSchema,
  createBalanceRequestSchema,
  createContactInviteSchema,
  cycleSettlementDecisionSchema,
  cycleSettlementExecutionSchema,
  relationshipInviteDecisionSchema,
  relationshipInviteSchema,
  requestDecisionSchema,
  type Database,
} from '@happy-circles/shared';

import { useSession } from '@/providers/session-provider';
import { formatCop } from './data';
import { createIdempotencyKey } from './idempotency';
import { queryClient } from './query-client';
import { supabase } from './supabase';

type RelationshipRow = Database['public']['Tables']['relationships']['Row'];
type ContactInviteRow = Database['public']['Tables']['contact_invites']['Row'];
type RelationshipInviteRow = Database['public']['Tables']['relationship_invites']['Row'];
type FinancialRequestRow = Database['public']['Tables']['financial_requests']['Row'];
type AuditEventRow = Database['public']['Tables']['audit_events']['Row'];
type SettlementProposalRow = Database['public']['Tables']['settlement_proposals']['Row'];
type SettlementParticipantRow =
  Database['public']['Tables']['settlement_proposal_participants']['Row'];
type UserProfileRow = Database['public']['Tables']['user_profiles']['Row'];
type OpenDebtRow = Database['public']['Views']['v_open_debts']['Row'];
type RelationshipHistoryRow = Database['public']['Views']['v_relationship_history']['Row'];
type InboxItemRow = Database['public']['Views']['v_inbox_items']['Row'];

interface AuditListItem {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
}

interface SettlementMovement {
  readonly debtor_user_id: string;
  readonly creditor_user_id: string;
  readonly amount_minor: number;
}

interface TimelineEventDraft {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly amountMinor: number;
  readonly tone: PersonTimelineItemDto['tone'];
  readonly kind: PersonTimelineItemDto['kind'];
  readonly status: string;
  readonly sourceType: 'user' | 'system';
  readonly sourceLabel: string;
  readonly originRequestId?: string | null;
  readonly originSettlementProposalId?: string | null;
  readonly flowLabel?: string;
  readonly detail?: string;
  readonly happenedAt: string;
  readonly sortWeight: number;
}

export interface SettlementDetailDto {
  readonly id: string;
  readonly status: string;
  readonly snapshotHash: string;
  readonly participants: readonly string[];
  readonly participantStatuses: readonly string[];
  readonly movements: readonly string[];
  readonly impactLines: readonly string[];
  readonly explainers: readonly string[];
}

export interface RelationshipInviteDto {
  readonly id: string;
  readonly direction: 'incoming' | 'outgoing';
  readonly userId: string;
  readonly displayName: string;
  readonly status: string;
  readonly createdAt: string;
}

export interface ContactInviteDto {
  readonly id: string;
  readonly inviteeName: string;
  readonly phoneE164: string;
  readonly status: string;
  readonly createdAt: string;
  readonly matchedDisplayName: string | null;
  readonly relationshipInviteId: string | null;
}

export interface CreateContactInviteResult {
  readonly contactInviteId: string;
  readonly status: string;
  readonly phoneE164: string;
  readonly matchedUserId: string | null;
  readonly relationshipInviteId: string | null;
}

interface ActionableItem {
  readonly id: PendingActionDto['id'];
  readonly kind: Extract<
    PendingActionDto['kind'],
    'financial_request' | 'settlement_proposal' | 'relationship_invite'
  >;
  readonly title: PendingActionDto['title'];
  readonly subtitle: PendingActionDto['subtitle'];
  readonly status: PendingActionDto['status'];
  readonly ctaLabel: PendingActionDto['ctaLabel'];
  readonly href: PendingActionDto['href'];
  readonly amountMinor?: PendingActionDto['amountMinor'];
  readonly createdAt: string;
}

export interface AppSnapshot {
  readonly dashboard: DashboardDto;
  readonly people: readonly PersonCardDto[];
  readonly peopleById: Readonly<Record<string, PersonDetailDto>>;
  readonly incomingInvites: readonly RelationshipInviteDto[];
  readonly outgoingInvites: readonly RelationshipInviteDto[];
  readonly whatsappInvites: readonly ContactInviteDto[];
  readonly activitySections: readonly ActivitySectionDto[];
  readonly pendingCount: number;
  readonly auditEvents: readonly AuditListItem[];
  readonly settlementsById: Readonly<Record<string, SettlementDetailDto>>;
}

interface CreateRequestInput {
  readonly requestKind: 'balance_increase' | 'balance_decrease';
  readonly responderUserId: string;
  readonly debtorUserId: string;
  readonly creditorUserId: string;
  readonly amountMinor: number;
  readonly description: string;
}

const APP_SNAPSHOT_QUERY_KEY = 'app-snapshot';

function assertSupabaseClient() {
  if (!supabase) {
    throw new Error('Supabase no esta configurado en esta app.');
  }

  return supabase;
}

function getCounterpartyUserId(
  relationship: RelationshipRow,
  currentUserId: string,
): string | null {
  if (relationship.user_low_id === currentUserId) {
    return relationship.user_high_id;
  }

  if (relationship.user_high_id === currentUserId) {
    return relationship.user_low_id;
  }

  return null;
}

function formatRelativeLabel(value: string): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return 'recientemente';
  }

  const diffMs = Date.now() - timestamp;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) {
    return 'hace un momento';
  }

  if (diffMs < hour) {
    return `hace ${Math.max(1, Math.round(diffMs / minute))} min`;
  }

  if (diffMs < day) {
    return `hace ${Math.max(1, Math.round(diffMs / hour))} h`;
  }

  if (diffMs < 7 * day) {
    return `hace ${Math.max(1, Math.round(diffMs / day))} d`;
  }

  return new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'short',
  }).format(new Date(timestamp));
}

function groupBy<K extends string, V>(items: readonly V[], getKey: (item: V) => K): Map<K, V[]> {
  const grouped = new Map<K, V[]>();

  for (const item of items) {
    const key = getKey(item);
    const bucket = grouped.get(key);
    if (bucket) {
      bucket.push(item);
      continue;
    }

    grouped.set(key, [item]);
  }

  return grouped;
}

function buildNameByUserId(
  profiles: readonly UserProfileRow[],
  currentUserId: string,
): Map<string, string> {
  const names = new Map<string, string>();

  for (const profile of profiles) {
    names.set(profile.id, profile.id === currentUserId ? 'Tu' : profile.display_name);
  }

  return names;
}

function deriveDirection(
  currentUserId: string,
  edge: OpenDebtRow | undefined,
  _latestRequest: FinancialRequestRow | undefined,
): PersonCardDto['direction'] {
  if (edge) {
    return edge.creditor_user_id === currentUserId ? 'owes_me' : 'i_owe';
  }

  return 'settled';
}

function sortByNewest<T extends { readonly createdAt: string }>(items: readonly T[]): T[] {
  return [...items].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
}

function sortPeople(left: PersonCardDto, right: PersonCardDto): number {
  if (left.pendingCount !== right.pendingCount) {
    return right.pendingCount - left.pendingCount;
  }

  const amountDiff = Math.abs(right.netAmountMinor) - Math.abs(left.netAmountMinor);
  if (amountDiff !== 0) {
    return amountDiff;
  }

  return left.displayName.localeCompare(right.displayName, 'es-CO');
}

function requestDirectionForUser(
  request: Pick<FinancialRequestRow, 'creditor_user_id' | 'debtor_user_id'>,
  currentUserId: string,
): 'i_owe' | 'owes_me' {
  return request.creditor_user_id === currentUserId ? 'owes_me' : 'i_owe';
}

function buildPendingRequestImpactTitle(input: {
  readonly request: FinancialRequestRow;
  readonly currentUserId: string;
}): string {
  const { request, currentUserId } = input;
  const direction = requestDirectionForUser(request, currentUserId);

  return direction === 'owes_me' ? 'Entrada propuesta' : 'Salida propuesta';
}

function formatPendingRequestTitle(
  request: FinancialRequestRow,
  currentUserId: string,
  names: Map<string, string>,
): string {
  return buildPendingRequestImpactTitle({
    request,
    currentUserId,
  });
}

function formatPendingRequestSubtitle(
  request: FinancialRequestRow,
  names: Map<string, string>,
): string {
  const creatorName = names.get(request.creator_user_id) ?? 'Persona';
  return [creatorName, request.description ?? 'Sin descripcion', formatRelativeLabel(request.created_at)].join(' | ');
}

function buildPersonPendingRequest(input: {
  readonly request: FinancialRequestRow;
  readonly currentUserId: string;
  readonly counterpartyName: string;
  readonly names: Map<string, string>;
}): PersonPendingRequestDto {
  const { request, currentUserId, counterpartyName, names } = input;
  const createdByCurrentUser = request.creator_user_id === currentUserId;
  const requestKind: PersonPendingRequestDto['requestKind'] =
    request.request_type === 'balance_decrease' || request.request_type === 'transaction_reversal'
      ? request.request_type
      : 'balance_increase';

  return {
    id: request.id,
    requestKind,
    responseState: request.responder_user_id === currentUserId ? 'requires_you' : 'waiting_other_side',
    title: buildPendingRequestImpactTitle({
      request,
      currentUserId,
    }),
    description: request.description ?? 'Sin descripcion',
    amountMinor: request.amount_minor,
    createdAtLabel: formatRelativeLabel(request.created_at),
    createdByLabel: names.get(request.creator_user_id) ?? (createdByCurrentUser ? 'Tu' : counterpartyName),
  };
}

function userLabelForRequest(
  userId: string | null | undefined,
  currentUserId: string,
  counterpartyName: string,
  names: Map<string, string>,
  fallback: string,
): string {
  if (!userId) {
    return fallback;
  }

  return userId === currentUserId ? 'Tu' : (names.get(userId) ?? counterpartyName);
}

function resolveRootRequestId(
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

function buildRequestFlowLabelFromRequest(
  request: FinancialRequestRow,
  currentUserId: string,
  counterpartyName: string,
  names: Map<string, string>,
): string {
  const creator = userLabelForRequest(
    request.creator_user_id,
    currentUserId,
    counterpartyName,
    names,
    'Persona',
  );
  const responder = userLabelForRequest(
    request.responder_user_id,
    currentUserId,
    counterpartyName,
    names,
    'La otra persona',
  );

  return `${creator} -> ${responder}`;
}

function buildRequestCreatedTitle(
  request: FinancialRequestRow,
  currentUserId: string,
  counterpartyName: string,
  names: Map<string, string>,
): string {
  const creator = userLabelForRequest(
    request.creator_user_id,
    currentUserId,
    counterpartyName,
    names,
    'Persona',
  );

  if (request.parent_request_id) {
    return `${creator} propuso un nuevo monto`;
  }

  if (request.request_type === 'balance_decrease') {
    return `${creator} propuso una salida`;
  }

  if (request.request_type === 'transaction_reversal') {
    return `${creator} propuso ajustar el movimiento`;
  }

  return `${creator} propuso una entrada`;
}

function buildRequestResolutionTitle(
  request: FinancialRequestRow,
  currentUserId: string,
  counterpartyName: string,
  names: Map<string, string>,
): string | null {
  const responder = userLabelForRequest(
    request.responder_user_id,
    currentUserId,
    counterpartyName,
    names,
    'La otra persona',
  );

  if (request.status === 'accepted') {
    if (request.parent_request_id) {
      return `${responder} acepto el nuevo monto`;
    }

    if (request.request_type === 'transaction_reversal') {
      return `${responder} acepto el ajuste`;
    }

    return `${responder} acepto la propuesta`;
  }

  if (request.status === 'rejected') {
    if (request.parent_request_id) {
      return `${responder} no acepto el nuevo monto`;
    }

    if (request.request_type === 'transaction_reversal') {
      return `${responder} no acepto el ajuste`;
    }

    return `${responder} no acepto la propuesta`;
  }

  if (request.status === 'amended') {
    return `${responder} propuso un nuevo monto`;
  }

  return null;
}

function requestToneForStatus(
  request: FinancialRequestRow,
  currentUserId: string,
  status: FinancialRequestRow['status'],
): PersonTimelineItemDto['tone'] {
  if (status === 'rejected' || status === 'amended') {
    return 'neutral';
  }

  if (request.creditor_user_id === currentUserId) {
    return 'positive';
  }

  if (request.debtor_user_id === currentUserId) {
    return 'negative';
  }

  return 'neutral';
}

function buildRequestEventSubtitle(
  flowLabel: string,
  description: string | null,
  happenedAt: string,
): string {
  return [flowLabel, description ?? 'Sin descripcion', formatRelativeLabel(happenedAt)].join(' | ');
}

function buildPersonTimeline(input: {
  readonly requests: readonly FinancialRequestRow[];
  readonly historyRows: readonly RelationshipHistoryRow[];
  readonly currentUserId: string;
  readonly counterpartyName: string;
  readonly names: Map<string, string>;
}): PersonTimelineItemDto[] {
  const requestById = new Map(input.requests.map((request) => [request.id, request]));
  const requestIdsWithChildren = new Set(
    input.requests.flatMap((request) => (request.parent_request_id ? [request.parent_request_id] : [])),
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
      subtitle: buildRequestEventSubtitle(flowLabel, request.description, request.created_at),
      amountMinor: request.amount_minor,
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
      (request.status === 'accepted' || request.status === 'rejected' || shouldAddAmendedFallback)
    ) {
      drafts.push({
        id: `${request.id}:${request.status}`,
        title: resolutionTitle,
        subtitle: buildRequestEventSubtitle(flowLabel, request.description, resolutionAt),
        amountMinor: request.amount_minor,
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

    drafts.push({
      id: row.item_id,
      title: buildTimelineStepTitle(
        row,
        input.currentUserId,
        input.counterpartyName,
        input.names,
      ),
      subtitle: buildHistorySubtitle(
        row,
        input.currentUserId,
        input.counterpartyName,
        input.names,
      ),
      amountMinor: row.amount_minor,
      tone: historyToneForRow(row, input.currentUserId),
      kind: historyKindForTimeline(row),
      status: row.status,
      sourceType: sourceTypeForRow(row),
      sourceLabel: sourceTypeForRow(row) === 'system' ? 'Sistema' : 'Usuario',
      originRequestId: row.origin_request_id
        ? resolveRootRequestId(row.origin_request_id, requestById)
        : row.item_id,
      originSettlementProposalId: row.origin_settlement_proposal_id ?? undefined,
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
        tone: event.tone,
        kind: event.kind,
        status: event.status,
        sourceType: event.sourceType,
        sourceLabel: event.sourceLabel,
        originRequestId: event.originRequestId,
        originSettlementProposalId: event.originSettlementProposalId,
        flowLabel: event.flowLabel,
        detail: event.detail,
        happenedAt: event.happenedAt,
        happenedAtLabel: formatRelativeLabel(event.happenedAt),
      }),
    );
}

function parseSettlementMovements(
  value: Database['public']['Tables']['settlement_proposals']['Row']['movements_json'],
) {
  if (!Array.isArray(value)) {
    return [] as SettlementMovement[];
  }

  return value.flatMap((entry) => {
    if (Array.isArray(entry) || typeof entry !== 'object' || entry === null) {
      return [];
    }

    const debtorUserId = entry['debtor_user_id'];
    const creditorUserId = entry['creditor_user_id'];
    const amountMinor = entry['amount_minor'];

    if (
      typeof debtorUserId === 'string' &&
      typeof creditorUserId === 'string' &&
      typeof amountMinor === 'number'
    ) {
      return [
        {
          debtor_user_id: debtorUserId,
          creditor_user_id: creditorUserId,
          amount_minor: amountMinor,
        },
      ];
    }

    return [];
  });
}

function buildPendingSettlementItems(
  proposals: readonly SettlementProposalRow[],
  participantsByProposalId: Map<string, SettlementParticipantRow[]>,
  names: Map<string, string>,
  currentUserId: string,
  inboxItems: readonly InboxItemRow[],
): ActionableItem[] {
  const proposalById = new Map(proposals.map((proposal) => [proposal.id, proposal]));
  const pendingProposalIds = new Set<string>();
  const items: ActionableItem[] = [];

  for (const inboxItem of inboxItems) {
    if (
      inboxItem.owner_user_id !== currentUserId ||
      inboxItem.item_kind !== 'settlement_proposal' ||
      inboxItem.status !== 'pending_approvals'
    ) {
      continue;
    }

    const proposal = proposalById.get(inboxItem.item_id);
    if (!proposal) {
      continue;
    }

    const participants = participantsByProposalId.get(proposal.id) ?? [];
    const participantNames = participants.map(
      (participant) => names.get(participant.participant_user_id) ?? 'Persona',
    );
    const others = participantNames.filter((name) => name !== 'Tu');
    const titleBase =
      others.length > 0 ? `Ajustaria saldos con ${others.join(', ')}` : 'Ajustaria saldos en tu circulo';

    pendingProposalIds.add(proposal.id);
    items.push({
      id: proposal.id,
      kind: 'settlement_proposal',
      title: 'Cierre de ciclo propuesto',
      subtitle: `${titleBase} | ${formatRelativeLabel(proposal.created_at)}`,
      status: 'pending_approvals',
      ctaLabel: 'Revisar',
      href: `/settlements/${proposal.id}`,
      createdAt: proposal.created_at,
    });
  }

  for (const proposal of proposals) {
    if (pendingProposalIds.has(proposal.id)) {
      continue;
    }

    const participants = participantsByProposalId.get(proposal.id) ?? [];
    const actorParticipant = participants.find(
      (participant) => participant.participant_user_id === currentUserId,
    );
    const participantNames = participants.map(
      (participant) => names.get(participant.participant_user_id) ?? 'Persona',
    );
    const others = participantNames.filter((name) => name !== 'Tu');
    const titleBase =
      others.length > 0 ? `Ajustaria saldos con ${others.join(', ')}` : 'Ajustaria saldos en tu circulo';

    if (proposal.status === 'pending_approvals' && actorParticipant?.decision === 'approved') {
      const approvalsPending = participants.filter(
        (participant) => participant.decision === 'pending',
      ).length;

      items.push({
        id: proposal.id,
        kind: 'settlement_proposal',
        title: 'Cierre de ciclo esperando a otros',
        subtitle: `${titleBase} | faltan ${approvalsPending} aprobacion${approvalsPending === 1 ? '' : 'es'}`,
        status: 'pending_approvals',
        ctaLabel: 'Revisar',
        href: `/settlements/${proposal.id}`,
        createdAt: proposal.created_at,
      });
    }

    if (proposal.status === 'approved' && !proposal.executed_at) {
      items.push({
        id: proposal.id,
        kind: 'settlement_proposal',
        title: 'Cierre de ciclo listo',
        subtitle: `${titleBase} | ya puedes ejecutarlo`,
        status: 'approved',
        ctaLabel: 'Ejecutar',
        href: `/settlements/${proposal.id}`,
        createdAt: proposal.created_at,
      });
    }
  }

  return items;
}

function buildInviteItems(
  invites: readonly RelationshipInviteRow[],
  names: Map<string, string>,
  currentUserId: string,
): {
  readonly incomingInvites: readonly RelationshipInviteDto[];
  readonly outgoingInvites: readonly RelationshipInviteDto[];
  readonly pendingActivityItems: readonly ActionableItem[];
} {
  const incomingInvites: RelationshipInviteDto[] = [];
  const outgoingInvites: RelationshipInviteDto[] = [];
  const pendingActivityItems: ActionableItem[] = [];

  for (const invite of invites) {
    if (invite.status !== 'pending') {
      continue;
    }

    const isIncoming = invite.invitee_user_id === currentUserId;
    const counterpartUserId = isIncoming ? invite.inviter_user_id : invite.invitee_user_id;
    const displayName = names.get(counterpartUserId) ?? 'Persona';
    const dto: RelationshipInviteDto = {
      id: invite.id,
      direction: isIncoming ? 'incoming' : 'outgoing',
      userId: counterpartUserId,
      displayName,
      status: invite.status,
      createdAt: invite.created_at,
    };

    if (isIncoming) {
      incomingInvites.push(dto);
    } else {
      outgoingInvites.push(dto);
    }

    if (isIncoming) {
      pendingActivityItems.push({
        id: invite.id,
        kind: 'relationship_invite',
        title: `${displayName} quiere conectar contigo`,
        subtitle: `Invitacion pendiente | ${formatRelativeLabel(invite.created_at)}`,
        status: 'requires_you',
        ctaLabel: 'Responder',
        href: '/invite',
        createdAt: invite.created_at,
      });
      continue;
    }

    pendingActivityItems.push({
      id: invite.id,
      kind: 'relationship_invite',
      title: `Esperando a ${displayName}`,
      subtitle: `Invitacion enviada | ${formatRelativeLabel(invite.created_at)}`,
      status: 'waiting_other_side',
      ctaLabel: 'Ver',
      href: '/invite',
      createdAt: invite.created_at,
    });
  }

  return {
    incomingInvites: sortByNewest(incomingInvites),
    outgoingInvites: sortByNewest(outgoingInvites),
    pendingActivityItems: sortByNewest(pendingActivityItems),
  };
}

function buildContactInviteItems(
  invites: readonly ContactInviteRow[],
  names: Map<string, string>,
): readonly ContactInviteDto[] {
  return sortByNewest(
    invites.map((invite) => ({
      id: invite.id,
      inviteeName: invite.invitee_name,
      phoneE164: invite.invitee_phone_e164,
      status: invite.status,
      createdAt: invite.created_at,
      matchedDisplayName: invite.claimed_by_user_id
        ? (names.get(invite.claimed_by_user_id) ?? invite.invitee_name)
        : null,
      relationshipInviteId: invite.relationship_invite_id,
    })),
  );
}

function historyToneForRow(
  row: RelationshipHistoryRow,
  currentUserId: string,
): PersonTimelineItemDto['tone'] {
  if (row.item_kind === 'ledger_transaction' && row.subtype === 'cycle_settlement') {
    return 'neutral';
  }

  if (row.status === 'rejected' || row.status === 'amended') {
    return 'neutral';
  }

  if (row.creditor_user_id === currentUserId) {
    return 'positive';
  }

  if (row.debtor_user_id === currentUserId) {
    return 'negative';
  }

  return 'neutral';
}

function sourceTypeForRow(row: RelationshipHistoryRow): 'user' | 'system' {
  if (row.item_kind === 'ledger_transaction' && row.source_type === 'system') {
    return 'system';
  }

  return 'user';
}

function isHistoryRowVisibleToCurrentUser(
  row: RelationshipHistoryRow,
  currentUserId: string,
  visibleRelationshipIds: ReadonlySet<string>,
): boolean {
  if (!visibleRelationshipIds.has(row.relationship_id)) {
    return false;
  }

  if (row.debtor_user_id === currentUserId || row.creditor_user_id === currentUserId) {
    return true;
  }

  if (row.item_kind === 'financial_request') {
    return row.creator_user_id === currentUserId || row.responder_user_id === currentUserId;
  }

  return false;
}

function historyKindForActivity(row: RelationshipHistoryRow): ActivityItemDto['kind'] {
  if (row.item_kind === 'financial_request') {
    return row.status === 'accepted' ? 'accepted_request' : 'financial_request';
  }

  if (row.subtype === 'balance_decrease_acceptance') {
    return 'manual_payment';
  }

  return 'system_note';
}

function historyKindForTimeline(row: RelationshipHistoryRow): PersonTimelineItemDto['kind'] {
  if (row.item_kind === 'financial_request') {
    return 'request';
  }

  if (row.subtype === 'balance_decrease_acceptance') {
    return 'payment';
  }

  if (row.subtype === 'cycle_settlement') {
    return 'settlement';
  }

  return 'system';
}

function buildHistoryTitle(
  row: RelationshipHistoryRow,
  counterpartyName: string,
  names: Map<string, string>,
): string {
  const movementFlow = buildMovementFlowLabel(row, names);

  if (row.item_kind === 'financial_request') {
    if (row.status === 'pending') {
      return `Propuesta pendiente con ${counterpartyName}`;
    }

    if (row.status === 'accepted') {
      return `Propuesta aceptada con ${counterpartyName}`;
    }

    if (row.status === 'amended') {
      return `${counterpartyName} propuso un nuevo monto`;
    }

    if (row.status === 'rejected') {
      return `${counterpartyName} no acepto la propuesta`;
    }

    return `Propuesta con ${counterpartyName}`;
  }

  if (
    row.subtype === 'balance_decrease_acceptance' ||
    row.subtype === 'balance_increase_acceptance' ||
    row.subtype === 'transaction_reversal_acceptance'
  ) {
    return movementFlow
      ? `Movimiento registrado: ${movementFlow}`
      : `Movimiento registrado con ${counterpartyName}`;
  }

  if (row.subtype === 'cycle_settlement') {
    return movementFlow
      ? `Cierre de ciclo del sistema: ${movementFlow}`
      : `Cierre de ciclo con ${counterpartyName}`;
  }

  return movementFlow
    ? `Movimiento confirmado: ${movementFlow}`
    : `Movimiento con ${counterpartyName}`;
}

function buildMovementFlowLabel(
  row: RelationshipHistoryRow,
  names: Map<string, string>,
): string | null {
  if (!row.debtor_user_id || !row.creditor_user_id) {
    return null;
  }

  const debtor = names.get(row.debtor_user_id) ?? 'Deudor';
  const creditor = names.get(row.creditor_user_id) ?? 'Acreedor';
  return `${debtor} -> ${creditor}`;
}

function buildRequestFlowLabel(
  row: RelationshipHistoryRow,
  currentUserId: string,
  counterpartyName: string,
  names: Map<string, string>,
): string | null {
  if (!row.creator_user_id || !row.responder_user_id) {
    return null;
  }

  const creator =
    row.creator_user_id === currentUserId
      ? 'Tu'
      : (names.get(row.creator_user_id) ?? counterpartyName);
  const responder =
    row.responder_user_id === currentUserId
      ? 'Tu'
      : (names.get(row.responder_user_id) ?? counterpartyName);

  return `${creator} -> ${responder}`;
}

function buildTimelineStepTitle(
  row: RelationshipHistoryRow,
  currentUserId: string,
  counterpartyName: string,
  names: Map<string, string>,
): string {
  const creator =
    row.creator_user_id === currentUserId
      ? 'Tu'
      : (row.creator_user_id ? (names.get(row.creator_user_id) ?? counterpartyName) : 'Sistema');
  const responder =
    row.responder_user_id === currentUserId
      ? 'Tu'
      : (row.responder_user_id ? (names.get(row.responder_user_id) ?? counterpartyName) : 'La otra persona');

  if (row.item_kind === 'financial_request') {
    if (row.status === 'pending') {
      if (row.subtype === 'balance_decrease') {
        return `${creator} propuso una salida`;
      }

      if (row.subtype === 'transaction_reversal') {
        return `${creator} propuso ajustar el movimiento`;
      }

      return `${creator} propuso una entrada`;
    }

    if (row.status === 'accepted') {
      if (row.subtype === 'transaction_reversal') {
        return `${responder} acepto el ajuste`;
      }

      if (row.subtype === 'balance_decrease' || row.subtype === 'balance_increase') {
        return `${responder} acepto la propuesta`;
      }

      return `${responder} acepto el ajuste`;
    }

    if (row.status === 'amended') {
      return `${responder} propuso un nuevo monto`;
    }

    if (row.status === 'rejected') {
      return `${responder} no acepto la propuesta`;
    }
  }

  if (row.subtype === 'balance_decrease_acceptance') {
    return sourceTypeForRow(row) === 'system'
      ? 'Sistema registro la salida'
      : `${creator} registro la salida`;
  }

  if (row.subtype === 'balance_increase_acceptance') {
    return sourceTypeForRow(row) === 'system'
      ? 'Sistema registro la entrada'
      : `${creator} registro la entrada`;
  }

  if (row.subtype === 'transaction_reversal_acceptance') {
    return sourceTypeForRow(row) === 'system'
      ? 'Sistema aplico el ajuste'
      : `${creator} aplico el ajuste`;
  }

  if (row.subtype === 'cycle_settlement') {
    return 'Sistema ejecuto un cierre de ciclo';
  }

  return buildHistoryTitle(row, counterpartyName, names);
}

function buildCycleSettlementImpactLabel(
  row: RelationshipHistoryRow,
  currentUserId: string,
  counterpartyName: string,
): string | null {
  if (row.subtype !== 'cycle_settlement') {
    return null;
  }

  return `Ajuste neto con ${counterpartyName}`;
}

function buildHistorySubtitle(
  row: RelationshipHistoryRow,
  currentUserId: string,
  counterpartyName: string,
  names: Map<string, string>,
): string {
  const pieces = [sourceTypeForRow(row) === 'system' ? 'Sistema' : 'Usuario'];

  const movementFlow = buildMovementFlowLabel(row, names);
  if (movementFlow) {
    pieces.push(movementFlow);
  }

  const cycleImpact = buildCycleSettlementImpactLabel(row, currentUserId, counterpartyName);
  if (cycleImpact) {
    pieces.push(cycleImpact);
  }

  if (row.description) {
    pieces.push(row.description);
  }

  pieces.push(formatRelativeLabel(row.happened_at));
  return pieces.join(' | ');
}

function buildSettlementDetail(
  proposal: SettlementProposalRow,
  participants: readonly SettlementParticipantRow[],
  names: Map<string, string>,
): SettlementDetailDto {
  const movements = parseSettlementMovements(proposal.movements_json).map((movement) => {
    const debtor = names.get(movement.debtor_user_id) ?? 'Deudor';
    const creditor = names.get(movement.creditor_user_id) ?? 'Acreedor';
    return `${debtor} -> ${creditor}: ${formatCop(movement.amount_minor)}`;
  });
  const impactLines = parseSettlementMovements(proposal.movements_json).map((movement) => {
    const debtor = names.get(movement.debtor_user_id) ?? 'Deudor';
    const creditor = names.get(movement.creditor_user_id) ?? 'Acreedor';
    return `Ajusta el saldo neto ${debtor} -> ${creditor} en ${formatCop(movement.amount_minor)}`;
  });
  const participantStatuses = participants.map((participant) => {
    const name = names.get(participant.participant_user_id) ?? 'Persona';
    return `${name}: ${participant.decision}`;
  });

  const approvalsPending = participants.filter(
    (participant) => participant.decision === 'pending',
  ).length;
  const explainers =
    proposal.status === 'pending_approvals'
      ? [
          approvalsPending > 0
            ? `Faltan ${approvalsPending} aprobacion${approvalsPending > 1 ? 'es' : ''} para que quede aprobado.`
            : 'Todos aprobaron, solo falta ejecutar.',
          'El snapshot hash evita ejecutar un cierre sobre un grafo viejo.',
        ]
      : proposal.status === 'approved'
        ? [
            'La propuesta ya fue aprobada por todos.',
            'El siguiente paso es ejecutar los movimientos.',
          ]
        : proposal.status === 'executed'
          ? [
              'El ledger ya recibio los movimientos de este cierre.',
              'El saldo neto fue recalculado despues de ejecutar.',
            ]
          : ['Revisa el estado tecnico antes de volver a proponer un cierre.'];

  return {
    id: proposal.id,
    status: proposal.status,
    snapshotHash: proposal.graph_snapshot_hash,
    participants: participants.map(
      (participant) => names.get(participant.participant_user_id) ?? 'Persona',
    ),
    participantStatuses,
    movements,
    impactLines,
    explainers,
  };
}

function buildAuditItems(events: readonly AuditEventRow[]): AuditListItem[] {
  return events.map((event) => ({
    id: event.id,
    title: event.event_name.replaceAll('_', ' '),
    subtitle: `${event.entity_type} | ${formatRelativeLabel(event.created_at)}`,
  }));
}

function buildLiveSnapshot(input: {
  readonly currentUserId: string;
  readonly profiles: readonly UserProfileRow[];
  readonly contactInvites: readonly ContactInviteRow[];
  readonly relationshipInvites: readonly RelationshipInviteRow[];
  readonly relationships: readonly RelationshipRow[];
  readonly openDebts: readonly OpenDebtRow[];
  readonly financialRequests: readonly FinancialRequestRow[];
  readonly history: readonly RelationshipHistoryRow[];
  readonly inboxItems: readonly InboxItemRow[];
  readonly settlementProposals: readonly SettlementProposalRow[];
  readonly settlementParticipants: readonly SettlementParticipantRow[];
  readonly auditEvents: readonly AuditEventRow[];
}): AppSnapshot {
  const nameByUserId = buildNameByUserId(input.profiles, input.currentUserId);
  const relationshipsByCounterpartyId = new Map<string, RelationshipRow>();

  for (const relationship of input.relationships) {
    const counterpartyUserId = getCounterpartyUserId(relationship, input.currentUserId);
    if (counterpartyUserId) {
      relationshipsByCounterpartyId.set(counterpartyUserId, relationship);
    }
  }

  const visibleRelationshipIds = new Set(input.relationships.map((relationship) => relationship.id));
  const history = input.history.filter((row) =>
    isHistoryRowVisibleToCurrentUser(row, input.currentUserId, visibleRelationshipIds),
  );
  const openDebtsByRelationshipId = new Map(
    input.openDebts.map((row) => [row.relationship_id, row]),
  );
  const requestById = new Map(input.financialRequests.map((request) => [request.id, request]));
  const requestsByRelationshipId = groupBy(input.financialRequests, (row) => row.relationship_id);
  const historyByRelationshipId = groupBy(history, (row) => row.relationship_id);
  const settlementParticipantsByProposalId = groupBy(
    input.settlementParticipants,
    (row) => row.settlement_proposal_id,
  );
  const inviteState = buildInviteItems(
    input.relationshipInvites,
    nameByUserId,
    input.currentUserId,
  );
  const contactInviteItems = buildContactInviteItems(input.contactInvites, nameByUserId);

  const people = Array.from(relationshipsByCounterpartyId.entries())
    .map(([counterpartyUserId, relationship]): PersonCardDto => {
      const requests = requestsByRelationshipId.get(relationship.id) ?? [];
      const latestRequest = requests[0];
      const edge = openDebtsByRelationshipId.get(relationship.id);
      const direction = deriveDirection(input.currentUserId, edge, latestRequest);
      const timeline = historyByRelationshipId.get(relationship.id) ?? [];
      const latestHistory = timeline[0];
      const lastActivityLabel =
        latestRequest && (!latestHistory || latestRequest.created_at >= latestHistory.happened_at)
          ? `Propuesta pendiente ${formatRelativeLabel(latestRequest.created_at)}`
          : latestHistory
            ? `Ultimo movimiento ${formatRelativeLabel(latestHistory.happened_at)}`
            : 'Sin movimientos todavia';

      return {
        userId: counterpartyUserId,
        displayName: nameByUserId.get(counterpartyUserId) ?? 'Persona',
        netAmountMinor: edge?.amount_minor ?? 0,
        direction,
        pendingCount: requests.filter((row) => row.status === 'pending').length,
        lastActivityLabel,
      };
    })
    .sort(sortPeople);

  const peopleById = Object.fromEntries(
    people.map((person): [string, PersonDetailDto] => {
      const relationship = relationshipsByCounterpartyId.get(person.userId);
      const requests = relationship ? (requestsByRelationshipId.get(relationship.id) ?? []) : [];
      const latestPendingRequest = requests.find((request) => request.status === 'pending');
      const historyRows = relationship ? (historyByRelationshipId.get(relationship.id) ?? []) : [];
      const timeline = buildPersonTimeline({
        requests,
        historyRows,
        currentUserId: input.currentUserId,
        counterpartyName: person.displayName,
        names: nameByUserId,
      });

      const headline =
        person.netAmountMinor === 0
          ? `Con ${person.displayName} estan al dia`
          : person.direction === 'owes_me'
            ? `${person.displayName} te debe`
            : `Le debes a ${person.displayName}`;

      const supportText =
        person.pendingCount > 0
          ? `Tienes ${person.pendingCount} pendiente${person.pendingCount > 1 ? 's' : ''} con ${person.displayName}.`
          : person.lastActivityLabel;

      const pendingRequest = latestPendingRequest
        ? buildPersonPendingRequest({
            request: latestPendingRequest,
            currentUserId: input.currentUserId,
            counterpartyName: person.displayName,
            names: nameByUserId,
          })
        : undefined;

      return [
        person.userId,
        {
          userId: person.userId,
          displayName: person.displayName,
          direction: person.direction,
          netAmountMinor: person.netAmountMinor,
          pendingCount: person.pendingCount,
          headline,
          supportText,
          pendingRequest,
          timeline,
        },
      ];
    }),
  );

  const pendingRequests = input.financialRequests
    .filter(
      (request) =>
        request.status === 'pending' && request.responder_user_id === input.currentUserId,
    )
    .map(
      (request): ActionableItem => ({
        id: request.id,
        kind: 'financial_request',
        title: formatPendingRequestTitle(request, input.currentUserId, nameByUserId),
        subtitle: formatPendingRequestSubtitle(request, nameByUserId),
        status: 'requires_you',
        ctaLabel: 'Responder',
        href: '/activity',
        amountMinor: request.amount_minor,
        createdAt: request.created_at,
      }),
    );

  const pendingSettlements = buildPendingSettlementItems(
    input.settlementProposals,
    settlementParticipantsByProposalId,
    nameByUserId,
    input.currentUserId,
    input.inboxItems,
  );

  const pendingItems = sortByNewest([
    ...pendingRequests,
    ...pendingSettlements,
    ...inviteState.pendingActivityItems,
  ]);

  const historyItems = history
    .filter((row) => !(row.item_kind === 'financial_request' && row.status === 'pending'))
    .map((row): ActivityItemDto => {
      const relationship = input.relationships.find((item) => item.id === row.relationship_id);
      const counterpartyUserId = relationship
        ? getCounterpartyUserId(relationship, input.currentUserId)
        : null;
      const counterpartyName = counterpartyUserId
        ? (nameByUserId.get(counterpartyUserId) ?? 'Persona')
        : 'Persona';

      return {
        id: row.item_id,
        kind: historyKindForActivity(row),
        title: buildTimelineStepTitle(row, input.currentUserId, counterpartyName, nameByUserId),
        subtitle: buildHistorySubtitle(row, input.currentUserId, counterpartyName, nameByUserId),
        status: row.status,
        href: counterpartyUserId ? `/person/${counterpartyUserId}` : '/activity',
        amountMinor: row.amount_minor,
        sourceType: sourceTypeForRow(row),
        detail: row.description ?? undefined,
        happenedAt: row.happened_at,
        happenedAtLabel: formatRelativeLabel(row.happened_at),
        tone: historyToneForRow(row, input.currentUserId),
        originRequestId: row.origin_request_id
          ? resolveRootRequestId(row.origin_request_id, requestById)
          : row.item_id,
        originSettlementProposalId: row.origin_settlement_proposal_id ?? undefined,
        counterpartyLabel: counterpartyName,
      };
    })
    .slice(0, 20);

  const summary = input.openDebts.reduce(
    (accumulator, debt) => {
      if (debt.debtor_user_id === input.currentUserId) {
        return {
          netBalanceMinor: accumulator.netBalanceMinor - debt.amount_minor,
          totalIOweMinor: accumulator.totalIOweMinor + debt.amount_minor,
          totalOwedToMeMinor: accumulator.totalOwedToMeMinor,
        };
      }

      if (debt.creditor_user_id === input.currentUserId) {
        return {
          netBalanceMinor: accumulator.netBalanceMinor + debt.amount_minor,
          totalIOweMinor: accumulator.totalIOweMinor,
          totalOwedToMeMinor: accumulator.totalOwedToMeMinor + debt.amount_minor,
        };
      }

      return accumulator;
    },
    {
      netBalanceMinor: 0,
      totalIOweMinor: 0,
      totalOwedToMeMinor: 0,
    },
  );

  const settlementsById = Object.fromEntries(
    input.settlementProposals.map((proposal) => [
      proposal.id,
      buildSettlementDetail(
        proposal,
        settlementParticipantsByProposalId.get(proposal.id) ?? [],
        nameByUserId,
      ),
    ]),
  );

  return {
    dashboard: {
      summary,
      urgentCount: pendingItems.length,
      topPendingPreview: pendingItems[0]
        ? {
            id: pendingItems[0].id,
            kind: pendingItems[0].kind,
            title: pendingItems[0].title,
            subtitle: pendingItems[0].subtitle,
            status: pendingItems[0].status,
            ctaLabel: pendingItems[0].ctaLabel,
            href: pendingItems[0].href,
            amountMinor: pendingItems[0].amountMinor,
          }
        : null,
      activePeople: people,
    },
    people,
    peopleById,
    incomingInvites: inviteState.incomingInvites,
    outgoingInvites: inviteState.outgoingInvites,
    whatsappInvites: contactInviteItems,
    activitySections: [
      {
        key: 'pending',
        title: 'Pendientes',
        description: 'Todo lo que espera accion tuya ahora mismo.',
        emptyMessage: 'No hay pendientes por ahora.',
        items: pendingItems,
      },
      {
        key: 'history',
        title: 'Historial',
        description: 'Lo ultimo que ya quedo registrado en el ledger o resuelto.',
        emptyMessage: 'Aun no hay historial.',
        items: historyItems,
      },
    ],
    pendingCount: pendingItems.length,
    auditEvents: buildAuditItems(input.auditEvents),
    settlementsById,
  };
}

async function fetchLiveSnapshot(currentUserId: string): Promise<AppSnapshot> {
  const client = assertSupabaseClient();
  const [
    profilesResult,
    contactInvitesResult,
    relationshipInvitesResult,
    relationshipsResult,
    openDebtsResult,
    requestsResult,
    historyResult,
    inboxItemsResult,
    settlementProposalsResult,
    settlementParticipantsResult,
    auditResult,
  ] = await Promise.all([
    client.from('user_profiles').select('id, display_name, email, created_at, updated_at'),
    client
      .from('contact_invites')
      .select(
        'id, inviter_user_id, invitee_name, invitee_phone_country_iso2, invitee_phone_country_calling_code, invitee_phone_national_number, invitee_phone_e164, status, claimed_by_user_id, relationship_invite_id, created_at, updated_at',
      )
      .order('created_at', { ascending: false }),
    client
      .from('relationship_invites')
      .select('id, inviter_user_id, invitee_user_id, status, created_at, updated_at')
      .order('created_at', { ascending: false }),
    client
      .from('relationships')
      .select('id, user_low_id, user_high_id, status, created_at, updated_at')
      .eq('status', 'active')
      .order('created_at', { ascending: false }),
    client.from('v_open_debts').select('*'),
    client
      .from('financial_requests')
      .select(
        'id, relationship_id, request_type, status, creator_user_id, responder_user_id, debtor_user_id, creditor_user_id, amount_minor, currency_code, description, parent_request_id, target_ledger_transaction_id, created_at, updated_at, resolved_at',
      )
      .order('created_at', { ascending: false }),
    client.from('v_relationship_history').select('*').order('happened_at', { ascending: false }),
    client
      .from('v_inbox_items')
      .select('owner_user_id, item_id, item_kind, subtype, status, created_at')
      .eq('owner_user_id', currentUserId)
      .order('created_at', { ascending: false }),
    client
      .from('settlement_proposals')
      .select(
        'id, created_by_user_id, status, graph_snapshot_hash, graph_snapshot, movements_json, created_at, updated_at, executed_at',
      )
      .order('created_at', { ascending: false }),
    client
      .from('settlement_proposal_participants')
      .select('id, settlement_proposal_id, participant_user_id, decision, decided_at'),
    client
      .from('audit_events')
      .select(
        'id, actor_user_id, entity_type, entity_id, event_name, request_id, metadata_json, created_at',
      )
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  if (profilesResult.error) {
    throw new Error(profilesResult.error.message);
  }

  if (relationshipsResult.error) {
    throw new Error(relationshipsResult.error.message);
  }

  if (contactInvitesResult.error) {
    throw new Error(contactInvitesResult.error.message);
  }

  if (relationshipInvitesResult.error) {
    throw new Error(relationshipInvitesResult.error.message);
  }

  if (openDebtsResult.error) {
    throw new Error(openDebtsResult.error.message);
  }

  if (requestsResult.error) {
    throw new Error(requestsResult.error.message);
  }

  if (historyResult.error) {
    throw new Error(historyResult.error.message);
  }

  if (inboxItemsResult.error) {
    throw new Error(inboxItemsResult.error.message);
  }

  if (settlementProposalsResult.error) {
    throw new Error(settlementProposalsResult.error.message);
  }

  if (settlementParticipantsResult.error) {
    throw new Error(settlementParticipantsResult.error.message);
  }

  if (auditResult.error) {
    throw new Error(auditResult.error.message);
  }

  return buildLiveSnapshot({
    currentUserId,
    profiles: profilesResult.data ?? [],
    contactInvites: contactInvitesResult.data ?? [],
    relationshipInvites: relationshipInvitesResult.data ?? [],
    relationships: relationshipsResult.data ?? [],
    openDebts: openDebtsResult.data ?? [],
    financialRequests: requestsResult.data ?? [],
    history: historyResult.data ?? [],
    inboxItems: inboxItemsResult.data ?? [],
    settlementProposals: settlementProposalsResult.data ?? [],
    settlementParticipants: settlementParticipantsResult.data ?? [],
    auditEvents: auditResult.data ?? [],
  });
}

async function fetchAppSnapshot(userId: string | null) {
  if (!userId) {
    throw new Error('No hay una sesion lista para cargar datos.');
  }

  return fetchLiveSnapshot(userId);
}

async function parseFunctionError(error: {
  readonly message: string;
  readonly context?: Response;
}) {
  if (error.context) {
    try {
      const cloned = error.context.clone();
      const body = (await cloned.json()) as { error?: string; message?: string };
      if (typeof body.error === 'string' && body.error.length > 0) {
        return body.error;
      }

      if (typeof body.message === 'string' && body.message.length > 0) {
        return body.message;
      }
    } catch {
      try {
        const text = await error.context.text();
        if (text.trim().length > 0) {
          return `${error.message}: ${text}`;
        }
      } catch {
        return error.message;
      }
    }
  }

  return error.message;
}

function isJwtAuthError(message: string): boolean {
  const normalized = message.trim().toLocaleLowerCase('en-US');

  return (
    normalized.includes('invalid jwt') ||
    normalized.includes('jwt expired') ||
    normalized.includes('jwt malformed') ||
    normalized.includes('bad jwt') ||
    normalized.includes('missing authorization header')
  );
}

async function invokeSupabaseFunction<TBody extends Record<string, unknown>, TResult>(
  name: string,
  body: TBody,
): Promise<TResult> {
  const client = assertSupabaseClient();
  const invoke = () => client.functions.invoke(name, { body });
  let { data, error } = await invoke();

  if (error) {
    const parsedMessage = await parseFunctionError(error);
    if (isJwtAuthError(parsedMessage)) {
      const { data: refreshData, error: refreshError } = await client.auth.refreshSession();
      if (refreshError || !refreshData.session) {
        await client.auth.signOut();
        throw new Error('Tu sesion ya no es valida. Cierra sesion y vuelve a entrar.');
      }

      ({ data, error } = await invoke());
      if (error) {
        throw new Error(await parseFunctionError(error));
      }

      return data as TResult;
    }

    throw new Error(parsedMessage);
  }

  return data as TResult;
}

async function invalidateAppSnapshot() {
  await queryClient.invalidateQueries({
    queryKey: [APP_SNAPSHOT_QUERY_KEY],
  });
}

export function useAppSnapshot() {
  const { userId } = useSession();

  return useQuery({
    queryKey: [APP_SNAPSHOT_QUERY_KEY, userId ?? 'signed-out'],
    enabled: Boolean(userId),
    queryFn: () => fetchAppSnapshot(userId),
  });
}

export function useCreateRelationshipInviteMutation() {
  return useMutation({
    mutationFn: async (inviteeUserId: string) => {
      const payload = relationshipInviteSchema.parse({
        idempotencyKey: createIdempotencyKey('create_relationship_invite'),
        inviteeUserId,
      });

      return invokeSupabaseFunction('create-relationship-invite', payload);
    },
    onSuccess: invalidateAppSnapshot,
  });
}

export function useCreateWhatsAppInviteMutation() {
  return useMutation({
    mutationFn: async (input: {
      readonly inviteeName: string;
      readonly phoneCountryIso2: string;
      readonly phoneCountryCallingCode: string;
      readonly phoneNationalNumber: string;
    }) => {
      const payload = createContactInviteSchema.parse({
        idempotencyKey: createIdempotencyKey('create_contact_invite'),
        inviteeName: input.inviteeName,
        phoneCountryIso2: input.phoneCountryIso2,
        phoneCountryCallingCode: input.phoneCountryCallingCode,
        phoneNationalNumber: input.phoneNationalNumber,
      });

      return invokeSupabaseFunction<typeof payload, CreateContactInviteResult>(
        'create-whatsapp-invite',
        payload,
      );
    },
    onSuccess: invalidateAppSnapshot,
  });
}

export function useAcceptRelationshipInviteMutation() {
  return useMutation({
    mutationFn: async (inviteId: string) => {
      const payload = relationshipInviteDecisionSchema.parse({
        idempotencyKey: createIdempotencyKey('accept_relationship_invite'),
        inviteId,
      });

      return invokeSupabaseFunction('accept-relationship-invite', payload);
    },
    onSuccess: invalidateAppSnapshot,
  });
}

export function useRejectRelationshipInviteMutation() {
  return useMutation({
    mutationFn: async (inviteId: string) => {
      const payload = relationshipInviteDecisionSchema.parse({
        idempotencyKey: createIdempotencyKey('reject_relationship_invite'),
        inviteId,
      });

      return invokeSupabaseFunction('reject-relationship-invite', payload);
    },
    onSuccess: invalidateAppSnapshot,
  });
}

export function useCreateRequestMutation() {
  return useMutation({
    mutationFn: async (input: CreateRequestInput) => {
      const payload = createBalanceRequestSchema.parse({
        idempotencyKey: createIdempotencyKey(`mobile_${input.requestKind}`),
        responderUserId: input.responderUserId,
        debtorUserId: input.debtorUserId,
        creditorUserId: input.creditorUserId,
        amountMinor: input.amountMinor,
        description: input.description,
        requestKind: input.requestKind,
      });

      return invokeSupabaseFunction('create-balance-request', payload);
    },
    onSuccess: async () => {
      await invalidateAppSnapshot();
    },
  });
}

export function useAcceptFinancialRequestMutation() {
  return useMutation({
    mutationFn: async (requestId: string) => {
      const payload = requestDecisionSchema.parse({
        idempotencyKey: createIdempotencyKey('accept_request'),
        requestId,
      });

      return invokeSupabaseFunction('accept-financial-request', payload);
    },
    onSuccess: invalidateAppSnapshot,
  });
}

export function useRejectFinancialRequestMutation() {
  return useMutation({
    mutationFn: async (requestId: string) => {
      const payload = requestDecisionSchema.parse({
        idempotencyKey: createIdempotencyKey('reject_request'),
        requestId,
      });

      return invokeSupabaseFunction('reject-financial-request', payload);
    },
    onSuccess: invalidateAppSnapshot,
  });
}

export function useAmendFinancialRequestMutation() {
  return useMutation({
    mutationFn: async (input: {
      readonly requestId: string;
      readonly amountMinor: number;
      readonly description: string;
    }) => {
      const payload = amendFinancialRequestSchema.parse({
        idempotencyKey: createIdempotencyKey('amend_request'),
        requestId: input.requestId,
        amountMinor: input.amountMinor,
        description: input.description,
      });

      return invokeSupabaseFunction('amend-financial-request', payload);
    },
    onSuccess: invalidateAppSnapshot,
  });
}

export function useApproveSettlementMutation() {
  return useMutation({
    mutationFn: async (proposalId: string) => {
      const payload = cycleSettlementDecisionSchema.parse({
        idempotencyKey: createIdempotencyKey('approve_settlement'),
        proposalId,
      });

      return invokeSupabaseFunction('approve-cycle-settlement', payload);
    },
    onSuccess: invalidateAppSnapshot,
  });
}

export function useRejectSettlementMutation() {
  return useMutation({
    mutationFn: async (proposalId: string) => {
      const payload = cycleSettlementDecisionSchema.parse({
        idempotencyKey: createIdempotencyKey('reject_settlement'),
        proposalId,
      });

      return invokeSupabaseFunction('reject-cycle-settlement', payload);
    },
    onSuccess: invalidateAppSnapshot,
  });
}

export function useExecuteSettlementMutation() {
  return useMutation({
    mutationFn: async (proposalId: string) => {
      const payload = cycleSettlementExecutionSchema.parse({
        idempotencyKey: createIdempotencyKey('execute_settlement'),
        proposalId,
      });

      return invokeSupabaseFunction('execute-approved-cycle-settlement', payload);
    },
    onSuccess: invalidateAppSnapshot,
  });
}
