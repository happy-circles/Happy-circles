import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import {
  AccessibilityInfo,
  Animated,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import { AppAvatar } from '@/components/app-avatar';
import {
  HappyCirclesCenterSvg,
  HappyCirclesOuterSvg,
  resolveHappyCirclesPalette,
} from '@/components/happy-circles-glyph';
import { theme } from '@/lib/theme';
import { AppText } from '@/components/app-text';

const HOME_CHROME_MORPH_START_Y = 8;
const HOME_CHROME_COMPACT_STATE_Y = 88;
const HOME_CHROME_EXPANDED_STATE_Y = 18;
const HOME_CHROME_COMPACT_PROGRESS = 0.82;
const HOME_CHROME_EXPANDED_PROGRESS = 0.18;
const HOME_CHROME_SCROLL_EXPAND_DISTANCE = 82;
const HOME_CHROME_SCROLL_COMPACT_DISTANCE = 132;
const HOME_CHROME_PROFILE_BUTTON_SIZE = 48;
const HOME_CHROME_AVATAR_SIZE = 40;
const HOME_CHROME_EXPANDED_LOGO_SIZE = 60;
const HOME_CHROME_ANCHOR_LOGO_SIZE = 78;
const HOME_CHROME_LOGO_VISUAL_Y_OFFSET = 3;
const HOME_CHROME_BRAND_GAP = 6;
const HOME_CHROME_TITLE_SIZE = 22;
const HOME_CHROME_TITLE_LINE_HEIGHT = 28;
const HOME_CHROME_TITLE_WIDTH = 150;
const HOME_CHROME_BADGE_SIZE = 25;
const HOME_CHROME_BADGE_COMPACT_RADIUS = 0.34;
const HOME_CHROME_BADGE_COMPACT_ANGLE = -42;
const HOME_CHROME_TOP_GAP = theme.spacing.xs;
const HOME_CHROME_FAB_EXIT_DISTANCE = 88;

export const HOME_CHROME_EXPANDED_HEIGHT = 86;

type HomeChromeProgress = Animated.Value;

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

function compactCountLabel(count: number) {
  return count > 99 ? '99+' : String(count);
}

function clampProgress(value: number) {
  return Math.min(1, Math.max(0, value));
}

export function useCollapsibleHomeChrome() {
  const reducedMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;
  const progressValueRef = useRef(0);
  const [isCompact, setIsCompact] = useState(false);
  const isCompactRef = useRef(false);
  const lastYRef = useRef(0);

  const updateCompactState = useCallback((nextProgress: number) => {
    if (!isCompactRef.current && nextProgress >= HOME_CHROME_COMPACT_PROGRESS) {
      isCompactRef.current = true;
      setIsCompact(true);
      return;
    }

    if (isCompactRef.current && nextProgress <= HOME_CHROME_EXPANDED_PROGRESS) {
      isCompactRef.current = false;
      setIsCompact(false);
    }
  }, []);

  const setProgressValue = useCallback(
    (nextProgress: number) => {
      const clampedProgress = clampProgress(nextProgress);
      progressValueRef.current = clampedProgress;
      updateCompactState(clampedProgress);
      progress.setValue(clampedProgress);
    },
    [progress, updateCompactState],
  );

  useEffect(() => {
    setProgressValue(isCompactRef.current ? 1 : 0);
  }, [reducedMotion, setProgressValue]);

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = Math.max(0, event.nativeEvent.contentOffset.y);
      const delta = y - lastYRef.current;
      lastYRef.current = y;

      if (reducedMotion) {
        if (y <= HOME_CHROME_EXPANDED_STATE_Y || delta < 0) {
          setProgressValue(0);
          return;
        }

        if (y >= HOME_CHROME_COMPACT_STATE_Y || delta > 0) {
          setProgressValue(1);
        }
        return;
      }

      if (y <= HOME_CHROME_MORPH_START_Y) {
        setProgressValue(0);
        return;
      }

      if (delta < 0) {
        setProgressValue(
          progressValueRef.current - Math.abs(delta) / HOME_CHROME_SCROLL_EXPAND_DISTANCE,
        );
        return;
      }

      if (delta > 0) {
        setProgressValue(progressValueRef.current + delta / HOME_CHROME_SCROLL_COMPACT_DISTANCE);
      }
    },
    [reducedMotion, setProgressValue],
  );

  return { isCompact, onScroll, progress };
}

