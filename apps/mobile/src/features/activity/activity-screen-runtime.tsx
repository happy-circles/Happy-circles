import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { ActivityItemDto, PersonCardDto } from '@happy-circles/application';

import { ActivityItemCard } from '@/components/activity-item-card';
import { AppAvatar } from '@/components/app-avatar';
import { AppText } from '@/components/app-text';
import { BrandedRefreshScrollView } from '@/components/branded-refresh-control';
import { CardActorAvatar } from '@/components/card-actor-avatar';
import { CardPressable } from '@/components/card-shell';
import { EmptyState } from '@/components/empty-state';
import { MessageBanner } from '@/components/message-banner';
import { SwipePager, type SwipePagerProgress } from '@/components/swipe-pager';
import {
  inviteRequestPersonHrefAfterSuccessfulAction,
  inviteRequestEmptyDescription,
  inviteRequestEmptyTitle,
  type InviteRequestItem,
  type InviteRequestsTab,
} from '@/features/home/dashboard-helpers';
import { usePeopleInviteRequestsController } from '@/features/people/use-people-invite-requests-controller';
import { triggerAppSelectionHaptic } from '@/lib/app-haptics';
import { resolveAvatarUrl } from '@/lib/avatar';
import { cardStateIntentFromStatus } from '@/lib/card-language';
import { formatCop } from '@/lib/data';
import {
  markNotificationItemsViewed,
  notificationViewKeyForItem,
  notificationViewedKeysWithLocalCache,
  useAppSnapshot,
} from '@/lib/live-data';
import { buildNotificationSummary } from '@/lib/notification-summary';
import { backOrReturnTo, returnToRoute } from '@/lib/navigation';
import {
  pendingNotificationDotColor,
  pendingNotificationSurfaceColor,
} from '@/lib/pending-notification-visuals';
import { buildPendingSetupReminderItems } from '@/lib/setup-reminder';
import { theme, type AppTheme } from '@/lib/theme';
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
import { ActivitySheetStatus } from './activity-sheet-status';
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
import { ActivityInviteRequestCard } from './activity-invite-request-card';
import { activityScreenStyles as styles } from './activity-screen.styles';
import { useAppTheme } from '@/providers/theme-provider';

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

interface NotificationCategoryDefinition {
  readonly key: NotificationCategoryKey;
  readonly label: string;
  readonly icon: keyof typeof Ionicons.glyphMap;
}

interface NotificationCategoryMeta extends NotificationCategoryDefinition {
  readonly color: string;
  readonly backgroundColor: string;
}

interface NotificationActor {
  readonly label: string;
  readonly avatarUrl: string | null;
}

const NOTIFICATION_CATEGORIES: readonly NotificationCategoryDefinition[] = [
  {
    key: 'all',
    label: 'Todas',
    icon: 'notifications-outline',
  },
  {
    key: 'transactions',
    label: 'Movimientos',
    icon: 'cash-outline',
  },
  {
    key: 'friends',
    label: 'Amigos',
    icon: 'person-add-outline',
  },
  {
    key: 'reminders',
    label: 'Recordatorios',
    icon: 'alarm-outline',
  },
];
const NOTIFICATION_CATEGORY_KEYS: readonly NotificationCategoryKey[] = [
  'all',
  'transactions',
  'friends',
  'reminders',
];
const NOTIFICATION_TAB_PREVIEW_THRESHOLD = 0.03;
const NOTIFICATION_PROGRAMMATIC_TAB_SETTLE_MS = 180;
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

function inviteRequestSectionTitle(tab: InviteRequestsTab, count: number): string {
  if (tab === 'received') {
    return count === 1 ? 'Recibida' : 'Recibidas';
  }

  if (tab === 'sent') {
    return count === 1 ? 'Enviada' : 'Enviadas';
  }

  return 'Historial';
}

function avatarColorForLabel(label: string, activeTheme: AppTheme = theme): string {
  let hash = 0;

  for (let index = 0; index < label.length; index += 1) {
    hash = (hash * 31 + label.charCodeAt(index)) >>> 0;
  }

  return (
    activeTheme.palette.notificationAvatar[hash % activeTheme.palette.notificationAvatar.length] ??
    activeTheme.colors.primary
  );
}

