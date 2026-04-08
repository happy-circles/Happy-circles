import { useMutation, useQuery } from '@tanstack/react-query';

import type {
  ActivityItemDto,
  ActivitySectionDto,
  DashboardDto,
  PendingActionDto,
  PersonCardDto,
  PersonDetailDto,
  PersonTimelineItemDto,
} from '@happy-circles/application';
import {
  createDebtRequestSchema,
  cycleSettlementDecisionSchema,
  cycleSettlementExecutionSchema,
  requestDecisionSchema,
  type Database,
} from '@happy-circles/shared';

import { useSession } from '@/providers/session-provider';

import { formatCop } from './data';
import { createIdempotencyKey } from './idempotency';
import { mockActivitySections, mockAudit, mockDashboard, mockPersonDetails, mockSettlement } from './mock-data';
import { queryClient } from './query-client';
import { supabase } from './supabase';

type RelationshipRow = Database['public']['Tables']['relationships']['Row'];
type FinancialRequestRow = Database['public']['Tables']['financial_requests']['Row'];
type AuditEventRow = Database['public']['Tables']['audit_events']['Row'];
type SettlementProposalRow = Database['public']['Tables']['settlement_proposals']['Row'];
type SettlementParticipantRow = Database['public']['Tables']['settlement_proposal_participants']['Row'];
type UserProfileRow = Database['public']['Tables']['user_profiles']['Row'];
type OpenDebtRow = Database['public']['Views']['v_open_debts']['Row'];
type RelationshipHistoryRow = Database['public']['Views']['v_relationship_history']['Row'];

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

export interface SettlementDetailDto {
  readonly id: string;
  readonly status: string;
  readonly snapshotHash: string;
  readonly participants: readonly string[];
  readonly movements: readonly string[];
  readonly explainers: readonly string[];
}

interface ActionableItem {
  readonly id: string;
  readonly kind: 'financial_request' | 'settlement_proposal';
  readonly title: string;
  readonly subtitle: string;
  readonly status: string;
  readonly ctaLabel: string;
  readonly href: string;
  readonly amountMinor?: number;
  readonly createdAt: string;
}

export interface AppSnapshot {
  readonly dashboard: DashboardDto;
  readonly people: readonly PersonCardDto[];
  readonly peopleById: Readonly<Record<string, PersonDetailDto>>;
  readonly activitySections: readonly ActivitySectionDto[];
  readonly pendingCount: number;
  readonly auditEvents: readonly AuditListItem[];
  readonly settlementsById: Readonly<Record<string, SettlementDetailDto>>;
}

interface CreateRequestInput {
  readonly requestType: 'debt' | 'manual_settlement';
  readonly responderUserId: string;
  readonly debtorUserId: string;
  readonly creditorUserId: string;
  readonly amountMinor: number;
  readonly description: string;
}

const APP_SNAPSHOT_QUERY_KEY = 'app-snapshot';

function getMockSnapshot(): AppSnapshot {
  const pendingItems = mockActivitySections.find((section) => section.key === 'pending')?.items.length ?? 0;
  return {
    dashboard: mockDashboard,
    people: mockDashboard.activePeople,
    peopleById: Object.fromEntries(mockPersonDetails.map((person) => [person.userId, person])),
    activitySections: mockActivitySections,
    pendingCount: pendingItems,
    auditEvents: mockAudit,
    settlementsById: {
      [mockSettlement.id]: mockSettlement,
    },
  };
}

function assertSupabaseClient() {
  if (!supabase) {
    throw new Error('Supabase no esta configurado en esta app.');
  }

  return supabase;
}