function HomeMorphLogo({
  compactCenterX,
  compactCenterY,
  expandedCenterX,
  expandedCenterY,
  progress,
}: {
  readonly compactCenterX: number;
  readonly compactCenterY: number;
  readonly expandedCenterX: number;
  readonly expandedCenterY: number;
  readonly progress: HomeChromeProgress;
}) {
  const maskId = useMemo(() => `home-morph-brand-${Math.random().toString(36).slice(2)}`, []);
  const palette = resolveHappyCirclesPalette('brand');
  const rotate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '-45deg'],
  });
  const faceOpacity = progress.interpolate({
    inputRange: [0, 0.42, 0.84],
    outputRange: [1, 0.42, 0],
  });
  const scale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [HOME_CHROME_EXPANDED_LOGO_SIZE / HOME_CHROME_ANCHOR_LOGO_SIZE, 1],
  });
  const left = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [
      expandedCenterX - HOME_CHROME_ANCHOR_LOGO_SIZE / 2,
      compactCenterX - HOME_CHROME_ANCHOR_LOGO_SIZE / 2,
    ],
  });
  const top = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [
      expandedCenterY - HOME_CHROME_ANCHOR_LOGO_SIZE / 2,
      compactCenterY - HOME_CHROME_ANCHOR_LOGO_SIZE / 2,
    ],
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.morphLogoLayer,
        {
          left,
          top,
          transform: [{ rotate }, { scale }],
        },
      ]}
    >
      <HappyCirclesOuterSvg maskId={maskId} palette={palette} size={HOME_CHROME_ANCHOR_LOGO_SIZE} />
      <Animated.View
        pointerEvents="none"
        style={[styles.morphLogoFaceLayer, { opacity: faceOpacity }]}
      >
        <HappyCirclesCenterSvg palette={palette} size={HOME_CHROME_ANCHOR_LOGO_SIZE} />
      </Animated.View>
    </Animated.View>
  );
}

function HomeActivityButton({
  count,
  isCompact,
}: {
  readonly count: number;
  readonly isCompact: boolean;
}) {
  const hasAttention = count > 0;

  return (
    <Link href="/activity" asChild>
      <Pressable
        accessibilityLabel={
          hasAttention ? `${compactCountLabel(count)} pendientes o notificaciones` : 'Actividad'
        }
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.activityButton,
          hasAttention ? styles.activityButtonActive : null,
          isCompact ? styles.activityButtonCompact : null,
          pressed ? styles.pressed : null,
        ]}
      >
        <Ionicons
          color={hasAttention ? theme.colors.primary : theme.colors.text}
          name={hasAttention ? 'notifications' : 'notifications-outline'}
          size={24}
        />
      </Pressable>
    </Link>
  );
}

