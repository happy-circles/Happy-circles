import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Stack,
  useLocalSearchParams,
  useRootNavigationState,
  useRouter,
  useSegments,
} from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Linking,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import type { Href } from 'expo-router';
import type { Json } from '@happy-circles/shared';

import {
  HEADER_BRAND_GAP,
  HEADER_BRAND_LOGO_SIZE,
  HEADER_BRAND_TITLE_LINE_HEIGHT,
  HEADER_BRAND_TITLE_SIZE,
  HEADER_BRAND_TITLE_WIDTH,
} from '@/components/brand-lockup';
import {
  BRAND_VERIFICATION_EASING,
  BRAND_VERIFICATION_RESULT_MS,
  BrandVerificationLockup,
  type BrandVerificationState,
} from '@/components/brand-verification-lockup';
import { GlobalFeedbackOverlay } from '@/components/global-feedback-overlay';
import { LaunchIntroVisibilityProvider } from '@/components/launch-intro-presence';
import { hrefForPendingInviteIntent, readPendingInviteIntent } from '@/lib/invite-intent';
import { isAuthRouteTransitionHoldActive } from '@/lib/auth-route-transition-hold';
import { PrimaryAction } from '@/components/primary-action';
import { SurfaceCard } from '@/components/surface-card';
import { appConfig } from '@/lib/config';
import { getCurrentAppVersion } from '@/lib/device-trust';
import { addNotificationResponseListener, configureNotifications } from '@/lib/notifications';
import { returnToRoute } from '@/lib/navigation';
import { buildSetupAccountHref } from '@/lib/setup-account';
import { supabase } from '@/lib/supabase';
import { theme } from '@/lib/theme';
import { AppProviders } from '@/providers/app-providers';
import { useSession } from '@/providers/session-provider';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const LAUNCH_INTRO_MIN_MS = 760;
const LAUNCH_LAND_MS = 560;
const LAUNCH_ROUTE_SETTLE_MS = 120;
const LAUNCH_REDUCED_MOTION_EXIT_MS = 180;
const LAUNCH_FACE_ID_DELAY_MS = 25;
const LAUNCH_LOGO_SIZE = 132;
const LAUNCH_HEADER_LOGO_SIZE = HEADER_BRAND_LOGO_SIZE;
const LAUNCH_HEADER_TITLE_SIZE = HEADER_BRAND_TITLE_SIZE;
const LAUNCH_HEADER_SCALE = LAUNCH_HEADER_LOGO_SIZE / LAUNCH_LOGO_SIZE;
const LAUNCH_LOCKUP_GAP = HEADER_BRAND_GAP / LAUNCH_HEADER_SCALE;
const LAUNCH_TITLE_WIDTH = HEADER_BRAND_TITLE_WIDTH / LAUNCH_HEADER_SCALE;
const LAUNCH_LOCKUP_WIDTH = LAUNCH_LOGO_SIZE + LAUNCH_LOCKUP_GAP + LAUNCH_TITLE_WIDTH;
const LAUNCH_TITLE_FONT_SIZE = LAUNCH_HEADER_TITLE_SIZE / LAUNCH_HEADER_SCALE;
const LAUNCH_TITLE_LINE_HEIGHT = HEADER_BRAND_TITLE_LINE_HEIGHT / LAUNCH_HEADER_SCALE;
const LAUNCH_EASING = BRAND_VERIFICATION_EASING;

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
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

