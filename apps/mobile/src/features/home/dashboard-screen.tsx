import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Alert, Linking, Text, View } from 'react-native';
import {
  HOME_REGISTER_FAB_CLEARANCE,
  PEOPLE_TILE_AVATAR_SIZE,
  dashboardStyles as styles,
} from '@/features/home/dashboard-screen.styles';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppAvatar } from '@/components/app-avatar';
import { MessageBanner } from '@/components/message-banner';
import { ScreenShell } from '@/components/screen-shell';
import { SetupPromptCard } from '@/components/setup-prompt-card';
import { BalanceLensCarousel } from '@/features/balance/balance-overview-screen';
import { AddPersonContactsSheet } from '@/features/home/add-person-contacts-sheet';
import { InviteRequestsSheet } from '@/features/home/dashboard-invite-requests-sheet';
import { DashboardLoadingState } from '@/features/home/dashboard-loading-state';
import {
  DashboardPeopleSection,
  DashboardTransactionsSection,
} from '@/features/home/dashboard-main-sections';
import {
  setupNotificationKey,
  transactionPersonForItem,
  transactionPersonHref,
} from '@/features/home/dashboard-preview-cards';
import {
  INVITE_REQUEST_TABS,
  balanceFocusHref,
  displayNameForInvite,
  inviteAccentBackgroundColor,
  inviteAccentColor,
  inviteCardIcon,
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
import {
  HOME_CHROME_EXPANDED_HEIGHT,
  HomeCollapsibleChrome,
  HomeRegisterFab,
  useCollapsibleHomeChrome,
} from '@/features/home/home-collapsible-chrome';
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

export function DashboardScreen() {
  const router = useRouter();
  const session = useSession();
  const insets = useSafeAreaInsets();
  const homeChrome = useCollapsibleHomeChrome();
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
  const pendingCount = snapshotQuery.data?.pendingCount ?? 0;
  const homeEntryReady = Boolean(dashboard) || Boolean(snapshotQuery.error);
  const currentUserLabel = currentUserProfile?.displayName ?? currentUserProfile?.email ?? 'Tu';
  const homeContentContainerStyle = useMemo(
    () => ({
      paddingBottom: HOME_REGISTER_FAB_CLEARANCE + Math.max(0, insets.bottom),
      paddingTop:
        HOME_CHROME_EXPANDED_HEIGHT + Math.max(0, insets.top) + theme.spacing.md,
    }),
    [insets.bottom, insets.top],
  );
  const homeChromeOverlay = (
    <>
      <HomeCollapsibleChrome
        avatarLabel={currentUserLabel}
        avatarUrl={currentUserProfile?.avatarUrl ?? null}
        isCompact={homeChrome.isCompact}
        notificationCount={notificationCount}
        pendingCount={pendingCount}
        progress={homeChrome.progress}
        topInset={Math.max(0, insets.top)}
      />
      <HomeRegisterFab
        bottomInset={Math.max(0, insets.bottom)}
        isCompact={homeChrome.isCompact}
        progress={homeChrome.progress}
      />
    </>
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
        headerVisible={false}
        headerVariant="plain"
        onScroll={homeChrome.onScroll}
        overlay={homeChromeOverlay}
        refresh={refresh}
        safeAreaEdges={['left', 'right']}
        scrollEventThrottle={16}
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
        headerVisible={false}
        headerVariant="plain"
        onScroll={homeChrome.onScroll}
        overlay={homeChromeOverlay}
        safeAreaEdges={['left', 'right']}
        scrollEventThrottle={16}
        title="Happy Circles"
        titleAlign="center"
      >
        <DashboardLoadingState />
      </ScreenShell>
    );
  }

  if (snapshotQuery.error) {
    return (
      <ScreenShell
        contentContainerStyle={homeContentContainerStyle}
        headerVisible={false}
        headerVariant="plain"
        onScroll={homeChrome.onScroll}
        overlay={homeChromeOverlay}
        refresh={refresh}
        safeAreaEdges={['left', 'right']}
        scrollEventThrottle={16}
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
      headerVisible={false}
      headerVariant="plain"
      contentWidthStyle={styles.homeContent}
      onScroll={homeChrome.onScroll}
      overlay={homeChromeOverlay}
      refresh={refresh}
      safeAreaEdges={['left', 'right']}
      scrollEventThrottle={16}
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

      <DashboardPeopleSection
        activePeople={dashboard.activePeople}
        inviteRequestCount={inviteRequestCount}
        onAddPerson={() => setAddPersonSheetVisible(true)}
        onOpenInviteRequests={openInviteRequests}
      />

      <DashboardTransactionsSection
        items={transactionPreviewItems}
        onOpenItem={openTransactionPreviewItem}
        people={dashboard.activePeople}
      />
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
