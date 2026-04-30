import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
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

import { AppAvatar } from '@/components/app-avatar';
import {
  BRAND_VERIFICATION_EASING,
  BRAND_VERIFICATION_RESULT_MS,
  BrandVerificationMark,
  type BrandVerificationState,
} from '@/components/brand-verification-lockup';
import { GlobalFeedbackOverlay } from '@/components/global-feedback-overlay';
import { HappyCirclesGlyph } from '@/components/happy-circles-glyph';
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
import { hrefForPendingInviteIntent, readPendingInviteIntent } from '@/lib/invite-intent';
import { isAuthRouteTransitionHoldActive } from '@/lib/auth-route-transition-hold';
import {
  beginHomeEntryHandoff,
  getHomeEntryReadyVersion,
  subscribeHomeEntryHandoff,
  subscribeHomeEntryReady,
} from '@/lib/home-entry-handoff';
import { subscribeSetupEntryHandoff } from '@/lib/setup-entry-handoff';
import { PrimaryAction } from '@/components/primary-action';
import { ProductAnalyticsBridge } from '@/components/product-analytics-bridge';
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

const LAUNCH_INTRO_MIN_MS = 760;
const LAUNCH_LAND_MS = 620;
const LAUNCH_ROUTE_SETTLE_MS = 120;
const LAUNCH_REDUCED_MOTION_EXIT_MS = 180;
const LAUNCH_FACE_ID_DELAY_MS = 25;
const LAUNCH_TARGET_WAIT_MS = 300;
const LAUNCH_HOME_TARGET_WAIT_MS = 1400;
const LAUNCH_SESSION_MAX_WAIT_MS = 3200;
const LAUNCH_TARGET_STABLE_SAMPLES = 3;
const LAUNCH_TARGET_STABLE_THRESHOLD = 0.75;
const LAUNCH_LOGO_SIZE = IDENTITY_FLOW_STAGE_SIZE;
const LAUNCH_AVATAR_EDIT_PENCIL_OFFSET = 35;
const LAUNCH_AVATAR_EDIT_PENCIL_SIZE = 32;
const LAUNCH_EASING = BRAND_VERIFICATION_EASING;
const HOME_ENTRY_SPIN_MS = 780;
const HOME_ENTRY_SUCCESS_MS = 260;
const HOME_ENTRY_ROUTE_SETTLE_MS = 120;
const HOME_ENTRY_LAND_MS = 980;
const HOME_ENTRY_REDUCED_MOTION_EXIT_MS = 180;
const HOME_ENTRY_FADE_MS = 160;
const HOME_ENTRY_READY_WAIT_MS = 1800;
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
  const segments = useSegments();
  const targets = useLaunchIntroTargets();
  const { height, width } = useWindowDimensions();
  const targetPreference: LaunchTargetPreference =
    session.status !== 'loading' &&
    session.status !== 'signed_out' &&
    session.status !== 'signed_in_locked' &&
    !session.setupState.requiredComplete
      ? 'identityAvatar'
      : session.status !== 'loading' &&
          session.status !== 'signed_out' &&
          session.status !== 'signed_in_locked' &&
          session.accountAccessState === 'active' &&
          session.profileCompletionState === 'complete'
        ? 'homeHeader'
        : String(segments[0] ?? '') === 'setup-account'
          ? 'identityAvatar'
          : String(segments[0] ?? '') === '(tabs)' || String(segments[0] ?? '') === 'home'
            ? 'homeHeader'
            : String(segments[0] ?? '') === 'join' ||
                String(segments[0] ?? '') === 'invite' ||
                String(segments[0] ?? '') === 'reset-password' ||
                String(segments[0] ?? '') === '(auth)'
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
  const unlockAttemptedRef = useRef(false);
  const latestTargetRef = useRef<LaunchIntroTargetSnapshot | null>(target);
  const latestTargetPreferenceRef = useRef(targetPreference);
  const latestStatusRef = useRef(session.status);
  const latestUnlockRef = useRef(() => session.unlock());
  const introMotion = useRef(new Animated.Value(0)).current;
  const landMotion = useRef(new Animated.Value(0)).current;
  const reducedExitMotion = useRef(new Animated.Value(0)).current;
  const handoffMotion = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    latestStatusRef.current = session.status;
    latestUnlockRef.current = () => session.unlock();
  }, [session]);

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
      useNativeDriver: true,
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

      function completeIntro() {
        if (!active || completing) {
          return;
        }

        completing = true;
        onVisibleChange(false);

        void waitForNextFrame().then(() => {
          if (!active) {
            return;
          }

          Animated.timing(handoffMotion, {
            duration: reducedMotion ? 90 : 140,
            easing: Easing.out(Easing.quad),
            toValue: 1,
            useNativeDriver: true,
          }).start(() => {
            if (!active) {
              return;
            }

            setVisible(false);
            requestUnlockAfterIntro();
          });
        });
      }

      function scheduleCompletionFallback(duration: number) {
        const timer = setTimeout(() => {
          completionTimers.delete(timer);
          completeIntro();
        }, duration + 180);

        completionTimers.add(timer);
        return timer;
      }

      async function waitForLandingTarget() {
        const startedAt = Date.now();
        const waitMs =
          latestTargetPreferenceRef.current === 'homeHeader'
            ? LAUNCH_HOME_TARGET_WAIT_MS
            : LAUNCH_TARGET_WAIT_MS;
        let previousTarget: LaunchIntroTargetSnapshot | null = null;
        let stableSamples = 0;

        while (active && Date.now() - startedAt < waitMs) {
          const currentTarget = latestTargetRef.current;

          if (currentTarget) {
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

        return latestTargetRef.current;
      }

      if (reducedMotion) {
        await wait(LAUNCH_ROUTE_SETTLE_MS);

        if (!active) {
          return;
        }

        const nextLandingTarget = await waitForLandingTarget();
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

        const completionTimer = scheduleCompletionFallback(LAUNCH_REDUCED_MOTION_EXIT_MS);
        Animated.timing(reducedExitMotion, {
          duration: LAUNCH_REDUCED_MOTION_EXIT_MS,
          easing: Easing.out(Easing.quad),
          toValue: 1,
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (finished) {
            clearTimeout(completionTimer);
            completionTimers.delete(completionTimer);
            completeIntro();
          }
        });
        return;
      }

      setLockupState('success');
      await wait(BRAND_VERIFICATION_RESULT_MS);
      setLockupState('idle');

      if (!active) {
        return;
      }

      await wait(LAUNCH_ROUTE_SETTLE_MS);

      if (!active) {
        return;
      }

      const nextLandingTarget = await waitForLandingTarget();
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

      const landDuration = nextLandingTarget ? LAUNCH_LAND_MS : LAUNCH_REDUCED_MOTION_EXIT_MS + 220;
      const completionTimer = scheduleCompletionFallback(landDuration);
      Animated.timing(landMotion, {
        duration: landDuration,
        easing: LAUNCH_EASING,
        toValue: 1,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          clearTimeout(completionTimer);
          completionTimers.delete(completionTimer);
          completeIntro();
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
    inputRange: [0, 0.48, 0.92, 1],
    outputRange: activeTarget?.visualKind === 'headerBrand' ? [1, 1, 0, 0] : [1, 1, 1, 1],
  });
  const logoScale = Animated.multiply(introScale, landingScale);
  const backdropOpacity = landMotion.interpolate({
    inputRange: [0, 0.72, 1],
    outputRange: [1, 1, 0],
  });
  const overlayFadeOpacity = landMotion.interpolate({
    inputRange: [0, 0.72, 1],
    outputRange: [1, 1, 0],
  });
  const overlayOpacity = reducedMotion
    ? reducedExitMotion.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 0],
      })
    : overlayFadeOpacity;
  const handoffOpacity = handoffMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });
  const rootOpacity =
    reducedMotion || !activeTarget
      ? Animated.multiply(overlayOpacity, handoffOpacity)
      : handoffOpacity;
  const headerGlyphOpacity = landMotion.interpolate({
    inputRange: [0, 0.48, 0.92, 1],
    outputRange: activeTarget?.visualKind === 'headerBrand' ? [0, 0, 1, 1] : [0, 0, 0, 0],
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
      <Animated.View style={[styles.launchOverlayBackdrop, { opacity: backdropOpacity }]} />
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
  const reducedMotion = useReducedMotion();
  const targets = useLaunchIntroTargets();
  const { height, width } = useWindowDimensions();
  const homeTarget = firstLaunchTargetOfKind(targets, 'headerBrand');
  const currentSourceTarget = firstHomeEntrySourceTarget(targets);
  const [visible, setVisible] = useState(false);
  const [requestId, setRequestId] = useState(0);
  const [requestReadyVersionAtStart, setRequestReadyVersionAtStart] = useState(0);
  const [sourceTarget, setSourceTarget] = useState<LaunchIntroTargetSnapshot | null>(null);
  const [landingTarget, setLandingTarget] = useState<LaunchIntroTargetSnapshot | null>(null);
  const [landingTargetLocked, setLandingTargetLocked] = useState(false);
  const [lockupState, setLockupState] = useState<BrandVerificationState>('loading');
  const latestHomeTargetRef = useRef<LaunchIntroTargetSnapshot | null>(homeTarget);
  const latestSourceTargetRef = useRef<LaunchIntroTargetSnapshot | null>(currentSourceTarget);
  const entryMotion = useRef(new Animated.Value(0)).current;
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
        setRequestReadyVersionAtStart(request.readyVersionAtStart);
        setRequestId(request.id);

        if (!nextSourceTarget) {
          Animated.timing(entryMotion, {
            duration: reducedMotion ? 80 : 180,
            easing: Easing.out(Easing.quad),
            toValue: 1,
            useNativeDriver: true,
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

    function completeHandoff() {
      if (!active || completing) {
        return;
      }

      completing = true;
      onVisibleChange(false);

      void waitForNextFrame().then(() => {
        if (!active) {
          return;
        }

        Animated.timing(handoffMotion, {
          duration: HOME_ENTRY_FADE_MS,
          easing: Easing.out(Easing.quad),
          toValue: 1,
          useNativeDriver: true,
        }).start(() => {
          if (active) {
            setVisible(false);
          }
        });
      });
    }

    function scheduleCompletionFallback(duration: number) {
      const timer = setTimeout(() => {
        completionTimers.delete(timer);
        completeHandoff();
      }, duration + 220);

      completionTimers.add(timer);
      return timer;
    }

    async function waitForHomeTarget() {
      const startedAt = Date.now();
      let previousTarget: LaunchIntroTargetSnapshot | null = null;
      let stableSamples = 0;

      while (active && Date.now() - startedAt < LAUNCH_HOME_TARGET_WAIT_MS) {
        const currentTarget = latestHomeTargetRef.current;

        if (currentTarget) {
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

      return latestHomeTargetRef.current;
    }

    async function waitForHomeReady() {
      if (getHomeEntryReadyVersion() > requestReadyVersionAtStart) {
        return;
      }

      await new Promise<void>((resolve) => {
        let settled = false;
        const timeout = setTimeout(finish, HOME_ENTRY_READY_WAIT_MS);
        const unsubscribe = subscribeHomeEntryReady((version) => {
          if (version > requestReadyVersionAtStart) {
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

    async function runHandoff() {
      if (reducedMotion) {
        await wait(HOME_ENTRY_ROUTE_SETTLE_MS);

        if (!active) {
          return;
        }

        const [nextTarget] = await Promise.all([waitForHomeTarget(), waitForHomeReady()]);
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

        const completionTimer = scheduleCompletionFallback(HOME_ENTRY_REDUCED_MOTION_EXIT_MS);
        Animated.timing(reducedExitMotion, {
          duration: HOME_ENTRY_REDUCED_MOTION_EXIT_MS,
          easing: Easing.out(Easing.quad),
          toValue: 1,
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (finished) {
            clearTimeout(completionTimer);
            completionTimers.delete(completionTimer);
            completeHandoff();
          }
        });
        return;
      }

      await wait(HOME_ENTRY_SPIN_MS);

      if (!active) {
        return;
      }

      setLockupState('success');
      await wait(HOME_ENTRY_SUCCESS_MS);
      setLockupState('idle');
      await wait(HOME_ENTRY_ROUTE_SETTLE_MS);

      if (!active) {
        return;
      }

      const [nextTarget] = await Promise.all([waitForHomeTarget(), waitForHomeReady()]);
      if (!active) {
        return;
      }

      setLandingTarget(nextTarget);
      setLandingTargetLocked(true);
      await waitForNextFrame();

      if (!active) {
        return;
      }

      const duration = nextTarget ? HOME_ENTRY_LAND_MS : HOME_ENTRY_REDUCED_MOTION_EXIT_MS + 220;
      const completionTimer = scheduleCompletionFallback(duration);
      Animated.timing(landMotion, {
        duration,
        easing: LAUNCH_EASING,
        toValue: 1,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          clearTimeout(completionTimer);
          completionTimers.delete(completionTimer);
          completeHandoff();
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
    visible,
  ]);

  if (!visible) {
    return null;
  }

  const activeTarget = landingTargetLocked ? landingTarget : homeTarget;
  const visualSourceTarget = sourceTarget ?? activeTarget;
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
  const backdropOpacity = Animated.multiply(
    entryMotion,
    reducedMotion
      ? reducedExitMotion.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 0],
        })
      : landMotion.interpolate({
          inputRange: [0, 0.82, 1],
          outputRange: [1, 1, 0],
        }),
  );
  const rootOpacity = handoffMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });
  const markOpacity = landMotion.interpolate({
    inputRange: [0, 0.5, 0.9, 1],
    outputRange: activeTarget ? [1, 1, 0, 0] : [1, 1, 1, 1],
  });
  const headerGlyphOpacity = landMotion.interpolate({
    inputRange: [0, 0.5, 0.9, 1],
    outputRange: activeTarget ? [0, 0, 1, 1] : [0, 0, 0, 0],
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

  return (
    <Animated.View
      accessibilityLabel="Happy Circles esta entrando al inicio"
      pointerEvents="auto"
      style={[styles.launchOverlay, { opacity: rootOpacity }]}
    >
      <Animated.View style={[styles.launchOverlayBackdrop, { opacity: backdropOpacity }]} />
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
          <Animated.View style={{ opacity: markOpacity }}>
            <BrandVerificationMark
              center={sourceAvatarCenter}
              centerGlyphSize={sourceCenterGlyphSize}
              centerGlyphViewBox={sourceCenterGlyphViewBox}
              centerSize={sourceAvatarSize}
              outerRotationDegrees={visualSourceTarget?.outerRotationDegrees ?? 0}
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
          {activeTarget ? (
            <Animated.View style={[styles.launchHeaderGlyphLayer, { opacity: headerGlyphOpacity }]}>
              <HappyCirclesGlyph size={LAUNCH_LOGO_SIZE} />
            </Animated.View>
          ) : null}
          {visualSourceTarget?.visualKind === 'identityAvatar' &&
          visualSourceTarget.avatarEditable ? (
            <Animated.View pointerEvents="none" style={styles.launchAvatarEditPencil}>
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
            useNativeDriver: true,
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

    function completeHandoff() {
      if (!active || completing) {
        return;
      }

      completing = true;
      onVisibleChange(false);

      void waitForNextFrame().then(() => {
        if (!active) {
          return;
        }

        Animated.timing(handoffMotion, {
          duration: SETUP_ENTRY_FADE_MS,
          easing: Easing.out(Easing.quad),
          toValue: 1,
          useNativeDriver: true,
        }).start(() => {
          if (active) {
            setVisible(false);
          }
        });
      });
    }

    function scheduleCompletionFallback(duration: number) {
      const timer = setTimeout(() => {
        completionTimers.delete(timer);
        completeHandoff();
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

        const completionTimer = scheduleCompletionFallback(SETUP_ENTRY_REDUCED_MOTION_EXIT_MS);
        Animated.timing(reducedExitMotion, {
          duration: SETUP_ENTRY_REDUCED_MOTION_EXIT_MS,
          easing: Easing.out(Easing.quad),
          toValue: 1,
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (finished) {
            clearTimeout(completionTimer);
            completionTimers.delete(completionTimer);
            completeHandoff();
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
      const completionTimer = scheduleCompletionFallback(duration);
      Animated.timing(landMotion, {
        duration,
        easing: LAUNCH_EASING,
        toValue: 1,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          clearTimeout(completionTimer);
          completionTimers.delete(completionTimer);
          completeHandoff();
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
  const backdropOpacity = Animated.multiply(
    entryMotion,
    reducedMotion
      ? reducedExitMotion.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 0],
        })
      : landMotion.interpolate({
          inputRange: [0, 0.82, 1],
          outputRange: [1, 1, 0],
        }),
  );
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
      <Animated.View style={[styles.launchOverlayBackdrop, { opacity: backdropOpacity }]} />
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
          returnToRoute(router, '/join?mode=sign-in');
        }
        return;
      }

      if (status === 'signed_in_locked') {
        if (!isJoinRoute && !isInviteLinkRoute && !cancelled) {
          returnToRoute(router, '/join');
        }
        return;
      }

      if (status === 'signed_in_untrusted') {
        if (!isSetupAccountRoute && !isResetPasswordRoute && !isPublicInviteRoute && !cancelled) {
          returnToRoute(router, buildSetupAccountHref('security'));
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
        beginHomeEntryHandoff();
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
        if (nextSignedInHref === '/home') {
          beginHomeEntryHandoff();
        }
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
  const [homeEntryHandoffVisible, setHomeEntryHandoffVisible] = useState(false);
  const [setupEntryHandoffVisible, setSetupEntryHandoffVisible] = useState(false);

  return (
    <LaunchIntroVisibilityProvider
      value={launchIntroVisible || homeEntryHandoffVisible || setupEntryHandoffVisible}
    >
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
        <Stack.Screen name="(tabs)" dangerouslySingular options={{ animation: 'none' }} />
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
        <Stack.Screen name="invite/[token]" dangerouslySingular options={{ animation: 'none' }} />
        <Stack.Screen name="invite/index" dangerouslySingular options={{ animation: 'none' }} />
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
  launchLogoGroup: {
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: 1000,
    position: 'absolute',
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
