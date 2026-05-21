import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, type Href } from 'expo-router';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { Platform, View } from 'react-native';
import {
  HOME_REGISTER_FAB_CLEARANCE,
  dashboardStyles as styles,
} from '@/features/home/dashboard-screen.styles';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenShell } from '@/components/screen-shell';
import { HappyCirclesMotion } from '@/components/happy-circles-motion';
import { BalanceLensCarousel } from '@/features/balance/balance-lens-carousel';
import { usePreferredBalanceAnalyticsPeriod } from '@/features/balance/balance-period-selection';
import { AddPersonContactsSheet } from '@/features/home/add-person-contacts-sheet';
import {
  DashboardPeopleSection,
  DashboardTransactionsSection,
} from '@/features/home/dashboard-main-sections';
import { buildDashboardTransactionPreview } from '@/features/home/dashboard-transaction-preview';
import {
  transactionPersonForItem,
  transactionPersonHref,
} from '@/features/home/dashboard-preview-cards';
import { balanceFocusHref, type TransactionTargetPanel } from '@/features/home/dashboard-helpers';
import {
  HOME_CHROME_EXPANDED_HEIGHT,
  HomeCollapsibleChrome,
  HomeRegisterFab,
  useCollapsibleHomeChrome,
} from '@/features/home/home-collapsible-chrome';
import { triggerAppSelectionHaptic } from '@/lib/app-haptics';
import { markHomeEntryReady } from '@/lib/home-entry-handoff';
import { pushRoute } from '@/lib/navigation';
import { buildNotificationSummary } from '@/lib/notification-summary';
import {
  notificationItemCanAlert,
  notificationViewKeyForItem,
  notificationViewedKeysWithLocalCache,
  useAppSnapshot,
} from '@/lib/live-data';
import { buildPendingSetupReminderItems } from '@/lib/setup-reminder';
import { theme } from '@/lib/theme';
import { useSnapshotRefresh } from '@/lib/use-snapshot-refresh';
import { useSession } from '@/providers/session-provider';
import type { ActivityItemDto } from '@happy-circles/application';
import { AppText } from '@/components/app-text';

const TRANSACTION_PREVIEW_LIMIT = 15;
const HOME_REFRESH_INDICATOR_CLEARANCE = theme.spacing.xl;
const HOME_REFRESH_MINIMUM_VISIBLE_MS = 700;

function DashboardLoadingState({ message }: { readonly message: string }) {
  return (
    <View style={styles.homeLoadingState}>
      <HappyCirclesMotion size={74} variant="loading" />
      <AppText style={styles.homeLoadingTitle}>Sincronizando</AppText>
      <AppText style={styles.homeLoadingText}>{message}</AppText>
    </View>
  );
}

