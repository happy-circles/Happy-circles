import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import type { Href } from 'expo-router';
import { Pressable, View } from 'react-native';

import { AppAvatar } from '@/components/app-avatar';
import { TransactionEventCard } from '@/components/transaction-event-card';
import {
  dashboardStyles as styles,
  PEOPLE_TILE_AVATAR_SIZE,
} from '@/features/home/dashboard-screen.styles';
import { notificationViewKeyForItem } from '@/lib/live-data';
import { theme } from '@/lib/theme';
import { useAppTheme } from '@/providers/theme-provider';
import {
  isCycleTransactionItem,
  transactionAmountIsVoided,
  transactionAmountLabel,
  transactionFocusId,
  transactionMetaLabel,
  transactionShouldSurfaceStatus,
  transactionStatusLabel,
  transactionStatusTone,
  transactionToneColor,
  transactionVisualCategory,
} from '@/lib/transaction-presentation';
import type { ActivityItemDto, PersonCardDto } from '@happy-circles/application';
import type { TransactionTargetPanel } from './dashboard-helpers';
import { AppText } from '@/components/app-text';

export function initialsBackgroundColor(
  person: Pick<PersonCardDto, 'userId' | 'displayName'>,
): string {
  const source = `${person.userId}:${person.displayName}`;
  let hash = 0;

  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) >>> 0;
  }

  return (
    theme.palette.previewAvatar[hash % theme.palette.previewAvatar.length] ?? theme.colors.primary
  );
}

function personDebtBorderColor(person: PersonCardDto): string {
  if (person.direction === 'owes_me' && person.netAmountMinor > 0) {
    return theme.colors.success;
  }

  if (person.direction === 'i_owe' && person.netAmountMinor > 0) {
    return theme.colors.warning;
  }

  return theme.colors.accent;
}

function firstName(value: string): string {
  const [name] = value.trim().split(/\s+/);
  return name && name.length > 0 ? name : 'Persona';
}

function badgeLabel(count: number): string {
  return count > 99 ? '99+' : String(count);
}

export function setupNotificationKey(id: string): string {
  return notificationViewKeyForItem({
    id,
    kind: 'system_note',
    status: 'pending',
  });
}

function compactTransactionSign(item: ActivityItemDto): '+' | '-' | 'cycle' | 'neutral' {
  if (isCycleTransactionItem(item)) {
    return 'cycle';
  }

  if (transactionAmountIsVoided(item)) {
    return 'neutral';
  }

  if (item.tone === 'positive') {
    return '+';
  }

  if (item.tone === 'negative') {
    return '-';
  }

  return 'neutral';
}

function compactTransactionAmountLabel(item: ActivityItemDto): string | null {
  const amountLabel = transactionAmountLabel(item);
  const sign = compactTransactionSign(item);

  if (!amountLabel) {
    return sign === 'cycle' ? 'Circle' : null;
  }

  if (sign === '+') {
    return `+ ${amountLabel}`;
  }

  if (sign === '-') {
    return `- ${amountLabel}`;
  }

  return amountLabel;
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

export function transactionPersonForItem(
  people: readonly PersonCardDto[],
  item: ActivityItemDto,
): PersonCardDto | undefined {
  const hrefPersonId = personIdFromHref(item.href);
  if (hrefPersonId) {
    const personByHref = people.find((entry) => entry.userId === hrefPersonId);
    if (personByHref) {
      return personByHref;
    }
  }

  return people.find((entry) => entry.displayName === item.counterpartyLabel);
}

export function transactionPersonHref(
  person: PersonCardDto | undefined,
  item: ActivityItemDto,
  panel: TransactionTargetPanel,
): Href {
  if (!person) {
    return (item.href ?? '/transactions') as Href;
  }

  return `/person/${person.userId}?panel=${panel}&focus=${encodeURIComponent(
    transactionFocusId(item),
  )}` as Href;
}

export function ShortcutTile({
  href,
  icon,
  label,
  badgeCount,
  dashed = false,
  onPress,
}: {
  readonly href?: Href;
  readonly icon: keyof typeof Ionicons.glyphMap;
  readonly label: string;
  readonly badgeCount?: number;
  readonly dashed?: boolean;
  readonly onPress?: () => void;
}) {
  const activeTheme = useAppTheme();
  const content = (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.peopleTile, pressed ? styles.quickActionPressed : null]}
    >
      <View
        style={[
          styles.shortcutCircle,
          {
            backgroundColor:
              activeTheme.scheme === 'dark'
                ? activeTheme.colors.surface
                : activeTheme.colors.background,
            borderColor: dashed ? activeTheme.colors.border : activeTheme.colors.accent,
          },
          dashed ? styles.shortcutCircleDashed : null,
        ]}
      >
        <Ionicons color={activeTheme.colors.primary} name={icon} size={22} />
        {typeof badgeCount === 'number' && badgeCount > 0 ? (
          <View style={styles.requestBadge}>
            <AppText style={styles.requestBadgeText}>{badgeLabel(badgeCount)}</AppText>
          </View>
        ) : null}
      </View>
      <AppText numberOfLines={1} style={styles.peopleTileLabel}>
        {label}
      </AppText>
    </Pressable>
  );

  if (href) {
    return (
      <Link href={href} asChild>
        {content}
      </Link>
    );
  }

  return content;
}

