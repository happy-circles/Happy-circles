import type { ActivityItemDto, PersonCardDto } from '@happy-circles/application';

import { theme } from './theme';

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
