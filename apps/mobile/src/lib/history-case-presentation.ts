import { formatCop } from './data';
import type { HistoryCase, HistoryCaseItem, HistoryStatusTone } from './history-case-types';
import {
  compactHistoryLabel,
  extractHistoryConcept,
  historyCaseInviteCategory,
  historyDirectionFromItem,
  historyItemVisualCategory,
  isInviteTrajectoryItem,
  splitHistorySubtitle,
} from './history-case-helpers';
import { historyStatusLabel, historyStatusTone } from './history-case-status';
import { transactionCategoryLabel } from './transaction-categories';

export { historyStatusLabel, historyStatusTone } from './history-case-status';

export function historyCaseVisualCategory<T extends HistoryCaseItem>(
  itemCase: HistoryCase<T>,
): string | null {
  return historyCaseInviteCategory(itemCase);
}

export function historyTimelineStepCategory<T extends HistoryCaseItem>(
  itemCase: Pick<HistoryCase<T>, 'steps'>,
  step: T,
  index: number,
): string | null {
  const category = historyItemVisualCategory(step);
  const previousStep = itemCase.steps[index - 1];
  if (!category || !previousStep) {
    return null;
  }

  return category === historyItemVisualCategory(previousStep) ? null : category;
}

export function historyTimelineStepDetailLabel(item: HistoryCaseItem): string | null {
  if (!isInviteTrajectoryItem(item)) {
    return null;
  }

  const ignored = new Set(
    [item.title, item.detail, item.happenedAtLabel, 'Invitacion de amistad', 'Acceso privado']
      .filter((value): value is string => Boolean(value))
      .map((value) => value.toLocaleLowerCase('es-CO')),
  );
  const details = splitHistorySubtitle(item.subtitle).filter((segment) => {
    const normalized = segment.toLocaleLowerCase('es-CO');
    return !ignored.has(normalized);
  });

  return details.length > 0 ? details.join(' · ') : null;
}

export function friendlyHistoryStepLabel(item: HistoryCaseItem): string {
  if (isInviteTrajectoryItem(item)) {
    return item.title;
  }

  if (item.kind === 'settlement') {
    if (item.status === 'rejected') {
      return 'Este Circle no se completo';
    }

    if (item.status === 'stale') {
      return 'Version reemplazada por saldos nuevos';
    }

    return 'Completaste un Circle!';
  }

  if (item.kind === 'payment') {
    return 'Se registro el movimiento';
  }

  if (item.title.endsWith(' propuso un nuevo monto')) {
    const actor = item.title.replace(' propuso un nuevo monto', '');
    return actor === 'Tu' ? 'Tu propusiste un nuevo monto' : `${actor} propuso un nuevo monto`;
  }

  if (item.title.startsWith('Tu creo ')) {
    return item.title.replace('Tu creo ', 'Tu creaste ');
  }

  if (item.title.startsWith('Tu acepto ')) {
    return item.title.replace('Tu acepto ', 'Tu aceptaste ');
  }

  if (item.title.startsWith('Tu rechazo ')) {
    return item.title.replace('Tu rechazo ', 'Tu rechazaste ');
  }

  if (item.title.startsWith('Tu registro ')) {
    return item.title.replace('Tu registro ', 'Tu registraste ');
  }

  if (item.title.startsWith('Tu confirmo ')) {
    return item.title.replace('Tu confirmo ', 'Tu confirmaste ');
  }

  if (item.title.startsWith('Tu aplico ')) {
    return item.title.replace('Tu aplico ', 'Tu aplicaste ');
  }

  return item.title;
}

