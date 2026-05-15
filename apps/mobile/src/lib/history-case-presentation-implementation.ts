import { formatCop } from './data';
import {
  circleAmountIsReal,
  cycleActivityKind,
  isCircleActivityItem,
  isCircleExecutedProposal,
  isCircleLifecycleOnly,
} from './cycle-activity';
import { circleStatusCopy } from './card-language';
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

const VOIDED_AMOUNT_STATUSES = new Set(['rejected', 'expired', 'canceled', 'stale']);

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
    [
      item.title,
      item.detail,
      item.happenedAtLabel,
      'Invitación de amistad',
      'Invitacion de amistad',
      'Acceso privado',
    ]
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

  if (isCircleActivityItem(item)) {
    const circleKind = cycleActivityKind(item);

    if (circleKind === 'lifecycle_rejected') {
      return 'Circle no completado';
    }

    if (circleKind === 'lifecycle_replaced') {
      return 'Version anterior de Circle';
    }

    if (circleKind === 'executed_proposal') {
      return 'Circle cerrado';
    }

    return circleKind === 'ledger_posted' ? cycleLedgerStepLabel(item) : item.title;
  }

  if (item.kind === 'payment') {
    return 'Se registró el movimiento';
  }

  if (item.title.endsWith(' propuso un nuevo monto')) {
    const actor = item.title.replace(' propuso un nuevo monto', '');
    return actor === 'Tú' || actor === 'Tu'
      ? 'Propusiste un nuevo monto'
      : `${actor} propuso un nuevo monto`;
  }

  const selfAction = item.title.match(
    /^T[uú] (cre[oó]|acept[oó]|rechaz[oó]|registr[oó]|confirm[oó]|aplic[oó]) (.+)$/i,
  );
  if (selfAction?.[1] && selfAction[2]) {
    const action = selfAction[1].toLowerCase();
    if (action === 'creo' || action === 'creó') {
      return `Creaste ${selfAction[2]}`;
    }
    if (action === 'acepto' || action === 'aceptó') {
      return `Aceptaste ${selfAction[2]}`;
    }
    if (action === 'rechazo' || action === 'rechazó') {
      return `Rechazaste ${selfAction[2]}`;
    }
    if (action === 'registro' || action === 'registró') {
      return `Registraste ${selfAction[2]}`;
    }
    if (action === 'confirmo' || action === 'confirmó') {
      return `Confirmaste ${selfAction[2]}`;
    }
    if (action === 'aplico' || action === 'aplicó') {
      return `Aplicaste ${selfAction[2]}`;
    }
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

  if (item.status === 'rejected') {
    return 'danger';
  }

  if (item.status === 'expired' || item.status === 'canceled') {
    return 'danger';
  }

  if (isCircleActivityItem(item)) {
    const circleKind = cycleActivityKind(item);

    if (circleKind === 'lifecycle_replaced' || item.status === 'waiting_other_side') {
      return 'cycle';
    }

    if (
      circleKind === 'executed_proposal' ||
      circleKind === 'ledger_posted' ||
      item.status === 'approved' ||
      item.status === 'executed' ||
      item.status === 'posted'
    ) {
      if (item.tone === 'negative') {
        return 'negative';
      }

      if (item.tone === 'positive') {
        return 'positive';
      }

      return 'positive';
    }

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
      return item.detail === 'Acceso privado' ? 'Acceso confirmado' : 'Relación creada';
    }

    if (item.status === 'rejected' || item.status === 'expired' || item.status === 'canceled') {
      return item.detail === 'Acceso privado' ? 'Acceso cerrado' : 'Sin relación creada';
    }

    return null;
  }

  if (isCircleActivityItem(item)) {
    return null;
  }

  if (item.status === 'rejected' || item.status === 'expired' || item.status === 'canceled') {
    return 'No cambió el saldo';
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

function cycleLedgerStepLabel(item: Pick<HistoryCaseItem, 'flowLabel' | 'title'>): string {
  const [from, to] = (item.flowLabel ?? '').split('->').map((part) => part.trim());

  if ((from === 'Tú' || from === 'Tu') && to) {
    return `Pagaste a ${to}`;
  }

  if ((to === 'Tú' || to === 'Tu') && from) {
    return `${from} te pagó`;
  }

  return 'Movimiento de Circle aplicado';
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

  const circleKind = cycleActivityKind(itemCase.latest);

  if (circleKind === 'lifecycle_rejected') {
    return 'No cambió el saldo';
  }

  if (circleKind === 'lifecycle_replaced') {
    return 'Versión reemplazada';
  }

  if (circleKind === 'executed_proposal') {
    return 'Saldo actualizado';
  }

  return circleKind === 'ledger_posted' ? 'Movimiento aplicado' : 'Happy Circle';
}

function inviteMismatchLabel<T extends HistoryCaseItem>(itemCase: HistoryCase<T>): string | null {
  if (!isInviteTrajectoryItem(itemCase.latest)) {
    return null;
  }

  const mismatchStep = itemCase.steps.find(
    (step) =>
      step.title.includes('reclamó la invitación enviada') ||
      step.title.includes('reclamo la invitacion enviada') ||
      step.title.includes('activó el acceso enviado') ||
      step.title.includes('activo el acceso enviado') ||
      step.subtitle.includes('reclamó la invitación enviada') ||
      step.subtitle.includes('reclamo la invitacion enviada') ||
      step.subtitle.includes('activó el acceso enviado') ||
      step.subtitle.includes('activo el acceso enviado'),
  );

  if (!mismatchStep) {
    return null;
  }

  if (
    mismatchStep.title.includes('reclamó la invitación enviada') ||
    mismatchStep.title.includes('reclamo la invitacion enviada') ||
    mismatchStep.title.includes('activó el acceso enviado') ||
    mismatchStep.title.includes('activo el acceso enviado')
  ) {
    return mismatchStep.title;
  }

  return mismatchStep.subtitle;
}

export function historyCardTitle<T extends HistoryCaseItem>(itemCase: HistoryCase<T>): string {
  if (itemCase.isCycleSnippet) {
    const circleKind = cycleActivityKind(itemCase.latest);

    if (circleKind === 'lifecycle_rejected') {
      return 'Happy Circle no completado';
    }

    if (circleKind === 'lifecycle_replaced') {
      return 'Versión reemplazada';
    }

    if (circleKind === 'executed_proposal') {
      return 'Happy Circle completado';
    }

    return circleKind === 'ledger_posted' ? 'Movimiento de Circle' : 'Happy Circle';
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

  const circleKind = cycleActivityKind(itemCase.latest);

  if (itemCase.latest.status === 'expired') {
    return circleStatusCopy.expired;
  }

  if (circleKind === 'lifecycle_rejected') {
    return circleStatusCopy.rejected;
  }

  if (circleKind === 'lifecycle_replaced') {
    return circleStatusCopy.stale;
  }

  if (itemCase.latest.status === 'waiting_other_side') {
    return circleStatusCopy.waitingOthers;
  }

  if (itemCase.latest.status === 'pending_approvals') {
    return circleStatusCopy.requiresYou;
  }

  if (itemCase.latest.status === 'approved') {
    return circleStatusCopy.approved;
  }

  if (circleKind === 'executed_proposal') {
    return circleStatusCopy.completed;
  }

  if (circleKind === 'ledger_posted') {
    return 'Movimiento aplicado';
  }

  return 'Happy Circle';
}

export function historyCaseStatusTone<T extends HistoryCaseItem>(
  itemCase: HistoryCase<T>,
): HistoryStatusTone {
  if (!itemCase.isCycleSnippet) {
    return historyStatusTone(itemCase.latest.status);
  }

  const circleKind = cycleActivityKind(itemCase.latest);

  if (circleKind === 'lifecycle_rejected' || itemCase.latest.status === 'expired') {
    return 'danger';
  }

  if (circleKind === 'lifecycle_replaced' || itemCase.latest.status === 'waiting_other_side') {
    return 'cycle';
  }

  if (itemCase.latest.status === 'pending_approvals') {
    return 'warning';
  }

  if (circleKind === 'executed_proposal' || circleKind === 'ledger_posted') {
    return 'success';
  }

  return 'cycle';
}

function historyAmountLabel(item: Pick<HistoryCaseItem, 'amountMinor'>): string | null {
  return typeof item.amountMinor === 'number' && item.amountMinor > 0
    ? formatCop(item.amountMinor)
    : null;
}

export function historyAmountIsVoided(
  item: Pick<HistoryCaseItem, 'status'> &
    Partial<
      Pick<
        HistoryCaseItem,
        'category' | 'kind' | 'id' | 'originSettlementProposalId' | 'happyCircleCaseId'
      >
    >,
): boolean {
  if (
    item.kind &&
    isCircleActivityItem({ category: item.category, kind: item.kind }) &&
    isCircleLifecycleOnly({
      category: item.category,
      happyCircleCaseId: item.happyCircleCaseId,
      id: item.id ?? 'cycle',
      kind: item.kind,
      originSettlementProposalId: item.originSettlementProposalId,
      status: item.status,
    })
  ) {
    return true;
  }

  return VOIDED_AMOUNT_STATUSES.has(item.status);
}

export function historyCaseAmountLabel(item: HistoryCaseItem): string | null {
  if (isCircleActivityItem(item)) {
    const kind = cycleActivityKind(item);

    if (kind === 'executed_proposal' || kind === 'ledger_posted' || historyAmountIsVoided(item)) {
      return historyAmountLabel(item);
    }

    return null;
  }

  return historyAmountLabel(item);
}

export function historyStepAmountLabel(item: HistoryCaseItem): string | null {
  if (historyAmountIsVoided(item)) {
    return null;
  }

  if (isCircleActivityItem(item) && !circleAmountIsReal(item)) {
    return null;
  }

  return historyAmountLabel(item);
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

  const tone = historyImpactTone(step);
  if (tone === 'positive') {
    return `+ ${amountLabel}`;
  }

  if (tone === 'negative') {
    return `- ${amountLabel}`;
  }

  return amountLabel;
}

export function historyTimelineStepMetaLabel<T extends HistoryCaseItem>(
  itemCase: Pick<HistoryCase<T>, 'isCycleSnippet' | 'latest'>,
  step: T,
): string | null {
  if (
    itemCase.isCycleSnippet &&
    isCircleExecutedProposal(itemCase.latest) &&
    isCircleLifecycleOnly(step)
  ) {
    return 'Antes del cierre';
  }

  return step.happenedAtLabel ?? null;
}

export function historyCaseMeta<T extends HistoryCaseItem>(itemCase: HistoryCase<T>): string {
  const timeLabel = itemCase.latest.happenedAtLabel ?? 'Reciente';
  const category = historyItemVisualCategory(itemCase.latest);

  return category ? `${timeLabel} | ${transactionCategoryLabel(category)}` : timeLabel;
}
