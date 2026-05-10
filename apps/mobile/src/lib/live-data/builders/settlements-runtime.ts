import type { PersonTimelineItemDto } from '@happy-circles/application';
import type {
  ActionableItem,
  InboxItemRow,
  SettlementDetailDecision,
  SettlementDetailDto,
  SettlementParticipantRow,
  SettlementProposalRow,
} from '../types';
import { formatRelativeLabel } from '../utils/dates';
import { parseSettlementMovements, settlementProposalTotalAmount } from './settlement-core';
import { LIVE_DATA_CTA, LIVE_DATA_ROUTES } from '../presentation';
import { formatCop } from '../../data';
import {
  buildSettlementVersionTimeline,
  isCurrentSettlementVersion,
  staleReasonDetail,
} from './settlement-versions';

export function normalizeSettlementDetailDecision(
  decision: string | null,
): SettlementDetailDecision {
  if (decision === 'approved') {
    return 'approved';
  }

  if (decision === 'rejected') {
    return 'rejected';
  }

  return 'pending';
}

export function buildPendingSettlementItems(
  proposals: readonly SettlementProposalRow[],
  participantsByProposalId: Map<string, SettlementParticipantRow[]>,
  names: Map<string, string>,
  currentUserId: string,
  visibleCounterpartyUserIds: ReadonlySet<string>,
  inboxItems: readonly InboxItemRow[],
  nowMs: number,
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
    const participantLabels = buildSettlementParticipantLabels({
      participantUserIds: participants.map((participant) => participant.participant_user_id),
      currentUserId,
      visibleCounterpartyUserIds,
      names,
    });
    const titleBase = `Ajusta saldos con ${summarizeSettlementParticipants(participantLabels)}`;

    pendingProposalIds.add(proposal.id);
    items.push({
      id: proposal.id,
      kind: 'settlement_proposal',
      title: 'Happy Circle pendiente',
      subtitle: `${titleBase} | ${formatRelativeLabel(proposal.created_at, nowMs)}`,
      status: 'pending_approvals',
      ctaLabel: LIVE_DATA_CTA.review,
      href: LIVE_DATA_ROUTES.settlement(proposal.id),
      amountMinor: settlementProposalTotalAmount(proposal),
      category: 'cycle',
      participantUserIds: participants.map((participant) => participant.participant_user_id),
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
    const participantLabels = buildSettlementParticipantLabels({
      participantUserIds: participants.map((participant) => participant.participant_user_id),
      currentUserId,
      visibleCounterpartyUserIds,
      names,
    });
    const titleBase = `Ajusta saldos con ${summarizeSettlementParticipants(participantLabels)}`;

    if (proposal.status === 'pending_approvals' && actorParticipant?.decision === 'approved') {
      const approvalsPending = participants.filter(
        (participant) => participant.decision === 'pending',
      ).length;

      items.push({
        id: proposal.id,
        kind: 'settlement_proposal',
        title: 'Happy Circle esperando aprobaciones',
        subtitle: `${titleBase} | faltan ${approvalsPending} aprobacion${approvalsPending === 1 ? '' : 'es'}`,
        status: 'waiting_other_side',
        ctaLabel: LIVE_DATA_CTA.review,
        href: LIVE_DATA_ROUTES.settlement(proposal.id),
        amountMinor: settlementProposalTotalAmount(proposal),
        category: 'cycle',
        participantUserIds: participants.map((participant) => participant.participant_user_id),
        createdAt: proposal.created_at,
      });
    }

    if (proposal.status === 'approved' && !proposal.executed_at) {
      items.push({
        id: proposal.id,
        kind: 'settlement_proposal',
        title: 'Happy Circle listo',
        subtitle: `${titleBase} | se completara automaticamente`,
        status: 'approved',
        ctaLabel: LIVE_DATA_CTA.complete,
        href: LIVE_DATA_ROUTES.settlement(proposal.id),
        amountMinor: settlementProposalTotalAmount(proposal),
        category: 'cycle',
        participantUserIds: participants.map((participant) => participant.participant_user_id),
        createdAt: proposal.created_at,
      });
    }
  }

  return items;
}

export function settlementParticipantLabel(input: {
  readonly participantUserId: string;
  readonly currentUserId: string;
  readonly visibleCounterpartyUserIds: ReadonlySet<string>;
  readonly names: Map<string, string>;
}): string | null {
  if (input.participantUserId === input.currentUserId) {
    return 'Tu';
  }

  if (input.visibleCounterpartyUserIds.has(input.participantUserId)) {
    return input.names.get(input.participantUserId) ?? 'Persona';
  }

  return null;
}

export function buildSettlementParticipantLabels(input: {
  readonly participantUserIds: readonly string[];
  readonly currentUserId: string;
  readonly visibleCounterpartyUserIds: ReadonlySet<string>;
  readonly names: Map<string, string>;
}): readonly string[] {
  const labels: string[] = [];
  let hiddenCount = 0;

  for (const participantUserId of input.participantUserIds) {
    const label = settlementParticipantLabel({
      participantUserId,
      currentUserId: input.currentUserId,
      visibleCounterpartyUserIds: input.visibleCounterpartyUserIds,
      names: input.names,
    });

    if (label) {
      if (!labels.includes(label)) {
        labels.push(label);
      }
      continue;
    }

    hiddenCount += 1;
  }

  if (hiddenCount === 1) {
    labels.push('Otra persona');
  } else if (hiddenCount > 1) {
    labels.push(`${hiddenCount} personas mas`);
  }

  return labels;
}

export function summarizeSettlementParticipants(labels: readonly string[]): string {
  const others = labels.filter((label) => label !== 'Tu');

  if (others.length === 0) {
    return 'tu circulo';
  }

  if (others.length === 1) {
    return others[0] ?? 'tu circulo';
  }

  if (others.length === 2) {
    return `${others[0]} y ${others[1]}`;
  }

  return `${others[0]} y ${others.length - 1} mas`;
}

export function buildSettlementProposalHistoryTimelineItems(input: {
  readonly proposals: readonly SettlementProposalRow[];
  readonly participantsByProposalId: Map<string, SettlementParticipantRow[]>;
  readonly currentUserId: string;
  readonly counterpartyUserId: string;
  readonly names: Map<string, string>;
  readonly nowMs: number;
}): PersonTimelineItemDto[] {
  return input.proposals.flatMap((proposal): PersonTimelineItemDto[] => {
    if (proposal.status !== 'rejected' && proposal.status !== 'stale') {
      return [];
    }

    const participants = input.participantsByProposalId.get(proposal.id) ?? [];
    const participantIds = new Set(
      participants.map((participant) => participant.participant_user_id),
    );
    if (!participantIds.has(input.currentUserId) || !participantIds.has(input.counterpartyUserId)) {
      return [];
    }

    const happenedAt = proposal.updated_at ?? proposal.created_at;
    const otherNames = participants
      .map((participant) => input.names.get(participant.participant_user_id) ?? 'Persona')
      .filter((name) => name !== 'Tu');
    const detail =
      proposal.status === 'rejected'
        ? 'Este Circle no se completo'
        : staleReasonDetail(proposal.stale_reason);
    const peopleLabel = otherNames.length > 0 ? `Con ${otherNames.join(', ')}` : 'Happy Circle';

    return [
      {
        id: `${proposal.id}:${proposal.status}`,
        title:
          proposal.status === 'rejected'
            ? 'Happy Circle no completado'
            : 'Happy Circle reemplazado',
        subtitle: [peopleLabel, detail, formatRelativeLabel(happenedAt, input.nowMs)].join(' | '),
        amountMinor: settlementProposalTotalAmount(proposal),
        category: 'cycle',
        tone: 'neutral',
        kind: 'settlement',
        status: proposal.status,
        sourceType: 'system',
        sourceLabel: 'Happy Circle',
        originRequestId: undefined,
        originSettlementProposalId: proposal.id,
        flowLabel: peopleLabel,
        detail,
        happenedAt,
        happenedAtLabel: formatRelativeLabel(happenedAt, input.nowMs),
      },
    ];
  });
}

export function buildSettlementDetail(
  proposal: SettlementProposalRow,
  participants: readonly SettlementParticipantRow[],
  names: Map<string, string>,
  currentUserId: string,
  visibleCounterpartyUserIds: ReadonlySet<string>,
  allProposals: readonly SettlementProposalRow[] = [proposal],
  participantsByProposalId: Map<string, SettlementParticipantRow[]> = new Map([
    [proposal.id, [...participants]],
  ]),
): SettlementDetailDto {
  const participantLabel = (participantUserId: string) =>
    settlementParticipantLabel({
      participantUserId,
      currentUserId,
      visibleCounterpartyUserIds,
      names,
    }) ?? 'Otra persona';

  const movementDetails = parseSettlementMovements(proposal.movements_json).map(
    (movement, index) => {
      const debtor = participantLabel(movement.debtor_user_id);
      const creditor = participantLabel(movement.creditor_user_id);

      return {
        id: `${proposal.id}:movement:${index}`,
        debtorUserId: movement.debtor_user_id,
        debtorLabel: debtor,
        creditorUserId: movement.creditor_user_id,
        creditorLabel: creditor,
        amountMinor: movement.amount_minor,
      };
    },
  );
  const movements = movementDetails.map(
    (movement) =>
      `${movement.debtorLabel} paga a ${movement.creditorLabel}: ${formatCop(movement.amountMinor)}`,
  );
  const impactLines = movementDetails.map((movement) => {
    return `Ajusta el saldo entre ${movement.debtorLabel} y ${movement.creditorLabel} por ${formatCop(movement.amountMinor)}`;
  });
  const participantDecisions = participants.map((participant) => ({
    userId: participant.participant_user_id,
    label: participantLabel(participant.participant_user_id),
    decision: normalizeSettlementDetailDecision(participant.decision),
  }));
  const participantStatuses = participantDecisions.map(
    (participant) => `${participant.label}: ${participant.decision}`,
  );

  const approvalsPending = participants.filter(
    (participant) => participant.decision === 'pending',
  ).length;
  const explainers =
    proposal.status === 'pending_approvals'
      ? [
          approvalsPending > 0
            ? `Faltan ${approvalsPending} aprobacion${approvalsPending > 1 ? 'es' : ''} para que quede aprobado.`
            : 'Todos aprobaron. Happy Circles lo completara automaticamente.',
          'Happy Circles evita aplicar una propuesta sobre saldos que ya cambiaron.',
        ]
      : proposal.status === 'approved'
        ? ['La propuesta ya fue aprobada por todos.', 'Estamos verificando el cierre automatico.']
        : proposal.status === 'executed'
          ? ['Completaste un Circle!', 'El saldo neto ya fue actualizado.']
          : proposal.status === 'stale'
            ? [
                staleReasonDetail(proposal.stale_reason),
                proposal.replaced_by_proposal_id
                  ? 'Hay una version nueva para revisar.'
                  : 'Esta version ya no puede aprobarse ni ejecutarse.',
              ]
            : ['Este Circle ya no esta activo. Puedes crear otro si los saldos cambiaron.'];

  return {
    id: proposal.id,
    happyCircleCaseId: proposal.happy_circle_case_id,
    versionNumber: proposal.version_number,
    isCurrentVersion: isCurrentSettlementVersion(proposal),
    replacesProposalId: proposal.replaces_proposal_id,
    replacedByProposalId: proposal.replaced_by_proposal_id,
    staleReason: proposal.stale_reason,
    status: proposal.status,
    snapshotHash: proposal.graph_snapshot_hash,
    participants: participantDecisions.map((participant) => participant.label),
    participantDecisions,
    participantStatuses,
    movementDetails,
    movements,
    impactLines,
    explainers,
    timeline: buildSettlementVersionTimeline({
      proposal,
      allProposals,
      participantsByProposalId,
    }),
  };
}