export function HomeCollapsibleChrome({
  avatarLabel,
  avatarUrl,
  isCompact,
  notificationCount,
  pendingCount,
  progress,
  topInset,
}: {
  readonly avatarLabel: string;
  readonly avatarUrl: string | null;
  readonly isCompact: boolean;
  readonly notificationCount: number;
  readonly pendingCount: number;
  readonly progress: HomeChromeProgress;
  readonly topInset: number;
}) {
  const { width } = useWindowDimensions();
  const attentionCount = notificationCount > 0 ? notificationCount : pendingCount;
  const contentWidth = Math.min(560, Math.max(0, width - theme.spacing.lg * 2));
  const contentLeft = (width - contentWidth) / 2;
  const profileCenterX = contentLeft + HOME_CHROME_PROFILE_BUTTON_SIZE / 2;
  const profileCenterY =
    topInset + HOME_CHROME_TOP_GAP + HOME_CHROME_PROFILE_BUTTON_SIZE / 2;
  const expandedLogoCenterX =
    contentLeft + contentWidth / 2 - (HOME_CHROME_TITLE_WIDTH + HOME_CHROME_BRAND_GAP) / 2;
  const expandedLogoCenterY =
    topInset + HOME_CHROME_TOP_GAP + HOME_CHROME_EXPANDED_LOGO_SIZE / 2;
  const compactLogoCenterX = profileCenterX;
  const compactLogoCenterY = profileCenterY + HOME_CHROME_LOGO_VISUAL_Y_OFFSET;
  const badgeStartCenterX =
    contentLeft + contentWidth - HOME_CHROME_PROFILE_BUTTON_SIZE + 42;
  const badgeStartCenterY =
    topInset + HOME_CHROME_TOP_GAP + HOME_CHROME_BADGE_SIZE / 2 - 4;
  const compactBadgeAngle = (HOME_CHROME_BADGE_COMPACT_ANGLE * Math.PI) / 180;
  const compactBadgeRadius =
    HOME_CHROME_ANCHOR_LOGO_SIZE * HOME_CHROME_BADGE_COMPACT_RADIUS;
  const badgeFinalCenterX =
    compactLogoCenterX + Math.cos(compactBadgeAngle) * compactBadgeRadius;
  const badgeFinalCenterY =
    compactLogoCenterY + Math.sin(compactBadgeAngle) * compactBadgeRadius;
  const badgeLeft = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [
      badgeStartCenterX - HOME_CHROME_BADGE_SIZE / 2,
      badgeFinalCenterX - HOME_CHROME_BADGE_SIZE / 2,
    ],
  });
  const badgeTop = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [
      badgeStartCenterY - HOME_CHROME_BADGE_SIZE / 2,
      badgeFinalCenterY - HOME_CHROME_BADGE_SIZE / 2,
    ],
  });
  const titleOpacity = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 0.4, 0],
  });
  const titleTranslateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -6],
  });
  const actionOpacity = progress.interpolate({
    inputRange: [0, 0.72, 1],
    outputRange: [1, 0.28, 0],
  });
  const actionScale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.9],
  });
  const badgeScale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.08],
  });

  return (
    <View
      pointerEvents="box-none"
      style={[styles.chromeRoot, { height: topInset + HOME_CHROME_EXPANDED_HEIGHT }]}
    >
      <HomeMorphLogo
        compactCenterX={compactLogoCenterX}
        compactCenterY={compactLogoCenterY}
        expandedCenterX={expandedLogoCenterX}
        expandedCenterY={expandedLogoCenterY}
        progress={progress}
      />
      <Animated.View
        pointerEvents="box-none"
        style={[
          styles.expandedBar,
          {
            height: topInset + HOME_CHROME_EXPANDED_HEIGHT,
            paddingTop: topInset + HOME_CHROME_TOP_GAP,
          },
        ]}
      >
        <View style={styles.expandedContent}>
          <Link href="/profile" asChild>
            <Pressable
              accessibilityLabel="Abrir perfil"
              accessibilityRole="button"
              style={({ pressed }) => [styles.profileButton, pressed ? styles.pressed : null]}
            >
              <View style={styles.avatarAnchor}>
                <AppAvatar
                  imageUrl={avatarUrl}
                  label={avatarLabel}
                  size={HOME_CHROME_AVATAR_SIZE}
                />
              </View>
            </Pressable>
          </Link>
          <Animated.View
            style={[
              styles.expandedBrand,
              {
                opacity: titleOpacity,
                transform: [{ translateY: titleTranslateY }],
              },
            ]}
          >
            <View style={styles.titleLockup}>
              <View style={styles.titleLogoPlaceholder} />
              <AppText numberOfLines={1} style={styles.brandTitle}>
                Happy Circles
              </AppText>
            </View>
          </Animated.View>
          <Animated.View
            pointerEvents={isCompact ? 'none' : 'auto'}
            style={[
              styles.expandedAction,
              {
                opacity: actionOpacity,
                transform: [{ scale: actionScale }],
              },
            ]}
          >
            <HomeActivityButton count={attentionCount} isCompact={isCompact} />
          </Animated.View>
        </View>
      </Animated.View>

      {attentionCount > 0 ? (
        <Animated.View
          pointerEvents="box-none"
          style={[
            styles.morphBadgeWrap,
            {
              left: badgeLeft,
              top: badgeTop,
              transform: [{ scale: badgeScale }],
            },
          ]}
        >
          <Link href="/activity" asChild>
            <Pressable
              accessibilityLabel={`${compactCountLabel(
                attentionCount,
              )} pendientes o notificaciones`}
              accessibilityRole="button"
              hitSlop={8}
              style={({ pressed }) => [styles.morphBadge, pressed ? styles.pressed : null]}
            >
              <AppText style={styles.compactBadgeText}>{compactCountLabel(attentionCount)}</AppText>
            </Pressable>
          </Link>
        </Animated.View>
      ) : null}
    </View>
  );
}

