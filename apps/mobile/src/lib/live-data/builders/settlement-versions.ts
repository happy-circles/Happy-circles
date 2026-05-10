import type {
  SettlementParticipantRow,
  SettlementProposalRow,
  SettlementVersionTimelineItemDto,
} from '../types';
import { settlementProposalTotalAmount } from './settlement-core';

function settlementVersionStatusTitle(status: string, versionNumber: number | null): string {
  const versionLabel = versionNumber ? `Version ${versionNumber}` : 'Version';

  if (status === 'pending_approvals') {
    return `${versionLabel} pendiente`;
  }
  if (status === 'approved') {
    return `${versionLabel} aprobada`;
  }
  if (status === 'executed') {
    return `${versionLabel} ejecutada`;
  }
  if (status === 'rejected') {
    return `${versionLabel} rechazada`;
  }
  if (status === 'stale') {
    return `${versionLabel} reemplazada`;
  }
  if (status === 'expired') {
    return `${versionLabel} expirada`;
  }

  return `${versionLabel} ${status}`;
}

export function staleReasonDetail(reason: string | null): string {
  if (reason === 'participant_set_changed') {
    return 'Se cerro porque el nuevo calculo cambio los participantes.';
  }
  if (reason === 'related_execution_changed_balance') {
    return 'Fue reemplazada porque otra ejecucion cambio los saldos.';
  }

  return 'Fue reemplazada porque los saldos cambiaron.';
}

export function isCurrentSettlementVersion(proposal: SettlementProposalRow): boolean {
  return proposal.replaced_by_proposal_id === null;
}

function settlementVersionDetail(input: {
  readonly proposal: SettlementProposalRow;
  readonly approvalsPending: number;
  readonly isCurrent: boolean;
}): string {
  const versionSuffix = input.isCurrent ? ' Es la version actual.' : '';

  if (input.proposal.status === 'pending_approvals') {
    return `Faltan ${input.approvalsPending} aprobacion${input.approvalsPending === 1 ? '' : 'es'}.${versionSuffix}`;
  }
  if (input.proposal.status === 'approved') {
    return `Todos aprobaron esta version.${versionSuffix}`;
  }
  if (input.proposal.status === 'executed') {
    return `Esta version se ejecuto y actualizo los saldos.${versionSuffix}`;
  }
  if (input.proposal.status === 'rejected') {
    return 'Esta version no fue aprobada.';
  }
  if (input.proposal.status === 'stale') {
    return staleReasonDetail(input.proposal.stale_reason);
  }
  if (input.proposal.status === 'expired') {
    return 'Esta version expiro antes de completarse.';
  }

  return `Estado: ${input.proposal.status}.${versionSuffix}`;
}

export function buildSettlementVersionTimeline(input: {
  readonly proposal: SettlementProposalRow;
  readonly allProposals: readonly SettlementProposalRow[];
  readonly participantsByProposalId: Map<string, SettlementParticipantRow[]>;
}): readonly SettlementVersionTimelineItemDto[] {
  const caseProposals = input.proposal.happy_circle_case_id
    ? input.allProposals.filter(
        (candidate) => candidate.happy_circle_case_id === input.proposal.happy_circle_case_id,
      )
    : [input.proposal];
  const uniqueById = new Map<string, SettlementProposalRow>();

  for (const proposal of caseProposals) {
    uniqueById.set(proposal.id, proposal);
  }

  return Array.from(uniqueById.values())
    .sort((left, right) => {
      const leftVersion = left.version_number ?? Number.MAX_SAFE_INTEGER;
      const rightVersion = right.version_number ?? Number.MAX_SAFE_INTEGER;
      if (leftVersion !== rightVersion) {
        return leftVersion - rightVersion;
      }

      return Date.parse(left.created_at) - Date.parse(right.created_at);
    })
    .map((proposal) => {
      const participants = input.participantsByProposalId.get(proposal.id) ?? [];
      const approvalsPending = participants.filter(
        (participant) => participant.decision === 'pending',
      ).length;
      const isCurrent = isCurrentSettlementVersion(proposal);

      return {
        proposalId: proposal.id,
        versionNumber: proposal.version_number,
        status: proposal.status,
        title: settlementVersionStatusTitle(proposal.status, proposal.version_number),
        detail: settlementVersionDetail({ proposal, approvalsPending, isCurrent }),
        amountMinor: settlementProposalTotalAmount(proposal),
        createdAt: proposal.created_at,
        updatedAt: proposal.updated_at,
        isCurrent,
        replacesProposalId: proposal.replaces_proposal_id,
        replacedByProposalId: proposal.replaced_by_proposal_id,
        staleReason: proposal.stale_reason,
      };
    });
}
