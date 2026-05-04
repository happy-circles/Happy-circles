import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { InteractionManager, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { ActivityItemDto, PersonCardDto } from '@happy-circles/application';

import { BrandedRefreshScrollView } from '@/components/branded-refresh-control';
import { EmptyState } from '@/components/empty-state';
import { HappyCirclesMotion } from '@/components/happy-circles-motion';
import { PrimaryAction } from '@/components/primary-action';
import { SwipePager } from '@/components/swipe-pager';
import { TransactionEventCard } from '@/components/transaction-event-card';
import { resolveAvatarUrl } from '@/lib/avatar';
import { formatCop } from '@/lib/data';
import { useAppSnapshot } from '@/lib/live-data';
import { publishHomeNavigationIntent } from '@/lib/home-navigation-intent';
import { backOrReturnTo, returnToRoute } from '@/lib/navigation';
import { buildSetupReminderItem, getSetupPromptDismissed } from '@/lib/setup-reminder';
import { theme } from '@/lib/theme';
import { useSnapshotRefresh } from '@/lib/use-snapshot-refresh';
import { transactionCategoryLabel } from '@/lib/transaction-categories';
import {
  transactionAccentColor,
  transactionAmountIsVoided,
  transactionAmountLabel,
  transactionContextLabel,
  transactionDirectionLabel,
  transactionFocusId,
  transactionMetaLabel,
  transactionStatusTone,
  transactionToneColor,
  transactionVisualCategory,
  isCycleTransactionItem,
  isPendingTransactionItem,
} from '@/lib/transaction-presentation';
import { useSession } from '@/providers/session-provider';

type ActivityDomainKey = 'transactions' | 'friendships';
type NotificationCategoryKey = 'all' | 'transactions' | 'friends' | 'reminders';
type RouterHref = Parameters<ReturnType<typeof useRouter>['push']>[0];

interface NotificationTarget {
  readonly href: RouterHref;
  readonly homeIntent?: {
    readonly kind: 'open_invite_requests';
    readonly tab: 'received' | 'sent';
  };
}

interface PendingCardPresentation {
  readonly eyebrow: string;
}

interface PendingSnippetContent {
  readonly detail?: string;
  readonly meta?: string;
}

interface FinancialRequestPendingContent {
  readonly createdByLabel: string;
  readonly detail: string;
  readonly createdAtLabel: string;
}

interface NotificationCategoryMeta {
  readonly key: NotificationCategoryKey;
  readonly label: string;
  readonly icon: keyof typeof Ionicons.glyphMap;
  readonly color: string;
  readonly backgroundColor: string;
}

interface NotificationActor {
  readonly label: string;
  readonly avatarUrl: string | null;
}

const NOTIFICATION_AVATAR_COLORS = [
  '#0f8a5f',
  '#2563eb',
  '#a35f19',
  '#7c3aed',
  '#b24338',
  '#141e33',
];

const NOTIFICATION_CATEGORIES: readonly NotificationCategoryMeta[] = [
  {
    key: 'all',
    label: 'Todas',
    icon: 'notifications-outline',
    color: theme.colors.primary,
    backgroundColor: theme.colors.primarySoft,
  },
  {
    key: 'transactions',
    label: 'Transacciones',
    icon: 'cash-outline',
    color: theme.colors.warning,
    backgroundColor: theme.colors.warningSoft,
  },
  {
    key: 'friends',
    label: 'Amigos',
    icon: 'person-add-outline',
    color: theme.colors.primary,
    backgroundColor: theme.colors.primarySoft,
  },
  {
    key: 'reminders',
    label: 'Recordatorios',
    icon: 'alarm-outline',
    color: theme.colors.success,
    backgroundColor: theme.colors.successSoft,
  },
];
const NOTIFICATION_CATEGORY_KEYS: readonly NotificationCategoryKey[] = [
  'all',
  'transactions',
  'friends',
  'reminders',
];

function avatarColorForLabel(label: string): string {
  let hash = 0;

  for (let index = 0; index < label.length; index += 1) {
    hash = (hash * 31 + label.charCodeAt(index)) >>> 0;
  }

  return (
    NOTIFICATION_AVATAR_COLORS[hash % NOTIFICATION_AVATAR_COLORS.length] ?? theme.colors.primary
  );
}

function parseActivityDomainParam(value: string | string[] | undefined): ActivityDomainKey | null {
  const normalized = Array.isArray(value) ? value[0] : value;

  if (normalized === 'friendships' || normalized === 'transactions') {
    return normalized;
  }

  return null;
}

function parseNotificationCategoryParam(
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

function initialCategoryFromDomain(domain: ActivityDomainKey | null): NotificationCategoryKey {
  if (domain === 'friendships') {
    return 'friends';
  }

  if (domain === 'transactions') {
    return 'transactions';
  }

  return 'all';
}

function notificationCategoryForItem(
  item: ActivityItemDto,
): Exclude<NotificationCategoryKey, 'all'> {
  const kind = String(item.kind);

  if (kind === 'friendship_invite' || kind === 'account_invite') {
    return 'friends';
  }

  if (kind === 'system' || kind === 'system_note' || kind === 'reminder') {
    return 'reminders';
  }

  return 'transactions';
}

function matchesNotificationCategory(
  item: ActivityItemDto,
  category: NotificationCategoryKey,
): boolean {
  return category === 'all' || notificationCategoryForItem(item) === category;
}

function notificationCategoryMeta(item: ActivityItemDto): NotificationCategoryMeta {
  const category = notificationCategoryForItem(item);
  return (
    NOTIFICATION_CATEGORIES.find((option) => option.key === category) ?? NOTIFICATION_CATEGORIES[0]
  );
}

function readStringField(value: unknown, key: string): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const field = (value as Record<string, unknown>)[key];
  return typeof field === 'string' && field.trim().length > 0 ? field.trim() : null;
}

function readNullableStringField(value: unknown, key: string): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const field = (value as Record<string, unknown>)[key];
  return typeof field === 'string' ? field : null;
}

