import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { InteractionManager, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { ActivityItemDto, PersonCardDto } from '@happy-circles/application';

import { ActivityItemCard } from '@/components/activity-item-card';
import { AppAvatar } from '@/components/app-avatar';
import { BrandedRefreshScrollView } from '@/components/branded-refresh-control';
import { EmptyState } from '@/components/empty-state';
import { HappyCirclesMotion } from '@/components/happy-circles-motion';
import { SwipePager } from '@/components/swipe-pager';
import { resolveAvatarUrl } from '@/lib/avatar';
import { formatCop } from '@/lib/data';
import {
  markNotificationItemsViewed,
  notificationViewKeyForItem,
  useAppSnapshot,
} from '@/lib/live-data';
import { publishHomeNavigationIntent } from '@/lib/home-navigation-intent';
import { backOrReturnTo, returnToRoute } from '@/lib/navigation';
import {
  buildAppleAuthReminderItem,
  buildBiometricsReminderItem,
  buildContactsReminderItem,
  buildDeviceTrustReminderItem,
  buildGoogleAuthReminderItem,
  buildNotificationsReminderItem,
  buildPasswordAuthReminderItem,
} from '@/lib/setup-reminder';
import { theme } from '@/lib/theme';
import { useSnapshotRefresh } from '@/lib/use-snapshot-refresh';
import {
  transactionCategoryBackgroundColor,
  transactionCategoryIcon,
  transactionCategoryLabel,
} from '@/lib/transaction-categories';
import {
  transactionAmountIsVoided,
  transactionAmountLabel,
  transactionContextLabel,
  transactionToneColor,
  transactionVisualCategory,
  isCycleTransactionItem,
} from '@/lib/transaction-presentation';
import { useSession } from '@/providers/session-provider';
import {
  initialCategoryFromDomain,
  matchesNotificationCategory,
  notificationCategoryForItem,
  parseActivityDomainParam,
  parseNotificationCategoryParam,
  pendingDetailHref,
  type NotificationCategoryKey,
  type NotificationTarget,
} from './activity-helpers';

interface PendingSnippetContent {
  readonly detail?: string;
  readonly meta?: string;
}

interface NotificationActionCardContent {
  readonly accentColor: string;
  readonly amountColor?: string;
  readonly amountLabel?: string | null;
  readonly amountStruckThrough?: boolean;
  readonly iconBackgroundColor?: string;
  readonly iconColor?: string;
  readonly iconName?: keyof typeof Ionicons.glyphMap;
  readonly leading: 'avatar' | 'icon';
  readonly meta?: string | null;
  readonly title: string;
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
const SETUP_REMINDER_BADGE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  'local-apple-auth-reminder': 'logo-apple',
  'local-biometrics-reminder': 'finger-print',
  'local-contacts-reminder': 'people-outline',
  'local-device-trust-reminder': 'shield-checkmark-outline',
  'local-google-auth-reminder': 'logo-google',
  'local-notifications-reminder': 'notifications-outline',
  'local-password-auth-reminder': 'key-outline',
};
const SETUP_REMINDER_STATUS_LABELS: Record<string, string> = {
  'local-apple-auth-reminder': 'Acceso',
  'local-biometrics-reminder': 'Seguridad',
  'local-contacts-reminder': 'Conexion',
  'local-device-trust-reminder': 'Prioritario',
  'local-google-auth-reminder': 'Acceso',
  'local-notifications-reminder': 'Avisos',
  'local-password-auth-reminder': 'Acceso',
};
const SETUP_REMINDER_WARNING_IDS = new Set([
  'local-biometrics-reminder',
  'local-device-trust-reminder',
]);

function avatarColorForLabel(label: string): string {
  let hash = 0;

  for (let index = 0; index < label.length; index += 1) {
    hash = (hash * 31 + label.charCodeAt(index)) >>> 0;
  }

  return (
    NOTIFICATION_AVATAR_COLORS[hash % NOTIFICATION_AVATAR_COLORS.length] ?? theme.colors.primary
  );
}

function notificationCategoryMeta(item: ActivityItemDto): NotificationCategoryMeta {
  const category = notificationCategoryForItem(item);
  return (
    NOTIFICATION_CATEGORIES.find((option) => option.key === category) ?? NOTIFICATION_CATEGORIES[0]
  );
}

function setupReminderBadgeIcon(
  item: ActivityItemDto,
  fallback: keyof typeof Ionicons.glyphMap,
): keyof typeof Ionicons.glyphMap {
  return SETUP_REMINDER_BADGE_ICONS[item.id] ?? fallback;
}

function setupReminderStatusLabel(item: ActivityItemDto): string | null {
  return SETUP_REMINDER_STATUS_LABELS[item.id] ?? null;
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

function joinNotificationMeta(parts: readonly (string | null | undefined)[]): string | null {
  const visibleParts = parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));

  return visibleParts.length > 0 ? visibleParts.join(' - ') : null;
}