export function HomeRegisterFab({
  bottomInset,
  isCompact,
  progress,
}: {
  readonly bottomInset: number;
  readonly isCompact: boolean;
  readonly progress: HomeChromeProgress;
}) {
  const opacity = progress.interpolate({
    inputRange: [0, 0.52, 1],
    outputRange: [1, 0.56, 0],
  });
  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, HOME_CHROME_FAB_EXIT_DISTANCE + bottomInset],
  });

  return (
    <Animated.View
      pointerEvents={isCompact ? 'none' : 'box-none'}
      style={[
        styles.fabWrap,
        {
          bottom: 28 + bottomInset,
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      <Link href="/register" asChild>
        <Pressable
          accessibilityLabel="Registrar movimiento"
          accessibilityRole="button"
          style={({ pressed }) => [styles.fab, pressed ? styles.pressed : null]}
        >
          <Ionicons color={theme.colors.white} name="add" size={22} />
          <AppText style={styles.fabLabel}>Registrar</AppText>
        </Pressable>
      </Link>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  chromeRoot: {
    left: 0,
    pointerEvents: 'box-none',
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 40,
  },
  expandedBar: {
    left: 0,
    paddingHorizontal: theme.spacing.lg,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 2,
  },
  expandedContent: {
    alignItems: 'center',
    alignSelf: 'center',
    flexDirection: 'row',
    gap: theme.spacing.md,
    justifyContent: 'space-between',
    maxWidth: 560,
    width: '100%',
  },
  profileButton: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    height: HOME_CHROME_PROFILE_BUTTON_SIZE,
    justifyContent: 'center',
    position: 'relative',
    width: HOME_CHROME_PROFILE_BUTTON_SIZE,
    zIndex: 2,
  },
  morphLogoLayer: {
    height: HOME_CHROME_ANCHOR_LOGO_SIZE,
    position: 'absolute',
    width: HOME_CHROME_ANCHOR_LOGO_SIZE,
    zIndex: 1,
  },
  morphLogoFaceLayer: {
    height: HOME_CHROME_ANCHOR_LOGO_SIZE,
    left: 0,
    position: 'absolute',
    top: 0,
    width: HOME_CHROME_ANCHOR_LOGO_SIZE,
  },
  avatarAnchor: {
    zIndex: 3,
  },
  expandedBrand: {
    alignItems: 'center',
    flex: 1,
  },
  titleLockup: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: HOME_CHROME_BRAND_GAP,
    justifyContent: 'center',
  },
  titleLogoPlaceholder: {
    height: HOME_CHROME_EXPANDED_LOGO_SIZE,
    width: HOME_CHROME_EXPANDED_LOGO_SIZE,
  },
  brandTitle: {
    color: theme.colors.text,
    fontSize: HOME_CHROME_TITLE_SIZE,
    fontWeight: '800',
    letterSpacing: 0,
    lineHeight: HOME_CHROME_TITLE_LINE_HEIGHT,
    width: HOME_CHROME_TITLE_WIDTH,
  },
  expandedAction: {
    alignItems: 'center',
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  activityButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.hairline,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    width: 48,
    ...theme.shadow.card,
  },
  activityButtonActive: {
    backgroundColor: theme.colors.primarySoft,
    borderColor: 'rgba(20, 30, 51, 0.12)',
  },
  activityButtonCompact: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    shadowOpacity: 0,
  },
  morphBadgeWrap: {
    position: 'absolute',
    zIndex: 48,
  },
  morphBadge: {
    alignItems: 'center',
    backgroundColor: theme.colors.danger,
    borderColor: theme.colors.surface,
    borderRadius: theme.radius.pill,
    borderWidth: 2,
    height: HOME_CHROME_BADGE_SIZE,
    justifyContent: 'center',
    minWidth: HOME_CHROME_BADGE_SIZE,
    paddingHorizontal: 5,
  },
  compactBadgeText: {
    color: theme.colors.white,
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 12,
  },
  fabWrap: {
    position: 'absolute',
    right: theme.spacing.lg,
    zIndex: 42,
  },
  fab: {
    alignItems: 'center',
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.pill,
    flexDirection: 'row',
    gap: theme.spacing.xs,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: 14,
    ...theme.shadow.floating,
  },
  fabLabel: {
    color: theme.colors.white,
    fontSize: theme.typography.footnote,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.68,
  },
});