function readObjectField(value: unknown, key: string): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const field = (value as Record<string, unknown>)[key];
  return typeof field === 'object' && field !== null && !Array.isArray(field)
    ? (field as Record<string, unknown>)
    : null;
}

function nameFromInviteTitle(title: string): string | null {
  const patterns = [
    /^(.+) quiere conectar contigo$/i,
    /^Esperando a (.+)$/i,
    /^Verifica a (.+)$/i,
    /^(.+) reclamo la invitacion para .+$/i,
    /^Invitacion lista para (.+)$/i,
    /^QR temporal para (.+)$/i,
    /^Esperando validacion de (.+)$/i,
    /^Acceso privado para (.+)$/i,
    /^Confirmaste a (.+)$/i,
    /^Rechazaste a (.+)$/i,
    /^(.+) acepto tu invitacion$/i,
    /^(.+) rechazo tu invitacion$/i,
    /^(.+) entro con el telefono esperado$/i,
  ];

  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return null;
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

function shouldShowRespondingInviteActor(item: ActivityItemDto): boolean {
  const actorRole = readStringField(item, 'actorRole');
  const actionState = readStringField(item, 'actionState');
  const flow = readStringField(item, 'flow');

  if (item.kind === 'friendship_invite') {
    return actorRole === 'sender' && flow === 'external' && actionState !== 'pending_claim';
  }

  if (item.kind === 'account_invite') {
    return actorRole === 'inviter';
  }

  return false;
}

function notificationActorForItem(
  item: ActivityItemDto,
  people: readonly PersonCardDto[],
): NotificationActor {
  if (notificationCategoryForItem(item) === 'reminders') {
    return {
      label: 'Happy Circles',
      avatarUrl: null,
    };
  }

  const profileDisplayName = readStringField(item, 'profileDisplayName');
  const profileAvatarUrl = readNullableStringField(item, 'profileAvatarUrl');
  const respondingProfileDisplayName = readStringField(item, 'respondingProfileDisplayName');
  const respondingProfileAvatarUrl = readNullableStringField(item, 'respondingProfileAvatarUrl');
  const actorRole = readStringField(item, 'actorRole');
  const claimantSnapshot = readObjectField(item, 'claimantSnapshot');
  const claimantName = readStringField(claimantSnapshot, 'displayName');
  const claimantAvatarPath = readNullableStringField(claimantSnapshot, 'avatarPath');
  const activatedUserDisplayName = readStringField(item, 'activatedUserDisplayName');
  const activatedUserAvatarUrl = readNullableStringField(item, 'activatedUserAvatarUrl');
  const intendedRecipientAlias = readStringField(item, 'intendedRecipientAlias');
  const actorProfileDisplayName =
    profileDisplayName && profileDisplayName !== 'Persona' ? profileDisplayName : null;
  const activatedActorDisplayName =
    activatedUserDisplayName && activatedUserDisplayName !== 'Persona'
      ? activatedUserDisplayName
      : null;
  const snapshotClaimantName = claimantName && claimantName !== 'Persona' ? claimantName : null;
  const showRespondingActor = shouldShowRespondingInviteActor(item);
  const canUseIntendedRecipientAlias =
    item.kind === 'friendship_invite'
      ? actorRole === 'sender'
      : item.kind === 'account_invite'
        ? actorRole === 'inviter'
        : true;
  const inviteActorDisplayName =
    item.kind === 'friendship_invite' || item.kind === 'account_invite'
      ? showRespondingActor
        ? (respondingProfileDisplayName ??
          actorProfileDisplayName ??
          activatedActorDisplayName ??
          snapshotClaimantName ??
          nameFromInviteTitle(item.title))
        : (actorProfileDisplayName ?? nameFromInviteTitle(item.title))
      : null;
  const label =
    inviteActorDisplayName ??
    actorProfileDisplayName ??
    item.counterpartyLabel ??
    (showRespondingActor ? activatedActorDisplayName : null) ??
    (showRespondingActor ? snapshotClaimantName : null) ??
    (canUseIntendedRecipientAlias ? intendedRecipientAlias : null) ??
    nameFromInviteTitle(item.title) ??
    (notificationCategoryForItem(item) === 'reminders' ? 'Happy Circles' : 'Persona');
  const matchedPerson = personByLabel(people, label);

  return {
    label,
    avatarUrl:
      matchedPerson?.avatarUrl ??
      (showRespondingActor ? respondingProfileAvatarUrl : null) ??
      profileAvatarUrl ??
      (showRespondingActor ? activatedUserAvatarUrl : null) ??
      (showRespondingActor ? resolveAvatarUrl(claimantAvatarPath) : null),
  };
}

function notificationTitleForDisplay(title: string, actorLabel: string): string {
  const trimmedTitle = title.trim();
  const trimmedActor = actorLabel.trim();

  if (!trimmedActor) {
    return trimmedTitle;
  }

  if (
    !trimmedTitle.toLocaleLowerCase('es-CO').startsWith(trimmedActor.toLocaleLowerCase('es-CO'))
  ) {
    return trimmedTitle;
  }

  const withoutActor = trimmedTitle.slice(trimmedActor.length).trim();
  if (!withoutActor) {
    return trimmedTitle;
  }

  return `${withoutActor.charAt(0).toLocaleUpperCase('es-CO')}${withoutActor.slice(1)}`;
}

function NotificationCategoryTab({
  count,
  meta,
  selected,
  onPress,
}: {
  readonly count: number;
  readonly meta: NotificationCategoryMeta;
  readonly selected: boolean;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.notificationTab,
        selected ? styles.notificationTabActive : null,
        pressed ? styles.tabButtonPressed : null,
      ]}
    >
      <Text
        numberOfLines={1}
        style={[styles.notificationTabLabel, selected ? styles.notificationTabLabelActive : null]}
      >
        {meta.label}
      </Text>
      {count > 0 ? (
        <View style={styles.notificationTabBadge}>
          <Text style={styles.notificationTabBadgeText}>{count > 99 ? '99+' : count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function NotificationSection({
  children,
  title,
}: {
  readonly children: ReactNode;
  readonly title: string;
}) {
  return (
    <View style={styles.notificationSection}>
      <Text style={styles.notificationSectionTitle}>{title}</Text>
      <View style={styles.notificationSectionContent}>{children}</View>
    </View>
  );
}

function buildPendingCardPresentation(item: ActivityItemDto): PendingCardPresentation {
  if (item.kind === 'financial_request' && item.status === 'requires_you') {
    return {
      eyebrow: 'Requiere tu respuesta',
    };
  }

  if (item.kind === 'financial_request' && item.status === 'waiting_other_side') {
    return {
      eyebrow: 'Esperando respuesta',
    };
  }

  if (item.kind === 'settlement_proposal' && item.status === 'pending_approvals') {
    return {
      eyebrow: 'Happy Circle',
    };
  }

  if (item.kind === 'settlement_proposal' && item.status === 'waiting_other_side') {
    return {
      eyebrow: 'Esperando aprobaciones',
    };
  }

  if (item.kind === 'settlement_proposal' && item.status === 'approved') {
    return {
      eyebrow: 'Happy Circle listo',
    };
  }

  if (item.kind === 'friendship_invite' && item.status === 'requires_you_response') {
    return {
      eyebrow: 'Nueva invitacion',
    };
  }

  if (item.kind === 'friendship_invite' && item.status === 'requires_you_review') {
    return {
      eyebrow: 'Por verificar',
    };
  }

  if (item.kind === 'friendship_invite' && item.status === 'pending_claim') {
    return {
      eyebrow: 'Enviada afuera',
    };
  }

  if (item.kind === 'friendship_invite' && item.status === 'waiting_sender_review') {
    return {
      eyebrow: 'Esperando validacion',
    };
  }

  if (item.kind === 'friendship_invite' && item.status === 'waiting_other_side') {
    return {
      eyebrow: 'Esperando respuesta',
    };
  }

  if (item.kind === 'account_invite' && item.status === 'requires_you_review') {
    return {
      eyebrow: 'Por verificar',
    };
  }

  if (item.kind === 'account_invite' && item.status === 'pending_activation') {
    if (readStringField(item, 'activatedUserId')) {
      return {
        eyebrow: 'Cuenta en creacion',
      };
    }

    return {
      eyebrow: 'Acceso enviado',
    };
  }

  if (item.kind === 'account_invite' && item.status === 'waiting_sender_review') {
    return {
      eyebrow: 'Esperando validacion',
    };
  }

  return {
    eyebrow: 'Seguimiento',
  };
}

function splitSubtitleSegments(value: string): string[] {
  return value
    .split('|')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function buildPendingSnippetContent(item: ActivityItemDto): PendingSnippetContent {
  const parts = splitSubtitleSegments(item.subtitle);

  if (item.kind === 'financial_request') {
    const [creatorLabel, detail, createdAtLabel] = parts;
    const createdByLabel =
      creatorLabel === 'Tu' ? 'Creado por ti' : creatorLabel ? `Creado por ${creatorLabel}` : null;

    return {
      detail: detail ?? item.subtitle,
      meta: [createdByLabel, createdAtLabel ?? null].filter(Boolean).join(' | '),
    };
  }

  if (item.kind === 'settlement_proposal') {
    const [detail, meta] = parts;
    return {
      detail: detail ?? transactionContextLabel(item, 'Happy Circle'),
      meta: meta ?? null,
    };
  }

  if (item.kind === 'friendship_invite' || item.kind === 'account_invite') {
    const [detail, meta] = parts;
    return {
      detail: detail ?? item.subtitle,
      meta: meta ?? null,
    };
  }

  const [detail, meta] = parts;
  return {
    detail: detail ?? item.subtitle,
    meta: meta ?? null,
  };
}

function buildInviteNotificationMeta(item: ActivityItemDto, fallback: string): string {
  const profileEmailLabel = readStringField(item, 'profileEmailLabel');

  return [profileEmailLabel, fallback].filter(Boolean).join(' | ') || fallback;
}

function inviteNotificationStatusTone(status: string): 'primary' | 'warning' | 'neutral' {
  if (status === 'requires_you_response' || status === 'requires_you_review') {
    return 'warning';
  }

  if (status === 'waiting_sender_review' || status === 'waiting_other_side') {
    return 'primary';
  }

  return 'neutral';
}

function pendingDetailHref(
  item: ActivityItemDto,
  people: readonly PersonCardDto[],
): NotificationTarget | null {
  if (item.kind === 'settlement_proposal') {
    return { href: `/settlements/${item.id}` as RouterHref };
  }

  if (item.kind === 'friendship_invite' || item.kind === 'account_invite') {
    return {
      href: '/home' as RouterHref,
      homeIntent: {
        kind: 'open_invite_requests',
        tab: inviteRequestTabForNotification(item),
      },
    };
  }

  if (notificationCategoryForItem(item) !== 'transactions') {
    return item.href ? { href: item.href as RouterHref } : null;
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
    )}` as RouterHref,
  };
}

function inviteRequestTabForNotification(item: ActivityItemDto): 'received' | 'sent' {
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

function buildFinancialRequestPendingContent(
  item: ActivityItemDto,
): FinancialRequestPendingContent {
  const parts = splitSubtitleSegments(item.subtitle);
  const [createdByLabel, detail, createdAtLabel] = parts;

  return {
    createdByLabel: createdByLabel ?? 'Persona',
    detail: detail ?? item.subtitle,
    createdAtLabel: createdAtLabel ?? '',
  };
}

export function ActivityScreen() {
  const session = useSession();
  const router = useRouter();
  const params = useLocalSearchParams<{ category?: string; domain?: string }>();
  const requestedDomain = parseActivityDomainParam(params.domain);
  const requestedCategory = parseNotificationCategoryParam(params.category);
  const snapshotQuery = useAppSnapshot();
  const refresh = useSnapshotRefresh(snapshotQuery);

  const [activeCategory, setActiveCategory] = useState<NotificationCategoryKey>(
    requestedCategory ?? initialCategoryFromDomain(requestedDomain),
  );
  const [visualActiveCategory, setVisualActiveCategory] =
    useState<NotificationCategoryKey>(activeCategory);
  const [setupPromptDismissed, setSetupPromptDismissed] = useState(false);

  const sections = snapshotQuery.data?.activitySections ?? [];
  const pendingSection = useMemo(() => sections.find((item) => item.key === 'pending'), [sections]);
  const basePendingItems = pendingSection?.items ?? [];
  const needsContacts =
    session.setupState.contactsPermissionStatus !== 'granted' &&
    session.setupState.contactsPermissionStatus !== 'limited';
  const needsNotifications = !session.notificationsEnabled;
  const setupReminderItem = useMemo(
    () =>
      setupPromptDismissed
        ? buildSetupReminderItem({
            needsContacts,
            needsNotifications,
          })
        : null,
    [needsContacts, needsNotifications, setupPromptDismissed],
  );
  const allPendingItems = useMemo(
    () => (setupReminderItem ? [setupReminderItem, ...basePendingItems] : basePendingItems),
    [basePendingItems, setupReminderItem],
  );
  const people = snapshotQuery.data?.people ?? [];
  const categoryCounts = useMemo(() => {
    const counts: Record<NotificationCategoryKey, number> = {
      all: allPendingItems.length,
      transactions: 0,
      friends: 0,
      reminders: 0,
    };

    for (const item of allPendingItems) {
      const category = notificationCategoryForItem(item);
      counts[category] += 1;
    }

    return counts;
  }, [allPendingItems]);

  useEffect(() => {
    setVisualActiveCategory(activeCategory);
  }, [activeCategory]);

  useEffect(() => {
    if (requestedCategory) {
      setActiveCategory(requestedCategory);
      return;
    }

    if (requestedDomain) {
      setActiveCategory(initialCategoryFromDomain(requestedDomain));
    }
  }, [requestedCategory, requestedDomain]);

  useEffect(() => {
    let isMounted = true;

    void getSetupPromptDismissed(session.userId).then((dismissed) => {
      if (isMounted) {
        setSetupPromptDismissed(dismissed);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [session.userId]);

  function closeNotifications() {
    backOrReturnTo(router, '/home');
  }

  function changeActiveCategory(category: NotificationCategoryKey) {
    setVisualActiveCategory(category);
    setActiveCategory(category);
  }

  function openNotificationTarget(target: NotificationTarget) {
    if (target.homeIntent) {
      const homeIntent = target.homeIntent;
      returnToRoute(router, target.href);

      InteractionManager.runAfterInteractions(() => {
        publishHomeNavigationIntent(homeIntent);
      });
      return;
    }

    returnToRoute(router, target.href);
  }

  function renderPendingCard(item: ActivityItemDto) {
    const category = notificationCategoryMeta(item);
    const actor = notificationActorForItem(item, people);
    const detailHref = pendingDetailHref(item, people);

    if (item.kind === 'financial_request') {
      const financialRequestContent = buildFinancialRequestPendingContent(item);
      const creatorLabel =
        financialRequestContent.createdByLabel === 'Tu'
          ? 'Creado por ti'
          : `Creado por ${financialRequestContent.createdByLabel}`;
      const transactionMeta = [
        creatorLabel,
        financialRequestContent.createdAtLabel
          ? `${financialRequestContent.createdAtLabel} · ${transactionCategoryLabel(item.category)}`
          : transactionCategoryLabel(item.category),
      ]
        .filter(Boolean)
        .join(' | ');

      return (
        <TransactionEventCard
          accentColor={transactionAccentColor(item)}
          actorAvatarUrl={actor.avatarUrl}
          actorFallbackColor={avatarColorForLabel(actor.label)}
          actorLabel={actor.label}
          amountColor={transactionToneColor(item)}
          amountLabel={transactionAmountLabel(item) ?? formatCop(item.amountMinor ?? 0)}
          amountStruckThrough={transactionAmountIsVoided(item)}
          category={transactionVisualCategory(item)}
          categoryPlacement="meta"
          compact
          compactMetaLayout="stacked"
          context={financialRequestContent.detail}
          directionLabel={transactionDirectionLabel(item)}
          key={item.id}
          meta={transactionMeta}
          onPress={detailHref ? () => openNotificationTarget(detailHref) : undefined}
          statusLabel={null}
          statusTone={transactionStatusTone(item)}
          unread
        >
          {detailHref ? (
            <PrimaryAction
              compact
              icon="person-circle-outline"
              label="Ver en perfil"
              onPress={() => openNotificationTarget(detailHref)}
              variant="secondary"
            />
          ) : null}
        </TransactionEventCard>
      );
    }

    const cardPresentation = buildPendingCardPresentation(item);
    const snippetContent = buildPendingSnippetContent(item);

    if (notificationCategoryForItem(item) === 'transactions') {
      const isSystemTransaction = isCycleTransactionItem(item);
      const transactionActorLabel =
        isSystemTransaction ? 'Happy Circle' : actor.label;

      return (
        <TransactionEventCard
          accentColor={transactionAccentColor(item)}
          actorAvatarUrl={isSystemTransaction ? null : actor.avatarUrl}
          actorAvatarVariant={isSystemTransaction ? 'system' : 'person'}
          actorFallbackColor={
            isSystemTransaction
              ? transactionToneColor(item)
              : avatarColorForLabel(actor.label)
          }
          actorLabel={transactionActorLabel}
          amountColor={transactionToneColor(item)}
          amountLabel={transactionAmountLabel(item)}
          amountStruckThrough={transactionAmountIsVoided(item)}
          category={transactionVisualCategory(item)}
          categoryPlacement="meta"
          compact
          compactMetaLayout="stacked"
          context={transactionContextLabel(item, transactionActorLabel)}
          directionLabel={transactionDirectionLabel(item)}
          key={item.id}
          meta={transactionMetaLabel(item)}
          onPress={detailHref ? () => openNotificationTarget(detailHref) : undefined}
          statusLabel={null}
          statusTone={transactionStatusTone(item)}
          unread
        />
      );
    }

    const isReminderNotification = notificationCategoryForItem(item) === 'reminders';

    return (
      <TransactionEventCard
        accentColor={category.color}
        actorAvatarUrl={actor.avatarUrl}
        actorAvatarVariant={isReminderNotification ? 'system' : 'person'}
        actorFallbackColor={avatarColorForLabel(actor.label)}
        actorLabel={actor.label}
        amountColor={category.color}
        badgeBackgroundColor={category.backgroundColor}
        badgeColor={category.color}
        badgeIcon={category.icon}
        categoryPlacement="meta"
        compact
        compactMetaLayout="stacked"
        context={notificationTitleForDisplay(item.title, actor.label)}
        key={item.id}
        meta={buildInviteNotificationMeta(
          item,
          snippetContent.detail ?? snippetContent.meta ?? cardPresentation.eyebrow,
        )}
        onPress={detailHref ? () => openNotificationTarget(detailHref) : undefined}
        statusLabel={cardPresentation.eyebrow}
        statusTone={inviteNotificationStatusTone(item.status)}
        unread
      />
    );
  }

  function renderNotificationPage(categoryKey: NotificationCategoryKey) {
    const categoryItems = allPendingItems.filter((item) =>
      matchesNotificationCategory(item, categoryKey),
    );
    const categoryMeta =
      NOTIFICATION_CATEGORIES.find((option) => option.key === categoryKey) ??
      NOTIFICATION_CATEGORIES[0];
    const hasNotifications = categoryItems.length > 0;

    return (
      <BrandedRefreshScrollView
        fillViewport
        contentContainerStyle={styles.sheetScrollContent}
        keyboardShouldPersistTaps="handled"
        refresh={refresh}
        refreshIndicatorStyle={styles.sheetRefreshIndicator}
        showsVerticalScrollIndicator={false}
      >
        {!hasNotifications ? (
          <EmptyState
            description={
              categoryKey === 'all'
                ? 'Cuando haya algo por responder o revisar, aparecera aqui.'
                : `Cuando haya actividad de ${categoryMeta.label.toLocaleLowerCase(
                    'es-CO',
                  )}, aparecera aqui.`
            }
            title={
              categoryKey === 'all'
                ? 'Sin notificaciones'
                : `Sin ${categoryMeta.label.toLocaleLowerCase('es-CO')}`
            }
          />
        ) : (
          <NotificationSection title="Pendientes">
            {categoryItems.map((item) => renderPendingCard(item))}
          </NotificationSection>
        )}
      </BrandedRefreshScrollView>
    );
  }

  if (snapshotQuery.isLoading) {
    return (
      <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
        <View style={styles.loadingState}>
          <View style={styles.loadingMotion}>
            <HappyCirclesMotion size={108} variant="loading" />
          </View>
          <Text style={styles.supportText}>
            Estamos leyendo las acciones reales desde Supabase.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (snapshotQuery.error) {
    return (
      <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
        <View style={styles.loadingState}>
          <Text style={styles.supportText}>{snapshotQuery.error.message}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
      <Pressable onPress={closeNotifications} style={styles.backdropTapTarget} />
      <View style={styles.layout}>
        <View style={styles.fixedTop}>
          <View style={styles.heroRow}>
            <Text style={styles.heroTitle}>Notificaciones</Text>
            <Pressable
              onPress={closeNotifications}
              style={({ pressed }) => [
                styles.closeButton,
                pressed ? styles.tabButtonPressed : null,
              ]}
            >
              <Ionicons color={theme.colors.text} name="close" size={22} />
            </Pressable>
          </View>
        </View>

        <View style={styles.panelArea}>
          <ScrollView
            horizontal
            contentContainerStyle={styles.notificationTabs}
            showsHorizontalScrollIndicator={false}
            style={styles.notificationTabsScroll}
          >
            {NOTIFICATION_CATEGORIES.map((category) => (
              <NotificationCategoryTab
                count={categoryCounts[category.key]}
                key={category.key}
                meta={category}
                onPress={() => changeActiveCategory(category.key)}
                selected={visualActiveCategory === category.key}
              />
            ))}
          </ScrollView>

          <SwipePager
            accessibilityLabel="Categorias de notificaciones"
            onChange={changeActiveCategory}
            onPreviewChange={setVisualActiveCategory}
            renderPage={(categoryKey) => renderNotificationPage(categoryKey)}
            style={styles.sheetScrollWrap}
            value={activeCategory}
            values={NOTIFICATION_CATEGORY_KEYS}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: theme.colors.overlay,
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdropTapTarget: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  layout: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radius.large,
    borderTopRightRadius: theme.radius.large,
    gap: theme.spacing.md,
    height: '88%',
    maxHeight: '88%',
    paddingBottom: theme.spacing.lg,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    width: '100%',
  },
  fixedTop: {
    gap: theme.spacing.xs,
  },
  heroRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  closeButton: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  heroTitle: {
    color: theme.colors.text,
    flex: 1,
    fontSize: theme.typography.body,
    fontWeight: '800',
  },
  panelArea: {
    flex: 1,
    minHeight: 0,
    flexShrink: 1,
    gap: theme.spacing.md,
  },
  notificationTabs: {
    alignItems: 'center',
    borderBottomColor: theme.colors.hairline,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: theme.spacing.md,
    flexDirection: 'row',
    minWidth: '100%',
  },
  notificationTabsScroll: {
    flexGrow: 0,
    flexShrink: 0,
  },
  notificationTab: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    minHeight: 42,
    paddingBottom: theme.spacing.sm,
    paddingTop: theme.spacing.xs,
  },
  notificationTabActive: {
    borderBottomColor: theme.colors.primary,
    borderBottomWidth: 2,
  },
  tabButtonPressed: {
    opacity: 0.88,
  },
  notificationTabLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.callout,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  notificationTabLabelActive: {
    color: theme.colors.text,
    fontWeight: '800',
  },
  notificationTabBadge: {
    alignItems: 'center',
    backgroundColor: theme.colors.danger,
    borderRadius: theme.radius.pill,
    height: 18,
    justifyContent: 'center',
    minWidth: 18,
    paddingHorizontal: 5,
  },
  notificationTabBadgeText: {
    color: theme.colors.white,
    fontSize: 10,
    fontWeight: '800',
  },
  sheetScrollWrap: {
    flex: 1,
    minHeight: 0,
    flexShrink: 1,
    position: 'relative',
  },
  sheetScrollContent: {
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.xs,
    paddingTop: theme.spacing.xs,
  },
  sheetRefreshIndicator: {
    top: theme.spacing.xs,
  },
  notificationSection: {
    gap: theme.spacing.sm,
  },
  notificationSectionTitle: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  notificationSectionContent: {
    gap: theme.spacing.sm,
  },
  supportText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.callout,
    lineHeight: 22,
  },
  loadingMotion: {
    alignItems: 'center',
  },
  loadingState: {
    alignSelf: 'center',
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radius.large,
    borderTopRightRadius: theme.radius.large,
    padding: theme.spacing.lg,
    width: '100%',
  },
});