export function PersonTile({ person }: { readonly person: PersonCardDto }) {
  const activeTheme = useAppTheme();

  return (
    <Link href={`/person/${person.userId}` as Href} asChild>
      <Pressable
        style={({ pressed }) => [styles.peopleTile, pressed ? styles.quickActionPressed : null]}
      >
        <View
          style={[
            styles.personAvatarRing,
            {
              backgroundColor: activeTheme.colors.background,
              borderColor: personDebtBorderColor(person),
            },
          ]}
        >
          <AppAvatar
            fallbackBackgroundColor={initialsBackgroundColor(person)}
            fallbackTextColor={theme.colors.white}
            imageUrl={person.avatarUrl ?? null}
            label={person.displayName}
            size={PEOPLE_TILE_AVATAR_SIZE}
          />
        </View>
        <AppText numberOfLines={1} style={styles.peopleTileLabel}>
          {firstName(person.displayName)}
        </AppText>
      </Pressable>
    </Link>
  );
}

export function TransactionPreviewCard({
  highlightPending = false,
  isPending = false,
  item,
  onPress,
  people,
  unread = false,
}: {
  readonly highlightPending?: boolean;
  readonly isPending?: boolean;
  readonly item: ActivityItemDto;
  readonly onPress?: () => void;
  readonly people: readonly PersonCardDto[];
  readonly unread?: boolean;
}) {
  const sign = compactTransactionSign(item);
  const isSystemTransaction = sign === 'cycle';
  const name = isSystemTransaction ? 'Happy Circle' : (item.counterpartyLabel ?? 'Persona');
  const person = transactionPersonForItem(people, item);
  const fallbackPerson = {
    displayName: name,
    userId: person?.userId ?? item.id,
  };
  const targetPanel: TransactionTargetPanel = isPending ? 'pending' : 'history';
  const href = transactionPersonHref(person, item, targetPanel);
  const amountLabel = compactTransactionAmountLabel(item);
  const meta = transactionMetaLabel(item);
  const category = transactionVisualCategory(item);
  const showStatus = transactionShouldSurfaceStatus(item, {
    density: 'summary',
    unread,
  });
  const toneColor = transactionToneColor(item);
  const previewAccentColor = unread || highlightPending ? toneColor : undefined;

  return (
    <TransactionEventCard
      accentColor={previewAccentColor}
      actorAvatarUrl={isSystemTransaction ? null : (person?.avatarUrl ?? null)}
      actorAvatarVariant={isSystemTransaction ? 'system' : 'person'}
      actorFallbackColor={
        isSystemTransaction ? toneColor : initialsBackgroundColor(fallbackPerson)
      }
      actorLabel={name}
      amountColor={toneColor}
      amountLabel={amountLabel}
      amountStruckThrough={transactionAmountIsVoided(item)}
      category={category}
      categoryPlacement="none"
      compact
      compactMetaLayout="inline"
      context=""
      href={onPress ? undefined : href}
      meta={meta}
      onPress={onPress}
      pending={highlightPending}
      pendingHighlightColor={toneColor}
      statusLabel={showStatus ? transactionStatusLabel(item) : null}
      statusTone={transactionStatusTone(item)}
      unread={unread}
      variant="elevated"
    />
  );
}
