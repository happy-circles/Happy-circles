import type {
  ActionableItem,
  HappyCircleScoreEventRow,
  InboxItemRow,
  SettlementDetailDto,
  SettlementParticipantRow,
  SettlementProposalRow,
} from '../types';
import { formatRelativeLabel } from '../utils/dates';
import {
  parseSettlementMovements,
  settlementProposalApprovedCount,
  settlementProposalApprovalsPending,
  settlementParticipantLegAmount,
  settlementProposalParticipantAmount,
  settlementProposalParticipantCount,
} from './settlement-core';
import { LIVE_DATA_CTA, LIVE_DATA_ROUTES } from '../presentation';
import { formatCop } from '../../data';
import {
  buildSettlementVersionTimeline,
  isCurrentSettlementVersion,
  staleReasonDetail,
} from './settlement-versions';
import {
  buildSettlementParticipantLabels,
  normalizeSettlementDetailDecision,
  settlementParticipantLabel,
  summarizeSettlementParticipants,
} from './settlement-participants';

export { buildSettlementProposalHistoryTimelineItems } from './settlement-history';
export {
  buildSettlementParticipantLabels,
  normalizeSettlementDetailDecision,
  settlementParticipantLabel,
  summarizeSettlementParticipants,
} from './settlement-participants';

function personalMovementAmount(
  movements: readonly {
    readonly amountMinor: number;
    readonly creditorUserId: string;
    readonly debtorUserId: string;
  }[],
  currentUserId: string,
  options: { readonly context: string; readonly requireBalanced: boolean },
): number {
  const summary = movements.reduce(
    (totals, movement) => ({
      paidMinor:
        totals.paidMinor + (movement.debtorUserId === currentUserId ? movement.amountMinor : 0),
      receivedMinor:
        totals.receivedMinor +
        (movement.creditorUserId === currentUserId ? movement.amountMinor : 0),
    }),
    { paidMinor: 0, receivedMinor: 0 },
  );

  return settlementParticipantLegAmount(summary, options);
}

