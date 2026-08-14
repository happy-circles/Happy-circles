import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import {
  Stack,
  useGlobalSearchParams,
  useRootNavigationState,
  useRouter,
  useSegments,
} from 'expo-router';
import Constants from 'expo-constants';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Linking,
  Platform,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';

import type { Href } from 'expo-router';
import type { Json } from '@happy-circles/shared';

import { AppAvatar } from '@/components/app-avatar';
import {
  BRAND_VERIFICATION_EASING,
  BrandVerificationMark,
  type BrandVerificationState,
} from '@/components/brand-verification-lockup';
import { GlobalFeedbackOverlay } from '@/components/global-feedback-overlay';
import {
  HappyCirclesCenterSvg,
  HappyCirclesGlyph,
  resolveHappyCirclesPalette,
} from '@/components/happy-circles-glyph';
import { HappyCircleDiscoveryBridge } from '@/components/happy-circle-discovery-bridge';
import {
  IDENTITY_FLOW_COMPACT_FACE_SIZE,
  IDENTITY_FLOW_LARGE_FACE_VIEW_BOX,
  IDENTITY_FLOW_PROFILE_AVATAR_SIZE,
  IDENTITY_FLOW_STAGE_SIZE,
} from '@/components/identity-flow';
import {
  LaunchIntroVisibilityProvider,
  type LaunchIntroTargetSnapshot,
  type LaunchIntroTargetVisualKind,
  useLaunchIntroTargets,
} from '@/components/launch-intro-presence';
import { clearPendingInviteIntentIfMatches, readPendingInviteIntent } from '@/lib/invite-intent';
import {
  readPendingAccountVerification,
  reconcilePendingAccountVerificationForSession,
} from '@/lib/account-verification';
import {
  clearPendingNavigationIntentIfMatches,
  readPendingNavigationIntent,
  writePendingNavigationIntent,
} from '@/lib/pending-navigation-intent';
import { isAuthRouteTransitionHoldActive } from '@/lib/auth-route-transition-hold';
import {
  beginHomeEntryHandoffAfterScrollReset,
  getHomeEntryReadyVersion,
  subscribeHomeEntryHandoff,
  subscribeHomeEntryReady,
} from '@/lib/home-entry-handoff';
import { requestLaunchTargetRemeasure } from '@/lib/launch-target-remeasure';
import { markSplashHidden, subscribeFirstScreenReady } from '@/lib/performance-metrics';
import { subscribeSetupEntryHandoff } from '@/lib/setup-entry-handoff';
import { PrimaryAction } from '@/components/primary-action';
import { ProductAnalyticsBridge } from '@/components/product-analytics-bridge';
import { SurfaceCard } from '@/components/surface-card';
import { resolveSetupAccountPreviewParams } from '@/features/onboarding/setup-account-helpers';
import { appConfig } from '@/lib/config';
import { getCurrentAppVersion } from '@/lib/device-trust';
import {
  addNotificationReceivedListener,
  addNotificationResponseListener,
  cancelScheduledPendingReminders,
  cancelScheduledReminders,
  configureNotifications,
  getLastNotificationRoute,
  notificationRouteFromResponse,
  scheduleDailyPendingReminder,
  setLocalNotificationBadgeCount,
  type NotificationRoute,
} from '@/lib/notifications';
import { disableCurrentPushDevice, registerCurrentPushDevice } from '@/lib/push-registration';
import { notificationViewedKeysWithLocalCache, useAppSnapshot } from '@/lib/live-data';
import { useSnapshotRealtimeBridge } from '@/lib/live-data/snapshot-realtime';
import { returnToRoute } from '@/lib/navigation';
import { buildNotificationSummary } from '@/lib/notification-summary';
import { resolvePreHomeRouteDecision } from '@/lib/pre-home-routing';
import { buildPendingSetupReminderItems } from '@/lib/setup-reminder';
import { supabase } from '@/lib/supabase';
import { theme } from '@/lib/theme';
import { AppProviders } from '@/providers/app-providers';
import { useSession } from '@/providers/session-provider';
import { useAppTheme, useThemeScheme } from '@/providers/theme-provider';
import { AppText } from '@/components/app-text';

const IS_EXPO_GO = String(Constants.appOwnership) === 'expo';

if (!IS_EXPO_GO) {
  SplashScreen.setOptions({ duration: 140, fade: true });
}

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

const SHOULD_USE_NATIVE_DRIVER = Platform.OS !== 'web';
const LAUNCH_INTRO_MIN_MS = 760;
const LAUNCH_LAND_MS = 700;
const LAUNCH_ROUTE_SETTLE_MS = 120;
const LAUNCH_REDUCED_MOTION_EXIT_MS = 180;
const LAUNCH_TARGET_WAIT_MS = 540;
const LAUNCH_HOME_TARGET_WAIT_MS = 1400;
const LAUNCH_SESSION_MAX_WAIT_MS = 3200;
const LAUNCH_TARGET_STABLE_SAMPLES = 4;
const LAUNCH_TARGET_STABLE_THRESHOLD = 1.25;
const LAUNCH_LOGO_SIZE = IDENTITY_FLOW_STAGE_SIZE;
const LAUNCH_AVATAR_EDIT_PENCIL_OFFSET = 35;
const LAUNCH_AVATAR_EDIT_PENCIL_SIZE = 32;
const LAUNCH_EASING = BRAND_VERIFICATION_EASING;
const HOME_ENTRY_SPIN_MS = 360;
const HOME_ENTRY_SOURCE_CENTER_MS = 260;
const HOME_ENTRY_SOURCE_CENTER_THRESHOLD = 18;
const HOME_ENTRY_ROUTE_SETTLE_MS = 120;
const HOME_ENTRY_LAND_MS = 720;
const HOME_ENTRY_REDUCED_MOTION_EXIT_MS = 180;
const HOME_ENTRY_FADE_MS = 120;
const HOME_ENTRY_READY_WAIT_MS = 2400;
const SETUP_ENTRY_SPIN_MS = 420;
const SETUP_ENTRY_SUCCESS_MS = 220;
const SETUP_ENTRY_ROUTE_SETTLE_MS = 120;
const SETUP_ENTRY_LAND_MS = 760;
const SETUP_ENTRY_REDUCED_MOTION_EXIT_MS = 180;
const SETUP_ENTRY_FADE_MS = 140;
const SETUP_ENTRY_TARGET_WAIT_MS = 1200;

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function waitForNextFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

async function waitForHomeEntryReadyAfter(readyVersionAtStart: number) {
  if (getHomeEntryReadyVersion() > readyVersionAtStart) {
    return;
  }

  await new Promise<void>((resolve) => {
    let settled = false;
    const timeout = setTimeout(finish, HOME_ENTRY_READY_WAIT_MS);
    const unsubscribe = subscribeHomeEntryReady((version) => {
      if (version > readyVersionAtStart) {
        finish();
      }
    });

    function finish() {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      unsubscribe();
      resolve();
    }
  });
}

function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    let mounted = true;

    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) {
        setReducedMotion(enabled);
      }
    });

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReducedMotion,
    );

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reducedMotion;
}

type LaunchTargetPreference = 'homeHeader' | 'identity' | 'identityAvatar' | 'none';

function sortLaunchTargets(targets: readonly LaunchIntroTargetSnapshot[]) {
  return [...targets].sort((left, right) => {
    if (right.priority !== left.priority) {
      return right.priority - left.priority;
    }

    return right.updatedAt - left.updatedAt;
  });
}

function firstLaunchTargetOfKind(
  targets: readonly LaunchIntroTargetSnapshot[],
  visualKind: LaunchIntroTargetVisualKind,
) {
  return sortLaunchTargets(targets).find((entry) => entry.visualKind === visualKind) ?? null;
}

function firstIdentityLaunchTarget(targets: readonly LaunchIntroTargetSnapshot[]) {
  return (
    sortLaunchTargets(targets).find(
      (entry) => entry.visualKind === 'identityAvatar' || entry.visualKind === 'identityMark',
    ) ?? null
  );
}

function firstHomeEntrySourceTarget(targets: readonly LaunchIntroTargetSnapshot[]) {
  return firstIdentityLaunchTarget(targets);
}

function isSameStableLaunchTarget(
  left: LaunchIntroTargetSnapshot | null,
  right: LaunchIntroTargetSnapshot | null,
) {
  if (!left || !right) {
    return false;
  }

  return (
    left.id === right.id &&
    left.visualKind === right.visualKind &&
    left.stageSize === right.stageSize &&
    left.centerFaceSize === right.centerFaceSize &&
    left.avatarUrl === right.avatarUrl &&
    left.avatarLabel === right.avatarLabel &&
    left.avatarSize === right.avatarSize &&
    left.avatarEditable === right.avatarEditable &&
    left.visualState === right.visualState &&
    Math.abs(left.x - right.x) <= LAUNCH_TARGET_STABLE_THRESHOLD &&
    Math.abs(left.y - right.y) <= LAUNCH_TARGET_STABLE_THRESHOLD &&
    Math.abs(left.width - right.width) <= LAUNCH_TARGET_STABLE_THRESHOLD &&
    Math.abs(left.height - right.height) <= LAUNCH_TARGET_STABLE_THRESHOLD
  );
}

