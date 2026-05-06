import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppAvatar } from '@/components/app-avatar';
import { HeaderBrandTitle } from '@/components/header-brand-title';
import { MessageBanner } from '@/components/message-banner';
import { NotificationBellButton } from '@/components/notification-bell-button';
import { ScreenShell } from '@/components/screen-shell';
import { SectionBlock } from '@/components/section-block';
import { SetupPromptCard } from '@/components/setup-prompt-card';
import { SurfaceCard } from '@/components/surface-card';
import { SwipePager } from '@/components/swipe-pager';
import { TransactionEventCard } from '@/components/transaction-event-card';
import { BalanceLensCarousel } from '@/features/balance/balance-overview-screen';
import { AddPersonContactsSheet } from '@/features/home/add-person-contacts-sheet';
import {
  INVITE_REQUEST_TABS,
  balanceFocusHref,
  displayNameForInvite,
  inviteAccentBackgroundColor,
  inviteAccentColor,
  inviteCardIcon,
  inviteRequestEmptyDescription,
  inviteRequestEmptyTitle,
  inviteRequestMeta,
  isActiveQrInvite,
  isReceivedInvite,
  isSentInvite,
  isVisibleInviteHistory,
  shouldShowRespondingInviteProfile,
  sortInviteHistoryItems,
  sortInviteRequestItems,
  type InviteRequestAction,
  type InviteRequestItem,
  type InviteRequestsTab,
  type TransactionTargetPanel,
} from '@/features/home/dashboard-helpers';
import { resolveAvatarUrl } from '@/lib/avatar';
import { markHomeEntryReady } from '@/lib/home-entry-handoff';
import { useHomeNavigationIntent } from '@/lib/home-navigation-intent';
import { pushRoute } from '@/lib/navigation';
import {
  markNotificationItemsViewed,
  notificationViewKeyForItem,
  useAppSnapshot,
  useCancelAccountInviteMutation,
  useCancelFriendshipInviteMutation,
  useRespondInternalFriendshipInviteMutation,
  useReviewAccountInviteMutation,
  useReviewExternalFriendshipInviteMutation,
} from '@/lib/live-data';
import { cancelScheduledReminders, scheduleDailyPendingReminder } from '@/lib/notifications';
import { dismissSetupPrompt, getSetupPromptDismissed } from '@/lib/setup-reminder';
import { buildHistoryCases, isHistoryCaseItem } from '@/lib/history-cases';
import {
  triggerIdentityErrorHaptic,
  triggerIdentitySuccessHaptic,
  triggerIdentityWarningHaptic,
} from '@/lib/identity-flow-haptics';
import { theme } from '@/lib/theme';
import { useSnapshotRefresh } from '@/lib/use-snapshot-refresh';
import {
  isConsolidatedTransactionItem,
  isCycleTransactionItem,
  isPendingTransactionItem,
  transactionAmountIsVoided,
  transactionAmountLabel,
  transactionCreatedByMetaLabel,
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
const PEOPLE_TILE_WIDTH = 68;
const PEOPLE_TILE_CIRCLE_SIZE = 56;
const PEOPLE_TILE_AVATAR_SIZE = 52;
const PEOPLE_TILE_LABEL_LINE_HEIGHT = 15;
const HOME_HEADER_ACTION_SIZE = 48;
const HOME_HEADER_AVATAR_SIZE = 40;
const HOME_HEADER_BRAND_LOGO_SIZE = 60;
const HOME_HEADER_BRAND_TITLE_SIZE = 22;
const HOME_REGISTER_FAB_CLEARANCE = 76;

function initialsBackgroundColor(person: Pick<PersonCardDto, 'userId' | 'displayName'>): string {
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

function setupNotificationKey(id: string): string {
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
            size={PEOPLE_TILE_AVATAR_SIZE}
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
  const meta = transactionCreatedByMetaLabel(item, name);
  const category = transactionVisualCategory(item);

  return (
    <TransactionEventCard
      accentColor={transactionToneColor(item)}
      actorAvatarUrl={isSystemTransaction ? null : (person?.avatarUrl ?? null)}
      actorAvatarVariant={isSystemTransaction ? 'system' : 'person'}
      actorFallbackColor={
        isSystemTransaction ? transactionToneColor(item) : initialsBackgroundColor(fallbackPerson)
      }
      actorLabel={name}
      amountColor={transactionToneColor(item)}
      amountLabel={amountLabel}
      amountStruckThrough={transactionAmountIsVoided(item)}
      category={category}
      categoryPlacement={isSystemTransaction ? 'none' : 'avatar'}
      compact
      compactMetaLayout="inline"
      context=""
      href={onPress ? undefined : href}
      meta={meta}
      onPress={onPress}
      pending={highlightPending}
      pendingHighlightColor={transactionToneColor(item)}
      statusLabel={transactionStatusLabel(item)}
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
  const meta = inviteRequestMeta(item);
  const accentColor = inviteAccentColor(item);
  const accentBackgroundColor = inviteAccentBackgroundColor(item);
  const busyPrefix = `${item.kind}:${item.inviteId}:`;
  const isBusy = Boolean(busyKey?.startsWith(busyPrefix));
  const showRespondingProfile = shouldShowRespondingInviteProfile(item);
  const avatarUrl =
    (showRespondingProfile ? item.respondingProfileAvatarUrl : null) ??
    item.profileAvatarUrl ??
    (item.kind === 'friendship_invite'
      ? showRespondingProfile
        ? resolveAvatarUrl(item.claimantSnapshot?.avatarPath ?? null)
        : null
      : showRespondingProfile
        ? item.activatedUserAvatarUrl
        : null);
  const fallbackPerson: PersonCardDto = {
    userId: item.inviteId,
    displayName,
    avatarUrl: null,
    direction: 'settled',
    lastActivityLabel: '',
    netAmountMinor: 0,
    pendingCount: 0,
  };

  const actionContent =
    item.actionState === 'requires_you_response' ? (
      <View style={styles.requestActions}>
        <Pressable
          accessibilityLabel="Rechazar solicitud"
          accessibilityRole="button"
          disabled={isBusy}
          onPress={() => onAction(item, 'reject')}
          style={({ pressed }) => [
            styles.requestIconButton,
            styles.requestIconButtonDanger,
            pressed ? styles.quickActionPressed : null,
            isBusy ? styles.actionDisabled : null,
          ]}
        >
          <Ionicons color={theme.colors.danger} name="close-circle-outline" size={16} />
        </Pressable>
        <Pressable
          accessibilityLabel="Aceptar solicitud"
          accessibilityRole="button"
          disabled={isBusy}
          onPress={() => onAction(item, 'accept')}
          style={({ pressed }) => [
            styles.requestIconButton,
            styles.requestIconButtonPrimary,
            pressed ? styles.quickActionPressed : null,
            isBusy ? styles.actionDisabled : null,
          ]}
        >
          <Ionicons color={theme.colors.primary} name="checkmark-circle" size={16} />
        </Pressable>
      </View>
    ) : item.actionState === 'requires_you_review' ? (
      <View style={styles.requestActions}>
        <Pressable
          accessibilityLabel="Rechazar solicitud"
          accessibilityRole="button"
          disabled={isBusy}
          onPress={() => onAction(item, 'reject')}
          style={({ pressed }) => [
            styles.requestIconButton,
            styles.requestIconButtonDanger,
            pressed ? styles.quickActionPressed : null,
            isBusy ? styles.actionDisabled : null,
          ]}
        >
          <Ionicons color={theme.colors.danger} name="close-circle-outline" size={16} />
        </Pressable>
        <Pressable
          accessibilityLabel="Aceptar solicitud"
          accessibilityRole="button"
          disabled={isBusy}
          onPress={() => onAction(item, 'approve')}
          style={({ pressed }) => [
            styles.requestIconButton,
            styles.requestIconButtonPrimary,
            pressed ? styles.quickActionPressed : null,
            isBusy ? styles.actionDisabled : null,
          ]}
        >
          <Ionicons color={theme.colors.primary} name="checkmark-circle" size={16} />
        </Pressable>
      </View>
    ) : (item.kind === 'friendship_invite' && item.actionState === 'pending_claim') ||
      (item.kind === 'account_invite' &&
        item.actionState === 'pending_activation' &&
        !item.activatedUserId) ? (
      <View style={[styles.requestActions, styles.requestSingleActionRow]}>
        <Pressable
          accessibilityLabel="Cancelar invitacion"
          accessibilityRole="button"
          disabled={isBusy}
          onPress={() => onAction(item, 'cancel')}
          style={({ pressed }) => [
            styles.requestIconButton,
            styles.requestIconButtonDanger,
            pressed ? styles.quickActionPressed : null,
            isBusy ? styles.actionDisabled : null,
          ]}
        >
          <Ionicons color={theme.colors.danger} name="close-circle-outline" size={15} />
        </Pressable>
      </View>
    ) : null;
  const typeIcon = (
    <View style={[styles.requestTypeIcon, { backgroundColor: accentBackgroundColor }]}>
      <Ionicons color={accentColor} name={inviteCardIcon(item)} size={15} />
    </View>
  );
  const profileContent = (
    <View style={styles.requestPersonRow}>
      <View style={styles.requestAvatarSlot}>
        <AppAvatar
          fallbackBackgroundColor={initialsBackgroundColor(fallbackPerson)}
          fallbackTextColor={theme.colors.white}
          imageUrl={avatarUrl}
          label={displayName}
          size={48}
        />
      </View>
      <View style={styles.requestPersonCopy}>
        <Text numberOfLines={1} style={styles.requestPersonName}>
          {displayName}
        </Text>
        <Text numberOfLines={1} style={styles.requestPersonMeta}>
          {meta}
        </Text>
      </View>
    </View>
  );

  return (
    <SurfaceCard
      padding="md"
      style={[styles.requestCard, { borderLeftColor: accentColor }]}
      variant="elevated"
    >
      <View style={styles.requestCardHeader}>
        {profileContent}
        <View style={styles.requestHeaderSide}>
          {actionContent ? (
            <>
              {isActiveQrInvite(item) ? typeIcon : null}
              {actionContent}
            </>
          ) : (
            typeIcon
          )}
        </View>
      </View>
    </SurfaceCard>
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
  const [visualTab, setVisualTab] = useState<InviteRequestsTab>(activeTab);

  useEffect(() => {
    setVisualTab(activeTab);
  }, [activeTab]);

  function changeTab(tab: InviteRequestsTab) {
    setVisualTab(tab);
    onChangeTab(tab);
  }

  function renderRequestPage(tab: InviteRequestsTab) {
    const items = tab === 'received' ? receivedItems : tab === 'sent' ? sentItems : historyItems;

    return (
      <ScrollView
        contentContainerStyle={[
          styles.requestList,
          items.length === 0 ? styles.requestListEmpty : null,
        ]}
        showsVerticalScrollIndicator={false}
        style={styles.requestScroll}
      >
        {items.length === 0 ? (
          <View style={styles.sheetEmpty}>
            <Text style={styles.sheetEmptyTitle}>{inviteRequestEmptyTitle(tab)}</Text>
            <Text style={styles.sheetEmptyText}>{inviteRequestEmptyDescription(tab)}</Text>
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
    );
  }

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
              onPress={() => changeTab('received')}
              selected={visualTab === 'received'}
            />
            <InviteRequestTabButton
              count={sentItems.length}
              label="Enviadas"
              onPress={() => changeTab('sent')}
              selected={visualTab === 'sent'}
            />
            <InviteRequestTabButton
              count={historyItems.length}
              label="Historico"
              onPress={() => changeTab('history')}
              selected={visualTab === 'history'}
            />
          </View>
          {message ? <MessageBanner message={message} tone="neutral" /> : null}
          <SwipePager
            accessibilityLabel="Pestanas de solicitudes"
            onChange={changeTab}
            onPreviewChange={setVisualTab}
            renderPage={(tab) => renderRequestPage(tab)}
            style={styles.requestPager}
            value={activeTab}
            values={INVITE_REQUEST_TABS}
          />
        </View>
      </View>
    </Modal>
  );
}

export function DashboardScreen() {
  const router = useRouter();
  const session = useSession();
  const insets = useSafeAreaInsets();
  const snapshotQuery = useAppSnapshot();
  const refresh = useSnapshotRefresh(snapshotQuery);
  const homeIntent = useHomeNavigationIntent();
  const respondInternalInvite = useRespondInternalFriendshipInviteMutation();
  const reviewExternalInvite = useReviewExternalFriendshipInviteMutation();
  const reviewAccountInvite = useReviewAccountInviteMutation();
  const cancelAccountInvite = useCancelAccountInviteMutation();
  const cancelFriendshipInvite = useCancelFriendshipInviteMutation();
  const handledHomeIntentIdRef = useRef<number | null>(null);
  const dashboard = snapshotQuery.data?.dashboard;
  const balanceOverview = snapshotQuery.data?.balanceOverview ?? null;
  const balanceAnalytics = snapshotQuery.data?.balanceAnalytics ?? null;
  const currentUserProfile = snapshotQuery.data?.currentUserProfile ?? null;
  const [nativeSetupMessage, setNativeSetupMessage] = useState<string | null>(null);
  const [busyNativeSetup, setBusyNativeSetup] = useState<'contacts' | 'notifications' | null>(null);
  const [inviteSheetVisible, setInviteSheetVisible] = useState(false);
  const [addPersonSheetVisible, setAddPersonSheetVisible] = useState(false);
  const [inviteTab, setInviteTab] = useState<InviteRequestsTab>('received');
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);
  const [busyInviteKey, setBusyInviteKey] = useState<string | null>(null);
  const [setupPromptDismissed, setSetupPromptDismissed] = useState<boolean | null>(null);
  const [optimisticNotificationViewedKeys, setOptimisticNotificationViewedKeys] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const friendshipPendingItems = snapshotQuery.data?.friendshipPendingItems ?? [];
  const friendshipHistoryItems = snapshotQuery.data?.friendshipHistoryItems ?? [];
  const accountInvitePendingItems = snapshotQuery.data?.accountInvitePendingItems ?? [];
  const accountInviteHistoryItems = snapshotQuery.data?.accountInviteHistoryItems ?? [];
  const invitePendingItems = sortInviteRequestItems([
    ...friendshipPendingItems,
    ...accountInvitePendingItems,
  ]);
  const inviteHistoryItems = useMemo(
    () =>
      sortInviteHistoryItems(
        [...friendshipHistoryItems, ...accountInviteHistoryItems].filter(isVisibleInviteHistory),
      ),
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
  const pendingTransactionItems = (pendingSection?.items ?? []).filter(isPendingTransactionItem);
  const notificationViewedKeys = useMemo(() => {
    const keys = new Set(snapshotQuery.data?.notificationViewedKeys ?? []);
    for (const key of optimisticNotificationViewedKeys) {
      keys.add(key);
    }

    return keys;
  }, [optimisticNotificationViewedKeys, snapshotQuery.data?.notificationViewedKeys]);
  const recentTransactionItems = buildHistoryCases(
    (historySection?.items ?? []).filter(isConsolidatedTransactionItem).filter(isHistoryCaseItem),
  )
    .map((itemCase) => itemCase.latest)
    .slice(0, RECENT_TRANSACTION_LIMIT);
  const transactionPreviewItems = [
    ...pendingTransactionItems.map((item) => ({
      highlightPending: !notificationViewedKeys.has(notificationViewKeyForItem(item)),
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
  const accountSetupEligible =
    session.accountAccessState === 'active' && session.profileCompletionState === 'complete';
  const needsContacts =
    session.setupState.contactsPermissionStatus !== 'granted' &&
    session.setupState.contactsPermissionStatus !== 'limited';
  const needsNotifications = !session.notificationsEnabled;
  const deviceTrustPending = accountSetupEligible && !session.isTrustedDevice;
  const biometricsPending =
    accountSetupEligible && session.biometricAvailable && !session.biometricsEnabled;
  const passwordAuthPending = accountSetupEligible && !session.linkedMethods.hasEmailPassword;
  const googleAuthPending = accountSetupEligible && !session.linkedMethods.hasGoogle;
  const appleAuthPending =
    accountSetupEligible && session.appleSignInAvailable && !session.linkedMethods.hasApple;
  const deviceTrustHref = {
    pathname: '/profile',
    params: { focus: 'trust-password', section: 'device' },
  } as Href;
  const biometricsHref = {
    pathname: '/profile',
    params: { focus: 'biometrics', section: 'account' },
  } as Href;
  const passwordAuthHref = {
    pathname: '/profile',
    params: { focus: 'attach-password', section: 'methods' },
  } as Href;
  const accessMethodsHref = {
    pathname: '/profile',
    params: { section: 'methods' },
  } as Href;
  const pendingSetupNotificationKeys = [
    needsContacts ? setupNotificationKey('local-contacts-reminder') : null,
    needsNotifications ? setupNotificationKey('local-notifications-reminder') : null,
    deviceTrustPending ? setupNotificationKey('local-device-trust-reminder') : null,
    biometricsPending ? setupNotificationKey('local-biometrics-reminder') : null,
    passwordAuthPending ? setupNotificationKey('local-password-auth-reminder') : null,
    googleAuthPending ? setupNotificationKey('local-google-auth-reminder') : null,
    appleAuthPending ? setupNotificationKey('local-apple-auth-reminder') : null,
  ].filter((key): key is string => Boolean(key));
  const pendingSetupCount = pendingSetupNotificationKeys.length;
  const unreadSetupCount = pendingSetupNotificationKeys.filter(
    (key) => !notificationViewedKeys.has(key),
  ).length;
  const pendingNotificationCount =
    pendingSection?.items.filter(
      (item) => !notificationViewedKeys.has(notificationViewKeyForItem(item)),
    ).length ??
    snapshotQuery.data?.notificationUnreadCount ??
    0;
  const showPendingSetupCard = setupPromptDismissed === false && pendingSetupCount > 0;
  const notificationCount = snapshotQuery.data ? pendingNotificationCount + unreadSetupCount : 0;
  const homeEntryReady = Boolean(dashboard) || Boolean(snapshotQuery.error);
  const homeContentContainerStyle = useMemo(
    () => ({ paddingBottom: HOME_REGISTER_FAB_CLEARANCE + Math.max(0, insets.bottom) }),
    [insets.bottom],
  );

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
    setOptimisticNotificationViewedKeys(new Set());
  }, [session.userId]);

  function markPendingTransactionViewed(item: ActivityItemDto) {
    const key = notificationViewKeyForItem(item);
    setOptimisticNotificationViewedKeys((current) => {
      const next = new Set(current);
      next.add(key);
      return next;
    });

    void markNotificationItemsViewed(session.userId, [item]).catch(() => {
      setOptimisticNotificationViewedKeys((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    });
  }

  function openTransactionPreviewItem(item: ActivityItemDto, isPending: boolean) {
    if (isPending) {
      markPendingTransactionViewed(item);
    }

    const person = transactionPersonForItem(dashboard?.activePeople ?? [], item);
    const panel: TransactionTargetPanel = isPending ? 'pending' : 'history';
    pushRoute(router, transactionPersonHref(person, item, panel));
  }

  async function handleContactsPermission() {
    if (session.setupState.contactsPermissionStatus === 'denied') {
      openAppSettings(
        'Permiso de contactos bloqueado',
        'Abre Ajustes y permite contactos para encontrar personas desde tu agenda.',
      );
      return;
    }

    setBusyNativeSetup('contacts');
    setNativeSetupMessage(null);

    try {
      const result = await session.requestContactsPermission();
      setNativeSetupMessage(result);
      if (result.includes('Ajustes')) {
        openAppSettings(
          'Permiso de contactos bloqueado',
          'Abre Ajustes y permite contactos para encontrar personas desde tu agenda.',
        );
      }
    } finally {
      setBusyNativeSetup(null);
    }
  }

  async function handleNotificationsPermission() {
    if (session.setupState.notificationsPermissionStatus === 'denied') {
      openAppSettings(
        'Notificaciones bloqueadas',
        'Abre Ajustes y permite notificaciones para activar recordatorios.',
      );
      return;
    }

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
      if (result.includes('Ajustes')) {
        openAppSettings(
          'Notificaciones bloqueadas',
          'Abre Ajustes y permite notificaciones para activar recordatorios.',
        );
      }
    } finally {
      setBusyNativeSetup(null);
    }
  }

  function openAppSettings(title: string, message: string) {
    Alert.alert(title, message, [
      { style: 'cancel', text: 'Ahora no' },
      { text: 'Abrir ajustes', onPress: () => void Linking.openSettings() },
    ]);
  }

  async function handleDismissNativeSetup() {
    setSetupPromptDismissed(true);
    setNativeSetupMessage(null);
    await dismissSetupPrompt(session.userId);
  }

  function openInviteRequests() {
    setInviteMessage(null);
    setInviteTab(
      receivedInviteItems.length > 0 ? 'received' : sentInviteItems.length > 0 ? 'sent' : 'history',
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
        if (action === 'accept') {
          triggerIdentitySuccessHaptic();
        } else {
          triggerIdentityWarningHaptic();
        }
        setInviteMessage(action === 'accept' ? 'Invitacion aceptada.' : 'Invitacion rechazada.');
        return;
      }

      if (item.kind === 'friendship_invite' && item.actionState === 'requires_you_review') {
        await reviewExternalInvite.mutateAsync({
          inviteId: item.inviteId,
          decision: action === 'approve' ? 'approve' : 'reject',
        });
        if (action === 'approve') {
          triggerIdentitySuccessHaptic();
        } else {
          triggerIdentityWarningHaptic();
        }
        setInviteMessage(action === 'approve' ? 'Conexion confirmada.' : 'Invitacion cerrada.');
        return;
      }

      if (item.kind === 'account_invite' && item.actionState === 'requires_you_review') {
        await reviewAccountInvite.mutateAsync({
          inviteId: item.inviteId,
          decision: action === 'approve' ? 'approve' : 'reject',
        });
        if (action === 'approve') {
          triggerIdentitySuccessHaptic();
        } else {
          triggerIdentityWarningHaptic();
        }
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
        triggerIdentityWarningHaptic();
        setInviteMessage('Invitacion cancelada.');
        return;
      }

      if (
        item.kind === 'account_invite' &&
        item.actionState === 'pending_activation' &&
        !item.activatedUserId &&
        action === 'cancel'
      ) {
        await cancelAccountInvite.mutateAsync(item.inviteId);
        triggerIdentityWarningHaptic();
        setInviteMessage('Invitacion de acceso cancelada.');
        return;
      }
    } catch (error) {
      triggerIdentityErrorHaptic();
      setInviteMessage(error instanceof Error ? error.message : 'No se pudo completar la accion.');
    } finally {
      setBusyInviteKey(null);
    }
  }

  useFocusEffect(
    useCallback(() => {
      if (!homeEntryReady) {
        return undefined;
      }

      let secondFrame: ReturnType<typeof requestAnimationFrame> | null = null;
      const firstFrame = requestAnimationFrame(() => {
        secondFrame = requestAnimationFrame(() => {
          markHomeEntryReady();
        });
      });

      return () => {
        cancelAnimationFrame(firstFrame);
        if (secondFrame !== null) {
          cancelAnimationFrame(secondFrame);
        }
      };
    }, [homeEntryReady]),
  );

  if (snapshotQuery.error && !dashboard) {
    return (
      <ScreenShell
        contentContainerStyle={homeContentContainerStyle}
        headerTitle={
          <HeaderBrandTitle
            logoSize={HOME_HEADER_BRAND_LOGO_SIZE}
            titleSize={HOME_HEADER_BRAND_TITLE_SIZE}
          />
        }
        headerVariant="plain"
        refresh={refresh}
        title="Happy Circles"
        titleAlign="center"
      >
        <Text style={styles.supportText}>{snapshotQuery.error.message}</Text>
      </ScreenShell>
    );
  }

  if (snapshotQuery.isLoading || !dashboard) {
    return (
      <ScreenShell
        contentContainerStyle={homeContentContainerStyle}
        headerTitle={
          <HeaderBrandTitle
            launchTargetDisabled
            logoSize={HOME_HEADER_BRAND_LOGO_SIZE}
            titleSize={HOME_HEADER_BRAND_TITLE_SIZE}
          />
        }
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
        contentContainerStyle={homeContentContainerStyle}
        headerTitle={
          <HeaderBrandTitle
            logoSize={HOME_HEADER_BRAND_LOGO_SIZE}
            titleSize={HOME_HEADER_BRAND_TITLE_SIZE}
          />
        }
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
      contentContainerStyle={homeContentContainerStyle}
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
              size={HOME_HEADER_AVATAR_SIZE}
            />
          </Pressable>
        </Link>
      }
      headerTitle={
        <HeaderBrandTitle
          logoSize={HOME_HEADER_BRAND_LOGO_SIZE}
          titleSize={HOME_HEADER_BRAND_TITLE_SIZE}
        />
      }
      headerSlot={<NotificationBellButton count={notificationCount} href="/activity" />}
      headerVariant="plain"
      contentWidthStyle={styles.homeContent}
      refresh={refresh}
      title="Happy Circles"
      titleAlign="center"
    >
      {balanceOverview && balanceAnalytics ? (
        <BalanceLensCarousel
          analytics={balanceAnalytics}
          onFocusPress={(focus) => pushRoute(router, balanceFocusHref(focus))}
          overview={balanceOverview}
        />
      ) : null}

      {nativeSetupMessage ? <MessageBanner message={nativeSetupMessage} tone="neutral" /> : null}

      {showPendingSetupCard ? (
        <SetupPromptCard
          biometricLabel={session.biometricLabel}
          busyKind={busyNativeSetup}
          dismissible
          needsAppleAuth={appleAuthPending}
          needsBiometrics={biometricsPending}
          needsContacts={needsContacts}
          needsDeviceTrust={deviceTrustPending}
          needsGoogleAuth={googleAuthPending}
          needsNotifications={needsNotifications}
          needsPasswordAuth={passwordAuthPending}
          onAppleAuthPress={() => pushRoute(router, accessMethodsHref)}
          onBiometricsPress={() => pushRoute(router, biometricsHref)}
          onContactsPress={() => void handleContactsPermission()}
          onDeviceTrustPress={() => pushRoute(router, deviceTrustHref)}
          onDismiss={() => void handleDismissNativeSetup()}
          onGoogleAuthPress={() => pushRoute(router, accessMethodsHref)}
          onNotificationsPress={() => void handleNotificationsPermission()}
          onPasswordAuthPress={() => pushRoute(router, passwordAuthHref)}
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
                onPress={() => openTransactionPreviewItem(item, isPending)}
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
    height: HOME_HEADER_ACTION_SIZE,
    justifyContent: 'center',
    width: HOME_HEADER_ACTION_SIZE,
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
    width: PEOPLE_TILE_WIDTH,
  },
  shortcutCircle: {
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    borderColor: theme.colors.accent,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    height: PEOPLE_TILE_CIRCLE_SIZE,
    justifyContent: 'center',
    position: 'relative',
    width: PEOPLE_TILE_CIRCLE_SIZE,
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
    height: PEOPLE_TILE_CIRCLE_SIZE,
    justifyContent: 'center',
    width: PEOPLE_TILE_CIRCLE_SIZE,
  },
  peopleTileLabel: {
    color: theme.colors.text,
    fontSize: theme.typography.caption,
    fontWeight: '700',
    includeFontPadding: false,
    lineHeight: PEOPLE_TILE_LABEL_LINE_HEIGHT,
    maxWidth: PEOPLE_TILE_WIDTH,
    minHeight: PEOPLE_TILE_LABEL_LINE_HEIGHT,
    textAlign: 'center',
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
    height: '82%',
    maxHeight: '88%',
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
    flexGrow: 1,
    gap: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
  },
  requestListEmpty: {
    justifyContent: 'center',
    paddingBottom: theme.spacing.xl,
  },
  requestPager: {
    flex: 1,
    minHeight: 0,
  },
  requestScroll: {
    flex: 1,
    minHeight: 0,
  },
  requestCard: {
    borderLeftWidth: 3,
  },
  requestCardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    minWidth: 0,
  },
  requestPersonRow: {
    alignItems: 'center',
    alignSelf: 'stretch',
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: theme.spacing.sm,
    minWidth: 0,
  },
  requestAvatarSlot: {
    flexShrink: 0,
    height: 48,
    width: 48,
  },
  requestPersonCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  requestPersonName: {
    color: theme.colors.text,
    fontSize: theme.typography.body,
    fontWeight: '800',
    lineHeight: 20,
  },
  requestPersonMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
  },
  requestHeaderSide: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
    flexShrink: 0,
    marginLeft: 'auto',
  },
  requestTypeIcon: {
    alignItems: 'center',
    backgroundColor: theme.colors.primaryGhost,
    borderRadius: theme.radius.pill,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  requestActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
    justifyContent: 'center',
  },
  requestSingleActionRow: {
    justifyContent: 'flex-end',
  },
  requestIconButton: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  requestIconButtonPrimary: {
    backgroundColor: theme.colors.primaryGhost,
  },
  requestIconButtonDanger: {
    backgroundColor: theme.colors.dangerSoft,
  },
  actionDisabled: {
    opacity: 0.46,
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
