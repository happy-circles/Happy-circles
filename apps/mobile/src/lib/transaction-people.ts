import type { Href } from 'expo-router';
import type { ActivityItemDto, PersonCardDto } from '@happy-circles/application';

import { theme } from './theme';
import { isCycleTransactionItem, transactionFocusId } from './transaction-presentation';

export type TransactionTargetPanel = 'pending' | 'history';

type TransactionRouteItem = Pick<
  ActivityItemDto,
  | 'category'
  | 'counterpartyLabel'
  | 'href'
  | 'id'
  | 'kind'
  | 'originRequestId'
  | 'originSettlementProposalId'
>;

export function transactionPersonIdFromHref(href: string | undefined): string | null {
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

export function transactionPersonForItem(
  people: readonly PersonCardDto[],
  item: Pick<ActivityItemDto, 'counterpartyLabel' | 'href'>,
): PersonCardDto | undefined {
  const hrefPersonId = transactionPersonIdFromHref(item.href);
  if (hrefPersonId) {
    const personByHref = people.find((person) => person.userId === hrefPersonId);
    if (personByHref) {
      return personByHref;
    }
  }

  return people.find((person) => person.displayName === item.counterpartyLabel);
}

export function transactionCircleHref(
  item: Pick<ActivityItemDto, 'category' | 'href' | 'id' | 'kind' | 'originSettlementProposalId'>,
): Href | null {
  if (!isCycleTransactionItem(item)) {
    return null;
  }

  const proposalId =
    item.originSettlementProposalId ?? (item.kind === 'settlement_proposal' ? item.id : null);

  if (proposalId) {
    return `/settlements/${proposalId}` as Href;
  }

  if (item.href?.startsWith('/settlements/')) {
    return item.href as Href;
  }

  return '/circles' as Href;
}

export function transactionDetailHref(
  people: readonly PersonCardDto[],
  item: TransactionRouteItem,
  panel: TransactionTargetPanel,
): Href {
  const circleHref = transactionCircleHref(item);
  if (circleHref) {
    return circleHref;
  }

  const matchedPerson = transactionPersonForItem(people, item);
  const personId = matchedPerson?.userId ?? transactionPersonIdFromHref(item.href);

  if (!personId) {
    return (item.href ?? '/transactions') as Href;
  }

  return `/person/${personId}?panel=${panel}&focus=${encodeURIComponent(
    transactionFocusId(item),
  )}` as Href;
}

export function transactionInitialsBackgroundColor(
  person: Pick<PersonCardDto, 'displayName' | 'userId'>,
): string {
  const source = `${person.userId}:${person.displayName}`;
  let hash = 0;

  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) >>> 0;
  }

  return theme.palette.avatar[hash % theme.palette.avatar.length] ?? theme.colors.primary;
}