function NotificationBridge() {
  const router = useRouter();
  const session = useSession();
  const snapshotQuery = useAppSnapshot();
  const handledNotificationIdsRef = useRef<Set<string>>(new Set());
  const lastNotificationSyncSignatureRef = useRef<string | null>(null);
  const notificationSyncVersionRef = useRef(0);
  const snapshotRefetchRef = useRef(snapshotQuery.refetch);
  const sessionRef = useRef(session);
  const pendingSection = snapshotQuery.data?.activitySections.find(
    (section) => section.key === 'pending',
  );
  const notificationViewedKeys = useMemo(
    () =>
      notificationViewedKeysWithLocalCache(
        session.userId,
        snapshotQuery.data?.notificationViewedKeys ?? [],
      ),
    [session.userId, snapshotQuery.data?.notificationViewedKeys],
  );
  const setupReminderItems = useMemo(() => buildPendingSetupReminderItems(session), [session]);
  const notificationSummary = useMemo(
    () =>
      buildNotificationSummary(
        snapshotQuery.data ? [...setupReminderItems, ...(pendingSection?.items ?? [])] : [],
        notificationViewedKeys,
      ),
    [notificationViewedKeys, pendingSection?.items, setupReminderItems, snapshotQuery.data],
  );
  const notificationSyncSignature = useMemo(() => {
    if (session.status === 'loading') {
      return null;
    }

    if (!session.userId || !session.notificationsEnabled) {
      return 'off';
    }

    if (!snapshotQuery.data) {
      return null;
    }

    return [
      notificationSummary.unreadCount,
      notificationSummary.categoryCounts.transactions,
      notificationSummary.categoryCounts.friends,
      notificationSummary.categoryCounts.reminders,
    ].join(':');
  }, [
    notificationSummary.categoryCounts.friends,
    notificationSummary.categoryCounts.reminders,
    notificationSummary.categoryCounts.transactions,
    notificationSummary.unreadCount,
    session.notificationsEnabled,
    session.status,
    session.userId,
    snapshotQuery.data,
  ]);

  useEffect(() => {
    snapshotRefetchRef.current = snapshotQuery.refetch;
  }, [snapshotQuery.refetch]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useSnapshotRealtimeBridge(
    session.userId,
    session.status !== 'loading' && Boolean(session.userId),
  );

  useEffect(() => {
    void configureNotifications();

    let isMounted = true;
    let receivedSubscription: { remove(): void } | null = null;
    let responseSubscription: { remove(): void } | null = null;

    function refetchSnapshotFromNotification() {
      void snapshotRefetchRef.current().catch(() => undefined);
    }

    function canOpenNotificationRoute() {
      const currentSession = sessionRef.current;
      return (
        currentSession.status !== 'loading' &&
        currentSession.status !== 'signed_out' &&
        currentSession.status !== 'signed_in_locked' &&
        currentSession.accountAccessState === 'active' &&
        currentSession.profileCompletionState === 'complete' &&
        currentSession.setupState.requiredComplete
      );
    }

    function openNotificationRoute(route: NotificationRoute | null) {
      if (!route || handledNotificationIdsRef.current.has(route.id)) {
        return;
      }

      handledNotificationIdsRef.current.add(route.id);
      refetchSnapshotFromNotification();
      if (canOpenNotificationRoute()) {
        returnToRoute(router, route.href as Href);
        return;
      }

      void writePendingNavigationIntent(route).catch(() => undefined);
    }

    void getLastNotificationRoute().then((route) => {
      if (isMounted) {
        openNotificationRoute(route);
      }
    });

    void addNotificationReceivedListener(() => {
      refetchSnapshotFromNotification();
    }).then((subscription) => {
      receivedSubscription = subscription;
    });

    void addNotificationResponseListener((response) => {
      refetchSnapshotFromNotification();
      openNotificationRoute(notificationRouteFromResponse(response));
    }).then((subscription) => {
      responseSubscription = subscription;
    });

    return () => {
      isMounted = false;
      receivedSubscription?.remove();
      responseSubscription?.remove();
    };
  }, [router]);

  useEffect(() => {
    if (session.status === 'loading' || !session.userId || !session.currentDeviceId) {
      return undefined;
    }

    if (
      session.notificationsEnabled &&
      session.setupState.notificationsPermissionStatus === 'granted'
    ) {
      void registerCurrentPushDevice(session.userId, session.currentDeviceId).catch((error) => {
        console.warn(
          'Failed to register push device',
          error instanceof Error ? error.message : String(error),
        );
      });
      return undefined;
    }

    if (
      !session.notificationsEnabled ||
      session.setupState.notificationsPermissionStatus === 'denied' ||
      session.setupState.notificationsPermissionStatus === 'unavailable'
    ) {
      void disableCurrentPushDevice(session.userId, session.currentDeviceId).catch((error) => {
        console.warn(
          'Failed to disable push device',
          error instanceof Error ? error.message : String(error),
        );
      });
    }

    return undefined;
  }, [
    session.currentDeviceId,
    session.notificationsEnabled,
    session.setupState.notificationsPermissionStatus,
    session.status,
    session.userId,
  ]);

  useEffect(() => {
    if (
      !notificationSyncSignature ||
      notificationSyncSignature === lastNotificationSyncSignatureRef.current
    ) {
      return undefined;
    }

    lastNotificationSyncSignatureRef.current = notificationSyncSignature;
    const syncVersion = notificationSyncVersionRef.current + 1;
    notificationSyncVersionRef.current = syncVersion;

    const isStale = () => notificationSyncVersionRef.current !== syncVersion;

    async function syncNativeNotificationState() {
      if (notificationSyncSignature === 'off') {
        await setLocalNotificationBadgeCount(0);
        if (!isStale()) {
          await cancelScheduledReminders();
        }
        return;
      }

      await configureNotifications();
      if (isStale()) {
        return;
      }

      await setLocalNotificationBadgeCount(notificationSummary.unreadCount);
      if (isStale()) {
        return;
      }

      await cancelScheduledPendingReminders();
      if (isStale() || notificationSummary.unreadCount <= 0) {
        return;
      }

      await scheduleDailyPendingReminder({
        friendCount: notificationSummary.categoryCounts.friends,
        reminderCount: notificationSummary.categoryCounts.reminders,
        transactionCount: notificationSummary.categoryCounts.transactions,
        unreadCount: notificationSummary.unreadCount,
      });
    }

    void syncNativeNotificationState().catch(() => {
      if (!isStale()) {
        lastNotificationSyncSignatureRef.current = null;
      }
    });

    return undefined;
  }, [notificationSummary, notificationSyncSignature]);

  return null;
}

type MinimumSupportedVersionSetting = {
  readonly minimumVersion: string;
  readonly message: string | null;
};

function normalizeVersion(version: string): number[] | null {
  const trimmed = version.trim();
  if (!trimmed) {
    return null;
  }

  const parts = trimmed.split('.');
  if (parts.length === 0) {
    return null;
  }

  const normalized: number[] = [];
  for (const part of parts) {
    if (!/^\d+$/.test(part)) {
      return null;
    }
    normalized.push(Number(part));
  }
  return normalized;
}

function compareVersions(left: string, right: string): number | null {
  const leftParts = normalizeVersion(left);
  const rightParts = normalizeVersion(right);

  if (!leftParts || !rightParts) {
    return null;
  }

  const maxLength = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = leftParts[index] ?? 0;
    const rightValue = rightParts[index] ?? 0;
    if (leftValue > rightValue) {
      return 1;
    }
    if (leftValue < rightValue) {
      return -1;
    }
  }

  return 0;
}

function parseMinimumSupportedVersion(value: Json): MinimumSupportedVersionSetting | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const minimumVersion =
    typeof record.minimumVersion === 'string' ? record.minimumVersion.trim() : '';
  const message = typeof record.message === 'string' ? record.message.trim() : '';

  if (!minimumVersion) {
    return null;
  }

  return {
    minimumVersion,
    message: message || null,
  };
}

async function readMinimumSupportedVersion(): Promise<MinimumSupportedVersionSetting | null> {
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from('app_settings')
    .select('value_json')
    .eq('key', 'mobile_min_supported_version')
    .maybeSingle();

  if (error) {
    throw error;
  }

  const row = data as { readonly value_json: Json } | null;
  return parseMinimumSupportedVersion(row?.value_json ?? null);
}

function MandatoryUpdateGate() {
  const activeTheme = useAppTheme();
  const currentVersion = getCurrentAppVersion();
  const minimumVersionQuery = useQuery({
    queryKey: ['app_settings', 'mobile_min_supported_version'],
    queryFn: readMinimumSupportedVersion,
    staleTime: 60_000,
  });

  const minimumVersion = minimumVersionQuery.data?.minimumVersion ?? null;
  const comparison =
    !__DEV__ && currentVersion && minimumVersion
      ? compareVersions(currentVersion, minimumVersion)
      : null;
  const requiresUpdate = comparison !== null && comparison < 0;

  if (!requiresUpdate) {
    return null;
  }

  const message =
    minimumVersionQuery.data?.message ??
    'Actualiza Happy Circles para seguir usando esta version de la app.';

  return (
    <View style={[styles.overlay, { backgroundColor: activeTheme.colors.overlay }]}>
      <SurfaceCard padding="lg" style={styles.lockCard} variant="elevated">
        <AppText style={[styles.lockTitle, { color: activeTheme.colors.text }]}>
          Actualizacion obligatoria
        </AppText>
        <AppText style={[styles.lockSubtitle, { color: activeTheme.colors.textMuted }]}>
          {message}
        </AppText>
        <AppText style={[styles.lockMessage, { color: activeTheme.colors.warning }]}>
          Version actual: {currentVersion} · Version minima: {minimumVersion}
        </AppText>
        <PrimaryAction
          label="Abrir sitio de actualizacion"
          subtitle={appConfig.appWebOrigin}
          onPress={() => void Linking.openURL(appConfig.appWebOrigin)}
        />
      </SurfaceCard>
    </View>
  );
}