export function DashboardScreen() {
  const router = useRouter();
  const session = useSession();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const topInset = Math.max(0, insets.top);
  const homeChromeHeight = HOME_CHROME_EXPANDED_HEIGHT + topInset;
  const homeRefreshInsetTop = Platform.OS === 'ios' ? homeChromeHeight : 0;
  const homeChrome = useCollapsibleHomeChrome(homeRefreshInsetTop);
  const homeRefreshProgressOffset = homeChromeHeight + HOME_REFRESH_INDICATOR_CLEARANCE;
  const snapshotQuery = useAppSnapshot();
  const refresh = useSnapshotRefresh(snapshotQuery, {
    minimumVisibleMs: HOME_REFRESH_MINIMUM_VISIBLE_MS,
    nativeIndicatorTopInset: homeRefreshInsetTop,
    progressViewOffset: homeRefreshProgressOffset,
  });
  const dashboard = snapshotQuery.data?.dashboard;
  const balanceOverview = snapshotQuery.data?.balanceOverview ?? null;
  const balanceAnalytics = snapshotQuery.data?.balanceAnalytics ?? null;
  const balancePeriod = usePreferredBalanceAnalyticsPeriod(balanceAnalytics?.defaultPeriod);
  const currentUserProfile = snapshotQuery.data?.currentUserProfile ?? null;
  const happyCircleScore = snapshotQuery.data?.happyCircleScore ?? null;
  const happyCircleFaces = happyCircleScore?.totalFaces ?? 0;
  const happyCircleClosedCount = happyCircleScore?.closedCircleCount ?? 0;
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
  const newCircleProposalIds = useMemo(() => {
    const ids = new Set<string>();

    for (const item of pendingSection?.items ?? []) {
      if (
        item.kind === 'settlement_proposal' &&
        item.category === 'cycle' &&
        notificationItemCanAlert(item) &&
        !notificationViewedKeys.has(notificationViewKeyForItem(item))
      ) {
        ids.add(item.originSettlementProposalId ?? item.id);
      }
    }

    return ids;
  }, [notificationViewedKeys, pendingSection?.items]);
  const transactionPreview = buildDashboardTransactionPreview({
    historyItems: historySection?.items ?? [],
    limit: TRANSACTION_PREVIEW_LIMIT,
    notificationViewedKeys,
    pendingItems: pendingSection?.items ?? [],
  });
  const setupReminderItems = useMemo(() => buildPendingSetupReminderItems(session), [session]);
  const notificationSummary = useMemo(
    () =>
      buildNotificationSummary(
        [...setupReminderItems, ...(pendingSection?.items ?? [])],
        notificationViewedKeys,
      ),
    [notificationViewedKeys, pendingSection?.items, setupReminderItems],
  );
  const notificationCount = snapshotQuery.data ? notificationSummary.unreadCount : 0;
  const homeLoadingMessage = snapshotQuery.isRestoringCache
    ? 'Preparando tus datos guardados.'
    : 'Cargando tu Circle.';
  const currentUserLabel = currentUserProfile?.displayName ?? currentUserProfile?.email ?? 'Tú';
  const homeContentContainerStyle = useMemo(
    () => ({
      paddingBottom: HOME_REGISTER_FAB_CLEARANCE + Math.max(0, insets.bottom),
      paddingHorizontal: 0,
      paddingTop:
        HOME_CHROME_EXPANDED_HEIGHT +
        Math.max(0, insets.top) +
        theme.spacing.lg -
        homeRefreshInsetTop,
    }),
    [homeRefreshInsetTop, insets.bottom, insets.top],
  );
  const homeChromeOverlay = (
    <>
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

  function openTransactionPreviewItem(item: ActivityItemDto, panel: TransactionTargetPanel) {
    const person = transactionPersonForItem(dashboard?.activePeople ?? [], item);
    pushRoute(router, transactionPersonHref(person, item, panel));
  }

  function openHappyFaces() {
    triggerAppSelectionHaptic();
    pushRoute(router, '/circles' as Href);
  }

  useFocusEffect(
    useCallback(() => {
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
    }, []),
  );

  if (snapshotQuery.error && !dashboard && !snapshotQuery.isRestoringCache) {
    return (
      <ScreenShell
        contentContainerStyle={homeContentContainerStyle}
        contentMode="full"
        headerVisible={false}
        headerVariant="plain"
        onScroll={homeChrome.onScroll}
        overlay={homeChromeOverlay}
        refresh={refresh}
        safeAreaEdges={[]}
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
        contentMode="full"
        headerVisible={false}
        headerVariant="plain"
        onScroll={homeChrome.onScroll}
        overlay={homeChromeOverlay}
        refresh={refresh}
        safeAreaEdges={[]}
        scrollEventThrottle={16}
        title="Happy Circles"
        titleAlign="center"
      >
        <DashboardLoadingState message={homeLoadingMessage} />
      </ScreenShell>
    );
  }

  return (
    <ScreenShell
      contentContainerStyle={homeContentContainerStyle}
      contentMode="full"
      headerVisible={false}
      headerVariant="plain"
      contentWidthStyle={styles.homeContent}
      onScroll={homeChrome.onScroll}
      overlay={homeChromeOverlay}
      refresh={refresh}
      safeAreaEdges={[]}
      scrollEnabled={homeScrollEnabled}
      scrollEventThrottle={16}
      title="Happy Circles"
      titleAlign="center"
    >
      {balanceOverview && balanceAnalytics ? (
        <BalanceLensCarousel
          analytics={balanceAnalytics}
          currentUserId={session.userId}
          happyFacesClosedCount={happyCircleClosedCount}
          happyFacesTotal={happyCircleFaces}
          isActive={isFocused}
          newCircleProposalIds={newCircleProposalIds}
          onCategoryPress={(category, period) =>
            pushRoute(router, `/categories?category=${category}&period=${period}` as Href)
          }
          onFocusPress={(focus) => pushRoute(router, balanceFocusHref(focus))}
          onHappyFacesPress={openHappyFaces}
          onSwipeInteractionChange={(isInteracting) => setHomeScrollEnabled(!isInteracting)}
          overview={balanceOverview}
          period={balancePeriod}
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
        currentUserLabel={currentUserProfile?.displayName ?? currentUserProfile?.email ?? 'Tú'}
        onClose={() => setAddPersonSheetVisible(false)}
        visible={addPersonSheetVisible}
      />
    </ScreenShell>
  );
}