function notificationCategoryVisual(key: NotificationCategoryKey, activeTheme: AppTheme = theme) {
  if (key === 'transactions') {
    return { backgroundColor: activeTheme.colors.warningSoft, color: activeTheme.colors.warning };
  }

  if (key === 'reminders') {
    return { backgroundColor: activeTheme.colors.successSoft, color: activeTheme.colors.success };
  }

  return { backgroundColor: activeTheme.colors.primarySoft, color: activeTheme.colors.primary };
}

function notificationCategoryMeta(
  item: ActivityItemDto,
  activeTheme: AppTheme = theme,
): NotificationCategoryMeta {
  const category = notificationCategoryForItem(item);
  const meta =
    NOTIFICATION_CATEGORIES.find((option) => option.key === category) ?? NOTIFICATION_CATEGORIES[0];
  return { ...meta, ...notificationCategoryVisual(meta.key, activeTheme) };
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
    /^(.+) reclamó la invitación para .+$/i,
    /^Invitación lista para (.+)$/i,
    /^QR temporal para (.+)$/i,
    /^Esperando validación de (.+)$/i,
    /^Acceso privado para (.+)$/i,
    /^Confirmaste a (.+)$/i,
    /^Rechazaste a (.+)$/i,
    /^(.+) aceptó tu invitación$/i,
    /^(.+) rechazó tu invitación$/i,
    /^(.+) entró con el teléfono esperado$/i,
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
  readonly meta: NotificationCategoryDefinition;
  readonly selected: boolean;
  readonly onPress: () => void;
}) {
  const activeTheme = useAppTheme();
  const visual = notificationCategoryVisual(meta.key, activeTheme);

  return (
    <Pressable
      hitSlop={{ bottom: 8, left: 10, right: 10, top: 8 }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.notificationTab,
        selected ? [styles.notificationTabActive, { borderBottomColor: visual.color }] : null,
        pressed ? styles.tabButtonPressed : null,
      ]}
    >
      <AppText
        numberOfLines={1}
        style={[
          styles.notificationTabLabel,
          { color: selected ? activeTheme.colors.text : activeTheme.colors.textMuted },
          selected ? styles.notificationTabLabelActive : null,
        ]}
      >
        {meta.label}
      </AppText>
      {count > 0 ? (
        <View style={[styles.notificationTabBadge, { backgroundColor: activeTheme.colors.danger }]}>
          <AppText style={[styles.notificationTabBadgeText, { color: activeTheme.colors.white }]}>
            {count > 99 ? '99+' : count}
          </AppText>
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
      <AppText style={styles.notificationSectionTitle}>{title}</AppText>
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
      creatorLabel === 'Tú' || creatorLabel === 'Tu'
        ? 'Creado por ti'
        : creatorLabel
          ? `Creado por ${creatorLabel}`
          : null;

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
    return 'Versión reemplazada';
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

  return 'Revisa esta transacción';
}

function inviteNotificationTitle(item: ActivityItemDto): string {
  if (item.kind === 'friendship_invite') {
    if (item.status === 'requires_you_response') {
      return 'Acepta la invitación';
    }

    if (item.status === 'requires_you_review') {
      return 'Revisa esta invitación';
    }

    if (item.status === 'pending_claim') {
      return 'Invitación enviada';
    }

    if (item.status === 'waiting_sender_review') {
      return 'Esperando validación';
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
      return readStringField(item, 'activatedUserId') ? 'Cuenta en creación' : 'Acceso enviado';
    }

    if (item.status === 'waiting_sender_review') {
      return 'Esperando validación';
    }
  }

  return 'Revisa esta actualización';
}

export function ActivityScreen() {
  const activeTheme = useAppTheme();
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
  const visualActiveCategoryRef = useRef<NotificationCategoryKey>(activeCategory);
  const programmaticCategoryTargetRef = useRef<NotificationCategoryKey | null>(null);
  const programmaticCategoryClearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [optimisticNotificationViewedKeys, setOptimisticNotificationViewedKeys] = useState<
    ReadonlySet<string>
  >(() => new Set());

  const sections = snapshotQuery.data?.activitySections ?? [];
  const pendingSection = useMemo(() => sections.find((item) => item.key === 'pending'), [sections]);
  const basePendingItems = pendingSection?.items ?? [];
  const notificationViewedKeys = useMemo(() => {
    const keys = new Set(
      notificationViewedKeysWithLocalCache(
        session.userId,
        snapshotQuery.data?.notificationViewedKeys ?? [],
      ),
    );
    for (const key of optimisticNotificationViewedKeys) {
      keys.add(key);
    }

    return keys;
  }, [
    optimisticNotificationViewedKeys,
    session.userId,
    snapshotQuery.data?.notificationViewedKeys,
  ]);
  const setupReminderItems = useMemo(() => buildPendingSetupReminderItems(session), [session]);
  const allPendingItems = useMemo(
    () => [...setupReminderItems, ...basePendingItems],
    [basePendingItems, setupReminderItems],
  );
  const notificationSummary = useMemo(
    () => buildNotificationSummary(allPendingItems, notificationViewedKeys),
    [allPendingItems, notificationViewedKeys],
  );
  const unviewedPendingItems = notificationSummary.unviewedItems;
  const reviewedPendingItems = notificationSummary.reviewedItems;
  const people = snapshotQuery.data?.people ?? [];
  const inviteRequests = usePeopleInviteRequestsController({
    accountInviteHistoryItems: snapshotQuery.data?.accountInviteHistoryItems ?? [],
    accountInvitePendingItems: snapshotQuery.data?.accountInvitePendingItems ?? [],
    friendshipHistoryItems: snapshotQuery.data?.friendshipHistoryItems ?? [],
    friendshipPendingItems: snapshotQuery.data?.friendshipPendingItems ?? [],
  });
  const categoryCounts = useMemo(() => {
    const counts: Record<NotificationCategoryKey, number> = {
      all: notificationSummary.unreadCount,
      ...notificationSummary.categoryCounts,
    };

    return counts;
  }, [notificationSummary]);

  useEffect(() => {
    setVisualNotificationCategory(activeCategory);
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

  useEffect(
    () => () => {
      if (programmaticCategoryClearTimeoutRef.current) {
        clearTimeout(programmaticCategoryClearTimeoutRef.current);
      }
    },
    [],
  );

  function markNotificationItemViewed(item: ActivityItemDto) {
    if (
      !session.userId ||
      !notificationSummary.alertableItems.includes(item) ||
      notificationViewedKeys.has(notificationViewKeyForItem(item))
    ) {
      return;
    }

    const notificationKey = notificationViewKeyForItem(item);
    setOptimisticNotificationViewedKeys((current) => {
      const merged = new Set(current);
      merged.add(notificationKey);

      return merged;
    });

    void markNotificationItemsViewed(session.userId, [item]).catch(() => {
      setOptimisticNotificationViewedKeys((current) => {
        const next = new Set(current);
        next.delete(notificationKey);

        return next;
      });
    });
  }

  function closeNotifications() {
    backOrReturnTo(router, '/home');
  }

  function setActiveNotificationCategory(category: NotificationCategoryKey) {
    if (category === activeCategory && category === visualActiveCategoryRef.current) {
      return;
    }

    triggerAppSelectionHaptic();
    setVisualNotificationCategory(category);
    setActiveCategory(category);
  }

  function setVisualNotificationCategory(category: NotificationCategoryKey) {
    if (visualActiveCategoryRef.current === category) {
      return;
    }

    visualActiveCategoryRef.current = category;
    setVisualActiveCategory(category);
  }

  function clearProgrammaticCategoryTarget() {
    if (programmaticCategoryClearTimeoutRef.current) {
      clearTimeout(programmaticCategoryClearTimeoutRef.current);
      programmaticCategoryClearTimeoutRef.current = null;
    }

    programmaticCategoryTargetRef.current = null;
  }

  function selectCategoryFromTab(category: NotificationCategoryKey) {
    clearProgrammaticCategoryTarget();
    programmaticCategoryTargetRef.current = category;
    setActiveNotificationCategory(category);
    programmaticCategoryClearTimeoutRef.current = setTimeout(() => {
      if (programmaticCategoryTargetRef.current === category) {
        programmaticCategoryTargetRef.current = null;
      }

      programmaticCategoryClearTimeoutRef.current = null;
    }, NOTIFICATION_PROGRAMMATIC_TAB_SETTLE_MS);
  }

  function changeActiveCategoryFromPager(category: NotificationCategoryKey) {
    clearProgrammaticCategoryTarget();
    setActiveNotificationCategory(category);
  }

  function handleNotificationPagerInteractionStateChange(isInteracting: boolean) {
    if (isInteracting) {
      clearProgrammaticCategoryTarget();
    }
  }

  function previewActiveCategoryFromPagerProgress(
    progress: SwipePagerProgress<NotificationCategoryKey>,
  ) {
    const programmaticTarget = programmaticCategoryTargetRef.current;

    if (programmaticTarget) {
      setVisualNotificationCategory(programmaticTarget);
      return;
    }

    setVisualNotificationCategory(
      progress.progress >= NOTIFICATION_TAB_PREVIEW_THRESHOLD ? progress.to : progress.from,
    );
  }

  function openNotificationTarget(target: NotificationTarget, item: ActivityItemDto) {
    markNotificationItemViewed(item);
    returnToRoute(router, target.href);
  }

  function openInvitePersonTarget(href: Href) {
    returnToRoute(router, href);
  }

  function renderNotificationActionCard(
    item: ActivityItemDto,
    actor: NotificationActor,
    content: NotificationActionCardContent,
    detailHref: NotificationTarget | null,
    unread: boolean,
  ) {
    const actorIntent = cardStateIntentFromStatus(item.status, {
      circle: isCycleTransactionItem(item),
    });
    const haloIntensity = unread || actorIntent === 'needsAction' ? 'strong' : 'soft';
    const card = (
      <ActivityItemCard
        accentColor={content.accentColor}
        attentionDot={unread}
        attentionDotColor={pendingNotificationDotColor(activeTheme)}
        compact
        highlightSurface={unread}
        key={item.id}
        leadingNode={
          <CardActorAvatar
            haloIntensity={haloIntensity}
            haloSize={54}
            intent={actorIntent}
            size={42}
          >
            {content.leading === 'avatar' ? (
              <AppAvatar
                fallbackBackgroundColor={avatarColorForLabel(actor.label, activeTheme)}
                fallbackTextColor={activeTheme.colors.white}
                imageUrl={actor.avatarUrl}
                label={actor.label}
                size={42}
              />
            ) : (
              <View
                style={[
                  styles.notificationActionIconBubble,
                  {
                    backgroundColor: content.iconBackgroundColor ?? activeTheme.colors.surfaceSoft,
                  },
                ]}
              >
                <Ionicons
                  color={content.iconColor ?? activeTheme.colors.textMuted}
                  name={content.iconName ?? 'information-circle-outline'}
                  size={24}
                />
              </View>
            )}
          </CardActorAvatar>
        }
        metaNode={
          content.meta ? (
            <AppText numberOfLines={1} style={styles.notificationActionMeta}>
              {content.meta}
            </AppText>
          ) : null
        }
        sideNode={
          content.amountLabel || detailHref ? (
            <View style={styles.notificationActionSide}>
              {content.amountLabel ? (
                <AppText
                  numberOfLines={1}
                  style={[
                    styles.notificationActionAmount,
                    content.amountColor ? { color: content.amountColor } : null,
                    content.amountStruckThrough ? styles.notificationActionAmountVoided : null,
                  ]}
                >
                  {content.amountLabel}
                </AppText>
              ) : null}
              {detailHref ? (
                <Ionicons color={activeTheme.colors.textMuted} name="chevron-forward" size={18} />
              ) : null}
            </View>
          ) : null
        }
        title={content.title}
        unread={unread}
        unreadSurfaceColor={pendingNotificationSurfaceColor(activeTheme)}
      />
    );

    if (!detailHref) {
      return card;
    }

    return (
      <CardPressable
        haptic="selection"
        key={item.id}
        onPress={() => openNotificationTarget(detailHref, item)}
      >
        {card}
      </CardPressable>
    );
  }

  function renderSetupReminderCard(item: ActivityItemDto, unread: boolean) {
    const category = notificationCategoryMeta(item, activeTheme);
    const detailHref = pendingDetailHref(item, people);
    const iconColor = SETUP_REMINDER_WARNING_IDS.has(item.id)
      ? activeTheme.colors.warning
      : category.color;
    const iconBackgroundColor = SETUP_REMINDER_WARNING_IDS.has(item.id)
      ? activeTheme.colors.warningSoft
      : category.backgroundColor;
    const iconName = setupReminderBadgeIcon(item, category.icon);
    const card = (
      <ActivityItemCard
        accentColor={iconColor}
        attentionDot={unread}
        attentionDotColor={pendingNotificationDotColor(activeTheme)}
        compact
        highlightSurface={unread}
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
            <Ionicons color={activeTheme.colors.textMuted} name="chevron-forward" size={18} />
          ) : null
        }
        title={item.title}
        unread={unread}
        unreadSurfaceColor={pendingNotificationSurfaceColor(activeTheme)}
      />
    );

    if (!detailHref) {
      return card;
    }

    return (
      <Pressable
        key={item.id}
        onPress={() => openNotificationTarget(detailHref, item)}
        style={({ pressed }) => [pressed ? styles.tabButtonPressed : null]}
      >
        {card}
      </Pressable>
    );
  }

  function renderPendingCard(item: ActivityItemDto, unread: boolean) {
    const category = notificationCategoryMeta(item, activeTheme);
    const actor = notificationActorForItem(item, people);
    const detailHref = pendingDetailHref(item, people);

    if (notificationCategoryForItem(item) === 'reminders' && setupReminderStatusLabel(item)) {
      return renderSetupReminderCard(item, unread);
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
        unread,
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
        unread,
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
      unread,
    );
  }

  function renderInviteRequestSection(tab: InviteRequestsTab, items: readonly InviteRequestItem[]) {
    if (items.length === 0) {
      return null;
    }

    return (
      <NotificationSection
        title={`${inviteRequestSectionTitle(tab, items.length)} (${items.length})`}
      >
        {items.map((item) => (
          <ActivityInviteRequestCard
            busyKey={inviteRequests.busyKey}
            item={item}
            key={`${tab}:${item.kind}:${item.inviteId}`}
            onAction={async (requestItem, action) => {
              const didCreateConnection = await inviteRequests.handleAction(requestItem, action);
              const href = didCreateConnection
                ? inviteRequestPersonHrefAfterSuccessfulAction(requestItem, action)
                : null;
              if (href) {
                openInvitePersonTarget(href);
              }
            }}
            onOpenPerson={openInvitePersonTarget}
          />
        ))}
      </NotificationSection>
    );
  }

  function renderFriendRequestsPage() {
    const hasRequestContent =
      inviteRequests.receivedItems.length > 0 ||
      inviteRequests.sentItems.length > 0 ||
      inviteRequests.historyItems.length > 0;

    return (
      <BrandedRefreshScrollView
        fillViewport
        contentContainerStyle={[
          styles.sheetScrollContent,
          { backgroundColor: activeTheme.colors.surface },
        ]}
        keyboardShouldPersistTaps="handled"
        refresh={refresh}
        showsVerticalScrollIndicator={false}
        style={[styles.pageScroll, { backgroundColor: activeTheme.colors.surface }]}
      >
        {inviteRequests.message ? (
          <MessageBanner message={inviteRequests.message} tone="neutral" />
        ) : null}
        {!hasRequestContent ? (
          <EmptyState
            description={inviteRequestEmptyDescription('received')}
            title={inviteRequestEmptyTitle('received')}
          />
        ) : (
          <>
            {renderInviteRequestSection('received', inviteRequests.receivedItems)}
            {renderInviteRequestSection('sent', inviteRequests.sentItems)}
            {renderInviteRequestSection('history', inviteRequests.historyItems)}
          </>
        )}
      </BrandedRefreshScrollView>
    );
  }

  function renderNotificationPage(categoryKey: NotificationCategoryKey) {
    if (categoryKey === 'friends') {
      return renderFriendRequestsPage();
    }

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
        contentContainerStyle={[
          styles.sheetScrollContent,
          { backgroundColor: activeTheme.colors.surface },
        ]}
        keyboardShouldPersistTaps="handled"
        refresh={refresh}
        showsVerticalScrollIndicator={false}
        style={[styles.pageScroll, { backgroundColor: activeTheme.colors.surface }]}
      >
        {!hasNotifications ? (
          <EmptyState
            description={
              categoryKey === 'all'
                ? 'Cuando haya algo por responder o revisar, aparecerá aquí.'
                : `Cuando haya actividad de ${categoryMeta.label.toLocaleLowerCase(
                    'es-CO',
                  )}, aparecerá aquí.`
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
              <NotificationSection title="Nuevas">
                {categoryPendingItems.map((item) => renderPendingCard(item, true))}
              </NotificationSection>
            ) : null}
            {categoryReviewedItems.length > 0 ? (
              <NotificationSection title="Revisadas">
                {categoryReviewedItems.map((item) => renderPendingCard(item, false))}
              </NotificationSection>
            ) : null}
          </>
        )}
      </BrandedRefreshScrollView>
    );
  }

  if ((snapshotQuery.isRestoringCache || snapshotQuery.isLoading) && !snapshotQuery.data) {
    return (
      <SafeAreaView
        edges={['left', 'right']}
        style={[styles.safeArea, { backgroundColor: activeTheme.colors.overlay }]}
      >
        <ActivitySheetStatus
          loading
          message="Estamos cargando tus movimientos."
          onClose={closeNotifications}
        />
      </SafeAreaView>
    );
  }

  if (snapshotQuery.error && !snapshotQuery.data) {
    return (
      <SafeAreaView
        edges={['left', 'right']}
        style={[styles.safeArea, { backgroundColor: activeTheme.colors.overlay }]}
      >
        <ActivitySheetStatus
          message={snapshotQuery.error.message}
          onClose={closeNotifications}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      edges={['left', 'right']}
      style={[styles.safeArea, { backgroundColor: activeTheme.colors.overlay }]}
    >
      <Pressable onPress={closeNotifications} style={styles.backdropTapTarget} />
      <View style={[styles.layout, { backgroundColor: activeTheme.colors.surface }]}>
        <View style={styles.sheetContent}>
          <View style={styles.fixedTop}>
            <View style={styles.heroRow}>
              <AppText style={styles.heroTitle}>Notificaciones</AppText>
              <Pressable
                accessibilityLabel="Cerrar notificaciones"
                accessibilityRole="button"
                onPress={closeNotifications}
                style={({ pressed }) => [
                  styles.closeButton,
                  pressed ? styles.tabButtonPressed : null,
                ]}
              >
                <Ionicons color={activeTheme.colors.text} name="close" size={22} />
              </Pressable>
            </View>
          </View>

          <View style={styles.panelArea}>
            <ScrollView
              horizontal
              contentContainerStyle={[
                styles.notificationTabs,
                { borderBottomColor: activeTheme.colors.hairline },
              ]}
              showsHorizontalScrollIndicator={false}
              style={styles.notificationTabsScroll}
            >
              {NOTIFICATION_CATEGORIES.map((category) => (
                <NotificationCategoryTab
                  count={categoryCounts[category.key]}
                  key={category.key}
                  meta={category}
                  onPress={() => selectCategoryFromTab(category.key)}
                  selected={visualActiveCategory === category.key}
                />
              ))}
            </ScrollView>

            <SwipePager
              accessibilityLabel="Categorias de notificaciones"
              animateProgrammaticTransitions={false}
              commitPreviewChanges
              offscreenPageLimit={1}
              onChange={changeActiveCategoryFromPager}
              onInteractionStateChange={handleNotificationPagerInteractionStateChange}
              onPreviewChange={setVisualNotificationCategory}
              onProgressChange={previewActiveCategoryFromPagerProgress}
              pageStyle={[styles.notificationPage, { backgroundColor: activeTheme.colors.surface }]}
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