function financialRequestNotificationTitle(item: ActivityItemDto): string {
  if (item.status === 'requires_you') {
    return 'Responde esta solicitud';
  }

  if (item.status === 'waiting_other_side') {
    return 'Solicitud enviada';
  }

  if (item.status === 'accepted') {
    return 'Solicitud aceptada';
  }

  if (item.status === 'rejected') {
    return 'Solicitud rechazada';
  }

  return 'Revisa esta solicitud';
}

function settlementNotificationTitle(item: ActivityItemDto): string {
  if (item.status === 'pending_approvals') {
    return 'Aprueba este Happy Circle';
  }

  if (item.status === 'waiting_other_side') {
    return 'Esperando aprobaciones';
  }

  if (item.status === 'approved') {
    return 'Completa este Happy Circle';
  }

  if (item.status === 'executed' || item.status === 'posted') {
    return 'Happy Circle completado';
  }

  if (item.status === 'rejected') {
    return 'Happy Circle no completado';
  }

  if (item.status === 'stale') {
    return 'Happy Circle reemplazado';
  }

  return 'Revisa este Happy Circle';
}

function transactionNotificationTitle(item: ActivityItemDto): string {
  if (isCycleTransactionItem(item)) {
    return settlementNotificationTitle(item);
  }

  if (item.status === 'requires_you' || item.status === 'pending') {
    return 'Revisa esta solicitud';
  }

  if (item.status === 'waiting_other_side') {
    return 'Esperando respuesta';
  }

  if (item.status === 'posted') {
    return item.tone === 'positive' ? 'Pago recibido' : 'Pago registrado';
  }

  if (item.status === 'accepted') {
    return 'Solicitud aceptada';
  }

  if (item.status === 'amended') {
    return 'Revisa el nuevo monto';
  }

  if (item.status === 'rejected' || item.status === 'canceled' || item.status === 'expired') {
    return 'Solicitud cerrada';
  }

  return 'Revisa esta transaccion';
}