function LaunchIntroOverlay({
  onVisibleChange,
}: {
  readonly onVisibleChange: (visible: boolean) => void;
}) {
  const activeTheme = useAppTheme();
  const session = useSession();
  const reducedMotion = useReducedMotion();
  const segments = useSegments();
  const targets = useLaunchIntroTargets();
  const { height, width } = useWindowDimensions();
  const isAuthSettledAwayFromHome =
    session.status === 'signed_out' || session.status === 'signed_in_locked';
  const isSignedInRouteCandidate = !isAuthSettledAwayFromHome && session.status !== 'loading';
  const targetPreference: LaunchTargetPreference = isAuthSettledAwayFromHome
    ? 'identity'
    : isSignedInRouteCandidate && !session.setupState.requiredComplete
      ? 'identityAvatar'
      : isSignedInRouteCandidate &&
          session.accountAccessState === 'active' &&
          session.profileCompletionState === 'complete'
        ? 'homeHeader'
        : String(segments[0] ?? '') === 'setup-account'
          ? 'identityAvatar'
          : String(segments[0] ?? '') === '(tabs)' || String(segments[0] ?? '') === 'home'
            ? 'homeHeader'
            : String(segments[0] ?? '') === 'join' ||
                String(segments[0] ?? '') === 'invite' ||
                String(segments[0] ?? '') === 'reset-password'
              ? 'identity'
              : 'none';
  const target =
    targetPreference === 'homeHeader'
      ? firstLaunchTargetOfKind(targets, 'headerBrand')
      : targetPreference === 'identityAvatar'
        ? (firstLaunchTargetOfKind(targets, 'identityAvatar') ?? firstIdentityLaunchTarget(targets))
        : targetPreference === 'identity'
          ? firstIdentityLaunchTarget(targets)
          : null;
  const [visible, setVisible] = useState(true);
  const [finishRequested, setFinishRequested] = useState(false);
  const [landingTarget, setLandingTarget] = useState<LaunchIntroTargetSnapshot | null>(null);
  const [landingTargetLocked, setLandingTargetLocked] = useState(false);
  const [lockupState, setLockupState] = useState<BrandVerificationState>('loading');
  const mountedAtRef = useRef(Date.now());
  const homeReadyVersionAtStartRef = useRef(getHomeEntryReadyVersion());
  const latestTargetRef = useRef<LaunchIntroTargetSnapshot | null>(target);
  const latestTargetPreferenceRef = useRef(targetPreference);
  const introMotion = useRef(new Animated.Value(1)).current;
  const landMotion = useRef(new Animated.Value(0)).current;
  const reducedExitMotion = useRef(new Animated.Value(0)).current;
  const handoffMotion = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    latestTargetRef.current = target;
    latestTargetPreferenceRef.current = targetPreference;
  }, [target, targetPreference]);

  useEffect(() => {
    if (reducedMotion) {
      introMotion.setValue(1);
      setLockupState('idle');
      return undefined;
    }

    setLockupState('loading');
    Animated.timing(introMotion, {
      duration: 620,
      easing: LAUNCH_EASING,
      toValue: 1,
      useNativeDriver: SHOULD_USE_NATIVE_DRIVER,
    }).start();

    return undefined;
  }, [introMotion, reducedMotion]);

  useEffect(() => {
    if (session.status !== 'loading' && !finishRequested) {
      setFinishRequested(true);
    }
  }, [finishRequested, session.status]);

  useEffect(() => {
    if (session.status !== 'loading' || finishRequested) {
      return undefined;
    }

    const timer = setTimeout(() => {
      setFinishRequested(true);
    }, LAUNCH_SESSION_MAX_WAIT_MS);

    return () => clearTimeout(timer);
  }, [finishRequested, session.status]);

  useEffect(() => {
    if (!finishRequested) {
      return undefined;
    }

    let active = true;
    const completionTimers = new Set<ReturnType<typeof setTimeout>>();
    let completing = false;

    async function finishIntro() {
      const elapsed = Date.now() - mountedAtRef.current;
      if (!reducedMotion && elapsed < LAUNCH_INTRO_MIN_MS) {
        await wait(LAUNCH_INTRO_MIN_MS - elapsed);
      }

      if (!active) {
        return;
      }

      function completeIntro(options?: { readonly immediate?: boolean }) {
        if (!active || completing) {
          return;
        }

        completing = true;

        if (options?.immediate) {
          setVisible(false);
          onVisibleChange(false);
          return;
        }

        void waitForNextFrame().then(() => {
          if (!active) {
            return;
          }

          const fadeDuration = reducedMotion ? 90 : 140;
          const fadeFallbackTimer = setTimeout(() => {
            completionTimers.delete(fadeFallbackTimer);
            if (!active) {
              return;
            }

            setVisible(false);
            onVisibleChange(false);
          }, fadeDuration + 220);
          completionTimers.add(fadeFallbackTimer);
          Animated.timing(handoffMotion, {
            duration: fadeDuration,
            easing: Easing.out(Easing.quad),
            toValue: 1,
            useNativeDriver: SHOULD_USE_NATIVE_DRIVER,
          }).start(() => {
            clearTimeout(fadeFallbackTimer);
            completionTimers.delete(fadeFallbackTimer);
            if (!active) {
              return;
            }

            setVisible(false);
            onVisibleChange(false);
          });
        });
      }

      function scheduleCompletionFallback(
        duration: number,
        options?: { readonly immediate?: boolean },
      ) {
        const timer = setTimeout(() => {
          completionTimers.delete(timer);
          completeIntro(options);
        }, duration + 180);

        completionTimers.add(timer);
        return timer;
      }

      async function waitForHomeReadyIfNeeded() {
        if (latestTargetPreferenceRef.current !== 'homeHeader') {
          return;
        }

        await waitForHomeEntryReadyAfter(homeReadyVersionAtStartRef.current);
      }

      async function waitForLandingTarget(minimumStableAt = 0) {
        requestLaunchTargetRemeasure();
        const startedAt = Date.now();
        const waitMs =
          latestTargetPreferenceRef.current === 'homeHeader'
            ? LAUNCH_HOME_TARGET_WAIT_MS
            : LAUNCH_TARGET_WAIT_MS;
        let previousTarget: LaunchIntroTargetSnapshot | null = null;
        let stableSamples = 0;

        while (active && Date.now() - startedAt < waitMs) {
          const currentTarget = latestTargetRef.current;

          if (currentTarget && currentTarget.stableAt >= minimumStableAt) {
            if (isSameStableLaunchTarget(previousTarget, currentTarget)) {
              stableSamples += 1;
            } else {
              stableSamples = 1;
            }

            previousTarget = currentTarget;

            if (stableSamples >= LAUNCH_TARGET_STABLE_SAMPLES) {
              return currentTarget;
            }
          }

          await waitForNextFrame();
        }

        const fallbackTarget = latestTargetRef.current;
        return fallbackTarget && fallbackTarget.stableAt >= minimumStableAt ? fallbackTarget : null;
      }

      if (reducedMotion) {
        await wait(LAUNCH_ROUTE_SETTLE_MS);

        if (!active) {
          return;
        }

        await waitForHomeReadyIfNeeded();
        if (!active) {
          return;
        }

        const nextLandingTarget = await waitForLandingTarget(
          latestTargetPreferenceRef.current === 'homeHeader' ? Date.now() : 0,
        );
        if (!active) {
          return;
        }

        setLandingTarget(nextLandingTarget);
        setLandingTargetLocked(true);
        setLockupState(nextLandingTarget?.visualState ?? 'idle');
        await waitForNextFrame();

        if (!active) {
          return;
        }

        const completionOptions = { immediate: Boolean(nextLandingTarget) };
        const completionTimer = scheduleCompletionFallback(
          LAUNCH_REDUCED_MOTION_EXIT_MS,
          completionOptions,
        );
        Animated.timing(reducedExitMotion, {
          duration: LAUNCH_REDUCED_MOTION_EXIT_MS,
          easing: Easing.out(Easing.quad),
          toValue: 1,
          useNativeDriver: SHOULD_USE_NATIVE_DRIVER,
        }).start(({ finished }) => {
          if (finished) {
            clearTimeout(completionTimer);
            completionTimers.delete(completionTimer);
            completeIntro(completionOptions);
          }
        });
        return;
      }

      await wait(LAUNCH_ROUTE_SETTLE_MS);

      if (!active) {
        return;
      }

      await waitForHomeReadyIfNeeded();
      if (!active) {
        return;
      }

      const nextLandingTarget = await waitForLandingTarget(
        latestTargetPreferenceRef.current === 'homeHeader' ? Date.now() : 0,
      );
      if (!active) {
        return;
      }

      setLandingTarget(nextLandingTarget);
      setLandingTargetLocked(true);
      await waitForNextFrame();

      if (!active) {
        return;
      }

      setLockupState('idle');
      await waitForNextFrame();

      if (!active) {
        return;
      }

      const landDuration = nextLandingTarget ? LAUNCH_LAND_MS : LAUNCH_REDUCED_MOTION_EXIT_MS + 220;
      const completionOptions = { immediate: Boolean(nextLandingTarget) };
      const completionTimer = scheduleCompletionFallback(landDuration, completionOptions);
      Animated.timing(landMotion, {
        duration: landDuration,
        easing: LAUNCH_EASING,
        toValue: 1,
        useNativeDriver: SHOULD_USE_NATIVE_DRIVER,
      }).start(({ finished }) => {
        if (finished) {
          clearTimeout(completionTimer);
          completionTimers.delete(completionTimer);
          completeIntro(completionOptions);
        }
      });
    }

    void finishIntro();

    return () => {
      active = false;
      completionTimers.forEach((timer) => clearTimeout(timer));
      completionTimers.clear();
    };
  }, [
    finishRequested,
    handoffMotion,
    landMotion,
    onVisibleChange,
    reducedExitMotion,
    reducedMotion,
  ]);

  if (!visible) {
    return null;
  }

  const introOpacity = introMotion.interpolate({
    inputRange: [0, 0.35, 1],
    outputRange: [0, 0.8, 1],
  });
  const introScale = introMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [0.96, 1],
  });
  const activeTarget = landingTargetLocked ? landingTarget : target;
  const targetCenterX = activeTarget ? activeTarget.x + activeTarget.width / 2 : width / 2;
  const targetCenterY = activeTarget ? activeTarget.y + activeTarget.height / 2 : height / 2;
  const targetScale = activeTarget ? activeTarget.stageSize / LAUNCH_LOGO_SIZE : 1;
  const landTranslateX = landMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [0, targetCenterX - width / 2],
  });
  const landTranslateY = landMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [0, targetCenterY - height / 2],
  });
  const landingScale = landMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [1, targetScale],
  });
  const fallbackLogoOpacity = landMotion.interpolate({
    inputRange: [0, 0.9, 1],
    outputRange: [1, 0.45, 0],
  });
  const logoGroupOpacity = activeTarget
    ? introOpacity
    : Animated.multiply(introOpacity, fallbackLogoOpacity);
  const markOpacity = landMotion.interpolate({
    inputRange: [0, 0.9, 1],
    outputRange: activeTarget?.visualKind === 'headerBrand' ? [1, 1, 0] : [1, 1, 1],
  });
  const logoScale = Animated.multiply(introScale, landingScale);
  const overlayFadeOpacity = landMotion.interpolate({
    inputRange: [0, 0.72, 1],
    outputRange: [1, 1, 0],
  });
  const reducedOverlayOpacity = reducedExitMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });
  const overlayOpacity = reducedMotion ? reducedOverlayOpacity : overlayFadeOpacity;
  const backdropOpacity = activeTarget ? 1 : reducedMotion ? 1 : overlayFadeOpacity;
  const handoffOpacity = handoffMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });
  const rootOpacity = activeTarget
    ? handoffOpacity
    : Animated.multiply(overlayOpacity, handoffOpacity);
  const headerGlyphOpacity = landMotion.interpolate({
    inputRange: [0, 0.9, 1],
    outputRange: activeTarget?.visualKind === 'headerBrand' ? [0, 0, 1] : [0, 0, 0],
  });
  const avatarSize =
    activeTarget?.visualKind === 'identityAvatar'
      ? (activeTarget.avatarSize ?? IDENTITY_FLOW_PROFILE_AVATAR_SIZE)
      : 0;
  const avatarOffset = (LAUNCH_LOGO_SIZE - avatarSize) / 2;
  const avatarOpacity = landMotion.interpolate({
    inputRange: [0, 0.25, 0.78, 1],
    outputRange: [0, 0, 1, 1],
  });
  const avatarScale = landMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [0.94, 1],
  });
  const launchCenterGlyphSize =
    activeTarget?.centerFaceSize === 'small' ? IDENTITY_FLOW_COMPACT_FACE_SIZE : undefined;
  const launchCenterGlyphViewBox =
    activeTarget?.centerFaceSize === 'large' ? IDENTITY_FLOW_LARGE_FACE_VIEW_BOX : undefined;

  return (
    <Animated.View
      accessibilityLabel="Happy Circles esta iniciando"
      pointerEvents="auto"
      style={[styles.launchOverlay, { opacity: rootOpacity }]}
    >
      <Animated.View
        style={[
          styles.launchOverlayBackdrop,
          { backgroundColor: activeTheme.colors.background, opacity: backdropOpacity },
        ]}
      />
      <Animated.View
        style={[
          styles.launchLogoGroup,
          {
            height: LAUNCH_LOGO_SIZE,
            left: width / 2 - LAUNCH_LOGO_SIZE / 2,
            opacity: logoGroupOpacity,
            top: height / 2 - LAUNCH_LOGO_SIZE / 2,
            transform: [{ translateX: landTranslateX }, { translateY: landTranslateY }],
            width: LAUNCH_LOGO_SIZE,
          },
        ]}
      >
        <Animated.View style={{ transform: [{ scale: logoScale }] }}>
          <Animated.View style={{ opacity: markOpacity }}>
            <BrandVerificationMark
              centerGlyphSize={launchCenterGlyphSize}
              centerGlyphViewBox={launchCenterGlyphViewBox}
              outerRotationDegrees={activeTarget?.outerRotationDegrees ?? 0}
              showOuterInIdle
              size={LAUNCH_LOGO_SIZE}
              state={lockupState}
            />
          </Animated.View>
          {activeTarget?.visualKind === 'headerBrand' ? (
            <Animated.View style={[styles.launchHeaderGlyphLayer, { opacity: headerGlyphOpacity }]}>
              <HappyCirclesGlyph size={LAUNCH_LOGO_SIZE} />
            </Animated.View>
          ) : null}
          {activeTarget?.visualKind === 'identityAvatar' ? (
            <Animated.View
              style={[
                styles.launchAvatarLayer,
                {
                  height: avatarSize,
                  left: avatarOffset,
                  opacity: avatarOpacity,
                  top: avatarOffset,
                  transform: [{ scale: avatarScale }],
                  width: avatarSize,
                },
              ]}
            >
              <AppAvatar
                fallbackBackgroundColor={activeTarget.avatarFallbackBackgroundColor}
                fallbackTextColor={activeTarget.avatarFallbackTextColor}
                imageUrl={activeTarget.avatarUrl ?? null}
                label={activeTarget.avatarLabel ?? 'Tu perfil'}
                size={avatarSize}
              />
            </Animated.View>
          ) : null}
          {activeTarget?.visualKind === 'identityAvatar' && activeTarget.avatarEditable ? (
            <Animated.View
              pointerEvents="none"
              style={[styles.launchAvatarEditPencil, { opacity: avatarOpacity }]}
            >
              <Ionicons color={theme.colors.white} name="pencil" size={15} />
            </Animated.View>
          ) : null}
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

function HomeEntryHandoffOverlay({
  disabled,
  onVisibleChange,
}: {
  readonly disabled: boolean;
  readonly onVisibleChange: (visible: boolean) => void;
}) {
  const activeTheme = useAppTheme();
  const reducedMotion = useReducedMotion();
  const targets = useLaunchIntroTargets();
  const { height, width } = useWindowDimensions();
  const homeTarget = firstLaunchTargetOfKind(targets, 'headerBrand');
  const currentSourceTarget = firstHomeEntrySourceTarget(targets);
  const [visible, setVisible] = useState(false);
  const [requestId, setRequestId] = useState(0);
  const [requestReadyVersionAtStart, setRequestReadyVersionAtStart] = useState(0);
  const [requestStartedAt, setRequestStartedAt] = useState(0);
  const [sourceTarget, setSourceTarget] = useState<LaunchIntroTargetSnapshot | null>(null);
  const [landingTarget, setLandingTarget] = useState<LaunchIntroTargetSnapshot | null>(null);
  const [landingTargetLocked, setLandingTargetLocked] = useState(false);
  const [lockupState, setLockupState] = useState<BrandVerificationState>('loading');
  const latestHomeTargetRef = useRef<LaunchIntroTargetSnapshot | null>(homeTarget);
  const latestSourceTargetRef = useRef<LaunchIntroTargetSnapshot | null>(currentSourceTarget);
  const entryMotion = useRef(new Animated.Value(0)).current;
  const sourceCenterMotion = useRef(new Animated.Value(1)).current;
  const landMotion = useRef(new Animated.Value(0)).current;
  const handoffMotion = useRef(new Animated.Value(0)).current;
  const reducedExitMotion = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    latestHomeTargetRef.current = homeTarget;
    latestSourceTargetRef.current = currentSourceTarget;
  }, [currentSourceTarget, homeTarget]);

  useEffect(
    () =>
      subscribeHomeEntryHandoff((request) => {
        if (disabled) {
          return;
        }

        entryMotion.stopAnimation();
        sourceCenterMotion.stopAnimation();
        landMotion.stopAnimation();
        handoffMotion.stopAnimation();
        reducedExitMotion.stopAnimation();
        const nextSourceTarget = latestSourceTargetRef.current;
        entryMotion.setValue(nextSourceTarget ? 1 : 0);
        sourceCenterMotion.setValue(nextSourceTarget ? 0 : 1);
        landMotion.setValue(0);
        handoffMotion.setValue(0);
        reducedExitMotion.setValue(0);
        setSourceTarget(nextSourceTarget);
        setLandingTarget(null);
        setLandingTargetLocked(false);
        setLockupState('loading');
        setVisible(true);
        onVisibleChange(true);
        setRequestReadyVersionAtStart(request.readyVersionAtStart);
        setRequestStartedAt(request.startedAt);
        setRequestId(request.id);

        const sourceCenterX = nextSourceTarget
          ? nextSourceTarget.x + nextSourceTarget.width / 2
          : width / 2;
        const sourceCenterY = nextSourceTarget
          ? nextSourceTarget.y + nextSourceTarget.height / 2
          : height / 2;
        const sourceNeedsCentering =
          nextSourceTarget &&
          (Math.abs(sourceCenterX - width / 2) > HOME_ENTRY_SOURCE_CENTER_THRESHOLD ||
            Math.abs(sourceCenterY - height / 2) > HOME_ENTRY_SOURCE_CENTER_THRESHOLD);

        if (!nextSourceTarget) {
          Animated.timing(entryMotion, {
            duration: reducedMotion ? 80 : 180,
            easing: Easing.out(Easing.quad),
            toValue: 1,
            useNativeDriver: SHOULD_USE_NATIVE_DRIVER,
          }).start(({ finished }) => {
            if (finished) {
              request.completeSourceCentering();
            }
          });
        } else if (sourceNeedsCentering && !reducedMotion) {
          Animated.timing(sourceCenterMotion, {
            duration: HOME_ENTRY_SOURCE_CENTER_MS,
            easing: Easing.out(Easing.cubic),
            toValue: 1,
            useNativeDriver: SHOULD_USE_NATIVE_DRIVER,
          }).start(({ finished }) => {
            if (finished) {
              request.completeSourceCentering();
            }
          });
        } else {
          sourceCenterMotion.setValue(1);
          request.completeSourceCentering();
        }
      }),
    [
      disabled,
      entryMotion,
      handoffMotion,
      height,
      landMotion,
      onVisibleChange,
      reducedExitMotion,
      reducedMotion,
      sourceCenterMotion,
      width,
    ],
  );

  useEffect(() => {
    if (!visible || requestId === 0) {
      return undefined;
    }

    let active = true;
    const completionTimers = new Set<ReturnType<typeof setTimeout>>();
    let completing = false;

    function completeHandoff(options?: { readonly immediate?: boolean }) {
      if (!active || completing) {
        return;
      }

      completing = true;

      void waitForNextFrame().then(() => {
        if (!active) {
          return;
        }

        if (options?.immediate) {
          setVisible(false);
          onVisibleChange(false);
          return;
        }

        function finishHandoffVisibility() {
          if (!active) {
            return;
          }

          setVisible(false);
          onVisibleChange(false);
        }

        const fadeFallbackTimer = setTimeout(() => {
          completionTimers.delete(fadeFallbackTimer);
          finishHandoffVisibility();
        }, HOME_ENTRY_FADE_MS + 220);
        completionTimers.add(fadeFallbackTimer);
        Animated.timing(handoffMotion, {
          duration: HOME_ENTRY_FADE_MS,
          easing: Easing.out(Easing.quad),
          toValue: 1,
          useNativeDriver: SHOULD_USE_NATIVE_DRIVER,
        }).start(() => {
          clearTimeout(fadeFallbackTimer);
          completionTimers.delete(fadeFallbackTimer);
          finishHandoffVisibility();
        });
      });
    }

    function scheduleCompletionFallback(
      duration: number,
      options?: { readonly immediate?: boolean },
    ) {
      const timer = setTimeout(() => {
        completionTimers.delete(timer);
        completeHandoff(options);
      }, duration + 220);

      completionTimers.add(timer);
      return timer;
    }

    async function waitForHomeTarget(minimumStableAt: number) {
      requestLaunchTargetRemeasure();
      const startedAt = Date.now();
      let previousTarget: LaunchIntroTargetSnapshot | null = null;
      let stableSamples = 0;

      while (active && Date.now() - startedAt < LAUNCH_HOME_TARGET_WAIT_MS) {
        const currentTarget = latestHomeTargetRef.current;

        if (currentTarget && currentTarget.stableAt >= minimumStableAt) {
          if (isSameStableLaunchTarget(previousTarget, currentTarget)) {
            stableSamples += 1;
          } else {
            stableSamples = 1;
          }

          previousTarget = currentTarget;

          if (stableSamples >= LAUNCH_TARGET_STABLE_SAMPLES) {
            return currentTarget;
          }
        }

        await waitForNextFrame();
      }

      const fallbackTarget = latestHomeTargetRef.current;
      return fallbackTarget && fallbackTarget.stableAt >= minimumStableAt ? fallbackTarget : null;
    }

    async function runHandoff() {
      if (reducedMotion) {
        await wait(HOME_ENTRY_ROUTE_SETTLE_MS);

        if (!active) {
          return;
        }

        await waitForHomeEntryReadyAfter(requestReadyVersionAtStart);
        const nextTarget = await waitForHomeTarget(Math.max(requestStartedAt, Date.now()));
        if (!active) {
          return;
        }

        setLandingTarget(nextTarget);
        setLandingTargetLocked(true);
        setLockupState('idle');
        await waitForNextFrame();

        if (!active) {
          return;
        }

        const completionOptions = { immediate: Boolean(nextTarget) };
        const completionTimer = scheduleCompletionFallback(
          HOME_ENTRY_REDUCED_MOTION_EXIT_MS,
          completionOptions,
        );
        Animated.timing(reducedExitMotion, {
          duration: HOME_ENTRY_REDUCED_MOTION_EXIT_MS,
          easing: Easing.out(Easing.quad),
          toValue: 1,
          useNativeDriver: SHOULD_USE_NATIVE_DRIVER,
        }).start(({ finished }) => {
          if (finished) {
            clearTimeout(completionTimer);
            completionTimers.delete(completionTimer);
            completeHandoff(completionOptions);
          }
        });
        return;
      }

      await wait(HOME_ENTRY_SPIN_MS);

      if (!active) {
        return;
      }

      await wait(HOME_ENTRY_ROUTE_SETTLE_MS);

      if (!active) {
        return;
      }

      await waitForHomeEntryReadyAfter(requestReadyVersionAtStart);
      const nextTarget = await waitForHomeTarget(Math.max(requestStartedAt, Date.now()));
      if (!active) {
        return;
      }

      setLandingTarget(nextTarget);
      setLandingTargetLocked(true);
      await waitForNextFrame();

      if (!active) {
        return;
      }

      setLockupState('idle');
      await waitForNextFrame();

      if (!active) {
        return;
      }

      const duration = nextTarget ? HOME_ENTRY_LAND_MS : HOME_ENTRY_REDUCED_MOTION_EXIT_MS + 220;
      const completionOptions = { immediate: Boolean(nextTarget) };
      const completionTimer = scheduleCompletionFallback(duration, completionOptions);
      Animated.timing(landMotion, {
        duration,
        easing: LAUNCH_EASING,
        toValue: 1,
        useNativeDriver: SHOULD_USE_NATIVE_DRIVER,
      }).start(({ finished }) => {
        if (finished) {
          clearTimeout(completionTimer);
          completionTimers.delete(completionTimer);
          completeHandoff(completionOptions);
        }
      });
    }

    void runHandoff();

    return () => {
      active = false;
      completionTimers.forEach((timer) => clearTimeout(timer));
      completionTimers.clear();
    };
  }, [
    handoffMotion,
    landMotion,
    onVisibleChange,
    reducedExitMotion,
    reducedMotion,
    requestId,
    requestReadyVersionAtStart,
    requestStartedAt,
    visible,
  ]);

  if (!visible) {
    return null;
  }

  const activeTarget = landingTargetLocked ? landingTarget : homeTarget;
  const visualSourceTarget = sourceTarget ?? activeTarget;
  const sourceOriginCenterX = sourceTarget ? sourceTarget.x + sourceTarget.width / 2 : width / 2;
  const sourceOriginCenterY = sourceTarget ? sourceTarget.y + sourceTarget.height / 2 : height / 2;
  const sourceCenterOffsetX = sourceTarget ? width / 2 - sourceOriginCenterX : 0;
  const sourceCenterOffsetY = sourceTarget ? height / 2 - sourceOriginCenterY : 0;
  const centeredSourceCenterX = sourceOriginCenterX + sourceCenterOffsetX;
  const centeredSourceCenterY = sourceOriginCenterY + sourceCenterOffsetY;
  const sourceScale = sourceTarget ? sourceTarget.stageSize / LAUNCH_LOGO_SIZE : 1;
  const targetCenterX = activeTarget
    ? activeTarget.x + activeTarget.width / 2
    : centeredSourceCenterX;
  const targetCenterY = activeTarget
    ? activeTarget.y + activeTarget.height / 2
    : centeredSourceCenterY;
  const sourceCenterTranslateX = sourceCenterMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [0, sourceCenterOffsetX],
  });
  const sourceCenterTranslateY = sourceCenterMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [0, sourceCenterOffsetY],
  });
  const targetScale = activeTarget ? activeTarget.stageSize / LAUNCH_LOGO_SIZE : sourceScale;
  const landTranslateX = landMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [0, targetCenterX - centeredSourceCenterX],
  });
  const landTranslateY = landMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [0, targetCenterY - centeredSourceCenterY],
  });
  const totalTranslateX = Animated.add(sourceCenterTranslateX, landTranslateX);
  const totalTranslateY = Animated.add(sourceCenterTranslateY, landTranslateY);
  const landingScale = landMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [sourceScale, targetScale],
  });
  const entryScale = entryMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [sourceTarget ? 1 : 0.96, 1],
  });
  const logoScale = Animated.multiply(entryScale, landingScale);
  const fallbackBackdropOpacity = reducedMotion
    ? reducedExitMotion.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 0],
      })
    : 1;
  const backdropOpacity = activeTarget
    ? entryMotion
    : Animated.multiply(entryMotion, fallbackBackdropOpacity);
  const rootOpacity = handoffMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });
  const sourceAvatarSize =
    visualSourceTarget?.visualKind === 'identityAvatar'
      ? (visualSourceTarget.avatarSize ?? IDENTITY_FLOW_PROFILE_AVATAR_SIZE)
      : undefined;
  const sourceCenterGlyphSize =
    visualSourceTarget?.visualKind === 'identityMark' &&
    visualSourceTarget.centerFaceSize === 'small'
      ? IDENTITY_FLOW_COMPACT_FACE_SIZE
      : undefined;
  const sourceCenterGlyphViewBox =
    visualSourceTarget?.visualKind === 'identityMark' &&
    visualSourceTarget.centerFaceSize === 'large'
      ? IDENTITY_FLOW_LARGE_FACE_VIEW_BOX
      : undefined;
  const sourceAvatarCenter =
    visualSourceTarget?.visualKind === 'identityAvatar' && sourceAvatarSize ? (
      <AppAvatar
        fallbackBackgroundColor={visualSourceTarget.avatarFallbackBackgroundColor}
        fallbackTextColor={visualSourceTarget.avatarFallbackTextColor}
        imageUrl={visualSourceTarget.avatarUrl ?? null}
        label={visualSourceTarget.avatarLabel ?? 'Tu perfil'}
        size={sourceAvatarSize}
      />
    ) : undefined;
  const hasHomeEntrySourceCenter = Boolean(
    sourceAvatarCenter || visualSourceTarget?.visualKind === 'identityMark',
  );
  const sourceCenterOpacity = landMotion.interpolate({
    inputRange: [0, 0.72, 0.92, 1],
    outputRange: activeTarget && hasHomeEntrySourceCenter ? [1, 1, 0, 0] : [1, 1, 1, 1],
  });
  const homeHeaderCenterOpacity = landMotion.interpolate({
    inputRange: [0, 0.72, 1],
    outputRange: activeTarget ? (hasHomeEntrySourceCenter ? [0, 0, 1] : [1, 1, 1]) : [0, 0, 0],
  });
  const homeHeaderPalette = resolveHappyCirclesPalette('brand');
  const homeHeaderCenter = activeTarget ? (
    <View style={styles.launchHomeCenterMorph}>
      {sourceAvatarCenter && sourceAvatarSize ? (
        <Animated.View
          style={[
            styles.launchHomeCenterLayer,
            {
              height: sourceAvatarSize,
              left: (LAUNCH_LOGO_SIZE - sourceAvatarSize) / 2,
              opacity: sourceCenterOpacity,
              top: (LAUNCH_LOGO_SIZE - sourceAvatarSize) / 2,
              width: sourceAvatarSize,
            },
          ]}
        >
          {sourceAvatarCenter}
        </Animated.View>
      ) : visualSourceTarget?.visualKind === 'identityMark' ? (
        <Animated.View
          style={[
            styles.launchHomeCenterLayer,
            {
              height: sourceCenterGlyphSize ?? LAUNCH_LOGO_SIZE,
              left: (LAUNCH_LOGO_SIZE - (sourceCenterGlyphSize ?? LAUNCH_LOGO_SIZE)) / 2,
              opacity: sourceCenterOpacity,
              top: (LAUNCH_LOGO_SIZE - (sourceCenterGlyphSize ?? LAUNCH_LOGO_SIZE)) / 2,
              width: sourceCenterGlyphSize ?? LAUNCH_LOGO_SIZE,
            },
          ]}
        >
          <HappyCirclesCenterSvg
            palette={homeHeaderPalette}
            size={sourceCenterGlyphSize ?? LAUNCH_LOGO_SIZE}
            viewBox={sourceCenterGlyphViewBox}
          />
        </Animated.View>
      ) : null}
      <Animated.View
        style={[styles.launchHomeCenterLayer, { opacity: homeHeaderCenterOpacity }]}
      >
        <HappyCirclesCenterSvg palette={homeHeaderPalette} size={LAUNCH_LOGO_SIZE} />
      </Animated.View>
    </View>
  ) : (
    sourceAvatarCenter
  );
  const homeEntryOuterRotationDegrees = activeTarget
    ? (activeTarget.outerRotationDegrees ?? 0)
    : (visualSourceTarget?.outerRotationDegrees ?? 0);

  return (
    <Animated.View
      accessibilityLabel="Happy Circles esta entrando al inicio"
      pointerEvents="auto"
      style={[styles.launchOverlay, { opacity: rootOpacity }]}
    >
      <Animated.View
        style={[
          styles.launchOverlayBackdrop,
          { backgroundColor: activeTheme.colors.background, opacity: backdropOpacity },
        ]}
      />
      <Animated.View
        style={[
          styles.launchLogoGroup,
          {
            height: LAUNCH_LOGO_SIZE,
            left: sourceOriginCenterX - LAUNCH_LOGO_SIZE / 2,
            opacity: entryMotion,
            top: sourceOriginCenterY - LAUNCH_LOGO_SIZE / 2,
            transform: [{ translateX: totalTranslateX }, { translateY: totalTranslateY }],
            width: LAUNCH_LOGO_SIZE,
          },
        ]}
      >
        <Animated.View style={{ transform: [{ scale: logoScale }] }}>
          <Animated.View>
            <BrandVerificationMark
              center={homeHeaderCenter}
              centerGlyphSize={sourceCenterGlyphSize}
              centerGlyphViewBox={sourceCenterGlyphViewBox}
              centerSize={activeTarget ? LAUNCH_LOGO_SIZE : sourceAvatarSize}
              outerRotationDegrees={homeEntryOuterRotationDegrees}
              replaceCenterOnResult={
                visualSourceTarget?.visualKind === 'identityAvatar'
                  ? !visualSourceTarget.avatarEditable
                  : undefined
              }
              showOuterInIdle
              size={LAUNCH_LOGO_SIZE}
              state={lockupState}
            />
          </Animated.View>
          {visualSourceTarget?.visualKind === 'identityAvatar' &&
          visualSourceTarget.avatarEditable ? (
            <Animated.View
              pointerEvents="none"
              style={[styles.launchAvatarEditPencil, { opacity: sourceCenterOpacity }]}
            >
              <Ionicons color={theme.colors.white} name="pencil" size={15} />
            </Animated.View>
          ) : null}
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

function SetupEntryHandoffOverlay({
  disabled,
  onVisibleChange,
}: {
  readonly disabled: boolean;
  readonly onVisibleChange: (visible: boolean) => void;
}) {
  const activeTheme = useAppTheme();
  const reducedMotion = useReducedMotion();
  const targets = useLaunchIntroTargets();
  const { height, width } = useWindowDimensions();
  const setupTarget = firstLaunchTargetOfKind(targets, 'identityAvatar');
  const currentSourceTarget = firstIdentityLaunchTarget(targets);
  const [visible, setVisible] = useState(false);
  const [requestId, setRequestId] = useState(0);
  const [sourceTarget, setSourceTarget] = useState<LaunchIntroTargetSnapshot | null>(null);
  const [landingTarget, setLandingTarget] = useState<LaunchIntroTargetSnapshot | null>(null);
  const [landingTargetLocked, setLandingTargetLocked] = useState(false);
  const [lockupState, setLockupState] = useState<BrandVerificationState>('loading');
  const latestSetupTargetRef = useRef<LaunchIntroTargetSnapshot | null>(setupTarget);
  const latestSourceTargetRef = useRef<LaunchIntroTargetSnapshot | null>(currentSourceTarget);
  const entryMotion = useRef(new Animated.Value(0)).current;
  const landMotion = useRef(new Animated.Value(0)).current;
  const handoffMotion = useRef(new Animated.Value(0)).current;
  const reducedExitMotion = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    latestSetupTargetRef.current = setupTarget;
    latestSourceTargetRef.current = currentSourceTarget;
  }, [currentSourceTarget, setupTarget]);

  useEffect(
    () =>
      subscribeSetupEntryHandoff((request) => {
        if (disabled) {
          return;
        }

        entryMotion.stopAnimation();
        landMotion.stopAnimation();
        handoffMotion.stopAnimation();
        reducedExitMotion.stopAnimation();
        const nextSourceTarget = latestSourceTargetRef.current;
        entryMotion.setValue(nextSourceTarget ? 1 : 0);
        landMotion.setValue(0);
        handoffMotion.setValue(0);
        reducedExitMotion.setValue(0);
        setSourceTarget(nextSourceTarget);
        setLandingTarget(null);
        setLandingTargetLocked(false);
        setLockupState('loading');
        setVisible(true);
        onVisibleChange(true);
        setRequestId(request.id);

        if (!nextSourceTarget) {
          Animated.timing(entryMotion, {
            duration: reducedMotion ? 80 : 180,
            easing: Easing.out(Easing.quad),
            toValue: 1,
            useNativeDriver: SHOULD_USE_NATIVE_DRIVER,
          }).start();
        }
      }),
    [
      disabled,
      entryMotion,
      handoffMotion,
      landMotion,
      onVisibleChange,
      reducedExitMotion,
      reducedMotion,
    ],
  );

  useEffect(() => {
    if (!visible || requestId === 0) {
      return undefined;
    }

    let active = true;
    const completionTimers = new Set<ReturnType<typeof setTimeout>>();
    let completing = false;

    function completeHandoff(options?: { readonly immediate?: boolean }) {
      if (!active || completing) {
        return;
      }

      completing = true;

      if (options?.immediate) {
        setVisible(false);
        onVisibleChange(false);
        return;
      }

      void waitForNextFrame().then(() => {
        if (!active) {
          return;
        }

        const fadeFallbackTimer = setTimeout(() => {
          completionTimers.delete(fadeFallbackTimer);
          if (active) {
            setVisible(false);
            onVisibleChange(false);
          }
        }, SETUP_ENTRY_FADE_MS + 220);
        completionTimers.add(fadeFallbackTimer);
        Animated.timing(handoffMotion, {
          duration: SETUP_ENTRY_FADE_MS,
          easing: Easing.out(Easing.quad),
          toValue: 1,
          useNativeDriver: SHOULD_USE_NATIVE_DRIVER,
        }).start(() => {
          clearTimeout(fadeFallbackTimer);
          completionTimers.delete(fadeFallbackTimer);
          if (active) {
            setVisible(false);
            onVisibleChange(false);
          }
        });
      });
    }

    function scheduleCompletionFallback(
      duration: number,
      options?: { readonly immediate?: boolean },
    ) {
      const timer = setTimeout(() => {
        completionTimers.delete(timer);
        completeHandoff(options);
      }, duration + 220);

      completionTimers.add(timer);
      return timer;
    }

    async function waitForSetupTarget() {
      const startedAt = Date.now();
      let previousTarget: LaunchIntroTargetSnapshot | null = null;
      let stableSamples = 0;

      while (active && Date.now() - startedAt < SETUP_ENTRY_TARGET_WAIT_MS) {
        const currentTarget = latestSetupTargetRef.current;

        if (currentTarget && currentTarget.id !== sourceTarget?.id) {
          if (isSameStableLaunchTarget(previousTarget, currentTarget)) {
            stableSamples += 1;
          } else {
            stableSamples = 1;
          }

          previousTarget = currentTarget;

          if (stableSamples >= LAUNCH_TARGET_STABLE_SAMPLES) {
            return currentTarget;
          }
        }

        await waitForNextFrame();
      }

      const fallbackTarget = latestSetupTargetRef.current;
      return fallbackTarget && fallbackTarget.id !== sourceTarget?.id ? fallbackTarget : null;
    }

    async function runHandoff() {
      if (reducedMotion) {
        await wait(SETUP_ENTRY_ROUTE_SETTLE_MS);

        if (!active) {
          return;
        }

        const nextTarget = await waitForSetupTarget();
        if (!active) {
          return;
        }

        setLandingTarget(nextTarget);
        setLandingTargetLocked(true);
        setLockupState(nextTarget?.visualState ?? 'idle');
        await waitForNextFrame();

        if (!active) {
          return;
        }

        const completionOptions = { immediate: Boolean(nextTarget) };
        const completionTimer = scheduleCompletionFallback(
          SETUP_ENTRY_REDUCED_MOTION_EXIT_MS,
          completionOptions,
        );
        Animated.timing(reducedExitMotion, {
          duration: SETUP_ENTRY_REDUCED_MOTION_EXIT_MS,
          easing: Easing.out(Easing.quad),
          toValue: 1,
          useNativeDriver: SHOULD_USE_NATIVE_DRIVER,
        }).start(({ finished }) => {
          if (finished) {
            clearTimeout(completionTimer);
            completionTimers.delete(completionTimer);
            completeHandoff(completionOptions);
          }
        });
        return;
      }

      await wait(SETUP_ENTRY_SPIN_MS);

      if (!active) {
        return;
      }

      setLockupState('success');
      await wait(SETUP_ENTRY_SUCCESS_MS);
      setLockupState('idle');
      await wait(SETUP_ENTRY_ROUTE_SETTLE_MS);

      if (!active) {
        return;
      }

      const nextTarget = await waitForSetupTarget();
      if (!active) {
        return;
      }

      setLandingTarget(nextTarget);
      setLandingTargetLocked(true);
      await waitForNextFrame();

      if (!active) {
        return;
      }

      const duration = nextTarget ? SETUP_ENTRY_LAND_MS : SETUP_ENTRY_REDUCED_MOTION_EXIT_MS + 220;
      const completionOptions = { immediate: Boolean(nextTarget) };
      const completionTimer = scheduleCompletionFallback(duration, completionOptions);
      Animated.timing(landMotion, {
        duration,
        easing: LAUNCH_EASING,
        toValue: 1,
        useNativeDriver: SHOULD_USE_NATIVE_DRIVER,
      }).start(({ finished }) => {
        if (finished) {
          clearTimeout(completionTimer);
          completionTimers.delete(completionTimer);
          completeHandoff(completionOptions);
        }
      });
    }

    void runHandoff();

    return () => {
      active = false;
      completionTimers.forEach((timer) => clearTimeout(timer));
      completionTimers.clear();
    };
  }, [
    handoffMotion,
    landMotion,
    onVisibleChange,
    reducedExitMotion,
    reducedMotion,
    requestId,
    sourceTarget,
    visible,
  ]);

  if (!visible) {
    return null;
  }

  const activeTarget = landingTargetLocked ? landingTarget : setupTarget;
  const visualSourceTarget = sourceTarget ?? activeTarget;
  const visualMarkTarget = landingTargetLocked && activeTarget ? activeTarget : visualSourceTarget;
  const sourceCenterX = sourceTarget ? sourceTarget.x + sourceTarget.width / 2 : width / 2;
  const sourceCenterY = sourceTarget ? sourceTarget.y + sourceTarget.height / 2 : height / 2;
  const sourceScale = sourceTarget ? sourceTarget.stageSize / LAUNCH_LOGO_SIZE : 1;
  const targetCenterX = activeTarget ? activeTarget.x + activeTarget.width / 2 : sourceCenterX;
  const targetCenterY = activeTarget ? activeTarget.y + activeTarget.height / 2 : sourceCenterY;
  const targetScale = activeTarget ? activeTarget.stageSize / LAUNCH_LOGO_SIZE : sourceScale;
  const landTranslateX = landMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [0, targetCenterX - sourceCenterX],
  });
  const landTranslateY = landMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [0, targetCenterY - sourceCenterY],
  });
  const landingScale = landMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [sourceScale, targetScale],
  });
  const entryScale = entryMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [sourceTarget ? 1 : 0.96, 1],
  });
  const logoScale = Animated.multiply(entryScale, landingScale);
  const fallbackBackdropOpacity = reducedMotion
    ? reducedExitMotion.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 0],
      })
    : landMotion.interpolate({
        inputRange: [0, 0.82, 1],
        outputRange: [1, 1, 0],
      });
  const backdropOpacity = activeTarget
    ? entryMotion
    : Animated.multiply(entryMotion, fallbackBackdropOpacity);
  const rootOpacity = handoffMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });
  const sourceAvatarSize =
    visualSourceTarget?.visualKind === 'identityAvatar'
      ? (visualSourceTarget.avatarSize ?? IDENTITY_FLOW_PROFILE_AVATAR_SIZE)
      : undefined;
  const sourceCenterGlyphSize =
    visualSourceTarget?.visualKind === 'identityMark' &&
    visualSourceTarget.centerFaceSize === 'small'
      ? IDENTITY_FLOW_COMPACT_FACE_SIZE
      : undefined;
  const sourceCenterGlyphViewBox =
    visualSourceTarget?.visualKind === 'identityMark' &&
    visualSourceTarget.centerFaceSize === 'large'
      ? IDENTITY_FLOW_LARGE_FACE_VIEW_BOX
      : undefined;
  const sourceAvatarCenter =
    visualSourceTarget?.visualKind === 'identityAvatar' && sourceAvatarSize ? (
      <AppAvatar
        fallbackBackgroundColor={visualSourceTarget.avatarFallbackBackgroundColor}
        fallbackTextColor={visualSourceTarget.avatarFallbackTextColor}
        imageUrl={visualSourceTarget.avatarUrl ?? null}
        label={visualSourceTarget.avatarLabel ?? 'Tu perfil'}
        size={sourceAvatarSize}
      />
    ) : undefined;
  const targetAvatarSize =
    activeTarget?.visualKind === 'identityAvatar'
      ? (activeTarget.avatarSize ?? IDENTITY_FLOW_PROFILE_AVATAR_SIZE)
      : 0;
  const targetAvatarOffset = (LAUNCH_LOGO_SIZE - targetAvatarSize) / 2;
  const targetAvatarOpacity = landMotion.interpolate({
    inputRange: [0, 0.25, 0.78, 1],
    outputRange: [0, 0, 1, 1],
  });
  const targetAvatarScale = landMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [0.94, 1],
  });

  return (
    <Animated.View
      accessibilityLabel="Happy Circles esta preparando tu perfil"
      pointerEvents="auto"
      style={[styles.launchOverlay, { opacity: rootOpacity }]}
    >
      <Animated.View
        style={[
          styles.launchOverlayBackdrop,
          { backgroundColor: activeTheme.colors.background, opacity: backdropOpacity },
        ]}
      />
      <Animated.View
        style={[
          styles.launchLogoGroup,
          {
            height: LAUNCH_LOGO_SIZE,
            left: sourceCenterX - LAUNCH_LOGO_SIZE / 2,
            opacity: entryMotion,
            top: sourceCenterY - LAUNCH_LOGO_SIZE / 2,
            transform: [{ translateX: landTranslateX }, { translateY: landTranslateY }],
            width: LAUNCH_LOGO_SIZE,
          },
        ]}
      >
        <Animated.View style={{ transform: [{ scale: logoScale }] }}>
          <BrandVerificationMark
            center={sourceAvatarCenter}
            centerGlyphSize={sourceCenterGlyphSize}
            centerGlyphViewBox={sourceCenterGlyphViewBox}
            centerSize={sourceAvatarSize}
            outerRotationDegrees={visualMarkTarget?.outerRotationDegrees ?? 0}
            replaceCenterOnResult={
              visualSourceTarget?.visualKind === 'identityAvatar'
                ? !visualSourceTarget.avatarEditable
                : undefined
            }
            showOuterInIdle
            size={LAUNCH_LOGO_SIZE}
            state={lockupState}
          />
          {activeTarget?.visualKind === 'identityAvatar' && targetAvatarSize > 0 ? (
            <Animated.View
              style={[
                styles.launchAvatarLayer,
                {
                  height: targetAvatarSize,
                  left: targetAvatarOffset,
                  opacity: targetAvatarOpacity,
                  top: targetAvatarOffset,
                  transform: [{ scale: targetAvatarScale }],
                  width: targetAvatarSize,
                },
              ]}
            >
              <AppAvatar
                fallbackBackgroundColor={activeTarget.avatarFallbackBackgroundColor}
                fallbackTextColor={activeTarget.avatarFallbackTextColor}
                imageUrl={activeTarget.avatarUrl ?? null}
                label={activeTarget.avatarLabel ?? 'Tu perfil'}
                size={targetAvatarSize}
              />
            </Animated.View>
          ) : null}
          {activeTarget?.visualKind === 'identityAvatar' && activeTarget.avatarEditable ? (
            <Animated.View
              pointerEvents="none"
              style={[styles.launchAvatarEditPencil, { opacity: targetAvatarOpacity }]}
            >
              <Ionicons color={theme.colors.white} name="pencil" size={15} />
            </Animated.View>
          ) : null}
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

function SessionRouteGuard() {
  const {
    accountAccessState,
    email,
    isEmailConfirmed,
    profileCompletionState,
    setupState,
    status,
  } = useSession();
  const rootNavigationState = useRootNavigationState();
  const params = useGlobalSearchParams<{
    auth_callback?: string | string[];
    case?: string | string[];
    code?: string | string[];
    mode?: string | string[];
    preview?: string | string[];
    token?: string | string[];
    type?: string | string[];
  }>();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (!rootNavigationState?.key || status === 'loading') {
      return;
    }

    let cancelled = false;

    async function syncRoutes() {
      const currentRootSegment = String(segments[0] ?? '');
      const isRootRoute = currentRootSegment === '';
      const isSetupAccountRoute = currentRootSegment === 'setup-account';
      const isInviteLinkRoute = currentRootSegment === 'invite';
      const isJoinRoute = currentRootSegment === 'join';
      const hasJoinToken = isJoinRoute && segments.length > 1;
      const isResetPasswordRoute = currentRootSegment === 'reset-password';
      const rawJoinMode = Array.isArray(params.mode) ? params.mode[0] : params.mode;
      const rawAuthCallback = Array.isArray(params.auth_callback)
        ? params.auth_callback[0]
        : params.auth_callback;
      const isGoogleAuthCallback =
        rawAuthCallback === 'google' || rawAuthCallback === 'google-link';
      const rawCode = Array.isArray(params.code) ? params.code[0] : params.code;
      const rawAuthType = Array.isArray(params.type) ? params.type[0] : params.type;
      const isEmailAuthCallback =
        (typeof rawCode === 'string' && rawCode.trim().length > 0) ||
        rawAuthType === 'signup' ||
        rawAuthType === 'email_change' ||
        rawAuthType === 'magiclink';
      const isAuthCallbackRoute =
        isSetupAccountRoute && (isGoogleAuthCallback || isEmailAuthCallback);
      const isPublicInviteRoute = isInviteLinkRoute || isJoinRoute;
      const rawPreview = Array.isArray(params.preview) ? params.preview[0] : params.preview;
      const setupPreview = resolveSetupAccountPreviewParams(
        {
          case: params.case,
          preview: params.preview,
          token: params.token,
        },
        __DEV__,
      );
      const isQaPreviewRoute =
        __DEV__ &&
        rawPreview === 'true' &&
        (isPublicInviteRoute || (isSetupAccountRoute && setupPreview.enabled));
      const isAuthRouteTransitionHeld =
        isJoinRoute && !hasJoinToken && isAuthRouteTransitionHoldActive();

      const [pendingInviteIntent, pendingNavigationIntent, pendingAccountVerification] =
        await Promise.all([
          readPendingInviteIntent(),
          readPendingNavigationIntent(),
          readPendingAccountVerification(),
        ]);
      await reconcilePendingAccountVerificationForSession({
        isEmailConfirmed,
        sessionEmail: email,
      });
      if (cancelled) {
        return;
      }
      const decision = resolvePreHomeRouteDecision({
        accountAccessState,
        hasJoinToken,
        isAuthRouteTransitionHeld,
        isInviteLinkRoute,
        isJoinRoute,
        isAuthCallbackRoute,
        isPublicInviteRoute,
        isQaPreviewRoute,
        isResetPasswordRoute,
        isRootRoute,
        isSetupAccountRoute,
        pendingInviteIntent,
        pendingAccountVerificationToken: pendingAccountVerification?.token ?? null,
        pendingNavigationIntent,
        profileCompletionState,
        rawAuthCallback,
        rawJoinMode,
        setupState,
        status,
      });

      if (decision.action === 'replace' && !cancelled) {
        if (decision.clearPendingAccountInvite) {
          if (pendingInviteIntent?.type === 'account_invite') {
            await clearPendingInviteIntentIfMatches({
              type: 'account_invite',
              token: pendingInviteIntent.token,
            }).catch(() => false);
          }
        }
        if (decision.consumePendingNavigationIntentId) {
          await clearPendingNavigationIntentIfMatches(
            decision.consumePendingNavigationIntentId,
          ).catch(() => false);
        }
        if (decision.handoff === 'home') {
          await beginHomeEntryHandoffAfterScrollReset();
        }
        if (cancelled) {
          return;
        }
        returnToRoute(router, decision.href);
        return;
      }

      if (isResetPasswordRoute) {
        return;
      }
    }

    void syncRoutes();

    return () => {
      cancelled = true;
    };
  }, [
    accountAccessState,
    email,
    isEmailConfirmed,
    params.auth_callback,
    params.case,
    params.code,
    params.mode,
    params.preview,
    params.token,
    params.type,
    profileCompletionState,
    rootNavigationState?.key,
    router,
    segments,
    setupState,
    status,
  ]);

  return null;
}

