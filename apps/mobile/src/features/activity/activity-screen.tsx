import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  Alert,
  InteractionManager,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { ActivityItemDto, PersonCardDto } from '@happy-circles/application';

import { AppTextInput } from '@/components/app-text-input';
import { EmptyState } from '@/components/empty-state';
import { FieldBlock } from '@/components/field-block';
import { MessageBanner } from '@/components/message-banner';
import { PrimaryAction } from '@/components/primary-action';
import { TransactionEventCard } from '@/components/transaction-event-card';
import { TransactionCategoryPicker } from '@/components/transaction-category-picker';
import { resolveAvatarUrl } from '@/lib/avatar';
import { formatCop } from '@/lib/data';
import {
  historyStatusLabel,
  historyStatusTone,
} from '@/lib/history-cases';
import {
  useAcceptFinancialRequestMutation,
  useAmendFinancialRequestMutation,
  useAppSnapshot,
  useApproveSettlementMutation,
  useCancelFriendshipInviteMutation,
  useExecuteSettlementMutation,
  useRespondInternalFriendshipInviteMutation,
  useReviewAccountInviteMutation,
  useReviewExternalFriendshipInviteMutation,
  useRejectFinancialRequestMutation,
  useRejectSettlementMutation,
} from '@/lib/live-data';
import { theme } from '@/lib/theme';
import {
  DEFAULT_TRANSACTION_CATEGORY,
  type UserTransactionCategory,
  isUserTransactionCategory,
  transactionCategoryLabel,
} from '@/lib/transaction-categories';
import { publishHomeNavigationIntent } from '@/lib/home-navigation-intent';
import {
  transactionAccentColor,
  transactionAmountIsVoided,
  transactionAmountLabel,
  transactionContextLabel,
  transactionDirectionLabel,
  transactionFocusId,
  transactionMetaLabel,
  transactionStatusLabel,
  transactionStatusTone,
  transactionToneColor,
  transactionVisualCategory,
  isPendingTransactionItem,
} from '@/lib/transaction-presentation';

type ActivityDomainKey = 'transactions' | 'friendships';
type NotificationCategoryKey = 'all' | 'transactions' | 'friends' | 'reminders';
type PendingActionKey = 'accept' | 'reject' | 'approve' | 'execute' | 'cancel';
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
  readonly primaryAction?: {
    readonly key: PendingActionKey;
    readonly label: string;
  };
  readonly secondaryAction?: {
    readonly key: 'reject' | 'cancel';
    readonly label: string;
  };
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

function notificationActorForItem(
  item: ActivityItemDto,
  people: readonly PersonCardDto[],
): NotificationActor {
  const claimantSnapshot = readObjectField(item, 'claimantSnapshot');
  const claimantName = readStringField(claimantSnapshot, 'displayName');
  const claimantAvatarPath = readNullableStringField(claimantSnapshot, 'avatarPath');
  const activatedUserDisplayName = readStringField(item, 'activatedUserDisplayName');
  const activatedUserAvatarUrl = readNullableStringField(item, 'activatedUserAvatarUrl');
  const intendedRecipientAlias = readStringField(item, 'intendedRecipientAlias');
  const label =
    item.counterpartyLabel ??
    activatedUserDisplayName ??
    claimantName ??
    intendedRecipientAlias ??
    nameFromInviteTitle(item.title) ??
    (notificationCategoryForItem(item) === 'reminders' ? 'Happy Circles' : 'Persona');
  const matchedPerson = personByLabel(people, label);

  return {
    label,
    avatarUrl:
      matchedPerson?.avatarUrl ?? activatedUserAvatarUrl ?? resolveAvatarUrl(claimantAvatarPath),
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

function readResultStatus(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const status = (value as Record<string, unknown>)['status'];
  return typeof status === 'string' ? status : null;
}

function readNestedStatus(value: unknown, key: string): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  return readResultStatus((value as Record<string, unknown>)[key]);
}

function readNestedProposalId(value: unknown, key: string): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const nested = (value as Record<string, unknown>)[key];
  if (typeof nested !== 'object' || nested === null || Array.isArray(nested)) {
    return null;
  }

  const proposalId = (nested as Record<string, unknown>)['proposalId'];
  return typeof proposalId === 'string' ? proposalId : null;
}

