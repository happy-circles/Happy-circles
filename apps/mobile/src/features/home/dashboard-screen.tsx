import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'expo-router';
import type { Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppAvatar } from '@/components/app-avatar';
import { BalanceSummaryCard } from '@/components/balance-summary-card';
import { HeaderBrandTitle } from '@/components/header-brand-title';
import { MessageBanner } from '@/components/message-banner';
import { NotificationBellButton } from '@/components/notification-bell-button';
import { HappyCircleCard } from '@/components/happy-circle-card';
import { ScreenShell } from '@/components/screen-shell';
import { SectionBlock } from '@/components/section-block';
import { SetupPromptCard } from '@/components/setup-prompt-card';
import { TransactionEventCard } from '@/components/transaction-event-card';
import { AddPersonContactsSheet } from '@/features/home/add-person-contacts-sheet';
import { resolveAvatarUrl } from '@/lib/avatar';
import { useHomeNavigationIntent } from '@/lib/home-navigation-intent';
import {
  type AccountInviteListItem,
  type FriendshipInviteListItem,
  useAppSnapshot,
  useCancelFriendshipInviteMutation,
  useRespondInternalFriendshipInviteMutation,
  useReviewAccountInviteMutation,
  useReviewExternalFriendshipInviteMutation,
} from '@/lib/live-data';
import { cancelScheduledReminders, scheduleDailyPendingReminder } from '@/lib/notifications';
import {
  getSeenPendingTransactionIds,
  markPendingTransactionIdsSeen,
} from '@/lib/pending-transaction-views';
import { dismissSetupPrompt, getSetupPromptDismissed } from '@/lib/setup-reminder';
import { transactionCategoryLabel } from '@/lib/transaction-categories';
import { theme } from '@/lib/theme';
import { useSnapshotRefresh } from '@/lib/use-snapshot-refresh';
import {
  isConsolidatedTransactionItem,
  isPendingTransactionItem,
  transactionAccentColor,
  transactionAmountIsVoided,
  transactionAmountLabel,
  transactionDirectionLabel,
  transactionFocusId,
  transactionStatusLabel,
  transactionStatusTone,
  transactionToneColor,
  transactionVisualCategory,
} from '@/lib/transaction-presentation';
import { useSession } from '@/providers/session-provider';
import type { ActivityItemDto, PersonCardDto } from '@happy-circles/application';

const AVATAR_COLORS = ['#c026d3', '#047857', '#2563eb', '#334155', '#dc2626', '#7c3aed'];
const RECENT_TRANSACTION_LIMIT = 8;
type InviteRequestsTab = 'received' | 'sent' | 'history';
type InviteRequestAction = 'accept' | 'reject' | 'approve' | 'cancel';
type InviteRequestItem = FriendshipInviteListItem | AccountInviteListItem;
type TransactionTargetPanel = 'pending' | 'history';

function initialsBackgroundColor(person: PersonCardDto): string {
  const source = `${person.userId}:${person.displayName}`;
  let hash = 0;

  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) >>> 0;
  }

  return AVATAR_COLORS[hash % AVATAR_COLORS.length] ?? theme.colors.primary;
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

function formatRelativeLabel(value: string): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return 'recientemente';
  }

  const diffMs = Date.now() - timestamp;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) {
    return 'hace un momento';
  }

  if (diffMs < hour) {
    return `hace ${Math.max(1, Math.round(diffMs / minute))} min`;
  }

  if (diffMs < day) {
    return `hace ${Math.max(1, Math.round(diffMs / hour))} h`;
  }

  if (diffMs < 7 * day) {
    return `hace ${Math.max(1, Math.round(diffMs / day))} d`;
  }

  return new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'short',
  }).format(new Date(timestamp));
}