function RootNavigator() {
  const activeTheme = useAppTheme();
  const scheme = useThemeScheme();
  const [launchIntroVisible, setLaunchIntroVisible] = useState(true);
  const [homeEntryHandoffVisible, setHomeEntryHandoffVisible] = useState(false);
  const [setupEntryHandoffVisible, setSetupEntryHandoffVisible] = useState(false);
  const [deferredStartupWorkReady, setDeferredStartupWorkReady] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      void SplashScreen.hideAsync()
        .then(() => {
          markSplashHidden();
        })
        .catch(() => undefined);
    });

    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => subscribeFirstScreenReady(() => setDeferredStartupWorkReady(true)), []);

  return (
    <LaunchIntroVisibilityProvider
      value={launchIntroVisible || homeEntryHandoffVisible || setupEntryHandoffVisible}
    >
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <NotificationBridge />
      <SessionRouteGuard />
      <Stack
        screenOptions={{
          animationMatchesGesture: true,
          contentStyle: {
            backgroundColor: activeTheme.colors.background,
          },
          fullScreenGestureEnabled: false,
          gestureDirection: 'horizontal',
          gestureEnabled: true,
          headerBackButtonMenuEnabled: false,
          headerShown: false,
          headerStyle: {
            backgroundColor: activeTheme.colors.background,
          },
          headerTintColor: activeTheme.colors.text,
        }}
      >
        <Stack.Screen name="(tabs)" dangerouslySingular options={{ animation: 'none' }} />
        <Stack.Screen
          name="activity"
          dangerouslySingular
          options={{
            animation: 'slide_from_bottom',
            contentStyle: {
              backgroundColor: 'transparent',
            },
            presentation: 'transparentModal',
          }}
        />
        <Stack.Screen name="categories" dangerouslySingular />
        <Stack.Screen name="circles" dangerouslySingular />
        <Stack.Screen name="category/[category]" dangerouslySingular />
        <Stack.Screen name="invite/[token]" dangerouslySingular options={{ animation: 'none' }} />
        <Stack.Screen
          name="join/[token]/create-account"
          dangerouslySingular
          options={{ animation: 'none' }}
        />
        <Stack.Screen
          name="join/[token]/index"
          dangerouslySingular
          options={{ animation: 'none' }}
        />
        <Stack.Screen name="join/index" dangerouslySingular options={{ animation: 'none' }} />
        <Stack.Screen name="people" dangerouslySingular />
        <Stack.Screen name="person/[userId]" dangerouslySingular />
        <Stack.Screen name="profile" dangerouslySingular />
        <Stack.Screen
          name="register"
          dangerouslySingular
          options={{
            animation: 'slide_from_bottom',
            contentStyle: {
              backgroundColor: 'transparent',
            },
            presentation: 'transparentModal',
          }}
        />
        <Stack.Screen name="reset-password" dangerouslySingular options={{ animation: 'none' }} />
        <Stack.Screen name="setup-account" dangerouslySingular options={{ animation: 'none' }} />
        <Stack.Screen name="settlements/[id]" dangerouslySingular />
        <Stack.Screen name="transactions" dangerouslySingular />
      </Stack>
      {deferredStartupWorkReady ? (
        <HappyCircleDiscoveryBridge
          disabled={launchIntroVisible || homeEntryHandoffVisible || setupEntryHandoffVisible}
        />
      ) : null}
      <MandatoryUpdateGate />
      <ProductAnalyticsBridge />
      <LaunchIntroOverlay onVisibleChange={setLaunchIntroVisible} />
      <SetupEntryHandoffOverlay
        disabled={launchIntroVisible || homeEntryHandoffVisible}
        onVisibleChange={setSetupEntryHandoffVisible}
      />
      <HomeEntryHandoffOverlay
        disabled={launchIntroVisible || setupEntryHandoffVisible}
        onVisibleChange={setHomeEntryHandoffVisible}
      />
      {deferredStartupWorkReady ? <GlobalFeedbackOverlay /> : null}
    </LaunchIntroVisibilityProvider>
  );
}