export function historyImpactTone(
  item: HistoryCaseItem,
): 'positive' | 'negative' | 'neutral' | 'danger' | 'cycle' {
  if (isInviteTrajectoryItem(item) && item.status === 'accepted') {
    return 'positive';
  }

  if (
    isInviteTrajectoryItem(item) &&
    (item.status === 'rejected' || item.status === 'expired' || item.status === 'canceled')
  ) {
    return 'danger';
  }

  if (item.kind === 'settlement' && item.status === 'stale') {
    return 'neutral';
  }

  if (item.status === 'rejected') {
    return 'danger';
  }

  if (item.status === 'expired' || item.status === 'canceled') {
    return 'danger';
  }

  if (item.kind === 'settlement') {
    return 'cycle';
  }

  if (isInviteTrajectoryItem(item)) {
    return 'neutral';
  }

  const direction = historyDirectionFromItem(item);

  if (direction === 'owes_me') {
    return 'positive';
  }

  if (direction === 'i_owe') {
    return 'negative';
  }

  return 'neutral';
}

export function historyImpactLabel(item: HistoryCaseItem): string | null {
  if (isInviteTrajectoryItem(item)) {
    if (item.status === 'accepted') {
      return item.detail === 'Acceso privado' ? 'Acceso confirmado' : 'Relacion creada';
    }

    if (item.status === 'rejected' || item.status === 'expired' || item.status === 'canceled') {
      return item.detail === 'Acceso privado' ? 'Acceso cerrado' : 'Sin relacion creada';
    }

    return null;
  }

  if (item.kind === 'settlement') {
    if (item.status === 'rejected') {
      return 'Este Circle no se completo';
    }

    if (item.status === 'stale') {
      return 'Version reemplazada';
    }

    if (item.status === 'posted' || item.status === 'executed') {
      return 'Completaste un Circle!';
    }

    return null;
  }

  if (item.status === 'rejected' || item.status === 'expired' || item.status === 'canceled') {
    return 'No cambio el saldo';
  }

  if (typeof item.amountMinor !== 'number' || item.amountMinor <= 0) {
    return null;
  }

  const direction = historyDirectionFromItem(item);
  if (direction === 'neutral') {
    return null;
  }

  const amountLabel = formatCop(item.amountMinor);
  const isProposal =
    item.kind === 'request' && (item.status === 'pending' || item.status === 'amended');
  const flowLabel = direction === 'owes_me' ? 'Entrada' : 'Salida';

  return isProposal ? `${flowLabel} propuesta de ${amountLabel}` : `${flowLabel} de ${amountLabel}`;
}

export function historyCaseEyebrow<T extends HistoryCaseItem>(
  itemCase: HistoryCase<T>,
): string | null {
  if (itemCase.isCycleSnippet) {
    return null;
  }

  if (isInviteTrajectoryItem(itemCase.latest)) {
    return 'Invitaciones';
  }

  return itemCase.latest.counterpartyLabel ?? null;
}

export function historyCaseImpactLabel<T extends HistoryCaseItem>(
  itemCase: HistoryCase<T>,
): string | null {
  if (!itemCase.isCycleSnippet) {
    return historyImpactLabel(itemCase.latest);
  }

  if (itemCase.latest.status === 'rejected') {
    return 'Este Circle no se completo';
  }

  if (itemCase.latest.status === 'stale') {
    return 'Version reemplazada por saldos nuevos';
  }

  return 'Completaste un Circle!';
}

function inviteMismatchLabel<T extends HistoryCaseItem>(itemCase: HistoryCase<T>): string | null {
  if (!isInviteTrajectoryItem(itemCase.latest)) {
    return null;
  }

  const mismatchStep = itemCase.steps.find(
    (step) =>
      step.title.includes('reclamo la invitacion enviada') ||
      step.title.includes('activo el acceso enviado') ||
      step.subtitle.includes('reclamo la invitacion enviada') ||
      step.subtitle.includes('activo el acceso enviado'),
  );

  if (!mismatchStep) {
    return null;
  }

  if (
    mismatchStep.title.includes('reclamo la invitacion enviada') ||
    mismatchStep.title.includes('activo el acceso enviado')
  ) {
    return mismatchStep.title;
  }

  return mismatchStep.subtitle;
}

