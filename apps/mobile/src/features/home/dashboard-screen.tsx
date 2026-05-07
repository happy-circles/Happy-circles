import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import {
  HOME_REGISTER_FAB_CLEARANCE,
  dashboardStyles as styles,
} from '@/features/home/dashboard-screen.styles';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenShell } from '@/components/screen-shell';
import { BalanceLensCarousel } from '@/features/balance/balance-overview-screen';
import { AddPersonContactsSheet } from '@/features/home/add-person-contacts-sheet';
import {
  DashboardPeopleSection,
  DashboardTransactionsSection,
} from '@/features/home/dashboard-main-sections';
import { buildDashboardTransactionPreview } from '@/features/home/dashboard-transaction-preview';
import {
  setupNotificationKey,
  transactionPersonForItem,
  transactionPersonHref,
} from '@/features/home/dashboard-preview-cards';
import { balanceFocusHref } from '@/features/home/dashboard-helpers';
import {
  HOME_CHROME_EXPANDED_HEIGHT,
  HomeCollapsibleChrome,
  HomeRegisterFab,
  useCollapsibleHomeChrome,
} from '@/features/home/home-collapsible-chrome';
import { HomeNativeSyncIndicator } from '@/features/home/home-native-sync-indicator';
import { markHomeEntryReady } from '@/lib/home-entry-handoff';
import { pushRoute } from '@/lib/navigation';
import { notificationViewKeyForItem, useAppSnapshot } from '@/lib/live-data';
import { theme } from '@/lib/theme';
import { useSnapshotRefresh } from '@/lib/use-snapshot-refresh';
import { useSession } from '@/providers/session-provider';
import type { ActivityItemDto } from '@happy-circles/application';
import { AppText } from '@/components/app-text';

const TRANSACTION_PREVIEW_LIMIT = 3;
const HOME_REFRESH_INDICATOR_CLEARANCE = theme.spacing.xl;
const HOME_REFRESH_MINIMUM_VISIBLE_MS = 700;