function NotificationBridge() {
  const router = useRouter();

  useEffect(() => {
    void configureNotifications();

    let currentSubscription: { remove(): void } | null = null;

    void addNotificationResponseListener((response) => {
      const href = response.notification.request.content.data?.href;
      if (typeof href === 'string') {
        returnToRoute(router, href as Href);
      }
    }).then((subscription) => {
      currentSubscription = subscription;
    });

    return () => {
      currentSubscription?.remove();
    };
  }, [router]);

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
    <View style={styles.overlay}>
      <SurfaceCard padding="lg" style={styles.lockCard} variant="elevated">
        <Text style={styles.lockTitle}>Actualizacion obligatoria</Text>
        <Text style={styles.lockSubtitle}>{message}</Text>
        <Text style={styles.lockMessage}>
          Version actual: {currentVersion} · Version minima: {minimumVersion}
        </Text>
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
  const session = useSession();
  const reducedMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const [visible, setVisible] = useState(true);
  const [finishRequested, setFinishRequested] = useState(false);
  const [lockupState, setLockupState] = useState<BrandVerificationState>('loading');
  const mountedAtRef = useRef(Date.now());
  const unlockAttemptedRef = useRef(false);
  const latestStatusRef = useRef(session.status);
  const latestUnlockRef = useRef(() => session.unlock());
  const introMotion = useRef(new Animated.Value(0)).current;
  const fitMotion = useRef(new Animated.Value(0)).current;
  const landMotion = useRef(new Animated.Value(0)).current;
  const reducedExitMotion = useRef(new Animated.Value(0)).current;
  const headerTranslateY = useMemo(() => {
    const headerCenterY =
      insets.top + theme.spacing.md + theme.spacing.xxs + LAUNCH_HEADER_LOGO_SIZE / 2;
    return headerCenterY - height / 2;
  }, [height, insets.top]);
  const lockupFitScale = useMemo(() => {
    const availableWidth = Math.max(1, width - theme.spacing.lg * 2);
    return Math.min(1, Math.max(LAUNCH_HEADER_SCALE, availableWidth / LAUNCH_LOCKUP_WIDTH));
  }, [width]);

  useEffect(() => {
    latestStatusRef.current = session.status;
    latestUnlockRef.current = () => session.unlock();
  }, [session]);

  useEffect(() => {
    if (reducedMotion) {
      introMotion.setValue(1);
      fitMotion.setValue(1);
      setLockupState('idle');
      return undefined;
    }

    fitMotion.setValue(0);
    setLockupState('loading');
    Animated.timing(introMotion, {
      duration: 620,
      easing: LAUNCH_EASING,
      toValue: 1,
      useNativeDriver: true,
    }).start();

    return undefined;
  }, [fitMotion, introMotion, reducedMotion]);

  useEffect(() => {
    if (session.status !== 'loading' && !finishRequested) {
      setFinishRequested(true);
    }
  }, [finishRequested, session.status]);

  useEffect(() => {
    if (!finishRequested) {
      return undefined;
    }

    let active = true;

    async function finishIntro() {
      const elapsed = Date.now() - mountedAtRef.current;
      if (!reducedMotion && elapsed < LAUNCH_INTRO_MIN_MS) {
        await wait(LAUNCH_INTRO_MIN_MS - elapsed);
      }

      if (!active) {
        return;
      }

      function requestUnlockAfterIntro() {
        if (latestStatusRef.current !== 'signed_in_locked' || unlockAttemptedRef.current) {
          return;
        }

        unlockAttemptedRef.current = true;
        void wait(LAUNCH_FACE_ID_DELAY_MS).then(() => {
          if (!active || latestStatusRef.current !== 'signed_in_locked') {
            return;
          }

          void latestUnlockRef.current();
        });
      }

      if (reducedMotion) {
        await wait(LAUNCH_ROUTE_SETTLE_MS);

        if (!active) {
          return;
        }

        Animated.timing(reducedExitMotion, {
          duration: LAUNCH_REDUCED_MOTION_EXIT_MS,
          easing: Easing.out(Easing.quad),
          toValue: 1,
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (finished && active) {
            onVisibleChange(false);
            setVisible(false);
            requestUnlockAfterIntro();
          }
        });
        return;
      }

      setLockupState('success');
      Animated.timing(fitMotion, {
        duration: 360,
        easing: LAUNCH_EASING,
        toValue: 1,
        useNativeDriver: true,
      }).start();
      await wait(BRAND_VERIFICATION_RESULT_MS);
      setLockupState('idle');

      if (!active) {
        return;
      }

      await wait(LAUNCH_ROUTE_SETTLE_MS);

      if (!active) {
        return;
      }

      Animated.timing(landMotion, {
        duration: LAUNCH_LAND_MS,
        easing: LAUNCH_EASING,
        toValue: 1,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished && active) {
          onVisibleChange(false);
          setVisible(false);
          requestUnlockAfterIntro();
        }
      });
    }

    void finishIntro();

    return () => {
      active = false;
    };
  }, [
    finishRequested,
    fitMotion,
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
  const lockupReadyScale = fitMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [1, lockupFitScale],
  });
  const landTranslateY = landMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [0, headerTranslateY],
  });
  const landingStartScale = (LAUNCH_LOGO_SIZE * lockupFitScale) / LAUNCH_HEADER_LOGO_SIZE;
  const landingScale = landMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [landingStartScale, 1],
  });
  const introLandingOpacity = landMotion.interpolate({
    inputRange: [0, 0.08, 1],
    outputRange: [1, 0, 0],
  });
  const landingOpacity = landMotion.interpolate({
    inputRange: [0, 0.08, 1],
    outputRange: [0, 1, 1],
  });
  const backdropOpacity = landMotion.interpolate({
    inputRange: [0, 0.72, 1],
    outputRange: [1, 1, 0],
  });
  const overlayOpacity = reducedMotion
    ? reducedExitMotion.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 0],
      })
    : 1;

  return (
    <Animated.View
      accessibilityLabel="Happy Circles esta iniciando"
      pointerEvents="auto"
      style={[styles.launchOverlay, { opacity: overlayOpacity }]}
    >
      <Animated.View style={[styles.launchOverlayBackdrop, { opacity: backdropOpacity }]} />
      <Animated.View
        style={[
          styles.launchIntroGroup,
          {
            height: LAUNCH_LOGO_SIZE,
            opacity: Animated.multiply(introOpacity, introLandingOpacity),
            transform: [
              {
                scale: Animated.multiply(introScale, lockupReadyScale),
              },
            ],
            width: LAUNCH_LOCKUP_WIDTH,
          },
        ]}
      >
        <BrandVerificationLockup
          gap={LAUNCH_LOCKUP_GAP}
          size={LAUNCH_LOGO_SIZE}
          state={lockupState}
          titleLineHeight={LAUNCH_TITLE_LINE_HEIGHT}
          titleSize={LAUNCH_TITLE_FONT_SIZE}
          titleWidth={LAUNCH_TITLE_WIDTH}
        />
      </Animated.View>
      <Animated.View
        style={[
          styles.launchLandingGroup,
          {
            height: LAUNCH_HEADER_LOGO_SIZE,
            opacity: landingOpacity,
            transform: [{ translateY: landTranslateY }, { scale: landingScale }],
            width: LAUNCH_HEADER_LOGO_SIZE + HEADER_BRAND_GAP + HEADER_BRAND_TITLE_WIDTH,
          },
        ]}
      >
        <BrandVerificationLockup
          gap={HEADER_BRAND_GAP}
          size={LAUNCH_HEADER_LOGO_SIZE}
          state={lockupState}
          titleLineHeight={HEADER_BRAND_TITLE_LINE_HEIGHT}
          titleSize={HEADER_BRAND_TITLE_SIZE}
          titleWidth={HEADER_BRAND_TITLE_WIDTH}
        />
      </Animated.View>
    </Animated.View>
  );
}

