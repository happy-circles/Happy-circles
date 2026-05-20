import type { Href } from 'expo-router';

import type { ActivityItemDto, PersonCardDto } from '@happy-circles/application';

import { notificationSummaryCategoryForItem } from '@/lib/notification-summary';
import { transactionCircleHref } from '@/lib/transaction-people';
import { isPendingTransactionItem, transactionFocusId } from '@/lib/transaction-presentation';

export type ActivityDomainKey = 'transactions' | 'friendships';
export type NotificationCategoryKey = 'all' | 'transactions' | 'friends' | 'reminders';

export interface NotificationTarget {
  readonly href: Href;
}

export function parseActivityDomainParam(
  value: string | string[] | undefined,
): ActivityDomainKey | null {
  const normalized = Array.isArray(value) ? value[0] : value;

  if (normalized === 'friendships' || normalized === 'transactions') {
    return normalized;
  }

  return null;
}

export function parseNotificationCategoryParam(
  value: string | string[] | undefined,
): NotificationCategoryKey | null {
  const normalized = Array.isArray(value) ? value[0] : value;

  if (
    normalized === 'all' ||
    normalized === 'transactions' ||
    normalized === 'friends' ||
    normalized === 'reminders'
  ) {
    return normalized;
  }

  return null;
}

export function initialCategoryFromDomain(
  domain: ActivityDomainKey | null,
): NotificationCategoryKey {
  if (domain === 'friendships') {
    return 'friends';
  }

  if (domain === 'transactions') {
    return 'transactions';
  }

  return 'all';
}

export function notificationCategoryForItem(
  item: ActivityItemDto,
): Exclude<NotificationCategoryKey, 'all'> {
  return notificationSummaryCategoryForItem(item);
}

export function matchesNotificationCategory(
  item: ActivityItemDto,
  category: NotificationCategoryKey,
): boolean {
  return category === 'all' || notificationCategoryForItem(item) === category;
}

function readStringField(value: unknown, key: string): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const field = (value as Record<string, unknown>)[key];
  return typeof field === 'string' && field.trim().length > 0 ? field : null;
}

export function personIdFromHref(href: string | undefined): string | null {
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

function personByLabel(
  people: readonly PersonCardDto[],
  label: string | null | undefined,
): PersonCardDto | null {
  const normalized = label?.trim().toLocaleLowerCase('es-CO') ?? '';
  if (!normalized) {
    return null;
  }

  return (
    people.find((person) => person.displayName.trim().toLocaleLowerCase('es-CO') === normalized) ??
    null
  );
}

export function inviteRequestTabForNotification(item: ActivityItemDto): 'received' | 'sent' {
  const actorRole = readStringField(item, 'actorRole');

  if (
    item.status === 'pending_claim' ||
    item.status === 'pending_activation' ||
    item.status === 'waiting_other_side' ||
    (item.kind === 'friendship_invite' &&
      item.status === 'waiting_sender_review' &&
      actorRole === 'sender')
  ) {
    return 'sent';
  }

  return 'received';
}

export function pendingDetailHref(
  item: ActivityItemDto,
  people: readonly PersonCardDto[],
): NotificationTarget | null {
  const circleHref = transactionCircleHref(item);
  if (circleHref) {
    return { href: circleHref };
  }

  if (item.kind === 'settlement_proposal') {
    return { href: `/settlements/${item.id}` as Href };
  }

  if (item.kind === 'friendship_invite' || item.kind === 'account_invite') {
    return {
      href: '/activity?category=friends' as Href,
    };
  }

  if (notificationCategoryForItem(item) !== 'transactions') {
    return item.href ? { href: item.href as Href } : null;
  }

  const hrefPersonId = personIdFromHref(item.href);
  const matchedPerson =
    (hrefPersonId ? people.find((person) => person.userId === hrefPersonId) : null) ??
    personByLabel(people, item.counterpartyLabel);
  const personId = matchedPerson?.userId ?? hrefPersonId;

  if (!personId) {
    return null;
  }

  const panel = isPendingTransactionItem(item) ? 'pending' : 'history';
  return {
    href: `/person/${personId}?panel=${panel}&focus=${encodeURIComponent(
      transactionFocusId(item),
    )}` as Href,
  };
}