export default function RootLayout() {
  return (
    <AppProviders>
      <RootNavigator />
    </AppProviders>
  );
}

const styles = StyleSheet.create({
  launchOverlay: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  launchOverlayBackdrop: {
    bottom: 0,
    elevation: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 0,
  },
  launchLogoGroup: {
    alignItems: 'center',
    elevation: 1,
    justifyContent: 'center',
    maxWidth: 1000,
    position: 'absolute',
    zIndex: 1,
  },
  launchAvatarLayer: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
  },
  launchAvatarEditPencil: {
    alignItems: 'center',
    bottom: LAUNCH_AVATAR_EDIT_PENCIL_OFFSET,
    height: LAUNCH_AVATAR_EDIT_PENCIL_SIZE,
    justifyContent: 'center',
    position: 'absolute',
    right: LAUNCH_AVATAR_EDIT_PENCIL_OFFSET,
    width: LAUNCH_AVATAR_EDIT_PENCIL_SIZE,
  },
  launchHeaderGlyphLayer: {
    left: 0,
    position: 'absolute',
    top: 0,
  },
  launchHomeCenterMorph: {
    height: LAUNCH_LOGO_SIZE,
    position: 'relative',
    width: LAUNCH_LOGO_SIZE,
  },
  launchHomeCenterLayer: {
    left: 0,
    position: 'absolute',
    top: 0,
  },
  overlay: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    padding: theme.spacing.lg,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  lockCard: {
    gap: theme.spacing.sm,
    maxWidth: 420,
    width: '100%',
    ...theme.shadow.floating,
  },
  lockTitle: {
    fontSize: theme.typography.title2,
    fontWeight: '800',
  },
  lockMotion: {
    alignItems: 'center',
  },
  lockSubtitle: {
    fontSize: theme.typography.callout,
    lineHeight: 22,
  },
  lockMessage: {
    fontSize: theme.typography.footnote,
    fontWeight: '700',
  },
});