function splitSubtitle(value: string): string[] {
  return value
    .split('|')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function homeTransactionMeta(item: ActivityItemDto, actorLabel: string): string {
  const subtitleParts = splitSubtitle(item.subtitle);
  const creatorLabel =
    item.kind === 'financial_request'
      ? (subtitleParts[0] ?? 'Persona')
      : item.category === 'cycle' ||
          item.kind === 'settlement' ||
          item.kind === 'settlement_proposal'
        ? 'Happy Circle'
        : firstName(actorLabel);
  const timeLabel = item.happenedAtLabel ?? subtitleParts[subtitleParts.length - 1] ?? 'Reciente';
  const createdByText = creatorLabel === 'Tu' ? 'Creado por ti' : `Creado por ${creatorLabel}`;

  return `${createdByText} · ${timeLabel} | ${transactionCategoryLabel(
    transactionVisualCategory(item),
  )}`;
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

function transactionPersonForItem(
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

function transactionPersonHref(
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

function sortInviteRequestItems(items: readonly InviteRequestItem[]): InviteRequestItem[] {
  return [...items].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
}

function inviteHistoryTimestamp(item: InviteRequestItem): string {
  if (typeof item.happenedAt === 'string' && item.happenedAt.length > 0) {
    return item.happenedAt;
  }

  if (item.kind === 'friendship_invite' && item.resolvedAt) {
    return item.resolvedAt;
  }

  if (item.kind === 'account_invite') {
    return item.resolvedAt ?? item.activatedAt ?? item.createdAt;
  }

  return item.createdAt;
}

function sortInviteHistoryItems(items: readonly InviteRequestItem[]): InviteRequestItem[] {
  return [...items].sort(
    (left, right) =>
      Date.parse(inviteHistoryTimestamp(right)) - Date.parse(inviteHistoryTimestamp(left)),
  );
}

function isReceivedInvite(item: InviteRequestItem): boolean {
  return (
    item.actionState === 'requires_you_response' ||
    item.actionState === 'requires_you_review' ||
    item.actionState === 'waiting_sender_review'
  );
}

function isSentInvite(item: InviteRequestItem): boolean {
  return (
    item.actionState === 'pending_claim' ||
    item.actionState === 'pending_activation' ||
    item.actionState === 'waiting_other_side' ||
    (item.kind === 'friendship_invite' &&
      item.actionState === 'waiting_sender_review' &&
      item.actorRole === 'sender')
  );
}

function displayNameForInvite(item: InviteRequestItem): string {
  if (item.kind === 'account_invite') {
    if (item.actorRole === 'activated' && item.counterpartyLabel) {
      return item.counterpartyLabel;
    }

    return (
      item.activatedUserDisplayName ??
      item.intendedRecipientAlias ??
      item.counterpartyLabel ??
      item.title
    );
  }

  const patterns = [
    /^(.+) quiere conectar contigo$/i,
    /^Esperando a (.+)$/i,
    /^Verifica a (.+)$/i,
    /^Invitacion lista para (.+)$/i,
    /^QR temporal para (.+)$/i,
    /^Esperando validacion de (.+)$/i,
  ];

  for (const pattern of patterns) {
    const match = item.title.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  if (item.claimantSnapshot?.displayName) {
    return item.claimantSnapshot.displayName;
  }

  if (item.intendedRecipientAlias) {
    return item.intendedRecipientAlias;
  }

  return item.title;
}

function statusLabelForInvite(item: InviteRequestItem): string {
  if (item.actionState === 'history') {
    if (item.status === 'accepted') {
      return 'Aceptada';
    }

    if (item.status === 'rejected') {
      return 'Rechazada';
    }

    if (item.status === 'expired') {
      return 'Expirada';
    }

    if (item.status === 'canceled') {
      return 'Cancelada';
    }

    return 'Historico';
  }

  if (item.actionState === 'requires_you_response') {
    return 'Por responder';
  }

  if (item.actionState === 'requires_you_review') {
    return 'Por verificar';
  }

  if (item.actionState === 'pending_claim') {
    return 'Pendiente de abrir';
  }

  if (item.actionState === 'pending_activation') {
    return 'Pendiente de activar';
  }

  if (item.actionState === 'waiting_sender_review') {
    return 'Esperando validacion';
  }

  if (item.actionState === 'waiting_other_side') {
    return 'Esperando respuesta';
  }

  return 'En seguimiento';
}

function inviteStatusTone(item: InviteRequestItem): 'primary' | 'warning' | 'neutral' {
  if (item.actionState === 'history') {
    if (item.status === 'accepted') {
      return 'primary';
    }

    if (item.status === 'rejected' || item.status === 'expired' || item.status === 'canceled') {
      return 'neutral';
    }

    return 'neutral';
  }

  if (item.actionState === 'requires_you_response' || item.actionState === 'requires_you_review') {
    return 'warning';
  }

  if (item.actionState === 'waiting_other_side' || item.actionState === 'waiting_sender_review') {
    return 'primary';
  }

  return 'neutral';
}

function inviteContextForDisplay(item: InviteRequestItem, displayName: string): string {
  const trimmedTitle = item.title.trim();
  const trimmedName = displayName.trim();

  if (
    trimmedName &&
    trimmedTitle.toLocaleLowerCase('es-CO').startsWith(trimmedName.toLocaleLowerCase('es-CO'))
  ) {
    const withoutName = trimmedTitle.slice(trimmedName.length).trim();
    if (withoutName) {
      return `${withoutName.charAt(0).toLocaleUpperCase('es-CO')}${withoutName.slice(1)}`;
    }
  }

  if (
    trimmedName &&
    trimmedTitle.toLocaleLowerCase('es-CO').endsWith(trimmedName.toLocaleLowerCase('es-CO'))
  ) {
    return statusLabelForInvite(item);
  }

  return trimmedTitle || statusLabelForInvite(item);
}

function ShortcutTile({
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
  const content = (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.peopleTile, pressed ? styles.quickActionPressed : null]}
    >
      <View style={[styles.shortcutCircle, dashed ? styles.shortcutCircleDashed : null]}>
        <Ionicons color={theme.colors.textMuted} name={icon} size={20} />
        {typeof badgeCount === 'number' && badgeCount > 0 ? (
          <View style={styles.requestBadge}>
            <Text style={styles.requestBadgeText}>{badgeLabel(badgeCount)}</Text>
          </View>
        ) : null}
      </View>
      <Text numberOfLines={1} style={styles.peopleTileLabel}>
        {label}
      </Text>
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

function PersonTile({ person }: { readonly person: PersonCardDto }) {
  return (
    <Link href={`/person/${person.userId}` as Href} asChild>
      <Pressable
        style={({ pressed }) => [styles.peopleTile, pressed ? styles.quickActionPressed : null]}
      >
        <View style={[styles.personAvatarRing, { borderColor: personDebtBorderColor(person) }]}>
          <AppAvatar
            fallbackBackgroundColor={initialsBackgroundColor(person)}
            fallbackTextColor={theme.colors.white}
            imageUrl={person.avatarUrl ?? null}
            label={person.displayName}
            size={48}
          />
        </View>
        <Text numberOfLines={1} style={styles.peopleTileLabel}>
          {firstName(person.displayName)}
        </Text>
      </Pressable>
    </Link>
  );
}

function TransactionPreviewCard({
  highlightPending = false,
  isPending = false,
  item,
  people,
  unread = false,
}: {
  readonly highlightPending?: boolean;
  readonly isPending?: boolean;
  readonly item: ActivityItemDto;
  readonly people: readonly PersonCardDto[];
  readonly unread?: boolean;
}) {
  const name =
    item.category === 'cycle' || item.kind === 'settlement' || item.kind === 'settlement_proposal'
      ? 'Happy Circle'
      : (item.counterpartyLabel ?? 'Persona');
  const context = '';
  const meta = homeTransactionMeta(item, name);
  const person = transactionPersonForItem(people, item);
  const targetPanel: TransactionTargetPanel = isPending ? 'pending' : 'history';
  const href = transactionPersonHref(person, item, targetPanel);
  const recentStatusLabel = !isPending && item.status === 'rejected' ? transactionStatusLabel(item) : null;
  const fallbackPerson: PersonCardDto = {
    userId: person?.userId ?? item.id,
    displayName: name,
    avatarUrl: null,
    direction: 'settled',
    lastActivityLabel: '',
    netAmountMinor: 0,
    pendingCount: 0,
  };

  return (
    <TransactionEventCard
      accentColor={transactionAccentColor(item)}
      actorAvatarUrl={person?.avatarUrl ?? null}
      actorFallbackColor={initialsBackgroundColor(fallbackPerson)}
      actorLabel={name}
      amountColor={transactionToneColor(item)}
      amountLabel={transactionAmountLabel(item)}
      amountStruckThrough={transactionAmountIsVoided(item)}
      category={transactionVisualCategory(item)}
      categoryPlacement="meta"
      compact
      compactMetaLayout={isPending ? 'inline' : 'stacked'}
      context={context}
      contextVariant={isPending ? 'badge' : 'text'}
      directionLayout={isPending ? 'floating' : 'stacked'}
      directionLabel={isPending ? transactionDirectionLabel(item) : null}
      href={href}
      meta={meta}
      pending={highlightPending}
      pendingHighlightColor={highlightPending ? transactionAccentColor(item) : undefined}
      statusLabel={isPending ? null : recentStatusLabel}
      statusTone={transactionStatusTone(item)}
      unread={unread}
    />
  );
}

function InviteRequestTabButton({
  count,
  label,
  selected,
  onPress,
}: {
  readonly count: number;
  readonly label: string;
  readonly selected: boolean;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.sheetTab,
        selected ? styles.sheetTabActive : null,
        pressed ? styles.quickActionPressed : null,
      ]}
    >
      <Text style={[styles.sheetTabText, selected ? styles.sheetTabTextActive : null]}>
        {label}
      </Text>
      {count > 0 ? (
        <View style={styles.sheetTabBadge}>
          <Text style={styles.sheetTabBadgeText}>{badgeLabel(count)}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function InviteRequestRow({
  item,
  busyKey,
  onAction,
}: {
  readonly item: InviteRequestItem;
  readonly busyKey: string | null;
  readonly onAction: (item: InviteRequestItem, action: InviteRequestAction) => void;
}) {
  const displayName = displayNameForInvite(item);
  const subtitleParts = splitSubtitle(item.subtitle);
  const subtitle = subtitleParts[1] ?? subtitleParts[0] ?? statusLabelForInvite(item);
  const meta = [formatRelativeLabel(inviteHistoryTimestamp(item)), subtitleParts[0] ?? null]
    .filter(Boolean)
    .join(' | ');
  const busyPrefix = `${item.kind}:${item.inviteId}:`;
  const isBusy = Boolean(busyKey?.startsWith(busyPrefix));
  const avatarUrl =
    item.kind === 'friendship_invite'
      ? resolveAvatarUrl(item.claimantSnapshot?.avatarPath ?? null)
      : item.activatedUserAvatarUrl;
  const fallbackPerson: PersonCardDto = {
    userId: item.inviteId,
    displayName,
    avatarUrl: null,
    direction: 'settled',
    lastActivityLabel: '',
    netAmountMinor: 0,
    pendingCount: 0,
  };

  const actionContent = (
    item.actionState === 'requires_you_response' ? (
      <View style={styles.requestActions}>
        <>
          <Pressable
            disabled={isBusy}
            onPress={() => onAction(item, 'accept')}
            style={({ pressed }) => [
              styles.requestIconButton,
              styles.requestAcceptButton,
              pressed ? styles.quickActionPressed : null,
              isBusy ? styles.actionDisabled : null,
            ]}
          >
            <Ionicons color={theme.colors.white} name="checkmark" size={18} />
          </Pressable>
          <Pressable
            disabled={isBusy}
            onPress={() => onAction(item, 'reject')}
            style={({ pressed }) => [
              styles.requestIconButton,
              styles.requestRejectButton,
              pressed ? styles.quickActionPressed : null,
              isBusy ? styles.actionDisabled : null,
            ]}
          >
            <Ionicons color={theme.colors.white} name="close" size={18} />
          </Pressable>
        </>
      </View>
    ) : item.actionState === 'requires_you_review' ? (
      <View style={styles.requestActions}>
        <>
          <Pressable
            disabled={isBusy}
            onPress={() => onAction(item, 'approve')}
            style={({ pressed }) => [
              styles.requestIconButton,
              styles.requestAcceptButton,
              pressed ? styles.quickActionPressed : null,
              isBusy ? styles.actionDisabled : null,
            ]}
          >
            <Ionicons color={theme.colors.white} name="checkmark" size={18} />
          </Pressable>
          <Pressable
            disabled={isBusy}
            onPress={() => onAction(item, 'reject')}
            style={({ pressed }) => [
              styles.requestIconButton,
              styles.requestRejectButton,
              pressed ? styles.quickActionPressed : null,
              isBusy ? styles.actionDisabled : null,
            ]}
          >
            <Ionicons color={theme.colors.white} name="close" size={18} />
          </Pressable>
        </>
      </View>
    ) : item.kind === 'friendship_invite' && item.actionState === 'pending_claim' ? (
      <View style={styles.requestActions}>
        <Pressable
          disabled={isBusy}
          onPress={() => onAction(item, 'cancel')}
          style={({ pressed }) => [
            styles.sentCancelButton,
            pressed ? styles.quickActionPressed : null,
            isBusy ? styles.actionDisabled : null,
          ]}
        >
          <Text style={styles.sentCancelText}>Cancelar</Text>
        </Pressable>
      </View>
    ) : null
  );

  return (
    <TransactionEventCard
      accentColor={theme.colors.primary}
      actorAvatarUrl={avatarUrl}
      actorFallbackColor={initialsBackgroundColor(fallbackPerson)}
      actorLabel={displayName}
      amountColor={theme.colors.primary}
      badgeBackgroundColor={theme.colors.primarySoft}
      badgeColor={theme.colors.primary}
      badgeIcon={item.kind === 'account_invite' ? 'key-outline' : 'person-add-outline'}
      categoryPlacement="meta"
      compact
      compactMetaLayout="stacked"
      context={inviteContextForDisplay(item, displayName)}
      directionLabel="Solicitud"
      meta={meta || subtitle}
      statusLabel={statusLabelForInvite(item)}
      statusTone={inviteStatusTone(item)}
    >
      {actionContent}
    </TransactionEventCard>
  );
}

function InviteRequestsSheet({
  activeTab,
  busyKey,
  historyItems,
  message,
  onAction,
  onChangeTab,
  onClose,
  receivedItems,
  sentItems,
  visible,
}: {
  readonly activeTab: InviteRequestsTab;
  readonly busyKey: string | null;
  readonly historyItems: readonly InviteRequestItem[];
  readonly message: string | null;
  readonly onAction: (item: InviteRequestItem, action: InviteRequestAction) => void;
  readonly onChangeTab: (tab: InviteRequestsTab) => void;
  readonly onClose: () => void;
  readonly receivedItems: readonly InviteRequestItem[];
  readonly sentItems: readonly InviteRequestItem[];
  readonly visible: boolean;
}) {
  const items =
    activeTab === 'received'
      ? receivedItems
      : activeTab === 'sent'
        ? sentItems
        : historyItems;

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.sheetScrim}>
        <Pressable onPress={onClose} style={styles.sheetBackdrop} />
        <View style={styles.friendshipSheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Solicitudes</Text>
            <Pressable onPress={onClose} style={styles.sheetCloseButton}>
              <Ionicons color={theme.colors.text} name="close" size={22} />
            </Pressable>
          </View>
          <View style={styles.sheetTabs}>
            <InviteRequestTabButton
              count={receivedItems.length}
              label="Recibidas"
              onPress={() => onChangeTab('received')}
              selected={activeTab === 'received'}
            />
            <InviteRequestTabButton
              count={sentItems.length}
              label="Enviadas"
              onPress={() => onChangeTab('sent')}
              selected={activeTab === 'sent'}
            />
            <InviteRequestTabButton
              count={historyItems.length}
              label="Historico"
              onPress={() => onChangeTab('history')}
              selected={activeTab === 'history'}
            />
          </View>
          {message ? <MessageBanner message={message} tone="neutral" /> : null}
          <ScrollView
            contentContainerStyle={styles.requestList}
            showsVerticalScrollIndicator={false}
          >
            {items.length === 0 ? (
              <View style={styles.sheetEmpty}>
                <Text style={styles.sheetEmptyTitle}>
                  {activeTab === 'received'
                    ? 'Sin solicitudes recibidas'
                    : activeTab === 'sent'
                      ? 'Sin solicitudes enviadas'
                      : 'Sin historial'}
                </Text>
                <Text style={styles.sheetEmptyText}>
                  {activeTab === 'received'
                    ? 'Cuando alguien quiera conectar contigo, aparecera aqui.'
                    : activeTab === 'history'
                      ? 'Las solicitudes resueltas y vencidas apareceran aqui.'
                    : 'Las invitaciones que envies quedaran en esta pestaña.'}
                </Text>
              </View>
            ) : (
              items.map((item) => (
                <InviteRequestRow
                  busyKey={busyKey}
                  item={item}
                  key={`${item.kind}:${item.inviteId}`}
                  onAction={onAction}
                />
              ))
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export function DashboardScreen() {
  const session = useSession();
  const snapshotQuery = useAppSnapshot();
  const refresh = useSnapshotRefresh(snapshotQuery);
  const homeIntent = useHomeNavigationIntent();
  const respondInternalInvite = useRespondInternalFriendshipInviteMutation();
  const reviewExternalInvite = useReviewExternalFriendshipInviteMutation();
  const reviewAccountInvite = useReviewAccountInviteMutation();
  const cancelFriendshipInvite = useCancelFriendshipInviteMutation();
  const handledHomeIntentIdRef = useRef<number | null>(null);
  const dashboard = snapshotQuery.data?.dashboard;
  const currentUserProfile = snapshotQuery.data?.currentUserProfile ?? null;
  const [nativeSetupMessage, setNativeSetupMessage] = useState<string | null>(null);
  const [busyNativeSetup, setBusyNativeSetup] = useState<'contacts' | 'notifications' | null>(null);
  const [inviteSheetVisible, setInviteSheetVisible] = useState(false);
  const [addPersonSheetVisible, setAddPersonSheetVisible] = useState(false);
  const [inviteTab, setInviteTab] = useState<InviteRequestsTab>('received');
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);
  const [busyInviteKey, setBusyInviteKey] = useState<string | null>(null);
  const [setupPromptDismissed, setSetupPromptDismissed] = useState<boolean | null>(null);
  const [seenPendingTransactionIds, setSeenPendingTransactionIds] =
    useState<ReadonlySet<string> | null>(null);
  const friendshipPendingItems = snapshotQuery.data?.friendshipPendingItems ?? [];
  const friendshipHistoryItems = snapshotQuery.data?.friendshipHistoryItems ?? [];
  const accountInvitePendingItems = snapshotQuery.data?.accountInvitePendingItems ?? [];
  const accountInviteHistoryItems = snapshotQuery.data?.accountInviteHistoryItems ?? [];
  const invitePendingItems = sortInviteRequestItems([
    ...friendshipPendingItems,
    ...accountInvitePendingItems,
  ]);
  const inviteHistoryItems = useMemo(
    () => sortInviteHistoryItems([...friendshipHistoryItems, ...accountInviteHistoryItems]),
    [accountInviteHistoryItems, friendshipHistoryItems],
  );
  const receivedInviteItems = invitePendingItems.filter(isReceivedInvite);
  const sentInviteItems = invitePendingItems.filter(isSentInvite);
  const inviteRequestCount = receivedInviteItems.length + sentInviteItems.length;
  const pendingSection = snapshotQuery.data?.activitySections.find(
    (section) => section.key === 'pending',
  );
  const historySection = snapshotQuery.data?.activitySections.find(
    (section) => section.key === 'history',
  );
  const activeSettlementProposal =
    snapshotQuery.data?.balanceOverview.resolution.activeProposal ?? null;
  const pendingTransactionItems = (pendingSection?.items ?? [])
    .filter(isPendingTransactionItem)
    .slice(0, 2);
  const recentTransactionItems = (historySection?.items ?? [])
    .filter(isConsolidatedTransactionItem)
    .slice(0, RECENT_TRANSACTION_LIMIT);
  const transactionPreviewItems = [
    ...pendingTransactionItems.map((item) => ({
      highlightPending: Boolean(
        seenPendingTransactionIds && !seenPendingTransactionIds.has(item.id),
      ),
      isPending: true,
      item,
      unread: true,
    })),
    ...recentTransactionItems.map((item) => ({
      highlightPending: false,
      isPending: false,
      item,
      unread: false,
    })),
  ];
  const needsContacts = session.setupState.contactsPermissionStatus !== 'granted';
  const needsNotifications = !session.notificationsEnabled;
  const showNativeSetup = (needsContacts || needsNotifications) && setupPromptDismissed === false;

  useEffect(() => {
    if (!homeIntent || homeIntent.kind !== 'open_invite_requests') {
      return;
    }

    if (!dashboard || handledHomeIntentIdRef.current === homeIntent.id) {
      return;
    }

    handledHomeIntentIdRef.current = homeIntent.id;
    setInviteMessage(null);
    setInviteTab(homeIntent.tab);
    setInviteSheetVisible(true);
  }, [dashboard, homeIntent]);

  useEffect(() => {
    let isMounted = true;

    setSetupPromptDismissed(null);
    void getSetupPromptDismissed(session.userId).then((dismissed) => {
      if (isMounted) {
        setSetupPromptDismissed(dismissed);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [session.userId]);

  useEffect(() => {
    let isMounted = true;

    setSeenPendingTransactionIds(null);
    void getSeenPendingTransactionIds(session.userId).then((nextIds) => {
      if (isMounted) {
        setSeenPendingTransactionIds(nextIds);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [session.userId]);

  useEffect(() => {
    if (!seenPendingTransactionIds) {
      return;
    }

    const nextSeenIds = pendingTransactionItems
      .map((item) => item.id)
      .filter((itemId) => !seenPendingTransactionIds.has(itemId));

    if (nextSeenIds.length === 0) {
      return;
    }

    void markPendingTransactionIdsSeen(session.userId, nextSeenIds);
  }, [pendingTransactionItems, seenPendingTransactionIds, session.userId]);

  async function handleContactsPermission() {
    setBusyNativeSetup('contacts');
    setNativeSetupMessage(null);

    try {
      const result = await session.requestContactsPermission();
      setNativeSetupMessage(result);
    } finally {
      setBusyNativeSetup(null);
    }
  }

  async function handleNotificationsPermission() {
    setBusyNativeSetup('notifications');
    setNativeSetupMessage(null);

    try {
      const result = await session.requestNotificationsPermission();
      if (result === 'Recordatorios activados.') {
        await cancelScheduledReminders();
        if ((snapshotQuery.data?.pendingCount ?? 0) > 0) {
          await scheduleDailyPendingReminder();
        }
      }
      setNativeSetupMessage(result);
    } finally {
      setBusyNativeSetup(null);
    }
  }

  async function handleDismissNativeSetup() {
    setSetupPromptDismissed(true);
    setNativeSetupMessage(null);
    await dismissSetupPrompt(session.userId);
  }

  function openInviteRequests() {
    setInviteMessage(null);
    setInviteTab(
      receivedInviteItems.length > 0
        ? 'received'
        : sentInviteItems.length > 0
          ? 'sent'
          : 'history',
    );
    setInviteSheetVisible(true);
  }

  function closeInviteRequests() {
    setInviteSheetVisible(false);
  }

  async function handleInviteRequestAction(item: InviteRequestItem, action: InviteRequestAction) {
    const key = `${item.kind}:${item.inviteId}:${action}`;
    setBusyInviteKey(key);
    setInviteMessage(null);

    try {
      if (item.kind === 'friendship_invite' && item.actionState === 'requires_you_response') {
        await respondInternalInvite.mutateAsync({
          inviteId: item.inviteId,
          decision: action === 'accept' ? 'accept' : 'reject',
        });
        setInviteMessage(action === 'accept' ? 'Invitacion aceptada.' : 'Invitacion rechazada.');
        return;
      }

      if (item.kind === 'friendship_invite' && item.actionState === 'requires_you_review') {
        await reviewExternalInvite.mutateAsync({
          inviteId: item.inviteId,
          decision: action === 'approve' ? 'approve' : 'reject',
        });
        setInviteMessage(action === 'approve' ? 'Conexion confirmada.' : 'Invitacion cerrada.');
        return;
      }

      if (item.kind === 'account_invite' && item.actionState === 'requires_you_review') {
        await reviewAccountInvite.mutateAsync({
          inviteId: item.inviteId,
          decision: action === 'approve' ? 'approve' : 'reject',
        });
        setInviteMessage(
          action === 'approve' ? 'Acceso confirmado.' : 'Invitacion de acceso cerrada.',
        );
        return;
      }

      if (
        item.kind === 'friendship_invite' &&
        item.actionState === 'pending_claim' &&
        action === 'cancel'
      ) {
        await cancelFriendshipInvite.mutateAsync(item.inviteId);
        setInviteMessage('Invitacion cancelada.');
      }
    } catch (error) {
      setInviteMessage(error instanceof Error ? error.message : 'No se pudo completar la accion.');
    } finally {
      setBusyInviteKey(null);
    }
  }

  if (snapshotQuery.isLoading || !dashboard) {
    return (
      <ScreenShell
        headerTitle={<HeaderBrandTitle logoSize={68} titleSize={30} />}
        headerVariant="plain"
        title="Happy Circles"
        titleAlign="center"
      >
        <View style={styles.homeLoadingStack}>
          <View style={styles.homeLoadingHero}>
            <View style={styles.homeLoadingTitleLine} />
            <View style={styles.homeLoadingBodyLine} />
          </View>
          <View style={styles.homeLoadingGrid}>
            <View style={styles.homeLoadingTile} />
            <View style={styles.homeLoadingTile} />
            <View style={styles.homeLoadingTile} />
          </View>
          <View style={styles.homeLoadingList}>
            <View style={styles.homeLoadingListLine} />
            <View style={styles.homeLoadingListLine} />
            <View style={styles.homeLoadingListLineShort} />
          </View>
        </View>
        <Text style={styles.supportText}>
          Estamos sincronizando el panorama general de tu cuenta.
        </Text>
      </ScreenShell>
    );
  }

  if (snapshotQuery.error) {
    return (
      <ScreenShell
        headerTitle={<HeaderBrandTitle logoSize={68} titleSize={30} />}
        headerVariant="plain"
        refresh={refresh}
        title="Happy Circles"
        titleAlign="center"
      >
        <Text style={styles.supportText}>{snapshotQuery.error.message}</Text>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell
      headerLeading={
        <Link href="/profile" asChild>
          <Pressable
            style={({ pressed }) => [
              styles.profileButton,
              pressed ? styles.quickActionPressed : null,
            ]}
          >
            <AppAvatar
              imageUrl={currentUserProfile?.avatarUrl ?? null}
              label={currentUserProfile?.displayName ?? currentUserProfile?.email ?? 'Tu'}
              size={34}
            />
          </Pressable>
        </Link>
      }
      headerTitle={<HeaderBrandTitle logoSize={68} titleSize={30} />}
      headerSlot={<NotificationBellButton count={dashboard.urgentCount} href="/activity" />}
      headerVariant="plain"
      contentWidthStyle={styles.homeContent}
      refresh={refresh}
      title="Happy Circles"
      titleAlign="center"
    >
      <BalanceSummaryCard
        detailsHref={'/balance' as Href}
        netBalanceMinor={dashboard.summary.netBalanceMinor}
        totalIOweMinor={dashboard.summary.totalIOweMinor}
        totalOwedToMeMinor={dashboard.summary.totalOwedToMeMinor}
      />

      {activeSettlementProposal ? (
        <View style={styles.dashboardSettlementContainer}>
          <HappyCircleCard proposal={activeSettlementProposal} variant="compact" />
        </View>
      ) : null}

      {nativeSetupMessage ? <MessageBanner message={nativeSetupMessage} tone="neutral" /> : null}

      {showNativeSetup ? (
        <SetupPromptCard
          busyKind={busyNativeSetup}
          needsContacts={needsContacts}
          needsNotifications={needsNotifications}
          onContactsPress={() => void handleContactsPermission()}
          onDismiss={() => void handleDismissNativeSetup()}
          onNotificationsPress={() => void handleNotificationsPermission()}
        />
      ) : null}

      <SectionBlock
        action={
          <Link href="/people" asChild>
            <Pressable
              style={({ pressed }) => [
                styles.peopleSectionAction,
                pressed ? styles.quickActionPressed : null,
              ]}
            >
              <Text style={styles.peopleSectionActionText}>Ver todas</Text>
            </Pressable>
          </Link>
        }
        title="Personas"
      >
        <ScrollView
          horizontal
          contentContainerStyle={styles.peopleRailContent}
          showsHorizontalScrollIndicator={false}
        >
          <ShortcutTile
            badgeCount={inviteRequestCount}
            icon="person-add-outline"
            label="Solicitudes"
            onPress={openInviteRequests}
          />
          <ShortcutTile
            dashed
            icon="add"
            label="Agregar"
            onPress={() => setAddPersonSheetVisible(true)}
          />
          {dashboard.activePeople.map((person) => (
            <PersonTile key={person.userId} person={person} />
          ))}
        </ScrollView>
      </SectionBlock>

      {transactionPreviewItems.length > 0 ? (
        <SectionBlock
          action={
            <Link href="/transactions" asChild>
              <Pressable
                style={({ pressed }) => [
                  styles.peopleSectionAction,
                  pressed ? styles.quickActionPressed : null,
                ]}
              >
                <Text style={styles.peopleSectionActionText}>Ver todas</Text>
              </Pressable>
            </Link>
          }
          title="Transacciones"
        >
          <View style={styles.transactionList}>
            {transactionPreviewItems.map(({ highlightPending, isPending, item, unread }) => (
              <TransactionPreviewCard
                highlightPending={highlightPending}
                isPending={isPending}
                item={item}
                key={item.id}
                people={dashboard.activePeople}
                unread={unread}
              />
            ))}
          </View>
        </SectionBlock>
      ) : null}
      <AddPersonContactsSheet
        currentUserAvatarUrl={currentUserProfile?.avatarUrl ?? null}
        currentUserLabel={currentUserProfile?.displayName ?? currentUserProfile?.email ?? 'Tu'}
        onClose={() => setAddPersonSheetVisible(false)}
        visible={addPersonSheetVisible}
      />
      <InviteRequestsSheet
        activeTab={inviteTab}
        busyKey={busyInviteKey}
        historyItems={inviteHistoryItems}
        message={inviteMessage}
        onAction={(item, action) => void handleInviteRequestAction(item, action)}
        onChangeTab={setInviteTab}
        onClose={closeInviteRequests}
        receivedItems={receivedInviteItems}
        sentItems={sentInviteItems}
        visible={inviteSheetVisible}
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  homeContent: {
    gap: theme.spacing.xl,
  },
  supportText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.callout,
    lineHeight: 22,
  },
  homeLoadingStack: {
    gap: theme.spacing.md,
    width: '100%',
  },
  homeLoadingHero: {
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radius.medium,
    gap: theme.spacing.sm,
    padding: theme.spacing.lg,
  },
  homeLoadingTitleLine: {
    backgroundColor: theme.colors.surfaceSoft,
    borderRadius: theme.radius.pill,
    height: 22,
    width: '58%',
  },
  homeLoadingBodyLine: {
    backgroundColor: theme.colors.surfaceSoft,
    borderRadius: theme.radius.pill,
    height: 14,
    width: '82%',
  },
  homeLoadingGrid: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  homeLoadingTile: {
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radius.medium,
    flex: 1,
    height: 74,
  },
  homeLoadingList: {
    gap: theme.spacing.sm,
    paddingTop: theme.spacing.xs,
  },
  homeLoadingListLine: {
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radius.pill,
    height: 16,
    width: '100%',
  },
  homeLoadingListLineShort: {
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radius.pill,
    height: 16,
    width: '68%',
  },
  profileButton: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  quickActionPressed: {
    opacity: 0.6,
  },
  peopleSectionAction: {
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 3,
  },
  peopleSectionActionText: {
    color: theme.colors.text,
    fontSize: theme.typography.caption,
    fontWeight: '800',
  },
  peopleRailContent: {
    gap: theme.spacing.sm,
    paddingRight: theme.spacing.xs,
  },
  peopleTile: {
    alignItems: 'center',
    gap: 6,
    width: 68,
  },
  shortcutCircle: {
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    borderColor: theme.colors.accent,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    height: 56,
    justifyContent: 'center',
    position: 'relative',
    width: 56,
  },
  shortcutCircleDashed: {
    borderStyle: 'dashed',
  },
  requestBadge: {
    alignItems: 'center',
    backgroundColor: theme.colors.danger,
    borderColor: theme.colors.background,
    borderRadius: theme.radius.pill,
    borderWidth: 2,
    height: 20,
    justifyContent: 'center',
    minWidth: 20,
    paddingHorizontal: 5,
    position: 'absolute',
    right: -3,
    top: -3,
  },
  requestBadgeText: {
    color: theme.colors.white,
    fontSize: 10,
    fontWeight: '800',
  },
  personAvatarRing: {
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.pill,
    borderWidth: 2,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  peopleTileLabel: {
    color: theme.colors.text,
    fontSize: theme.typography.caption,
    fontWeight: '700',
    maxWidth: 68,
    textAlign: 'center',
  },
  dashboardSettlementContainer: {
    paddingHorizontal: theme.spacing.lg,
  },
  transactionList: {
    gap: theme.spacing.sm,
  },
  sheetScrim: {
    backgroundColor: theme.colors.overlay,
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetBackdrop: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  friendshipSheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radius.large,
    borderTopRightRadius: theme.radius.large,
    gap: theme.spacing.sm,
    maxHeight: '76%',
    paddingBottom: theme.spacing.lg,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
  },
  sheetHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  sheetTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.body,
    fontWeight: '800',
  },
  sheetCloseButton: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  sheetTabs: {
    borderBottomColor: theme.colors.hairline,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: theme.spacing.lg,
  },
  sheetTab: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingBottom: theme.spacing.xs,
    paddingTop: theme.spacing.xs,
  },
  sheetTabActive: {
    borderBottomColor: theme.colors.primary,
    borderBottomWidth: 2,
  },
  sheetTabText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    fontWeight: '800',
  },
  sheetTabTextActive: {
    color: theme.colors.text,
  },
  sheetTabBadge: {
    alignItems: 'center',
    backgroundColor: theme.colors.danger,
    borderRadius: theme.radius.pill,
    height: 18,
    justifyContent: 'center',
    minWidth: 18,
    paddingHorizontal: 5,
  },
  sheetTabBadgeText: {
    color: theme.colors.white,
    fontSize: 10,
    fontWeight: '800',
  },
  requestList: {
    gap: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
  },
  requestActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
    justifyContent: 'flex-end',
  },
  requestIconButton: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  requestAcceptButton: {
    backgroundColor: theme.colors.success,
  },
  requestRejectButton: {
    backgroundColor: theme.colors.danger,
  },
  actionDisabled: {
    opacity: 0.46,
  },
  sentCancelButton: {
    borderColor: theme.colors.danger,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
  },
  sentCancelText: {
    color: theme.colors.danger,
    fontSize: theme.typography.caption,
    fontWeight: '800',
  },
  requestStatusPill: {
    backgroundColor: theme.colors.accentSoft,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 7,
  },
  requestStatusText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    fontWeight: '800',
  },
  sheetEmpty: {
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xl,
  },
  sheetEmptyTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '800',
    textAlign: 'center',
  },
  sheetEmptyText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
    textAlign: 'center',
  },
});