function actionLabel(
  itemId: string,
  busyKey: string | null,
  action: PendingActionKey,
  idleLabel: string,
  busyLabel: string,
): string {
  return busyKey === `${itemId}:${action}` ? busyLabel : idleLabel;
}

function buildPendingCardPresentation(
  item: ActivityItemDto,
  busyKey: string | null,
): PendingCardPresentation {
  if (item.kind === 'financial_request' && item.status === 'requires_you') {
    return {
      eyebrow: 'Decision inmediata',
      primaryAction: {
        key: 'accept',
        label: actionLabel(item.id, busyKey, 'accept', 'Aceptar', 'Aceptando...'),
      },
      secondaryAction: {
        key: 'reject',
        label: actionLabel(item.id, busyKey, 'reject', 'No aceptar', 'Enviando...'),
      },
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
      primaryAction: {
        key: 'approve',
        label: actionLabel(item.id, busyKey, 'approve', 'Aprobar Circle', 'Aprobando...'),
      },
      secondaryAction: {
        key: 'reject',
        label: actionLabel(item.id, busyKey, 'reject', 'No aprobar', 'Enviando...'),
      },
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
      primaryAction: {
        key: 'execute',
        label: actionLabel(item.id, busyKey, 'execute', 'Completar Circle', 'Completando...'),
      },
    };
  }

  if (item.kind === 'friendship_invite' && item.status === 'requires_you_response') {
    return {
      eyebrow: 'Nueva invitacion',
      primaryAction: {
        key: 'accept',
        label: actionLabel(item.id, busyKey, 'accept', 'Aceptar invitacion', 'Aceptando...'),
      },
      secondaryAction: {
        key: 'reject',
        label: actionLabel(item.id, busyKey, 'reject', 'Rechazar', 'Rechazando...'),
      },
    };
  }

  if (item.kind === 'friendship_invite' && item.status === 'requires_you_review') {
    return {
      eyebrow: 'Por verificar',
      primaryAction: {
        key: 'approve',
        label: actionLabel(item.id, busyKey, 'approve', 'Si es esta persona', 'Confirmando...'),
      },
      secondaryAction: {
        key: 'reject',
        label: actionLabel(item.id, busyKey, 'reject', 'No es', 'Cerrando...'),
      },
    };
  }

  if (item.kind === 'friendship_invite' && item.status === 'pending_claim') {
    return {
      eyebrow: 'Enviada afuera',
      secondaryAction: {
        key: 'cancel',
        label: actionLabel(item.id, busyKey, 'cancel', 'Cancelar', 'Cancelando...'),
      },
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
      primaryAction: {
        key: 'approve',
        label: actionLabel(item.id, busyKey, 'approve', 'Si es esta persona', 'Confirmando...'),
      },
      secondaryAction: {
        key: 'reject',
        label: actionLabel(item.id, busyKey, 'reject', 'No es', 'Cerrando...'),
      },
    };
  }

  if (item.kind === 'account_invite' && item.status === 'pending_activation') {
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
    return null;
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
  const router = useRouter();
  const params = useLocalSearchParams<{ category?: string; domain?: string }>();
  const requestedDomain = parseActivityDomainParam(params.domain);
  const requestedCategory = parseNotificationCategoryParam(params.category);
  const snapshotQuery = useAppSnapshot();
  const acceptRequest = useAcceptFinancialRequestMutation();
  const amendRequest = useAmendFinancialRequestMutation();
  const respondInternalInvite = useRespondInternalFriendshipInviteMutation();
  const rejectRequest = useRejectFinancialRequestMutation();
  const reviewAccountInvite = useReviewAccountInviteMutation();
  const reviewExternalInvite = useReviewExternalFriendshipInviteMutation();
  const cancelFriendshipInvite = useCancelFriendshipInviteMutation();
  const approveSettlement = useApproveSettlementMutation();
  const rejectSettlement = useRejectSettlementMutation();
  const executeSettlement = useExecuteSettlementMutation();

  const [message, setMessage] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [activeAmendmentItemId, setActiveAmendmentItemId] = useState<string | null>(null);
  const [amendmentAmount, setAmendmentAmount] = useState('');
  const [amendmentDescription, setAmendmentDescription] = useState('');
  const [amendmentCategory, setAmendmentCategory] = useState<UserTransactionCategory>(
    DEFAULT_TRANSACTION_CATEGORY,
  );
  const [activeCategory, setActiveCategory] = useState<NotificationCategoryKey>(
    requestedCategory ?? initialCategoryFromDomain(requestedDomain),
  );

  const sections = snapshotQuery.data?.activitySections ?? [];
  const pendingSection = useMemo(() => sections.find((item) => item.key === 'pending'), [sections]);
  const allPendingItems = pendingSection?.items ?? [];
  const people = snapshotQuery.data?.people ?? [];
  const activePendingItems = useMemo(
    () => allPendingItems.filter((item) => matchesNotificationCategory(item, activeCategory)),
    [activeCategory, allPendingItems],
  );
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
  const activeCategoryMeta =
    NOTIFICATION_CATEGORIES.find((option) => option.key === activeCategory) ??
    NOTIFICATION_CATEGORIES[0];
  const hasVisibleNotifications = activePendingItems.length > 0;

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
    if (
      activeAmendmentItemId &&
      !allPendingItems.some((item) => item.id === activeAmendmentItemId)
    ) {
      setActiveAmendmentItemId(null);
      setAmendmentAmount('');
      setAmendmentDescription('');
      setAmendmentCategory(DEFAULT_TRANSACTION_CATEGORY);
    }
  }, [activeAmendmentItemId, allPendingItems]);

  function showAutoCyclePrompt(proposalId: string | null, status: string | null) {
    if (status !== 'pending_approvals' && status !== 'approved') {
      return;
    }

    Alert.alert(
      status === 'approved' ? 'Happy Circle listo' : 'Happy Circle pendiente',
      status === 'approved'
        ? 'Todos ya aprobaron este Circle. Quieres abrirlo ahora para completarlo?'
        : 'Se detecto un Happy Circle automatico en tu circulo. Quieres revisarlo ahora?',
      [
        {
          text: 'Luego',
          style: 'cancel',
        },
        {
          text: 'Abrir',
          onPress: () => {
            openNotificationTarget({
              href: (proposalId ? `/settlements/${proposalId}` : '/activity') as RouterHref,
            });
          },
        },
      ],
    );
  }

  function closeNotifications() {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/home');
  }

  function openNotificationTarget(target: NotificationTarget) {
    if (target.homeIntent) {
      const homeIntent = target.homeIntent;
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace(target.href);
      }

      InteractionManager.runAfterInteractions(() => {
        publishHomeNavigationIntent(homeIntent);
      });
      return;
    }

    if (typeof router.dismissTo === 'function') {
      router.dismissTo(target.href);
      return;
    }

    router.replace(target.href);
  }

  function renderPendingCard(item: ActivityItemDto) {
    const category = notificationCategoryMeta(item);
    const actor = notificationActorForItem(item, people);
    const detailHref = pendingDetailHref(item, people);

    if (item.kind === 'financial_request') {
      const financialRequestContent = buildFinancialRequestPendingContent(item);
      const responseState = item.status === 'requires_you' ? 'requires_you' : 'waiting_other_side';
      const creatorLabel =
        financialRequestContent.createdByLabel === 'Tu'
          ? 'Creado por ti'
          : `Creado por ${financialRequestContent.createdByLabel}`;
      const transactionMeta = [
        creatorLabel,
        financialRequestContent.createdAtLabel
          ? `${financialRequestContent.createdAtLabel} · ${transactionCategoryLabel(item.category)}`
          : transactionCategoryLabel(item.category),
      ].filter(Boolean).join(' | ');

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
          context={financialRequestContent.detail}
          directionLabel={transactionDirectionLabel(item)}
          key={item.id}
          meta={transactionMeta}
          onPress={detailHref ? () => openNotificationTarget(detailHref) : undefined}
          pending
          statusLabel={transactionStatusLabel(item)}
          statusTone={transactionStatusTone(item)}
          unread
        >
          {responseState === 'requires_you' ? (
            <>
              <View style={styles.actionRow}>
                <View style={styles.primaryActionSlot}>
                  <PrimaryAction
                    compact
                    label={busyKey === `${item.id}:accept` ? 'Aceptando...' : 'Aceptar'}
                    loading={busyKey === `${item.id}:accept`}
                    onPress={
                      busyKey
                        ? undefined
                        : () => void handlePendingAction(item.id, item.kind, item.status, 'accept')
                    }
                  />
                </View>
              </View>
              <View style={styles.inlineActionRow}>
                <Pressable
                  onPress={
                    busyKey
                      ? undefined
                      : () => void handlePendingAction(item.id, item.kind, item.status, 'reject')
                  }
                  style={({ pressed }) => [
                    styles.inlineAction,
                    pressed ? styles.inlineActionPressed : null,
                  ]}
                >
                  <Text style={[styles.inlineActionText, styles.inlineActionDangerText]}>
                    {busyKey === `${item.id}:reject` ? 'Enviando...' : 'No aceptar'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={busyKey ? undefined : () => toggleAmendment(item)}
                  style={({ pressed }) => [
                    styles.inlineAction,
                    pressed ? styles.inlineActionPressed : null,
                  ]}
                >
                  <Text style={styles.inlineActionText}>
                    {activeAmendmentItemId === item.id ? 'Ocultar cambio' : 'Cambiar monto'}
                  </Text>
                </Pressable>
              </View>

              {activeAmendmentItemId === item.id ? (
                <View style={styles.amendmentPanel}>
                  <FieldBlock hint="Escribe el valor en pesos." label="Monto">
                    <AppTextInput
                      keyboardType="number-pad"
                      onChangeText={setAmendmentAmount}
                      placeholder="45000"
                      placeholderTextColor={theme.colors.muted}
                      value={amendmentAmount}
                    />
                    {Number.parseInt(amendmentAmount || '0', 10) > 0 ? (
                      <Text style={styles.amountPreview}>
                        {formatCop(Math.max(Number.parseInt(amendmentAmount || '0', 10) * 100, 0))}
                      </Text>
                    ) : null}
                  </FieldBlock>

                  <FieldBlock hint="Ajusta el concepto antes de enviarlo." label="Concepto">
                    <AppTextInput
                      multiline
                      onChangeText={setAmendmentDescription}
                      placeholder="Explica el nuevo monto"
                      placeholderTextColor={theme.colors.muted}
                      style={styles.textarea}
                      value={amendmentDescription}
                    />
                  </FieldBlock>

                  <FieldBlock hint="Tambien quedara guardada en el historial." label="Categoria">
                    <TransactionCategoryPicker
                      onChange={setAmendmentCategory}
                      value={amendmentCategory}
                    />
                  </FieldBlock>

                  <View style={styles.actionRow}>
                    <View style={styles.primaryActionSlot}>
                      <PrimaryAction
                        compact
                        label={
                          busyKey === `${item.id}:amendment` ? 'Enviando...' : 'Enviar nuevo monto'
                        }
                        loading={busyKey === `${item.id}:amendment`}
                        onPress={busyKey ? undefined : () => void handleAmendment(item.id)}
                      />
                    </View>
                  </View>
                </View>
              ) : null}
            </>
          ) : null}
        </TransactionEventCard>
      );
    }

    const cardPresentation = buildPendingCardPresentation(item, busyKey);
    const snippetContent = buildPendingSnippetContent(item);
    const hasInlineActions = Boolean(
      cardPresentation.primaryAction || cardPresentation.secondaryAction,
    );
    const actionContent = hasInlineActions ? (
      <View style={styles.cardActionStack}>
        {cardPresentation.primaryAction ? (
          <View style={styles.primaryActionSlot}>
            <PrimaryAction
              compact
              label={cardPresentation.primaryAction.label}
              onPress={
                busyKey
                  ? undefined
                  : () =>
                      void handlePendingAction(
                        item.id,
                        item.kind,
                        item.status,
                        cardPresentation.primaryAction!.key,
                      )
              }
            />
          </View>
        ) : null}

        {cardPresentation.secondaryAction ? (
          <Pressable
            onPress={
              busyKey
                ? undefined
                : () =>
                    void handlePendingAction(
                      item.id,
                      item.kind,
                      item.status,
                      cardPresentation.secondaryAction!.key,
                    )
            }
            style={({ pressed }) => [
              styles.inlineAction,
              pressed ? styles.inlineActionPressed : null,
            ]}
          >
            <Text style={[styles.inlineActionText, styles.inlineActionDangerText]}>
              {cardPresentation.secondaryAction.label}
            </Text>
          </Pressable>
        ) : null}
      </View>
    ) : null;

    if (notificationCategoryForItem(item) === 'transactions') {
      const transactionActorLabel =
        item.kind === 'settlement_proposal' || item.kind === 'settlement' || item.category === 'cycle'
          ? 'Happy Circle'
          : actor.label;

      return (
        <TransactionEventCard
          accentColor={transactionAccentColor(item)}
          actorAvatarUrl={item.category === 'cycle' ? null : actor.avatarUrl}
          actorFallbackColor={
            item.category === 'cycle' ? transactionToneColor(item) : avatarColorForLabel(actor.label)
          }
          actorLabel={transactionActorLabel}
          amountColor={transactionToneColor(item)}
          amountLabel={transactionAmountLabel(item)}
          amountStruckThrough={transactionAmountIsVoided(item)}
          category={transactionVisualCategory(item)}
          context={transactionContextLabel(item, transactionActorLabel)}
          directionLabel={transactionDirectionLabel(item)}
          key={item.id}
          meta={transactionMetaLabel(item)}
          onPress={detailHref ? () => openNotificationTarget(detailHref) : undefined}
          pending
          statusLabel={transactionStatusLabel(item) ?? historyStatusLabel(item.status)}
          statusTone={transactionStatusTone(item)}
          unread
        >
          {actionContent}
        </TransactionEventCard>
      );
    }

    return (
      <TransactionEventCard
        accentColor={category.color}
        actorAvatarUrl={actor.avatarUrl}
        actorFallbackColor={avatarColorForLabel(actor.label)}
        actorLabel={actor.label}
        amountColor={category.color}
        badgeBackgroundColor={category.backgroundColor}
        badgeColor={category.color}
        badgeIcon={category.icon}
        context={notificationTitleForDisplay(item.title, actor.label)}
        directionLabel={category.label}
        key={item.id}
        meta={snippetContent.detail ?? snippetContent.meta ?? cardPresentation.eyebrow}
        onPress={detailHref ? () => openNotificationTarget(detailHref) : undefined}
        pending
        statusLabel={historyStatusLabel(item.status)}
        statusTone={historyStatusTone(item.status)}
        unread
      >
        {actionContent}
      </TransactionEventCard>
    );
  }

  function toggleAmendment(item: ActivityItemDto) {
    if (activeAmendmentItemId === item.id) {
      setActiveAmendmentItemId(null);
      setAmendmentCategory(DEFAULT_TRANSACTION_CATEGORY);
      return;
    }

    const financialRequestContent = buildFinancialRequestPendingContent(item);
    const category = isUserTransactionCategory(item.category)
      ? item.category
      : DEFAULT_TRANSACTION_CATEGORY;
    setActiveAmendmentItemId(item.id);
    setAmendmentAmount(String(Math.max(1, Math.round((item.amountMinor ?? 0) / 100))));
    setAmendmentDescription(financialRequestContent.detail);
    setAmendmentCategory(category);
  }

  async function handleAmendment(requestId: string) {
    const amountMinor = Math.max(Number.parseInt(amendmentAmount || '0', 10) * 100, 0);
    const trimmedDescription = amendmentDescription.trim();

    if (amountMinor <= 0 || trimmedDescription.length === 0) {
      setMessage('Define un monto valido y escribe un concepto para proponer otro monto.');
      return;
    }

    setBusyKey(`${requestId}:amendment`);
    setMessage(null);

    try {
      await amendRequest.mutateAsync({
        requestId,
        amountMinor,
        description: trimmedDescription,
        category: amendmentCategory,
      });
      setActiveAmendmentItemId(null);
      setAmendmentAmount('');
      setAmendmentDescription('');
      setAmendmentCategory(DEFAULT_TRANSACTION_CATEGORY);
      setMessage('Nuevo monto enviado.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo enviar el nuevo monto.');
    } finally {
      setBusyKey(null);
    }
  }

  async function handlePendingAction(
    itemId: string,
    kind: string,
    status: string,
    action: PendingActionKey,
  ) {
    const key = `${itemId}:${action}`;
    setBusyKey(key);
    setMessage(null);

    try {
      if (kind === 'financial_request') {
        if (action === 'accept') {
          const response = await acceptRequest.mutateAsync(itemId);
          const autoCycleStatus = readNestedStatus(response, 'autoCycleProposal');
          const autoCycleProposalId = readNestedProposalId(response, 'autoCycleProposal');
          setMessage(
            autoCycleStatus === 'pending_approvals'
              ? 'Propuesta aceptada. Tambien quedo un Happy Circle listo para revisar.'
              : 'Propuesta aceptada.',
          );
          showAutoCyclePrompt(autoCycleProposalId, autoCycleStatus);
        } else {
          await rejectRequest.mutateAsync(itemId);
          setMessage('Propuesta no aceptada.');
        }
        return;
      }

      if (kind === 'settlement_proposal' && status === 'pending_approvals') {
        if (action === 'approve') {
          const response = await approveSettlement.mutateAsync(itemId);
          const nextStatus = readResultStatus(response);
          setMessage(
            nextStatus === 'approved'
              ? 'Todos aceptaron. El Happy Circle quedo listo.'
              : nextStatus === 'stale'
                ? 'Este Circle fue reemplazado porque el grafo cambio.'
                : 'Tu aprobacion quedo registrada.',
          );
        } else {
          await rejectSettlement.mutateAsync(itemId);
          setMessage('Happy Circle no aprobado.');
        }
        return;
      }

      if (kind === 'settlement_proposal' && status === 'approved' && action === 'execute') {
        const response = await executeSettlement.mutateAsync(itemId);
        const nextStatus = readNestedStatus(response, 'nextAutoCycleProposal');
        const nextProposalId = readNestedProposalId(response, 'nextAutoCycleProposal');
        setMessage(
          nextStatus === 'pending_approvals'
            ? 'Happy Circle completado. Ya quedo otro Circle pendiente.'
            : 'Happy Circle completado.',
        );
        showAutoCyclePrompt(nextProposalId, nextStatus);
        return;
      }

      if (kind === 'friendship_invite' && status === 'requires_you_response') {
        if (action === 'accept') {
          await respondInternalInvite.mutateAsync({
            inviteId: itemId,
            decision: 'accept',
          });
          setMessage('Invitacion aceptada.');
        } else {
          await respondInternalInvite.mutateAsync({
            inviteId: itemId,
            decision: 'reject',
          });
          setMessage('Invitacion rechazada.');
        }
        return;
      }

      if (kind === 'friendship_invite' && status === 'requires_you_review') {
        if (action === 'approve') {
          await reviewExternalInvite.mutateAsync({
            inviteId: itemId,
            decision: 'approve',
          });
          setMessage('Conexion confirmada.');
        } else {
          await reviewExternalInvite.mutateAsync({
            inviteId: itemId,
            decision: 'reject',
          });
          setMessage('Invitacion cerrada.');
        }
        return;
      }

      if (kind === 'friendship_invite' && status === 'pending_claim' && action === 'cancel') {
        await cancelFriendshipInvite.mutateAsync(itemId);
        setMessage('Invitacion cancelada.');
        return;
      }

      if (kind === 'account_invite' && status === 'requires_you_review') {
        await reviewAccountInvite.mutateAsync({
          inviteId: itemId,
          decision: action === 'approve' ? 'approve' : 'reject',
        });
        setMessage(action === 'approve' ? 'Acceso confirmado.' : 'Invitacion de acceso cerrada.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo completar la accion.');
    } finally {
      setBusyKey(null);
    }
  }

  if (snapshotQuery.isLoading) {
    return (
      <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
        <View style={styles.loadingState}>
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
          >
            {NOTIFICATION_CATEGORIES.map((category) => (
              <NotificationCategoryTab
                count={categoryCounts[category.key]}
                key={category.key}
                meta={category}
                onPress={() => setActiveCategory(category.key)}
                selected={activeCategory === category.key}
              />
            ))}
          </ScrollView>

          {message ? <MessageBanner message={message} /> : null}

          <View style={styles.sheetScrollWrap}>
            <ScrollView
              contentContainerStyle={styles.sheetScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {!hasVisibleNotifications ? (
                <EmptyState
                  description={
                    activeCategory === 'all'
                      ? 'Cuando haya algo por responder o revisar, aparecera aqui.'
                      : `Cuando haya actividad de ${activeCategoryMeta.label.toLocaleLowerCase(
                          'es-CO',
                        )}, aparecera aqui.`
                  }
                  title={
                    activeCategory === 'all'
                      ? 'Sin notificaciones'
                      : `Sin ${activeCategoryMeta.label.toLocaleLowerCase('es-CO')}`
                  }
                />
              ) : (
                <>
                  {activePendingItems.length > 0 ? (
                    <NotificationSection title="No leidas">
                      {activePendingItems.map((item) => renderPendingCard(item))}
                    </NotificationSection>
                  ) : null}
                </>
              )}
            </ScrollView>
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
    gap: theme.spacing.md,
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
    flexShrink: 1,
    gap: theme.spacing.md,
  },
  notificationTabs: {
    alignItems: 'stretch',
    borderBottomColor: theme.colors.hairline,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: theme.spacing.md,
    flexDirection: 'row',
    minWidth: '100%',
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
    flexShrink: 1,
  },
  sheetScrollContent: {
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.xs,
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
  loadingState: {
    alignSelf: 'center',
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radius.large,
    borderTopRightRadius: theme.radius.large,
    padding: theme.spacing.lg,
    width: '100%',
  },
  cardActionStack: {
    gap: theme.spacing.xs,
  },
  actionRow: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  primaryActionSlot: {
    width: '100%',
  },
  inlineActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  inlineAction: {
    paddingVertical: 4,
  },
  inlineActionPressed: {
    opacity: 0.62,
  },
  inlineActionText: {
    color: theme.colors.primary,
    fontSize: theme.typography.footnote,
    fontWeight: '700',
  },
  inlineActionDanger: {
    backgroundColor: 'transparent',
  },
  inlineActionDangerText: {
    color: theme.colors.danger,
  },
  amendmentPanel: {
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radius.medium,
    gap: theme.spacing.md,
    marginTop: theme.spacing.xs,
    padding: theme.spacing.md,
  },
  textarea: {
    minHeight: 96,
    paddingTop: theme.spacing.sm,
    textAlignVertical: 'top',
  },
  amountPreview: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    fontWeight: '700',
  },
});
