import type {
  ActivityItemDto,
  PersonDetailDto,
  PersonTimelineItemDto,
} from '@happy-circles/application';

import { formatCop } from './data';
import { transactionCategoryLabel } from './transaction-categories';

type HistoryStatusTone = 'primary' | 'success' | 'warning' | 'neutral' | 'danger' | 'cycle';
type HistoryDirection = 'i_owe' | 'owes_me' | 'neutral';

export interface HistoryCaseItem {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly status: string;
  readonly kind: 'request' | 'payment' | 'settlement' | 'system' | 'friendship_invite';
  readonly amountMinor?: number;
  readonly category?: ActivityItemDto['category'];
  readonly tone?: 'positive' | 'negative' | 'neutral';
  readonly flowLabel?: string;
  readonly detail?: string;
  readonly happenedAt?: string;
  readonly happenedAtLabel?: string;
  readonly originRequestId?: string | null;
  readonly originSettlementProposalId?: string | null;
  readonly counterpartyLabel?: string;
}

export interface HistoryCase<T extends HistoryCaseItem = HistoryCaseItem> {
  readonly id: string;
  readonly latest: T;
  readonly earliest: T;
  readonly steps: readonly T[];
  readonly isCycleSnippet: boolean;
}

export type ActivityHistoryItem = ActivityItemDto & {
  readonly kind: 'request' | 'payment' | 'settlement' | 'system' | 'friendship_invite';
};

type ComparableHistoryItem = {
  readonly id: string;
  readonly kind: ActivityItemDto['kind'];
  readonly status: string;
  readonly happenedAt?: string;
};

function historyStepPriority(item: Pick<ComparableHistoryItem, 'kind' | 'status'>): number {
  if (item.kind !== 'request') {
    return 3;
  }

  if (item.status === 'pending') {
    return 1;
  }

  return 2;
}

function extractHistoryConcept(detail?: string | null): string | null {
  if (!detail) {
    return null;
  }

  let concept = detail.trim();
  if (concept.length === 0) {
    return null;
  }

  if (concept.toLocaleLowerCase('es-CO') === 'cycle settlement system movement') {
    return null;
  }

  concept = concept.replace(/^reset\s+/i, '');
  concept = concept.replace(/^reversal of\s+/i, '');
  concept = concept.replace(/\s+\S+\s*->\s*\S+\s*$/i, '');
  concept = concept.trim();

  return concept.length > 0 ? concept : null;
}

function firstNameLabel(value: string): string {
  const [firstPart] = value.trim().split(/\s+/);
  return firstPart && firstPart.length > 0 ? firstPart : value;
}

function compactHistoryLabel(item: Pick<HistoryCaseItem, 'kind' | 'status'>): string {
  if (item.kind === 'friendship_invite') {
    return 'Invitacion';
  }

  if (item.kind === 'settlement') {
    return 'Happy Circle';
  }

  if (item.kind === 'payment') {
    return 'Movimiento registrado';
  }

  if (item.status === 'posted') {
    return 'Registrado';
  }

  if (item.status === 'amended') {
    return 'Monto actualizado';
  }

  if (item.status === 'accepted') {
    return 'Aceptada';
  }

  if (item.status === 'rejected') {
    return 'Rechazada';
  }

  return 'Solicitud';
}

function historyDirectionFromItem(item: HistoryCaseItem): HistoryDirection {
  if (
    item.status === 'rejected' ||
    item.status === 'canceled' ||
    item.status === 'expired' ||
    item.status === 'stale'
  ) {
    return 'neutral';
  }

  if (item.kind === 'settlement') {
    return 'neutral';
  }

  if (item.kind === 'payment') {
    const [from, to] = (item.flowLabel ?? '').split('->').map((part) => part.trim());
    const counterpartyName = item.counterpartyLabel?.trim();

    if (counterpartyName && from === counterpartyName) {
      return 'owes_me';
    }

    if (counterpartyName && to === counterpartyName) {
      return 'i_owe';
    }
  }

  if (item.tone === 'positive') {
    return 'owes_me';
  }

  if (item.tone === 'negative') {
    return 'i_owe';
  }

  return 'neutral';
}

function historyCaseKey(
  item: Pick<HistoryCaseItem, 'id' | 'originRequestId' | 'originSettlementProposalId'>,
): string {
  if (item.originSettlementProposalId) {
    return `settlement:${item.originSettlementProposalId}`;
  }

  if (item.originRequestId) {
    return `request:${item.originRequestId}`;
  }

  return `event:${item.id}`;
}

