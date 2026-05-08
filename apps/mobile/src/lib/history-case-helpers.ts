import type {
  ComparableHistoryItem,
  HistoryCase,
  HistoryCaseItem,
  HistoryDirection,
} from './history-case-types';

export function historyStepPriority(item: Pick<ComparableHistoryItem, 'kind' | 'status'>): number {
  if (item.kind !== 'request') {
    return 3;
  }

  if (item.status === 'pending') {
    return 1;
  }

  return 2;
}

export function extractHistoryConcept(detail?: string | null): string | null {
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

export function firstNameLabel(value: string): string {
  const [firstPart] = value.trim().split(/\s+/);
  return firstPart && firstPart.length > 0 ? firstPart : value;
}

export function splitHistorySubtitle(value: string): string[] {
  return value
    .split('|')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export function historyCreatorLabel(item: HistoryCaseItem, fallbackLabel: string): string {
  if (item.category === 'cycle' || item.kind === 'settlement') {
    return 'Happy Circle';
  }

  const subtitleParts = splitHistorySubtitle(item.subtitle);
  const titleCreator = item.title.match(
    /^(.+?)\s+(propuso|acepto|registro|aplico|no acepto)\b/i,
  )?.[1];

  if (titleCreator?.trim()) {
    return titleCreator.trim();
  }

  const subtitleCreator = subtitleParts[0];
  if (
    subtitleCreator &&
    subtitleCreator !== 'Usuario' &&
    subtitleCreator !== 'Sistema' &&
    subtitleCreator !== 'Happy Circle'
  ) {
    return subtitleCreator;
  }

  return fallbackLabel;
}

export function createdByText(label: string): string {
  return label === 'Tu' ? 'Creado por ti' : `Creado por ${label}`;
}

export function isInviteTrajectoryItem(item: Pick<HistoryCaseItem, 'kind' | 'detail'>): boolean {
  return (
    item.kind === 'friendship_invite' ||
    item.detail === 'Invitacion de amistad' ||
    item.detail === 'Acceso privado'
  );
}

function normalizedHistoryText(...values: readonly (string | null | undefined)[]): string {
  return values.filter(Boolean).join(' ').toLocaleLowerCase('es-CO');
}

export function historyItemVisualCategory(item: HistoryCaseItem): string | null {
  if (!isInviteTrajectoryItem(item)) {
    return item.category ?? null;
  }

  const text = normalizedHistoryText(item.title, item.subtitle, item.detail);
  if (item.detail === 'Acceso privado' || text.includes('acceso')) {
    return 'access_key';
  }

  if (text.includes('qr')) {
    return 'friendship_qr';
  }

  return 'friendship';
}

export function historyCaseInviteCategory<T extends HistoryCaseItem>(
  itemCase: HistoryCase<T>,
): string | null {
  if (!isInviteTrajectoryItem(itemCase.latest)) {
    return historyItemVisualCategory(itemCase.latest);
  }

  const categories = itemCase.steps.map(historyItemVisualCategory);
  if (categories.includes('access_key')) {
    return 'access_key';
  }

  if (categories.includes('friendship_qr')) {
    return 'friendship_qr';
  }

  return 'friendship';
}

export function compactHistoryLabel(item: Pick<HistoryCaseItem, 'kind' | 'status' | 'detail'>): string {
  if (item.kind === 'friendship_invite') {
    return 'Invitacion';
  }

  if (isInviteTrajectoryItem(item)) {
    return item.detail ?? 'Invitacion';
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
    return 'Monto modificado';
  }

  if (item.status === 'accepted') {
    return 'Aceptada';
  }

  if (item.status === 'rejected') {
    return 'Rechazada';
  }

  return 'Solicitud';
}

export function historyDirectionFromItem(item: HistoryCaseItem): HistoryDirection {
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

export function historyCaseKey(
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