export function DashboardScreen() {
  const router = useRouter();
  const session = useSession();
  const insets = useSafeAreaInsets();
  const homeChrome = useCollapsibleHomeChrome();
  const topInset = Math.max(0, insets.top);
  const homeChromeHeight = HOME_CHROME_EXPANDED_HEIGHT + topInset;
  const homeRefreshProgressOffset = homeChromeHeight + HOME_REFRESH_INDICATOR_CLEARANCE;
  const snapshotQuery = useAppSnapshot();
  const refresh = useSnapshotRefresh(snapshotQuery, {
    minimumVisibleMs: HOME_REFRESH_MINIMUM_VISIBLE_MS,
    nativeIndicatorVisible: false,
    progressViewOffset: homeRefreshProgressOffset,
  });
  const showNativeSyncIndicator =
    refresh.refreshing ||
    snapshotQuery.isRestoringCache ||
    snapshotQuery.isLoading ||
    snapshotQuery.isFetching;
  const dashboard = snapshotQuery.data?.dashboard;
  const balanceOverview = snapshotQuery.data?.balanceOverview ?? null;
  const balanceAnalytics = snapshotQuery.data?.balanceAnalytics ?? null;
  const currentUserProfile = snapshotQuery.data?.currentUserProfile ?? null;
  const [homeScrollEnabled, setHomeScrollEnabled] = useState(true);
  const [addPersonSheetVisible, setAddPersonSheetVisible] = useState(false);
  const [optimisticNotificationViewedKeys, setOptimisticNotificationViewedKeys] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const pendingSection = snapshotQuery.data?.activitySections.find(
    (section) => section.key === 'pending',
  );
  const historySection = snapshotQuery.data?.activitySections.find(
    (section) => section.key === 'history',
  );
  const notificationViewedKeys = useMemo(() => {
    const keys = new Set(snapshotQuery.data?.notificationViewedKeys ?? []);
    for (const key of optimisticNotificationViewedKeys) {
      keys.add(key);
    }

    return keys;
  }, [optimisticNotificationViewedKeys, snapshotQuery.data?.notificationViewedKeys]);
  const transactionPreview = buildDashboardTransactionPreview({
    historyItems: historySection?.items ?? [],
    limit: TRANSACTION_PREVIEW_LIMIT,
  });
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
  const pendingSetupNotificationKeys = [
    needsContacts ? setupNotificationKey('local-contacts-reminder') : null,
    needsNotifications ? setupNotificationKey('local-notifications-reminder') : null,
    deviceTrustPending ? setupNotificationKey('local-device-trust-reminder') : null,
    biometricsPending ? setupNotificationKey('local-biometrics-reminder') : null,
    passwordAuthPending ? setupNotificationKey('local-password-auth-reminder') : null,
    googleAuthPending ? setupNotificationKey('local-google-auth-reminder') : null,
    appleAuthPending ? setupNotificationKey('local-apple-auth-reminder') : null,
  ].filter((key): key is string => Boolean(key));
  const unreadSetupCount = pendingSetupNotificationKeys.filter(
    (key) => !notificationViewedKeys.has(key),
  ).length;
  const pendingNotificationCount =
    pendingSection?.items.filter(
      (item) => !notificationViewedKeys.has(notificationViewKeyForItem(item)),
    ).length ??
    snapshotQuery.data?.notificationUnreadCount ??
    0;
  const notificationCount = snapshotQuery.data ? pendingNotificationCount + unreadSetupCount : 0;
  const homeEntryReady =
    !snapshotQuery.isRestoringCache && (Boolean(dashboard) || Boolean(snapshotQuery.error));
  const currentUserLabel = currentUserProfile?.displayName ?? currentUserProfile?.email ?? 'Tu';
  const homeContentContainerStyle = useMemo(
    () => ({
      paddingBottom: HOME_REGISTER_FAB_CLEARANCE + Math.max(0, insets.bottom),
      paddingTop: HOME_CHROME_EXPANDED_HEIGHT + Math.max(0, insets.top) + theme.spacing.lg,
    }),
    [insets.bottom, insets.top],
  );
  const homeChromeOverlay = (
    <>
      <HomeNativeSyncIndicator top={homeChromeHeight} visible={showNativeSyncIndicator} />
      <HomeCollapsibleChrome
        avatarLabel={currentUserLabel}
        avatarUrl={currentUserProfile?.avatarUrl ?? null}
        isCompact={homeChrome.isCompact}
        notificationCount={notificationCount}
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
    setOptimisticNotificationViewedKeys(new Set());
  }, [session.userId]);

  function openTransactionPreviewItem(item: ActivityItemDto) {
    const person = transactionPersonForItem(dashboard?.activePeople ?? [], item);
    pushRoute(router, transactionPersonHref(person, item, 'history'));
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

  if (snapshotQuery.error && !dashboard && !snapshotQuery.isRestoringCache) {
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
        <AppText style={styles.supportText}>{snapshotQuery.error.message}</AppText>
      </ScreenShell>
    );
  }

  if (snapshotQuery.isRestoringCache || snapshotQuery.isLoading || !dashboard) {
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
      />
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
      scrollEnabled={homeScrollEnabled}
      scrollEventThrottle={16}
      title="Happy Circles"
      titleAlign="center"
    >
      {balanceOverview && balanceAnalytics ? (
        <BalanceLensCarousel
          analytics={balanceAnalytics}
          onFocusPress={(focus) => pushRoute(router, balanceFocusHref(focus))}
          onSwipeInteractionChange={(isInteracting) => setHomeScrollEnabled(!isInteracting)}
          overview={balanceOverview}
        />
      ) : null}

      <DashboardPeopleSection
        activePeople={dashboard.activePeople}
        onAddPerson={() => setAddPersonSheetVisible(true)}
      />

      <DashboardTransactionsSection
        items={transactionPreview.visibleItems}
        onOpenItem={openTransactionPreviewItem}
        people={dashboard.activePeople}
      />
      <AddPersonContactsSheet
        currentUserAvatarUrl={currentUserProfile?.avatarUrl ?? null}
        currentUserLabel={currentUserProfile?.displayName ?? currentUserProfile?.email ?? 'Tu'}
        onClose={() => setAddPersonSheetVisible(false)}
        visible={addPersonSheetVisible}
      />
    </ScreenShell>
  );
}