function personalMovementCount(
  movements: readonly { readonly creditorUserId: string; readonly debtorUserId: string }[],
  currentUserId: string,
): number {
  return movements.filter(
    (movement) =>
      movement.debtorUserId === currentUserId || movement.creditorUserId === currentUserId,
  ).length;
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
  const directParticipantUserIdsForProposal = (proposal: SettlementProposalRow) => {
    const userIds = new Set<string>([currentUserId]);

    for (const movement of parseSettlementMovements(proposal.movements_json)) {
      if (movement.debtor_user_id === currentUserId) {
        userIds.add(movement.creditor_user_id);
      }
      if (movement.creditor_user_id === currentUserId) {
        userIds.add(movement.debtor_user_id);
      }
    }

    return Array.from(userIds);
  };

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

    const personalAmountMinor = settlementProposalParticipantAmount(proposal, currentUserId);
    const visibleParticipantUserIds = directParticipantUserIdsForProposal(proposal);
    const participantLabels = buildSettlementParticipantLabels({
      participantUserIds: visibleParticipantUserIds,
      currentUserId,
      visibleCounterpartyUserIds: new Set([
        ...visibleCounterpartyUserIds,
        ...visibleParticipantUserIds,
      ]),
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
      amountMinor: personalAmountMinor,
      category: 'cycle',
      originSettlementProposalId: proposal.id,
      happyCircleCaseId: proposal.happy_circle_case_id,
      replacesProposalId: proposal.replaces_proposal_id,
      replacedByProposalId: proposal.replaced_by_proposal_id,
      staleReason: proposal.stale_reason,
      participantUserIds: visibleParticipantUserIds,
      createdByCurrentUser: proposal.created_by_user_id === currentUserId,
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
    const visibleParticipantUserIds = directParticipantUserIdsForProposal(proposal);
    const participantLabels = buildSettlementParticipantLabels({
      participantUserIds: visibleParticipantUserIds,
      currentUserId,
      visibleCounterpartyUserIds: new Set([
        ...visibleCounterpartyUserIds,
        ...visibleParticipantUserIds,
      ]),
      names,
    });
    const titleBase = `Ajusta saldos con ${summarizeSettlementParticipants(participantLabels)}`;

    if (proposal.status === 'pending_approvals' && actorParticipant?.decision === 'approved') {
      const approvalsPending = settlementProposalApprovalsPending(proposal, participants);
      const personalAmountMinor = settlementProposalParticipantAmount(proposal, currentUserId);

      items.push({
        id: proposal.id,
        kind: 'settlement_proposal',
        title: 'Happy Circle esperando aprobaciones',
        subtitle: `${titleBase} | faltan ${approvalsPending} ${approvalsPending === 1 ? 'aprobación' : 'aprobaciones'}`,
        status: 'waiting_other_side',
        ctaLabel: LIVE_DATA_CTA.review,
        href: LIVE_DATA_ROUTES.settlement(proposal.id),
        amountMinor: personalAmountMinor,
        category: 'cycle',
        originSettlementProposalId: proposal.id,
        happyCircleCaseId: proposal.happy_circle_case_id,
        replacesProposalId: proposal.replaces_proposal_id,
        replacedByProposalId: proposal.replaced_by_proposal_id,
        staleReason: proposal.stale_reason,
        participantUserIds: visibleParticipantUserIds,
        createdByCurrentUser: proposal.created_by_user_id === currentUserId,
        createdAt: proposal.created_at,
      });
    }

    if (proposal.status === 'approved' && !proposal.executed_at) {
      const personalAmountMinor = settlementProposalParticipantAmount(proposal, currentUserId);

      items.push({
        id: proposal.id,
        kind: 'settlement_proposal',
        title: 'Happy Circle listo',
        subtitle: `${titleBase} | se completara automaticamente`,
        status: 'approved',
        ctaLabel: LIVE_DATA_CTA.complete,
        href: LIVE_DATA_ROUTES.settlement(proposal.id),
        amountMinor: personalAmountMinor,
        category: 'cycle',
        originSettlementProposalId: proposal.id,
        happyCircleCaseId: proposal.happy_circle_case_id,
        replacesProposalId: proposal.replaces_proposal_id,
        replacedByProposalId: proposal.replaced_by_proposal_id,
        staleReason: proposal.stale_reason,
        participantUserIds: visibleParticipantUserIds,
        createdByCurrentUser: proposal.created_by_user_id === currentUserId,
        createdAt: proposal.created_at,
      });
    }
  }

  return items;
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
  treasureAwardEvent: HappyCircleScoreEventRow | null = null,
): SettlementDetailDto {
  const parsedMovements = parseSettlementMovements(proposal.movements_json);
  const parsedOriginalMovements = parseSettlementMovements(proposal.graph_snapshot);
  const personalMovements = parsedMovements.filter(
    (movement) =>
      movement.debtor_user_id === currentUserId || movement.creditor_user_id === currentUserId,
  );
  const personalOriginalMovements = parsedOriginalMovements.filter(
    (movement) =>
      movement.debtor_user_id === currentUserId || movement.creditor_user_id === currentUserId,
  );
  const directCounterpartyUserIds = new Set(
    personalMovements.flatMap((movement) => [movement.debtor_user_id, movement.creditor_user_id]),
  );
  directCounterpartyUserIds.delete(currentUserId);
  const participantLabel = (participantUserId: string) => {
    if (participantUserId === currentUserId || directCounterpartyUserIds.has(participantUserId)) {
      return (
        settlementParticipantLabel({
          participantUserId,
          currentUserId,
          visibleCounterpartyUserIds: new Set([...visibleCounterpartyUserIds, participantUserId]),
          names,
        }) ?? 'Persona'
      );
    }

    return null;
  };

  const buildMovementDetails = (
    rawMovements: ReturnType<typeof parseSettlementMovements>,
    idPrefix: string,
  ) =>
    rawMovements.map((movement, index) => {
      const debtor = participantLabel(movement.debtor_user_id) ?? 'Persona';
      const creditor = participantLabel(movement.creditor_user_id) ?? 'Persona';

      return {
        id: `${proposal.id}:${idPrefix}:${index}`,
        debtorUserId: movement.debtor_user_id,
        debtorLabel: debtor,
        creditorUserId: movement.creditor_user_id,
        creditorLabel: creditor,
        amountMinor: movement.amount_minor,
      };
    });

  const movementDetails = buildMovementDetails(personalMovements, 'movement');
  const originalMovementDetails = buildMovementDetails(
    personalOriginalMovements,
    'original-movement',
  );
  const visibleParticipants = participants.filter(
    (participant) =>
      participant.participant_user_id === currentUserId ||
      directCounterpartyUserIds.has(participant.participant_user_id),
  );
  const totalAmountMinor = personalMovementAmount(movementDetails, currentUserId, {
    context: `Settlement detail ${proposal.id} visible total participant ${currentUserId}`,
    requireBalanced:
      proposal.happy_circle_case_id !== null || proposal.source_graph_cycle_job_id !== null,
  });
  const personalAmountMinor = personalMovementAmount(movementDetails, currentUserId, {
    context: `Settlement detail ${proposal.id} participant ${currentUserId}`,
    requireBalanced:
      proposal.happy_circle_case_id !== null || proposal.source_graph_cycle_job_id !== null,
  });
  const movementCount = movementDetails.length;
  const personalFinalMovementCount = personalMovementCount(movementDetails, currentUserId);
  const originalMovementCount = originalMovementDetails.length;
  const personalOriginalMovementCount = personalMovementCount(
    originalMovementDetails,
    currentUserId,
  );
  const savedMovementsCount = Math.max(originalMovementCount - movementCount, 0);
  const personalSavedMovementsCount = Math.max(
    personalOriginalMovementCount - personalFinalMovementCount,
    0,
  );
  const movements = movementDetails.map(
    (movement) =>
      `${movement.debtorLabel} paga a ${movement.creditorLabel}: ${formatCop(movement.amountMinor)}`,
  );
  const impactLines = movementDetails.map((movement) => {
    return `Ajusta el saldo entre ${movement.debtorLabel} y ${movement.creditorLabel} por ${formatCop(movement.amountMinor)}`;
  });
  const participantDecisions = visibleParticipants.map((participant) => ({
    userId: participant.participant_user_id,
    label: participantLabel(participant.participant_user_id) ?? 'Persona',
    decision: normalizeSettlementDetailDecision(participant.decision),
  }));
  const participantStatuses = participantDecisions.map(
    (participant) => `${participant.label}: ${participant.decision}`,
  );
  const participantCount = settlementProposalParticipantCount(proposal, participants);
  const approvedCount = settlementProposalApprovedCount(proposal, participants);
  const approvalsPending = settlementProposalApprovalsPending(proposal, participants);
  const explainers =
    proposal.status === 'pending_approvals'
      ? [
          approvalsPending > 0
            ? `Faltan ${approvalsPending} ${approvalsPending === 1 ? 'aprobación' : 'aprobaciones'}.`
            : 'Sin pendientes.',
        ]
      : proposal.status === 'approved'
        ? ['Aprobado. Falta cerrar.']
        : proposal.status === 'executed'
          ? ['Movimientos registrados.']
          : proposal.status === 'stale'
            ? [
                staleReasonDetail(proposal.stale_reason),
                proposal.replaced_by_proposal_id ? 'Hay un cálculo nuevo.' : 'No se puede aprobar.',
              ]
            : ['No se aplicaron movimientos.'];

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
    participantCount,
    approvedCount,
    approvalsPending,
    totalAmountMinor,
    personalAmountMinor,
    movementCount,
    personalMovementCount: personalFinalMovementCount,
    originalMovementCount,
    personalOriginalMovementCount,
    savedMovementsCount,
    personalSavedMovementsCount,
    movementDetails,
    originalMovementDetails,
    movements,
    impactLines,
    explainers,
    treasureAward: treasureAwardEvent
      ? {
          id: treasureAwardEvent.id,
          awardedAt: treasureAwardEvent.awarded_at,
          claimedAt: treasureAwardEvent.treasure_claimed_at,
          scoreDelta: treasureAwardEvent.score_delta,
        }
      : null,
    timeline: buildSettlementVersionTimeline({
      proposal,
      allProposals,
      participantsByProposalId,
      currentUserId,
    }),
  };
}
