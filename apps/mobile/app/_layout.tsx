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

import { GlobalFeedbackOverlay } from '@/components/global-feedback-overlay';
import {
  HappyCirclesBottomPieceSvg,
  HappyCirclesCenterSvg,
  HappyCirclesGlyph,
  HappyCirclesLeftPieceSvg,
  HappyCirclesRightPieceSvg,
  HappyCirclesTopPieceSvg,
  resolveHappyCirclesPalette,
} from '@/components/happy-circles-glyph';
import { hrefForPendingInviteIntent, readPendingInviteIntent } from '@/lib/invite-intent';
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

const LAUNCH_INTRO_MIN_MS = 1750;
const LAUNCH_READY_MS = 760;
const LAUNCH_LAND_MS = 1400;
const LAUNCH_ROUTE_SETTLE_MS = 420;
const LAUNCH_LOGO_SIZE = 116;
const LAUNCH_HEADER_LOGO_SIZE = 68;
const LAUNCH_HEADER_TITLE_SIZE = 30;
const LAUNCH_HEADER_SCALE = LAUNCH_HEADER_LOGO_SIZE / LAUNCH_LOGO_SIZE;
const LAUNCH_LOCKUP_GAP = 6 / LAUNCH_HEADER_SCALE;
const LAUNCH_TITLE_WIDTH = 346;
const LAUNCH_TITLE_FONT_SIZE = LAUNCH_HEADER_TITLE_SIZE / LAUNCH_HEADER_SCALE;
const LAUNCH_TITLE_LINE_HEIGHT = 36 / LAUNCH_HEADER_SCALE;
const LAUNCH_LOCKUP_LOGO_CENTER_OFFSET = (LAUNCH_TITLE_WIDTH + LAUNCH_LOCKUP_GAP) / 2;
const LAUNCH_EASING = Easing.bezier(0.16, 1, 0.3, 1);

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function createLaunchMaskId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
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