function SessionRouteGuard() {
  const { accountAccessState, profileCompletionState, setupState, status } = useSession();
  const rootNavigationState = useRootNavigationState();
  const params = useLocalSearchParams<{ preview?: string | string[] }>();
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
      const inAuthGroup = currentRootSegment === '(auth)';
      const isSetupAccountRoute = currentRootSegment === 'setup-account';
      const isInviteLinkRoute = currentRootSegment === 'invite';
      const isJoinRoute = currentRootSegment === 'join';
      const hasJoinToken = isJoinRoute && segments.length > 1;
      const isResetPasswordRoute = currentRootSegment === 'reset-password';
      const isPublicInviteRoute = isInviteLinkRoute || isJoinRoute;
      const isPublicSignedOutRoute = inAuthGroup || isPublicInviteRoute || isResetPasswordRoute;
      const rawPreview = Array.isArray(params.preview) ? params.preview[0] : params.preview;
      const isQaPreviewRoute = __DEV__ && rawPreview === 'true';
      const isAuthRouteTransitionHeld =
        isJoinRoute && !hasJoinToken && isAuthRouteTransitionHoldActive();

      if (status === 'signed_out') {
        if (isRootRoute && !cancelled) {
          returnToRoute(router, '/join');
          return;
        }

        if (!isPublicSignedOutRoute && !cancelled) {
          returnToRoute(router, '/sign-in');
        }
        return;
      }

      if (status === 'signed_in_locked') {
        if (!isJoinRoute && !isInviteLinkRoute && !cancelled) {
          returnToRoute(router, '/join');
        }
        return;
      }

      const pendingIntent = await readPendingInviteIntent();
      const inviteAwareHref = pendingIntent ? hrefForPendingInviteIntent(pendingIntent) : null;
      const joinRootHref = '/join' as unknown as Href;

      if (accountAccessState === 'needs_invite') {
        if (!isJoinRoute && !cancelled) {
          returnToRoute(router, (inviteAwareHref ?? joinRootHref) as Href);
        }
        return;
      }

      if (
        !setupState.requiredComplete &&
        !isSetupAccountRoute &&
        !isResetPasswordRoute &&
        !isPublicInviteRoute
      ) {
        if (!cancelled) {
          returnToRoute(
            router,
            buildSetupAccountHref(setupState.pendingRequiredSteps[0] ?? 'profile'),
          );
        }
        return;
      }

      if (
        accountAccessState === 'needs_activation' &&
        !isJoinRoute &&
        !isSetupAccountRoute &&
        !cancelled
      ) {
        returnToRoute(router, (inviteAwareHref ?? joinRootHref) as Href);
        return;
      }

      if (
        accountAccessState === 'active' &&
        profileCompletionState === 'complete' &&
        isJoinRoute &&
        !hasJoinToken &&
        !inviteAwareHref &&
        !isAuthRouteTransitionHeld &&
        !isQaPreviewRoute &&
        !cancelled
      ) {
        returnToRoute(router, '/home');
        return;
      }

      const nextSignedInHref =
        accountAccessState === 'active'
          ? profileCompletionState === 'complete'
            ? (inviteAwareHref ?? '/home')
            : buildSetupAccountHref(setupState.pendingRequiredSteps[0] ?? 'profile')
          : (inviteAwareHref ?? joinRootHref);

      if (isResetPasswordRoute) {
        return;
      }

      if (inAuthGroup && !cancelled) {
        returnToRoute(router, nextSignedInHref as Href);
      }
    }

    void syncRoutes();

    return () => {
      cancelled = true;
    };
  }, [
    accountAccessState,
    params.preview,
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
  const [launchIntroVisible, setLaunchIntroVisible] = useState(true);

  return (
    <LaunchIntroVisibilityProvider value={launchIntroVisible}>
      <StatusBar style="dark" />
      <NotificationBridge />
      <SessionRouteGuard />
      <Stack
        screenOptions={{
          animationMatchesGesture: true,
          contentStyle: {
            backgroundColor: theme.colors.background,
          },
          fullScreenGestureEnabled: false,
          gestureDirection: 'horizontal',
          gestureEnabled: true,
          headerBackButtonMenuEnabled: false,
          headerShown: false,
          headerStyle: {
            backgroundColor: theme.colors.background,
          },
          headerTintColor: theme.colors.text,
        }}
      >
        <Stack.Screen name="(tabs)" dangerouslySingular />
        <Stack.Screen name="advanced/audit" dangerouslySingular />
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
        <Stack.Screen name="balance/analytics" dangerouslySingular />
        <Stack.Screen name="balance/index" dangerouslySingular />
        <Stack.Screen name="invite/[token]" dangerouslySingular />
        <Stack.Screen name="invite/index" dangerouslySingular />
        <Stack.Screen name="join/[token]/create-account" dangerouslySingular />
        <Stack.Screen name="join/[token]/index" dangerouslySingular />
        <Stack.Screen name="join/index" dangerouslySingular />
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
        <Stack.Screen name="reset-password" dangerouslySingular />
        <Stack.Screen name="setup-account" dangerouslySingular />
        <Stack.Screen name="settlements/[id]" dangerouslySingular />
        <Stack.Screen name="transactions" dangerouslySingular />
      </Stack>
      <MandatoryUpdateGate />
      <LaunchIntroOverlay onVisibleChange={setLaunchIntroVisible} />
      <GlobalFeedbackOverlay />
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
    padding: theme.spacing.lg,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  launchOverlayBackdrop: {
    backgroundColor: theme.colors.background,
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  launchIntroGroup: {
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: 1000,
    position: 'relative',
  },
  launchLandingGroup: {
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: 1000,
    position: 'absolute',
  },
  overlay: {
    alignItems: 'center',
    backgroundColor: theme.colors.overlay,
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
    color: theme.colors.text,
    fontSize: theme.typography.title2,
    fontWeight: '800',
  },
  lockMotion: {
    alignItems: 'center',
  },
  lockSubtitle: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.callout,
    lineHeight: 22,
  },
  lockMessage: {
    color: theme.colors.warning,
    fontSize: theme.typography.footnote,
    fontWeight: '700',
  },
});
