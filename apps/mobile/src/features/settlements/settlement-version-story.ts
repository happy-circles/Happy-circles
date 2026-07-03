import type { CardTimelineStep, CardTone } from '@/components/card-shell';
import { formatCop } from '@/lib/data';
import type { SettlementVersionTimelineItemDto } from '@/lib/live-data/settlement-version-types';

const VOIDED_VERSION_STATUSES = new Set(['rejected', 'canceled', 'expired', 'stale']);

function versionAmountIsVoided(item: Pick<SettlementVersionTimelineItemDto, 'status'>): boolean {
  return VOIDED_VERSION_STATUSES.has(item.status);
}

function versionTimelineTone(status: string): CardTone {
  if (versionAmountIsVoided({ status })) {
    return 'danger';
  }

  if (status === 'executed') {
    return 'success';
  }

  if (status === 'approved') {
    return 'cycle';
  }

  if (status === 'pending_approvals') {
    return 'warning';
  }

  if (status === 'rejected') {
    return 'danger';
  }

  return 'neutral';
}

function versionNumberLabel(item: SettlementVersionTimelineItemDto, index: number): string {
  const versionNumber = item.displayVersionNumber ?? item.versionNumber ?? index + 1;

  return `Versión ${versionNumber}`;
}

function versionStatusLabel(status: string): string {
  if (status === 'pending_approvals') {
    return 'En aprobación';
  }

  if (status === 'approved') {
    return 'Lista';
  }

  if (status === 'executed') {
    return 'Cerrada';
  }

  if (status === 'rejected') {
    return 'No aprobada';
  }

  if (status === 'stale') {
    return 'Reemplazada';
  }

  if (status === 'expired') {
    return 'Expirada';
  }

  return status;
}

function versionDateLabel(timestamp: string): string | null {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'short',
  }).format(date);
}

function versionStoryTitle(item: SettlementVersionTimelineItemDto, index: number): string {
  if (versionAmountIsVoided(item)) {
    return index === 0 ? 'Calculo sin efecto' : 'Calculo anterior';
  }

  if (item.isCurrent) {
    return index === 0 ? 'Cálculo actual' : 'Nuevo cálculo actual';
  }

  if (item.status === 'executed') {
    return 'Circle cerrado';
  }

  return index === 0 ? 'Primer cálculo' : 'Nuevo cálculo';
}

function personChangeLabel(count: number, action: 'added' | 'removed'): string {
  const verb =
    action === 'added'
      ? count === 1
        ? 'agrego'
        : 'agregaron'
      : count === 1
        ? 'quito'
        : 'quitaron';
  const plural = count === 1 ? 'persona' : 'personas';

  return `Se ${verb} ${count} ${plural}.`;
}

function carriedApprovalLabel(count: number): string {
  const plural = count === 1 ? 'aprobacion' : 'aprobaciones';

  return `Se conservaron ${count} ${plural}.`;
}

function versionChangeDetail(item: SettlementVersionTimelineItemDto): string | null {
  const parts: string[] = [];
  const addedParticipantCount = item.addedParticipantCount ?? 0;
  const removedParticipantCount = item.removedParticipantCount ?? 0;
  const carriedApprovalCount = item.carriedApprovalCount ?? 0;

  if (item.amountChanged) {
    if (typeof item.previousAmountMinor === 'number' && item.previousAmountMinor > 0) {
      parts.push(
        `El monto cambio de ${formatCop(item.previousAmountMinor)} a ${formatCop(item.amountMinor)}.`,
      );
    } else if (item.amountMinor > 0) {
      parts.push(`Nuevo monto: ${formatCop(item.amountMinor)}.`);
    }
  }

  if (addedParticipantCount > 0) {
    parts.push(personChangeLabel(addedParticipantCount, 'added'));
  }

  if (removedParticipantCount > 0) {
    parts.push(personChangeLabel(removedParticipantCount, 'removed'));
  }

  if (carriedApprovalCount > 0) {
    parts.push(carriedApprovalLabel(carriedApprovalCount));
  }

  return parts.length > 0 ? parts.join(' ') : null;
}

function versionStoryDetail(item: SettlementVersionTimelineItemDto): string | null {
  const changeDetail = versionChangeDetail(item);

  if (changeDetail) {
    return changeDetail;
  }

  if (versionAmountIsVoided(item)) {
    return item.detail || 'No cambio el saldo.';
  }

  if (item.status === 'executed') {
    return 'Actualizo el saldo.';
  }

  if (item.status === 'approved') {
    return 'Listo para registrar.';
  }

  if (item.status === 'pending_approvals') {
    return item.detail || 'Esperando aprobaciones.';
  }

  return item.detail || null;
}

function versionStoryMeta(item: SettlementVersionTimelineItemDto, index: number): string {
  const parts = [
    versionNumberLabel(item, index),
    versionDateLabel(item.createdAt),
    item.isCurrent ? 'Actual' : versionStatusLabel(item.status),
  ].filter(Boolean);

  return parts.join(' / ');
}

export function versionStorySteps(
  timeline: readonly SettlementVersionTimelineItemDto[],
): readonly CardTimelineStep[] {
  return timeline.map((item, index) => {
    const amountStruckThrough = versionAmountIsVoided(item);

    return {
      actorLabel: 'Happy Circle',
      amountLabel: formatCop(item.amountMinor),
      amountStruckThrough,
      conversationSide: 'system',
      detail: versionStoryDetail(item),
      id: item.proposalId,
      meta: versionStoryMeta(item, index),
      tone: versionTimelineTone(item.status),
      title: versionStoryTitle(item, index),
    };
  });
}