function LaunchIntroOverlay() {
  const session = useSession();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [visible, setVisible] = useState(true);
  const [finishRequested, setFinishRequested] = useState(false);
  const mountedAtRef = useRef(Date.now());
  const unlockAttemptedRef = useRef(false);
  const latestStatusRef = useRef(session.status);
  const latestUnlockRef = useRef(session.unlock);
  const introMotion = useRef(new Animated.Value(0)).current;
  const spinMotion = useRef(new Animated.Value(0)).current;
  const pulseMotion = useRef(new Animated.Value(0)).current;
  const readyMotion = useRef(new Animated.Value(0)).current;
  const textMotion = useRef(new Animated.Value(0)).current;
  const landMotion = useRef(new Animated.Value(0)).current;
  const topMaskId = useMemo(() => createLaunchMaskId('launch-top'), []);
  const leftMaskId = useMemo(() => createLaunchMaskId('launch-left'), []);
  const rightMaskId = useMemo(() => createLaunchMaskId('launch-right'), []);
  const loadingPalette = useMemo(
    () => ({
      ...resolveHappyCirclesPalette('brand'),
      face: theme.colors.brandCoral,
      faceDetail: theme.colors.white,
    }),
    [],
  );
  const successPalette = useMemo(
    () => ({
      ...resolveHappyCirclesPalette('brand'),
      face: theme.colors.brandGreen,
      faceDetail: theme.colors.white,
    }),
    [],
  );
  const headerTranslateY = useMemo(() => {
    const headerCenterY =
      insets.top + theme.spacing.md + theme.spacing.xxs + LAUNCH_HEADER_LOGO_SIZE / 2;
    return headerCenterY - height / 2;
  }, [height, insets.top]);

  useEffect(() => {
    latestStatusRef.current = session.status;
    latestUnlockRef.current = session.unlock;
  }, [session.status, session.unlock]);

  useEffect(() => {
    Animated.timing(introMotion, {
      duration: 620,
      easing: LAUNCH_EASING,
      toValue: 1,
      useNativeDriver: true,
    }).start();

    const spinLoop = Animated.loop(
      Animated.timing(spinMotion, {
        duration: 1400,
        easing: Easing.linear,
        toValue: 1,
        useNativeDriver: true,
      }),
    );
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseMotion, {
          duration: 620,
          easing: Easing.inOut(Easing.quad),
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(pulseMotion, {
          duration: 620,
          easing: Easing.inOut(Easing.quad),
          toValue: 0,
          useNativeDriver: true,
        }),
      ]),
    );

    spinLoop.start();
    pulseLoop.start();

    return () => {
      spinLoop.stop();
      pulseLoop.stop();
    };
  }, [introMotion, pulseMotion, spinMotion]);

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
      if (elapsed < LAUNCH_INTRO_MIN_MS) {
        await wait(LAUNCH_INTRO_MIN_MS - elapsed);
      }

      if (!active) {
        return;
      }

      await new Promise<void>((resolve) => {
        Animated.timing(readyMotion, {
          duration: LAUNCH_READY_MS,
          easing: LAUNCH_EASING,
          toValue: 1,
          useNativeDriver: true,
        }).start(() => resolve());
      });

      if (!active) {
        return;
      }

      await new Promise<void>((resolve) => {
        Animated.timing(textMotion, {
          duration: 860,
          easing: LAUNCH_EASING,
          toValue: 1,
          useNativeDriver: true,
        }).start(() => resolve());
      });

      if (!active) {
        return;
      }

      if (latestStatusRef.current === 'signed_in_locked' && !unlockAttemptedRef.current) {
        unlockAttemptedRef.current = true;
        await latestUnlockRef.current();
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
          setVisible(false);
        }
      });
    }

    void finishIntro();

    return () => {
      active = false;
    };
  }, [finishRequested, landMotion, readyMotion, textMotion]);

  if (!visible) {
    return null;
  }

  const introOpacity = introMotion.interpolate({
    inputRange: [0, 0.35, 1],
    outputRange: [0, 0.8, 1],
  });
  const introScale = introMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [0.82, 1],
  });
  const rotate = spinMotion.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
  const centerPulseScale = pulseMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.045],
  });
  const loadingFaceOpacity = readyMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });
  const successFaceOpacity = readyMotion;
  const rotatingPiecesOpacity = textMotion.interpolate({
    inputRange: [0, 0.72, 1],
    outputRange: [1, 0.18, 0],
  });
  const staticLogoOpacity = textMotion.interpolate({
    inputRange: [0, 0.42, 1],
    outputRange: [0, 1, 1],
  });
  const centerOverlayOpacity = textMotion.interpolate({
    inputRange: [0, 0.4, 1],
    outputRange: [1, 0.35, 0],
  });
  const logoReadyScale = readyMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.94],
  });
  const textOpacity = textMotion.interpolate({
    inputRange: [0, 0.2, 1],
    outputRange: [0, 0.18, 1],
  });
  const textTranslateX = textMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [-10, 0],
  });
  const lockupTranslateX = textMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [LAUNCH_LOCKUP_LOGO_CENTER_OFFSET, 0],
  });
  const landTranslateY = landMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [0, headerTranslateY],
  });
  const landScale = landMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [1, LAUNCH_HEADER_SCALE],
  });
  const overlayOpacity = landMotion.interpolate({
    inputRange: [0, 0.58, 1],
    outputRange: [1, 0.96, 0],
  });

  return (
    <Animated.View
      accessibilityLabel="Happy Circles esta iniciando"
      pointerEvents="auto"
      style={[styles.launchOverlay, { opacity: overlayOpacity }]}
    >
      <Animated.View
        style={[
          styles.launchIntroGroup,
          {
            height: LAUNCH_LOGO_SIZE,
            opacity: introOpacity,
            transform: [
              { translateX: lockupTranslateX },
              { translateY: landTranslateY },
              { scale: Animated.multiply(introScale, landScale) },
            ],
            width: LAUNCH_LOGO_SIZE + LAUNCH_LOCKUP_GAP + LAUNCH_TITLE_WIDTH,
          },
        ]}
      >
        <Animated.View
          style={[
            styles.launchLogoStage,
            {
              height: LAUNCH_LOGO_SIZE,
              transform: [{ scale: logoReadyScale }],
              width: LAUNCH_LOGO_SIZE,
            },
          ]}
        >
          <Animated.View style={[styles.launchLogoLayer, { opacity: staticLogoOpacity }]}>
            <HappyCirclesGlyph size={LAUNCH_LOGO_SIZE} />
          </Animated.View>

          <Animated.View
            style={[
              styles.launchLogoLayer,
              {
                opacity: rotatingPiecesOpacity,
                transform: [{ rotate }],
              },
            ]}
          >
            <Animated.View style={styles.launchLogoLayer}>
              <HappyCirclesTopPieceSvg
                maskId={topMaskId}
                palette={loadingPalette}
                size={LAUNCH_LOGO_SIZE}
              />
            </Animated.View>
            <Animated.View style={styles.launchLogoLayer}>
              <HappyCirclesLeftPieceSvg
                maskId={leftMaskId}
                palette={loadingPalette}
                size={LAUNCH_LOGO_SIZE}
              />
            </Animated.View>
            <Animated.View style={styles.launchLogoLayer}>
              <HappyCirclesRightPieceSvg
                maskId={rightMaskId}
                palette={loadingPalette}
                size={LAUNCH_LOGO_SIZE}
              />
            </Animated.View>
            <Animated.View style={styles.launchLogoLayer}>
              <HappyCirclesBottomPieceSvg palette={loadingPalette} size={LAUNCH_LOGO_SIZE} />
            </Animated.View>
          </Animated.View>

          <Animated.View
            style={[
              styles.launchLogoLayer,
              {
                opacity: centerOverlayOpacity,
                transform: [{ scale: centerPulseScale }],
              },
            ]}
          >
            <Animated.View style={[styles.launchLogoLayer, { opacity: loadingFaceOpacity }]}>
              <HappyCirclesCenterSvg palette={loadingPalette} size={LAUNCH_LOGO_SIZE} />
            </Animated.View>
            <Animated.View style={[styles.launchLogoLayer, { opacity: successFaceOpacity }]}>
              <HappyCirclesCenterSvg palette={successPalette} size={LAUNCH_LOGO_SIZE} wink />
            </Animated.View>
          </Animated.View>
        </Animated.View>

        <Animated.View
          style={[
            styles.launchTitleWrap,
            {
              opacity: textOpacity,
              transform: [{ translateX: textTranslateX }],
            },
          ]}
        >
          <Text numberOfLines={1} style={styles.launchTitle}>
            Happy Circles
          </Text>
        </Animated.View>
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
  return (
    <>
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
      <LaunchIntroOverlay />
      <GlobalFeedbackOverlay />
    </>
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
    backgroundColor: theme.colors.background,
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    padding: theme.spacing.lg,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  launchIntroGroup: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: LAUNCH_LOCKUP_GAP,
    justifyContent: 'center',
    position: 'relative',
  },
  launchLogoStage: {
    overflow: 'visible',
    position: 'relative',
  },
  launchLogoLayer: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  launchTitleWrap: {
    overflow: 'hidden',
    width: LAUNCH_TITLE_WIDTH,
  },
  launchTitle: {
    color: theme.colors.text,
    fontSize: LAUNCH_TITLE_FONT_SIZE,
    fontWeight: '800',
    letterSpacing: 0,
    lineHeight: LAUNCH_TITLE_LINE_HEIGHT,
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