function inviteNotificationTitle(item: ActivityItemDto): string {
  if (item.kind === 'friendship_invite') {
    if (item.status === 'requires_you_response') {
      return 'Acepta la invitacion';
    }

    if (item.status === 'requires_you_review') {
      return 'Revisa esta invitacion';
    }

    if (item.status === 'pending_claim') {
      return 'Invitacion enviada';
    }

    if (item.status === 'waiting_sender_review') {
      return 'Esperando validacion';
    }

    if (item.status === 'waiting_other_side') {
      return 'Esperando respuesta';
    }
  }

  if (item.kind === 'account_invite') {
    if (item.status === 'requires_you_review') {
      return 'Revisa este acceso';
    }

    if (item.status === 'pending_activation') {
      return readStringField(item, 'activatedUserId') ? 'Cuenta en creacion' : 'Acceso enviado';
    }

    if (item.status === 'waiting_sender_review') {
      return 'Esperando validacion';
    }
  }

  return 'Revisa esta actualizacion';
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
  const [optimisticNotificationViewedKeys, setOptimisticNotificationViewedKeys] = useState<
    ReadonlySet<string>
  >(() => new Set());

  const sections = snapshotQuery.data?.activitySections ?? [];
  const pendingSection = useMemo(() => sections.find((item) => item.key === 'pending'), [sections]);
  const basePendingItems = pendingSection?.items ?? [];
  const notificationViewedKeys = useMemo(() => {
    const keys = new Set(snapshotQuery.data?.notificationViewedKeys ?? []);
    for (const key of optimisticNotificationViewedKeys) {
      keys.add(key);
    }

    return keys;
  }, [optimisticNotificationViewedKeys, snapshotQuery.data?.notificationViewedKeys]);
  const accountSetupEligible =
    session.accountAccessState === 'active' && session.profileCompletionState === 'complete';
  const needsContacts =
    session.setupState.contactsPermissionStatus !== 'granted' &&
    session.setupState.contactsPermissionStatus !== 'limited';
  const needsNotifications = !session.notificationsEnabled;
  const needsPasswordAuth = accountSetupEligible && !session.linkedMethods.hasEmailPassword;
  const needsGoogleAuth = accountSetupEligible && !session.linkedMethods.hasGoogle;
  const needsAppleAuth =
    accountSetupEligible && session.appleSignInAvailable && !session.linkedMethods.hasApple;
  const setupReminderItems = useMemo(
    () =>
      [
        accountSetupEligible && !session.isTrustedDevice ? buildDeviceTrustReminderItem() : null,
        accountSetupEligible && session.biometricAvailable && !session.biometricsEnabled
          ? buildBiometricsReminderItem()
          : null,
        needsPasswordAuth ? buildPasswordAuthReminderItem() : null,
        needsGoogleAuth ? buildGoogleAuthReminderItem() : null,
        needsAppleAuth ? buildAppleAuthReminderItem() : null,
        needsContacts ? buildContactsReminderItem() : null,
        needsNotifications ? buildNotificationsReminderItem() : null,
      ].filter((item): item is ActivityItemDto => Boolean(item)),
    [
      accountSetupEligible,
      needsAppleAuth,
      needsContacts,
      needsGoogleAuth,
      needsNotifications,
      needsPasswordAuth,
      session.biometricAvailable,
      session.biometricsEnabled,
      session.isTrustedDevice,
    ],
  );
  const allPendingItems = useMemo(
    () => [...setupReminderItems, ...basePendingItems],
    [basePendingItems, setupReminderItems],
  );
  const unviewedPendingItems = useMemo(
    () =>
      allPendingItems.filter(
        (item) => !notificationViewedKeys.has(notificationViewKeyForItem(item)),
      ),
    [allPendingItems, notificationViewedKeys],
  );
  const reviewedPendingItems = useMemo(
    () =>
      allPendingItems.filter((item) =>
        notificationViewedKeys.has(notificationViewKeyForItem(item)),
      ),
    [allPendingItems, notificationViewedKeys],
  );
  const people = snapshotQuery.data?.people ?? [];
  const categoryCounts = useMemo(() => {
    const counts: Record<NotificationCategoryKey, number> = {
      all: unviewedPendingItems.length,
      transactions: 0,
      friends: 0,
      reminders: 0,
    };

    for (const item of unviewedPendingItems) {
      const category = notificationCategoryForItem(item);
      counts[category] += 1;
    }

    return counts;
  }, [unviewedPendingItems]);

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
    setOptimisticNotificationViewedKeys(new Set());
  }, [session.userId]);

  useEffect(() => {
    if (!session.userId || unviewedPendingItems.length === 0) {
      return;
    }

    const nextKeys = unviewedPendingItems.map((item) => notificationViewKeyForItem(item));
    const nextKeySet = new Set(nextKeys);
    setOptimisticNotificationViewedKeys((current) => {
      const merged = new Set(current);
      for (const key of nextKeys) {
        merged.add(key);
      }

      return merged;
    });

    void markNotificationItemsViewed(session.userId, unviewedPendingItems).catch(() => {
      setOptimisticNotificationViewedKeys((current) => {
        const next = new Set(current);
        for (const key of nextKeySet) {
          next.delete(key);
        }

        return next;
      });
    });
  }, [session.userId, unviewedPendingItems]);

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

  function renderNotificationActionCard(
    item: ActivityItemDto,
    actor: NotificationActor,
    content: NotificationActionCardContent,
    detailHref: NotificationTarget | null,
  ) {
    const card = (
      <ActivityItemCard
        accentColor={content.accentColor}
        compact
        key={item.id}
        leadingNode={
          content.leading === 'avatar' ? (
            <AppAvatar
              fallbackBackgroundColor={avatarColorForLabel(actor.label)}
              fallbackTextColor={theme.colors.white}
              imageUrl={actor.avatarUrl}
              label={actor.label}
              rounded={false}
              size={42}
            />
          ) : (
            <View
              style={[
                styles.notificationActionIconBubble,
                { backgroundColor: content.iconBackgroundColor ?? theme.colors.surfaceSoft },
              ]}
            >
              <Ionicons
                color={content.iconColor ?? theme.colors.textMuted}
                name={content.iconName ?? 'information-circle-outline'}
                size={24}
              />
            </View>
          )
        }
        metaNode={
          content.meta ? (
            <Text numberOfLines={1} style={styles.notificationActionMeta}>
              {content.meta}
            </Text>
          ) : null
        }
        sideNode={
          content.amountLabel || detailHref ? (
            <View style={styles.notificationActionSide}>
              {content.amountLabel ? (
                <Text
                  numberOfLines={1}
                  style={[
                    styles.notificationActionAmount,
                    content.amountColor ? { color: content.amountColor } : null,
                    content.amountStruckThrough ? styles.notificationActionAmountVoided : null,
                  ]}
                >
                  {content.amountLabel}
                </Text>
              ) : null}
              {detailHref ? (
                <Ionicons color={theme.colors.textMuted} name="chevron-forward" size={18} />
              ) : null}
            </View>
          ) : null
        }
        title={content.title}
      />
    );

    if (!detailHref) {
      return card;
    }

    return (
      <Pressable
        key={item.id}
        onPress={() => openNotificationTarget(detailHref)}
        style={({ pressed }) => [pressed ? styles.tabButtonPressed : null]}
      >
        {card}
      </Pressable>
    );
  }

  function renderSetupReminderCard(item: ActivityItemDto) {
    const category = notificationCategoryMeta(item);
    const detailHref = pendingDetailHref(item, people);
    const iconColor = SETUP_REMINDER_WARNING_IDS.has(item.id)
      ? theme.colors.warning
      : category.color;
    const iconBackgroundColor = SETUP_REMINDER_WARNING_IDS.has(item.id)
      ? theme.colors.warningSoft
      : category.backgroundColor;
    const iconName = setupReminderBadgeIcon(item, category.icon);
    const card = (
      <ActivityItemCard
        accentColor={iconColor}
        compact
        key={item.id}
        leadingNode={
          <View
            style={[styles.notificationActionIconBubble, { backgroundColor: iconBackgroundColor }]}
          >
            <Ionicons color={iconColor} name={iconName} size={24} />
          </View>
        }
        sideNode={
          detailHref ? (
            <Ionicons color={theme.colors.textMuted} name="chevron-forward" size={18} />
          ) : null
        }
        title={item.title}
      />
    );

    if (!detailHref) {
      return card;
    }

    return (
      <Pressable
        key={item.id}
        onPress={() => openNotificationTarget(detailHref)}
        style={({ pressed }) => [pressed ? styles.tabButtonPressed : null]}
      >
        {card}
      </Pressable>
    );
  }

  function renderPendingCard(item: ActivityItemDto) {
    const category = notificationCategoryMeta(item);
    const actor = notificationActorForItem(item, people);
    const detailHref = pendingDetailHref(item, people);

    if (notificationCategoryForItem(item) === 'reminders' && setupReminderStatusLabel(item)) {
      return renderSetupReminderCard(item);
    }

    if (item.kind === 'financial_request') {
      const visualCategory = transactionVisualCategory(item);
      const iconColor = transactionToneColor(item);
      return renderNotificationActionCard(
        item,
        actor,
        {
          accentColor: iconColor,
          amountColor: iconColor,
          amountLabel: transactionAmountLabel(item) ?? formatCop(item.amountMinor ?? 0),
          amountStruckThrough: transactionAmountIsVoided(item),
          iconBackgroundColor: transactionCategoryBackgroundColor(visualCategory),
          iconColor,
          iconName: transactionCategoryIcon(visualCategory) as keyof typeof Ionicons.glyphMap,
          leading: 'icon',
          meta: joinNotificationMeta([actor.label, transactionCategoryLabel(visualCategory)]),
          title: financialRequestNotificationTitle(item),
        },
        detailHref,
      );
    }

    if (notificationCategoryForItem(item) === 'transactions') {
      const isSystemTransaction = isCycleTransactionItem(item);
      const visualCategory = transactionVisualCategory(item);
      const iconColor = transactionToneColor(item);
      const transactionActorLabel = isSystemTransaction ? 'Happy Circle' : actor.label;

      return renderNotificationActionCard(
        item,
        actor,
        {
          accentColor: iconColor,
          amountColor: iconColor,
          amountLabel: transactionAmountLabel(item),
          amountStruckThrough: transactionAmountIsVoided(item),
          iconBackgroundColor: transactionCategoryBackgroundColor(visualCategory),
          iconColor,
          iconName: transactionCategoryIcon(visualCategory) as keyof typeof Ionicons.glyphMap,
          leading: 'icon',
          meta: joinNotificationMeta([
            transactionActorLabel,
            transactionCategoryLabel(visualCategory),
          ]),
          title: transactionNotificationTitle(item),
        },
        detailHref,
      );
    }

    const snippetContent = buildPendingSnippetContent(item);
    const profileEmailLabel = readStringField(item, 'profileEmailLabel');
    const actorMetaLabel =
      actor.label !== 'Persona' && actor.label !== 'Happy Circles' ? actor.label : null;
    const canUseActorAvatar = Boolean(actor.avatarUrl || actorMetaLabel);

    return renderNotificationActionCard(
      item,
      actor,
      {
        accentColor: category.color,
        iconBackgroundColor: category.backgroundColor,
        iconColor: category.color,
        iconName: item.kind === 'account_invite' ? 'key-outline' : category.icon,
        leading: canUseActorAvatar ? 'avatar' : 'icon',
        meta: joinNotificationMeta([
          actorMetaLabel,
          profileEmailLabel ?? snippetContent.meta ?? snippetContent.detail,
        ]),
        title: inviteNotificationTitle(item),
      },
      detailHref,
    );
  }

  function renderNotificationPage(categoryKey: NotificationCategoryKey) {
    const categoryPendingItems = unviewedPendingItems.filter((item) =>
      matchesNotificationCategory(item, categoryKey),
    );
    const categoryReviewedItems = reviewedPendingItems.filter((item) =>
      matchesNotificationCategory(item, categoryKey),
    );
    const categoryMeta =
      NOTIFICATION_CATEGORIES.find((option) => option.key === categoryKey) ??
      NOTIFICATION_CATEGORIES[0];
    const hasNotifications = categoryPendingItems.length > 0 || categoryReviewedItems.length > 0;

    return (
      <BrandedRefreshScrollView
        fillViewport
        contentContainerStyle={styles.sheetScrollContent}
        keyboardShouldPersistTaps="handled"
        refresh={refresh}
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
          <>
            {categoryPendingItems.length > 0 ? (
              <NotificationSection title="Pendientes">
                {categoryPendingItems.map((item) => renderPendingCard(item))}
              </NotificationSection>
            ) : null}
            {categoryReviewedItems.length > 0 ? (
              <NotificationSection title="Revisadas">
                {categoryReviewedItems.map((item) => renderPendingCard(item))}
              </NotificationSection>
            ) : null}
          </>
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
        <View style={styles.sheetContent}>
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
    height: '88%',
    maxHeight: '88%',
    paddingBottom: theme.spacing.lg,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    width: '100%',
  },
  sheetContent: {
    alignSelf: 'center',
    flex: 1,
    gap: theme.spacing.md,
    maxWidth: 560,
    minHeight: 0,
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
  notificationActionIconBubble: {
    alignItems: 'center',
    borderRadius: theme.radius.medium,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  notificationActionMeta: {
    color: theme.colors.textMuted,
    fontSize: 12,
    lineHeight: 15,
  },
  notificationActionSide: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'flex-end',
    minWidth: 0,
  },
  notificationActionAmount: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '800',
    lineHeight: 18,
  },
  notificationActionAmountVoided: {
    opacity: 0.72,
    textDecorationLine: 'line-through',
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
