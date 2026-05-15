import type { PersonTimelineItemDto } from '@happy-circles/application';

import type { SettlementParticipantRow, SettlementProposalRow } from '../types';
import { formatRelativeLabel } from '../utils/dates';
import { settlementProposalCounterpartyImpact } from './settlement-core';
import { staleReasonDetail } from './settlement-versions';

function settlementLifecycleCopy(input: {
  readonly actorDecision: string | null | undefined;
  readonly participantCount: number;
  readonly pendingCount: number;
  readonly proposalStatus: string;
  readonly staleReason: string | null;
}): { readonly detail: string; readonly title: string } {
  if (input.proposalStatus === 'executed') {
    return {
      detail: 'El saldo neto fue actualizado.',
      title: 'Circle cerrado',
    };
  }

  if (input.proposalStatus === 'stale') {
    const detail = `Luego fue reemplazada: ${staleReasonDetail(input.staleReason)}`;

    if (input.actorDecision === 'approved') {
      return {
        detail,
        title: 'Aprobaste esta versión',
      };
    }

    if (input.actorDecision === 'rejected') {
      return {
        detail,
        title: 'No aprobaste esta versión',
      };
    }

    return {
      detail,
      title: 'Versión reemplazada',
    };
  }

  if (input.actorDecision === 'approved') {
    const missingCount = Math.max(0, input.pendingCount);
    const reason =
      missingCount > 0
        ? `Faltaron ${missingCount} de ${input.participantCount} aprobaciones.`
        : 'Otra persona no aprobo el Circle.';

    return {
      detail: `${reason} No cambió el saldo.`,
      title: 'Aprobaste este Circle',
    };
  }

  if (input.actorDecision === 'rejected') {
    return {
      detail: 'No cambió el saldo.',
      title: 'No aprobaste este Circle',
    };
  }

  return {
    detail: 'No se completó. No cambió el saldo.',
    title: 'Circle no completado',
  };
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
    if (
      proposal.status !== 'rejected' &&
      proposal.status !== 'stale' &&
      proposal.status !== 'executed'
    ) {
      return [];
    }

    const participants = input.participantsByProposalId.get(proposal.id) ?? [];
    const participantIds = new Set(
      participants.map((participant) => participant.participant_user_id),
    );
    if (!participantIds.has(input.currentUserId) || !participantIds.has(input.counterpartyUserId)) {
      return [];
    }

    const counterpartyImpact = settlementProposalCounterpartyImpact(
      proposal,
      input.currentUserId,
      input.counterpartyUserId,
    );
    if (counterpartyImpact.amountMinor <= 0) {
      return [];
    }

    const actorParticipant = participants.find(
      (participant) => participant.participant_user_id === input.currentUserId,
    );
    const happenedAt =
      proposal.status === 'executed'
        ? (proposal.executed_at ?? proposal.updated_at ?? proposal.created_at)
        : (actorParticipant?.decided_at ?? proposal.updated_at ?? proposal.created_at);
    const otherNames = participants
      .map((participant) => input.names.get(participant.participant_user_id) ?? 'Persona')
      .filter((name) => name !== 'Tú' && name !== 'Tu');
    const pendingCount = participants.filter(
      (participant) => participant.decision === 'pending',
    ).length;
    const lifecycleCopy = settlementLifecycleCopy({
      actorDecision: actorParticipant?.decision,
      participantCount: participants.length,
      pendingCount,
      proposalStatus: proposal.status,
      staleReason: proposal.stale_reason,
    });
    const peopleLabel = otherNames.length > 0 ? `Con ${otherNames.join(', ')}` : 'Happy Circle';

    return [
      {
        id: `${proposal.id}:${proposal.status}`,
        title: lifecycleCopy.title,
        subtitle: [
          peopleLabel,
          lifecycleCopy.detail,
          formatRelativeLabel(happenedAt, input.nowMs),
        ].join(' | '),
        amountMinor: counterpartyImpact.amountMinor,
        category: 'cycle',
        tone:
          counterpartyImpact.direction === 'incoming'
            ? 'positive'
            : counterpartyImpact.direction === 'outgoing'
              ? 'negative'
              : 'neutral',
        kind: 'settlement',
        status: proposal.status,
        sourceType: 'system',
        sourceLabel: 'Happy Circle',
        originRequestId: undefined,
        originSettlementProposalId: proposal.id,
        happyCircleCaseId: proposal.happy_circle_case_id,
        replacesProposalId: proposal.replaces_proposal_id,
        replacedByProposalId: proposal.replaced_by_proposal_id,
        staleReason: proposal.stale_reason,
        flowLabel: peopleLabel,
        detail: lifecycleCopy.detail,
        happenedAt,
        happenedAtLabel: formatRelativeLabel(happenedAt, input.nowMs),
      },
    ];
  });
}
