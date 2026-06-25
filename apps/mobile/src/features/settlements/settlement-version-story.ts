import { type CardTimelineStep, type CardTone } from '@/components/card-shell';
import { formatCop } from '@/lib/data';
import { type SettlementVersionTimelineItemDto } from '@/lib/live-data';
import { transactionAmountIsVoided } from '@/lib/transaction-presentation';

function versionTimelineTone(status: string): CardTone {
  if (transactionAmountIsVoided({ status })) {
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
  if (transactionAmountIsVoided({ status: item.status })) {
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

function versionStoryDetail(item: SettlementVersionTimelineItemDto): string | null {
  if (transactionAmountIsVoided({ status: item.status })) {
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
    const amountStruckThrough = transactionAmountIsVoided({ status: item.status });

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
