import type { ActivityItemDto, PersonCardDto } from '@happy-circles/application';
import type { TransactionCategory } from '@happy-circles/shared';
import { type Href } from 'expo-router';

import { type HistoryCase, type HistoryCaseItem } from '@/lib/history-cases';
import { theme, type AppTheme } from '@/lib/theme';
import { type TransactionRootFilter } from '@/lib/transaction-filters';
import {
  isNoBalanceTransactionStatus,
  transactionVisualCategory,
} from '@/lib/transaction-presentation';

export const PRIMARY_FILTER_OPTIONS: readonly {
  readonly label: string;
  readonly value: Extract<
    TransactionRootFilter,
    'all' | 'owed_to_me' | 'i_owe' | 'pending' | 'rejected'
  >;
}[] = [
  { label: 'Todo', value: 'all' },
  { label: 'Pendientes', value: 'pending' },
  { label: 'Rechazadas', value: 'rejected' },
  { label: 'Te deben', value: 'owed_to_me' },
  { label: 'Debes', value: 'i_owe' },
];

function isBalanceRootItem(item: ActivityItemDto): boolean {
  return (
    !isNoBalanceTransactionStatus(item.status) &&
    (item.tone === 'positive' || item.tone === 'negative')
  );
}

export function matchesPendingFilter(
  item: ActivityItemDto,
  filter: TransactionRootFilter,
): boolean {
  if (filter === 'all' || filter === 'pending' || filter === 'projection') {
    return true;
  }

  if (filter === 'pending_incoming') {
    return item.tone === 'positive';
  }

  if (filter === 'pending_outgoing') {
    return item.tone === 'negative';
  }

  return false;
}

export function matchesHistoryFilter(
  item: ActivityItemDto,
  filter: TransactionRootFilter,
): boolean {
  if (filter === 'all') {
    return true;
  }

  if (filter === 'rejected') {
    return item.status === 'rejected';
  }

  if (filter === 'current_balance') {
    return isBalanceRootItem(item);
  }

  if (filter === 'owed_to_me') {
    return isBalanceRootItem(item) && item.tone === 'positive';
  }

  if (filter === 'i_owe') {
    return isBalanceRootItem(item) && item.tone === 'negative';
  }

  return false;
}

export function matchesCategoryFilter(
  item: ActivityItemDto,
  category: TransactionCategory | null,
): boolean {
  return !category || transactionVisualCategory(item) === category;
}

export function emptyFilterTitle(filter: TransactionRootFilter): string {
  if (filter === 'all') {
    return 'Sin transacciones';
  }

  if (filter === 'pending' || filter === 'pending_incoming' || filter === 'pending_outgoing') {
    return 'Sin pendientes';
  }

  if (filter === 'rejected') {
    return 'Sin rechazadas';
  }

  if (filter === 'projection') {
    return 'Sin raiz de proyeccion';
  }

  return 'Sin movimientos';
}

export function emptyFilterDescription(filter: TransactionRootFilter): string {
  if (filter === 'all') {
    return 'Cuando registres movimientos o se creen propuestas, apareceran aqui.';
  }

  if (filter === 'pending_incoming') {
    return 'No hay pendientes que aumenten tu balance proyectado.';
  }

  if (filter === 'pending_outgoing') {
    return 'No hay pendientes que reduzcan tu balance proyectado.';
  }

  if (filter === 'pending' || filter === 'projection') {
    return 'No hay movimientos pendientes para esta raiz.';
  }

  if (filter === 'rejected') {
    return 'No hay movimientos rechazados en esta vista.';
  }

  if (filter === 'owed_to_me') {
    return 'No hay movimientos donde te deban en esta vista.';
  }

  if (filter === 'i_owe') {
    return 'No hay movimientos donde debas en esta vista.';
  }

  return 'No hay movimientos que expliquen esta raiz del balance.';
}

export function initialsBackgroundColor(
  person: Pick<PersonCardDto, 'userId' | 'displayName'>,
  activeTheme: AppTheme = theme,
): string {
  const source = `${person.userId}:${person.displayName}`;
  let hash = 0;

  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) >>> 0;
  }

  return (
    activeTheme.palette.avatar[hash % activeTheme.palette.avatar.length] ??
    activeTheme.colors.primary
  );
}

function personIdFromHref(href: string | undefined): string | null {
  const match = href?.match(/^\/person\/([^/?#]+)/);
  if (!match?.[1]) {
    return null;
  }

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export function activityHistoryCaseItem(item: ActivityItemDto): HistoryCaseItem {
  const normalizedKind: HistoryCaseItem['kind'] =
    item.kind === 'settlement'
      ? 'settlement'
      : item.kind === 'payment' || item.kind === 'manual_payment'
        ? 'payment'
        : item.kind === 'system'
          ? 'system'
          : 'request';

  return {
    amountMinor: item.amountMinor,
    category: item.category,
    counterpartyLabel: item.counterpartyLabel,
    detail: item.detail,
    flowLabel: item.flowLabel,
    happenedAt: item.happenedAt,
    happenedAtLabel: item.happenedAtLabel,
    happyCircleCaseId: item.happyCircleCaseId,
    href: item.href,
    id: item.id,
    kind: normalizedKind,
    originRequestId: item.originRequestId,
    originSettlementProposalId: item.originSettlementProposalId,
    replacedByProposalId: item.replacedByProposalId,
    replacesProposalId: item.replacesProposalId,
    staleReason: item.staleReason,
    status: item.status,
    subtitle: item.subtitle,
    title: item.title,
    tone: item.tone,
  };
}

export function transactionPersonForHistoryCase(
  people: readonly PersonCardDto[],
  itemCase: Pick<HistoryCase<HistoryCaseItem>, 'latest'>,
): PersonCardDto | undefined {
  const hrefPersonId = personIdFromHref(itemCase.latest.href);
  if (hrefPersonId) {
    const matchedPerson = people.find((person) => person.userId === hrefPersonId);
    if (matchedPerson) {
      return matchedPerson;
    }
  }

  return people.find((person) => person.displayName === itemCase.latest.counterpartyLabel);
}

export function transactionHistoryCaseHref(
  people: readonly PersonCardDto[],
  itemCase: HistoryCase<HistoryCaseItem>,
): Href {
  if (itemCase.isCycleSnippet) {
    const proposalId =
      itemCase.latest.originSettlementProposalId ??
      itemCase.steps.find((step) => step.originSettlementProposalId)?.originSettlementProposalId;

    if (proposalId) {
      return `/settlements/${proposalId}` as Href;
    }

    return itemCase.latest.href?.startsWith('/settlements/')
      ? (itemCase.latest.href as Href)
      : ('/circles' as Href);
  }

  const matchedPerson = transactionPersonForHistoryCase(people, itemCase);
  const personId = matchedPerson?.userId ?? personIdFromHref(itemCase.latest.href);
  if (!personId) {
    return itemCase.latest.href?.startsWith('/person/')
      ? (itemCase.latest.href as Href)
      : ('/transactions' as Href);
  }

  const focusId =
    itemCase.latest.originSettlementProposalId ??
    itemCase.latest.originRequestId ??
    itemCase.latest.id;

  return `/person/${personId}?panel=history&focus=${encodeURIComponent(focusId)}` as Href;
}