export function historyCardTitle<T extends HistoryCaseItem>(itemCase: HistoryCase<T>): string {
  if (itemCase.isCycleSnippet) {
    if (itemCase.latest.status === 'rejected') {
      return 'Happy Circle no completado';
    }

    if (itemCase.latest.status === 'stale') {
      return 'Version reemplazada';
    }

    return 'Happy Circle completado';
  }

  if (isInviteTrajectoryItem(itemCase.latest)) {
    const mismatchLabel = inviteMismatchLabel(itemCase);
    if (mismatchLabel) {
      return mismatchLabel;
    }

    return itemCase.latest.title;
  }

  for (const step of itemCase.steps) {
    const concept = extractHistoryConcept(step.detail);
    if (concept) {
      return concept;
    }
  }

  return compactHistoryLabel(itemCase.latest);
}

export function historyCaseStatusLabel<T extends HistoryCaseItem>(
  itemCase: HistoryCase<T>,
): string {
  if (!itemCase.isCycleSnippet) {
    return historyStatusLabel(itemCase.latest.status);
  }

  if (itemCase.latest.status === 'rejected' || itemCase.latest.status === 'canceled') {
    return 'No completado';
  }

  if (itemCase.latest.status === 'expired') {
    return 'Expirado';
  }

  if (itemCase.latest.status === 'stale') {
    return 'Reemplazado';
  }

  if (itemCase.latest.status === 'waiting_other_side') {
    return 'Esperando aprobaciones';
  }

  if (itemCase.latest.status === 'pending_approvals') {
    return 'Necesita tu aprobacion';
  }

  if (itemCase.latest.status === 'approved') {
    return 'Listo para completar';
  }

  if (itemCase.latest.status === 'executed' || itemCase.latest.status === 'posted') {
    return 'Completado';
  }

  return 'Happy Circle';
}

export function historyCaseStatusTone<T extends HistoryCaseItem>(
  itemCase: HistoryCase<T>,
): HistoryStatusTone {
  if (!itemCase.isCycleSnippet) {
    return historyStatusTone(itemCase.latest.status);
  }

  if (itemCase.latest.status === 'rejected' || itemCase.latest.status === 'canceled') {
    return 'danger';
  }

  if (
    itemCase.latest.status === 'expired' ||
    itemCase.latest.status === 'stale' ||
    itemCase.latest.status === 'waiting_other_side'
  ) {
    return 'neutral';
  }

  if (itemCase.latest.status === 'pending_approvals') {
    return 'warning';
  }

  if (itemCase.latest.status === 'executed' || itemCase.latest.status === 'posted') {
    return 'success';
  }

  return 'cycle';
}

export function historyStepAmountLabel(item: HistoryCaseItem): string | null {
  if (
    item.status === 'rejected' ||
    item.status === 'expired' ||
    item.status === 'canceled' ||
    item.status === 'stale'
  ) {
    return null;
  }

  if (item.kind === 'settlement' && item.status !== 'posted' && item.status !== 'executed') {
    return null;
  }

  return typeof item.amountMinor === 'number' && item.amountMinor > 0
    ? formatCop(item.amountMinor)
    : null;
}

export function historyHasAmountChanges<T extends HistoryCaseItem>(steps: readonly T[]): boolean {
  return steps.some((step, index) => {
    const previousStep = steps[index - 1];
    if (!previousStep) {
      return false;
    }

    return historyStepAmountLabel(step) !== historyStepAmountLabel(previousStep);
  });
}

export function historyTimelineStepAmountLabel<T extends HistoryCaseItem>(
  itemCase: Pick<HistoryCase<T>, 'latest' | 'steps'>,
  step: T,
  index: number,
): string | null {
  const amountLabel = historyStepAmountLabel(step);
  if (!amountLabel || !historyHasAmountChanges(itemCase.steps)) {
    return null;
  }

  const previousStep = itemCase.steps[index - 1];
  if (previousStep && amountLabel === historyStepAmountLabel(previousStep)) {
    return null;
  }

  return amountLabel;
}

export function historyCaseMeta<T extends HistoryCaseItem>(itemCase: HistoryCase<T>): string {
  const timeLabel = itemCase.latest.happenedAtLabel ?? 'Reciente';
  const category = historyItemVisualCategory(itemCase.latest);

  return category ? `${timeLabel} | ${transactionCategoryLabel(category)}` : timeLabel;
}