export function isHistoryCaseItem(item: ActivityItemDto): item is ActivityHistoryItem {
  return (
    item.kind === 'request' ||
    item.kind === 'payment' ||
    item.kind === 'settlement' ||
    item.kind === 'system' ||
    item.kind === 'friendship_invite'
  );
}

export function compareHistoryItems<T extends ComparableHistoryItem>(left: T, right: T): number {
  const timeDiff = Date.parse(right.happenedAt ?? '') - Date.parse(left.happenedAt ?? '');
  if (timeDiff !== 0) {
    return timeDiff;
  }

  const priorityDiff = historyStepPriority(right) - historyStepPriority(left);
  if (priorityDiff !== 0) {
    return priorityDiff;
  }

  return right.id.localeCompare(left.id);
}

export function buildHistoryCases<T extends HistoryCaseItem>(
  items: readonly T[],
): HistoryCase<T>[] {
  const sortedItems = [...items].sort(compareHistoryItems);

  const groups = new Map<string, T[]>();
  for (const item of sortedItems) {
    const key = historyCaseKey(item);
    const existing = groups.get(key);
    if (existing) {
      existing.push(item);
    } else {
      groups.set(key, [item]);
    }
  }

  return Array.from(groups.entries())
    .flatMap(([id, groupedItems]): HistoryCase<T>[] => {
      const uniqueItems = groupedItems.filter(
        (item, index, collection) =>
          collection.findIndex((candidate) => candidate.id === item.id) === index,
      );
      const completedItems = uniqueItems.filter((item) => item.status !== 'pending');
      if (completedItems.length === 0) {
        return [];
      }

      const steps = [...uniqueItems].reverse();
      return [
        {
          id,
          // Keep pending proposals inside the expanded timeline, but anchor the case
          // on the latest completed event so history does not duplicate inbox items.
          latest: completedItems[0],
          earliest: steps[0],
          steps,
          isCycleSnippet: groupedItems.some((item) => item.kind === 'settlement'),
        },
      ];
    })
    .sort((left, right) => compareHistoryItems(left.latest, right.latest));
}

export function toHistoryFeedItem(
  item: PersonTimelineItemDto,
  counterpartyLabel?: string,
): HistoryCaseItem {
  return {
    id: item.id,
    title: item.title,
    subtitle: item.subtitle,
    status: item.status,
    kind: item.kind,
    amountMinor: item.amountMinor,
    category: item.category,
    tone: item.tone,
    flowLabel: item.flowLabel,
    detail: item.detail,
    happenedAt: item.happenedAt,
    happenedAtLabel: item.happenedAtLabel,
    originRequestId: item.originRequestId,
    originSettlementProposalId: item.originSettlementProposalId,
    counterpartyLabel,
  };
}

export function buildActivityHistoryItems(
  peopleById: Readonly<Record<string, PersonDetailDto>>,
): ActivityItemDto[] {
  return Object.values(peopleById)
    .flatMap((person) =>
      person.timeline.map(
        (item): ActivityItemDto => ({
          id: item.id,
          title: item.title,
          subtitle: item.subtitle,
          status: item.status,
          href: `/person/${person.userId}`,
          amountMinor: item.amountMinor,
          category: item.category,
          sourceType: item.sourceType,
          detail: item.detail,
          happenedAt: item.happenedAt,
          happenedAtLabel: item.happenedAtLabel,
          tone: item.tone,
          flowLabel: item.flowLabel,
          originRequestId: item.originRequestId,
          originSettlementProposalId: item.originSettlementProposalId,
          counterpartyLabel: person.displayName,
          kind: item.kind,
        }),
      ),
    )
    .sort(compareHistoryItems);
}