function getCounterpartyUserId(relationship: RelationshipRow, currentUserId: string): string | null {
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

function buildNameByUserId(profiles: readonly UserProfileRow[], currentUserId: string): Map<string, string> {
  const names = new Map<string, string>();

  for (const profile of profiles) {
    names.set(profile.id, profile.id === currentUserId ? 'Tu' : profile.display_name);
  }

  return names;
}

function deriveDirection(
  currentUserId: string,
  edge: OpenDebtRow | undefined,
  latestRequest: FinancialRequestRow | undefined,
): PersonCardDto['direction'] {
  if (edge) {
    return edge.creditor_user_id === currentUserId ? 'owes_me' : 'i_owe';
  }

  if (latestRequest) {
    return latestRequest.creditor_user_id === currentUserId ? 'owes_me' : 'i_owe';
  }

  return 'owes_me';
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

function formatPendingRequestTitle(request: FinancialRequestRow, names: Map<string, string>): string {
  const creatorName = names.get(request.creator_user_id) ?? 'Tu contraparte';
  if (request.request_type === 'manual_settlement') {
    return `${creatorName} te propuso un pago manual`;
  }

  if (request.request_type === 'reversal') {
    return `${creatorName} te propuso una reversa`;
  }

  return `${creatorName} te envio una deuda`;
}

function formatPendingRequestSubtitle(request: FinancialRequestRow): string {
  return `${formatCop(request.amount_minor)} | ${request.description ?? 'Sin descripcion'} | ${formatRelativeLabel(request.created_at)}`;
}

function parseSettlementMovements(value: Database['public']['Tables']['settlement_proposals']['Row']['movements_json']) {
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
): ActionableItem[] {
  return proposals.flatMap((proposal) => {
    const participants = participantsByProposalId.get(proposal.id) ?? [];
    const actorParticipant = participants.find((participant) => participant.participant_user_id === currentUserId);
    if (!actorParticipant) {
      return [];
    }

    const participantNames = participants.map((participant) => names.get(participant.participant_user_id) ?? 'Persona');
    const others = participantNames.filter((name) => name !== 'Tu');
    const titleBase =
      others.length > 0 ? `Cierre con ${others.join(', ')}` : 'Cierre pendiente en tu circulo';

    if (proposal.status === 'pending_approvals' && actorParticipant.decision === 'pending') {
      return [
        {
          id: proposal.id,
          kind: 'settlement_proposal',
          title: titleBase,
          subtitle: `Falta tu aprobacion | ${formatRelativeLabel(proposal.created_at)}`,
          status: 'pending_approvals',
          ctaLabel: 'Revisar',
          href: `/settlements/${proposal.id}`,
          createdAt: proposal.created_at,
        },
      ];
    }

    if (proposal.status === 'approved' && !proposal.executed_at) {
      return [
        {
          id: proposal.id,
          kind: 'settlement_proposal',
          title: `${titleBase} listo para ejecutar`,
          subtitle: `Todos aprobaron | ${formatRelativeLabel(proposal.created_at)}`,
          status: 'approved',
          ctaLabel: 'Ejecutar',
          href: `/settlements/${proposal.id}`,
          createdAt: proposal.created_at,
        },
      ];
    }

    return [];
  });
}

function historyToneForRow(
  row: RelationshipHistoryRow,
  currentUserId: string,
): PersonTimelineItemDto['tone'] {
  if (row.item_kind === 'ledger_transaction' && row.subtype === 'cycle_settlement') {
    return 'neutral';
  }

  if (row.item_kind === 'ledger_transaction' && row.subtype === 'manual_settlement_acceptance') {
    return 'positive';
  }

  if (row.status === 'rejected' || row.status === 'countered') {
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

function historyKindForActivity(row: RelationshipHistoryRow): ActivityItemDto['kind'] {
  if (row.item_kind === 'financial_request') {
    return row.status === 'accepted' ? 'accepted_request' : 'financial_request';
  }

  if (row.subtype === 'manual_settlement_acceptance') {
    return 'manual_payment';
  }

  return 'system_note';
}

function historyKindForTimeline(row: RelationshipHistoryRow): PersonTimelineItemDto['kind'] {
  if (row.item_kind === 'financial_request') {
    return 'request';
  }

  if (row.subtype === 'manual_settlement_acceptance') {
    return 'payment';
  }

  if (row.subtype === 'cycle_settlement') {
    return 'settlement';
  }

  return 'system';
}

function buildHistoryTitle(row: RelationshipHistoryRow, counterpartyName: string): string {
  if (row.item_kind === 'financial_request') {
    if (row.status === 'pending') {
      return `Request pendiente con ${counterpartyName}`;
    }

    if (row.status === 'accepted') {
      return row.subtype === 'manual_settlement'
        ? `Pago con ${counterpartyName} confirmado`
        : `Deuda con ${counterpartyName} confirmada`;
    }

    if (row.status === 'countered') {
      return `${counterpartyName} hizo una contraoferta`;
    }

    if (row.status === 'rejected') {
      return `${counterpartyName} rechazo el request`;
    }

    return `Request con ${counterpartyName}`;
  }

  if (row.subtype === 'manual_settlement_acceptance') {
    return `Pago manual con ${counterpartyName}`;
  }

  if (row.subtype === 'cycle_settlement') {
    return `Cierre ejecutado con ${counterpartyName}`;
  }

  return `Movimiento con ${counterpartyName}`;
}

function buildHistorySubtitle(row: RelationshipHistoryRow): string {
  const pieces = [formatRelativeLabel(row.happened_at)];
  if (row.description) {
    pieces.unshift(row.description);
  }

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

  const approvalsPending = participants.filter((participant) => participant.decision === 'pending').length;
  const explainers =
    proposal.status === 'pending_approvals'
      ? [
          approvalsPending > 0
            ? `Faltan ${approvalsPending} aprobacion${approvalsPending > 1 ? 'es' : ''} para ejecutar.`
            : 'Todos aprobaron, solo falta ejecutar.',
          'El snapshot hash evita ejecutar un cierre sobre un grafo viejo.',
        ]
      : proposal.status === 'approved'
        ? ['La propuesta ya fue aprobada por todos.', 'El siguiente paso es ejecutar los movimientos.']
        : proposal.status === 'executed'
          ? ['El ledger ya recibio los movimientos de este cierre.', 'El saldo neto fue recalculado despues de ejecutar.']
          : ['Revisa el estado tecnico antes de volver a proponer un cierre.'];

  return {
    id: proposal.id,
    status: proposal.status,
    snapshotHash: proposal.graph_snapshot_hash,
    participants: participants.map((participant) => names.get(participant.participant_user_id) ?? 'Persona'),
    movements,
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
  readonly relationships: readonly RelationshipRow[];
  readonly openDebts: readonly OpenDebtRow[];
  readonly financialRequests: readonly FinancialRequestRow[];
  readonly history: readonly RelationshipHistoryRow[];
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

  const openDebtsByRelationshipId = new Map(input.openDebts.map((row) => [row.relationship_id, row]));
  const requestsByRelationshipId = groupBy(input.financialRequests, (row) => row.relationship_id);
  const historyByRelationshipId = groupBy(input.history, (row) => row.relationship_id);
  const settlementParticipantsByProposalId = groupBy(
    input.settlementParticipants,
    (row) => row.settlement_proposal_id,
  );

  const people = Array.from(relationshipsByCounterpartyId.entries())
    .map(([counterpartyUserId, relationship]): PersonCardDto => {
      const requests = requestsByRelationshipId.get(relationship.id) ?? [];
      const latestRequest = requests[0];
      const edge = openDebtsByRelationshipId.get(relationship.id);
      const direction = deriveDirection(input.currentUserId, edge, latestRequest);
      const timeline = historyByRelationshipId.get(relationship.id) ?? [];
      const latestHistory = timeline[0];
      const lastActivityLabel = latestRequest && (!latestHistory || latestRequest.created_at >= latestHistory.happened_at)
        ? `Request pendiente ${formatRelativeLabel(latestRequest.created_at)}`
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
      const historyRows = relationship ? (historyByRelationshipId.get(relationship.id) ?? []) : [];
      const timeline = historyRows
        .map((row): PersonTimelineItemDto => ({
          id: row.item_id,
          title: buildHistoryTitle(row, person.displayName),
          subtitle: buildHistorySubtitle(row),
          amountMinor: row.amount_minor,
          tone: historyToneForRow(row, input.currentUserId),
          kind: historyKindForTimeline(row),
          status: row.status,
        }))
        .slice(0, 12);

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
          timeline,
        },
      ];
    }),
  );

  const pendingRequests = input.financialRequests
    .filter((request) => request.status === 'pending' && request.responder_user_id === input.currentUserId)
    .map(
      (request): ActionableItem => ({
        id: request.id,
        kind: 'financial_request',
        title: formatPendingRequestTitle(request, nameByUserId),
        subtitle: formatPendingRequestSubtitle(request),
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
  );

  const pendingItems = sortByNewest([...pendingRequests, ...pendingSettlements]);

  const historyItems = input.history
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
        title: buildHistoryTitle(row, counterpartyName),
        subtitle: buildHistorySubtitle(row),
        status: row.status,
        href: counterpartyUserId ? `/person/${counterpartyUserId}` : '/activity',
        amountMinor: row.amount_minor,
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
      activePeople: people.slice(0, 6),
    },
    people,
    peopleById,
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
    relationshipsResult,
    openDebtsResult,
    requestsResult,
    historyResult,
    settlementProposalsResult,
    settlementParticipantsResult,
    auditResult,
  ] = await Promise.all([
    client.from('user_profiles').select('id, display_name, email, created_at, updated_at'),
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
      .select('id, actor_user_id, entity_type, entity_id, event_name, request_id, metadata_json, created_at')
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  if (profilesResult.error) {
    throw new Error(profilesResult.error.message);
  }

  if (relationshipsResult.error) {
    throw new Error(relationshipsResult.error.message);
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
    relationships: relationshipsResult.data ?? [],
    openDebts: openDebtsResult.data ?? [],
    financialRequests: requestsResult.data ?? [],
    history: historyResult.data ?? [],
    settlementProposals: settlementProposalsResult.data ?? [],
    settlementParticipants: settlementParticipantsResult.data ?? [],
    auditEvents: auditResult.data ?? [],
  });
}

async function fetchAppSnapshot(authMode: 'demo' | 'supabase', userId: string | null) {
  if (authMode === 'demo') {
    return getMockSnapshot();
  }

  if (!userId) {
    throw new Error('No hay una sesion lista para cargar datos.');
  }

  return fetchLiveSnapshot(userId);
}

async function parseFunctionError(error: { readonly message: string; readonly context?: Response }) {
  if (error.context) {
    try {
      const body = (await error.context.json()) as { error?: string };
      if (typeof body.error === 'string' && body.error.length > 0) {
        return body.error;
      }
    } catch {
      return error.message;
    }
  }

  return error.message;
}

async function invokeSupabaseFunction<TBody extends Record<string, unknown>, TResult>(
  name: string,
  body: TBody,
): Promise<TResult> {
  const client = assertSupabaseClient();
  const { data, error } = await client.functions.invoke(name, { body });

  if (error) {
    throw new Error(await parseFunctionError(error));
  }

  return data as TResult;
}

async function invalidateAppSnapshot() {
  await queryClient.invalidateQueries({
    queryKey: [APP_SNAPSHOT_QUERY_KEY],
  });
}

export function useAppSnapshot() {
  const { authMode, userId } = useSession();

  return useQuery({
    queryKey: [APP_SNAPSHOT_QUERY_KEY, authMode, userId ?? 'demo'],
    enabled: authMode === 'demo' || Boolean(userId),
    queryFn: () => fetchAppSnapshot(authMode, userId),
  });
}

export function useCreateRequestMutation() {
  const { authMode } = useSession();

  return useMutation({
    mutationFn: async (input: CreateRequestInput) => {
      const payload = createDebtRequestSchema.parse({
        idempotencyKey: createIdempotencyKey(`mobile_${input.requestType}`),
        responderUserId: input.responderUserId,
        debtorUserId: input.debtorUserId,
        creditorUserId: input.creditorUserId,
        amountMinor: input.amountMinor,
        description: input.description,
      });

      if (authMode === 'demo') {
        return { status: 'demo' } as const;
      }

      return input.requestType === 'manual_settlement'
        ? invokeSupabaseFunction('propose-manual-settlement', payload)
        : invokeSupabaseFunction('create-debt-request', payload);
    },
    onSuccess: async () => {
      await invalidateAppSnapshot();
    },
  });
}

export function useAcceptFinancialRequestMutation() {
  const { authMode } = useSession();

  return useMutation({
    mutationFn: async (requestId: string) => {
      const payload = requestDecisionSchema.parse({
        idempotencyKey: createIdempotencyKey('accept_request'),
        requestId,
      });

      if (authMode === 'demo') {
        return { status: 'demo' } as const;
      }

      return invokeSupabaseFunction('accept-financial-request', payload);
    },
    onSuccess: invalidateAppSnapshot,
  });
}

export function useRejectFinancialRequestMutation() {
  const { authMode } = useSession();

  return useMutation({
    mutationFn: async (requestId: string) => {
      const payload = requestDecisionSchema.parse({
        idempotencyKey: createIdempotencyKey('reject_request'),
        requestId,
      });

      if (authMode === 'demo') {
        return { status: 'demo' } as const;
      }

      return invokeSupabaseFunction('reject-financial-request', payload);
    },
    onSuccess: invalidateAppSnapshot,
  });
}

export function useApproveSettlementMutation() {
  const { authMode } = useSession();

  return useMutation({
    mutationFn: async (proposalId: string) => {
      const payload = cycleSettlementDecisionSchema.parse({
        idempotencyKey: createIdempotencyKey('approve_settlement'),
        proposalId,
      });

      if (authMode === 'demo') {
        return { status: 'demo' } as const;
      }

      return invokeSupabaseFunction('approve-cycle-settlement', payload);
    },
    onSuccess: invalidateAppSnapshot,
  });
}

export function useRejectSettlementMutation() {
  const { authMode } = useSession();

  return useMutation({
    mutationFn: async (proposalId: string) => {
      const payload = cycleSettlementDecisionSchema.parse({
        idempotencyKey: createIdempotencyKey('reject_settlement'),
        proposalId,
      });

      if (authMode === 'demo') {
        return { status: 'demo' } as const;
      }

      return invokeSupabaseFunction('reject-cycle-settlement', payload);
    },
    onSuccess: invalidateAppSnapshot,
  });
}

export function useExecuteSettlementMutation() {
  const { authMode } = useSession();

  return useMutation({
    mutationFn: async (proposalId: string) => {
      const payload = cycleSettlementExecutionSchema.parse({
        idempotencyKey: createIdempotencyKey('execute_settlement'),
        proposalId,
      });

      if (authMode === 'demo') {
        return { status: 'demo' } as const;
      }

      return invokeSupabaseFunction('execute-approved-cycle-settlement', payload);
    },
    onSuccess: invalidateAppSnapshot,
  });
}