export function historyStatusLabel(status: string): string {
  if (status === 'requires_you') {
    return 'Por responder';
  }

  if (status === 'requires_you_response') {
    return 'Por responder';
  }

  if (status === 'requires_you_review') {
    return 'Por verificar';
  }

  if (status === 'waiting_other_side') {
    return 'En espera';
  }

  if (status === 'waiting_sender_review') {
    return 'En validacion';
  }

  if (status === 'pending_claim') {
    return 'Pendiente';
  }

  if (status === 'pending_activation') {
    return 'Pendiente';
  }

  if (status === 'pending_approvals') {
    return 'Pendiente';
  }

  if (status === 'approved') {
    return 'Aprobado';
  }

  if (status === 'pending') {
    return 'Pendiente';
  }

  if (status === 'amended') {
    return 'Nuevo monto';
  }

  if (status === 'accepted') {
    return 'Aceptada';
  }

  if (status === 'rejected') {
    return 'Rechazada';
  }

  if (status === 'expired') {
    return 'Expirada';
  }

  if (status === 'canceled') {
    return 'Cancelada';
  }

  if (status === 'stale') {
    return 'Reemplazada';
  }

  if (status === 'executed') {
    return 'Completado';
  }

  if (status === 'posted') {
    return 'Registrado';
  }

  return status;
}

export function historyStatusTone(status: string): HistoryStatusTone {
  if (
    status === 'requires_you' ||
    status === 'requires_you_response' ||
    status === 'requires_you_review' ||
    status === 'pending' ||
    status === 'amended'
  ) {
    return 'warning';
  }

  if (status === 'accepted' || status === 'posted' || status === 'executed') {
    return 'success';
  }

  if (status === 'rejected' || status === 'expired' || status === 'canceled') {
    return 'danger';
  }

  if (status === 'pending_approvals' || status === 'approved') {
    return 'primary';
  }

  return 'neutral';
}

export function friendlyHistoryStepLabel(item: HistoryCaseItem): string {
  if (item.kind === 'friendship_invite') {
    return item.title;
  }

  if (item.kind === 'settlement') {
    if (item.status === 'rejected') {
      return 'Este Circle no se completo';
    }

    if (item.status === 'stale') {
      return 'Este Circle fue reemplazado';
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
  if (
    item.kind === 'friendship_invite' &&
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

  if (item.kind === 'friendship_invite') {
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
  if (item.kind === 'friendship_invite') {
    if (item.status === 'accepted') {
      return 'Relacion creada';
    }

    if (item.status === 'rejected' || item.status === 'expired' || item.status === 'canceled') {
      return 'Sin relacion creada';
    }

    return null;
  }

  if (item.kind === 'settlement') {
    if (item.status === 'rejected') {
      return 'Este Circle no se completo';
    }

    if (item.status === 'stale') {
      return 'Este Circle fue reemplazado';
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

  if (itemCase.latest.kind === 'friendship_invite') {
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
    return 'Este Circle fue reemplazado';
  }

  return 'Completaste un Circle!';
}

export function historyCardTitle<T extends HistoryCaseItem>(itemCase: HistoryCase<T>): string {
  if (itemCase.isCycleSnippet) {
    if (itemCase.latest.status === 'rejected') {
      return 'Happy Circle no completado';
    }

    if (itemCase.latest.status === 'stale') {
      return 'Happy Circle reemplazado';
    }

    return 'Happy Circle completado';
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

  if (itemCase.latest.status === 'rejected') {
    return 'No completado';
  }

  if (itemCase.latest.status === 'stale') {
    return 'Reemplazado';
  }

  if (itemCase.latest.status === 'pending_approvals') {
    return 'Pendiente';
  }

  if (itemCase.latest.status === 'approved') {
    return 'Listo';
  }

  return 'Completado';
}

export function historyCaseStatusTone<T extends HistoryCaseItem>(
  itemCase: HistoryCase<T>,
): HistoryStatusTone {
  if (!itemCase.isCycleSnippet) {
    return historyStatusTone(itemCase.latest.status);
  }

  if (itemCase.latest.status === 'rejected') {
    return 'danger';
  }

  if (itemCase.latest.status === 'stale') {
    return 'neutral';
  }

  if (
    itemCase.latest.status === 'pending_approvals' ||
    itemCase.latest.status === 'waiting_other_side'
  ) {
    return 'warning';
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

export function historyCaseMeta<T extends HistoryCaseItem>(itemCase: HistoryCase<T>): string {
  const creatorLabel =
    (itemCase.latest.counterpartyLabel ? firstNameLabel(itemCase.latest.counterpartyLabel) : null) ||
    (itemCase.isCycleSnippet ? 'Happy Circle' : 'Usuario');
  const timeLabel = itemCase.latest.happenedAtLabel ?? 'Reciente';

  return `Creado por ${creatorLabel} · ${timeLabel} | ${transactionCategoryLabel(
    itemCase.latest.category,
  )}`;
}
