import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Link, useRouter } from 'expo-router';
import type { NativeScrollEvent, NativeSyntheticEvent, StyleProp, ViewStyle } from 'react-native';
import {
  AccessibilityInfo,
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import { AppAvatar } from '@/components/app-avatar';
import { AppText } from '@/components/app-text';
import { HeaderBrandTitle } from '@/components/header-brand-title';
import { HappyCirclesOuterSvg, resolveHappyCirclesPalette } from '@/components/happy-circles-glyph';
import { pushRoute } from '@/lib/navigation';
import { theme } from '@/lib/theme';

const HOME_CHROME_MORPH_START_Y = 2;
const HOME_CHROME_COMPACT_STATE_Y = 88;
const HOME_CHROME_EXPANDED_STATE_Y = 18;
const HOME_CHROME_COMPACT_PROGRESS = 0.82;
const HOME_CHROME_EXPANDED_PROGRESS = 0.18;
const HOME_CHROME_SCROLL_EXPAND_DISTANCE = 82;
const HOME_CHROME_SCROLL_COMPACT_DISTANCE = 112;
const HOME_CHROME_CONTENT_MAX_WIDTH = 560;
const HOME_CHROME_PROFILE_BUTTON_SIZE = 48;
const HOME_CHROME_AVATAR_SIZE = 40;
const HOME_CHROME_PROFILE_CARD_AVATAR_INSET = theme.spacing.sm;
const HOME_CHROME_PROFILE_LEADING_OFFSET =
  HOME_CHROME_PROFILE_CARD_AVATAR_INSET -
  (HOME_CHROME_PROFILE_BUTTON_SIZE - HOME_CHROME_AVATAR_SIZE) / 2;
const HOME_CHROME_COMPACT_LOGO_SIZE = 78;
const HOME_CHROME_EXPANDED_LOGO_SIZE = 60;
const HOME_CHROME_EXPANDED_BRAND_WIDTH = 246;
const HOME_CHROME_EXPANDED_ACTION_SIZE = 48;
const HOME_CHROME_GLASS_COMPACT_SIZE = 92;
const HOME_CHROME_GLASS_COMPACT_RADIUS = HOME_CHROME_GLASS_COMPACT_SIZE / 2;
const HOME_CHROME_GLASS_EXPANDED_HEIGHT = 68;
const HOME_CHROME_FAB_COMPACT_SIZE = HOME_CHROME_GLASS_EXPANDED_HEIGHT;
const HOME_CHROME_FAB_EXPANDED_WIDTH = 136;
const HOME_CHROME_FAB_RADIUS = HOME_CHROME_FAB_COMPACT_SIZE / 2;
const HOME_CHROME_TOP_GAP = theme.spacing.xs;

export const HOME_CHROME_EXPANDED_HEIGHT = 86;

type HomeChromeProgress = Animated.Value;

const liquidGlassPlatformStyle = Platform.select({
  web: {
    WebkitBackdropFilter: 'blur(38px) saturate(220%)',
    backdropFilter: 'blur(38px) saturate(220%)',
    boxShadow: '0 22px 54px rgba(15, 23, 40, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.86)',
  },
  ios: {
    shadowColor: '#0f1728',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.16,
    shadowRadius: 34,
  },
  default: {
    elevation: 9,
  },
}) as object | undefined;

const shouldMountNativeGlass = Platform.OS === 'ios';
const hasNativeLiquidGlass = shouldMountNativeGlass && isLiquidGlassAvailable();
const liquidGlassBackgroundColor = hasNativeLiquidGlass
  ? 'rgba(255, 255, 255, 0.12)'
  : 'rgba(255, 255, 255, 0.94)';
const fabGlassBackgroundColor = hasNativeLiquidGlass
  ? 'rgba(255, 255, 255, 0.1)'
  : 'rgba(255, 255, 255, 0.9)';
const liquidGlassTopGlowBackgroundColor = hasNativeLiquidGlass
  ? 'rgba(255, 255, 255, 0.24)'
  : 'rgba(255, 255, 255, 0.82)';
const liquidGlassTopGlowOpacity = hasNativeLiquidGlass ? 0.42 : 0.96;

function LiquidGlassSurface({
  children,
  showGlow = true,
  style,
  tintColor = 'rgba(255, 255, 255, 0.04)',
}: {
  readonly children?: ReactNode;
  readonly showGlow?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly tintColor?: string;
}) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, style]}>
      {shouldMountNativeGlass ? (
        <GlassView
          colorScheme="light"
          glassEffectStyle="regular"
          pointerEvents="none"
          style={styles.nativeLiquidGlass}
          tintColor={tintColor}
        />
      ) : null}
      {showGlow ? <View pointerEvents="none" style={styles.liquidGlassTopGlow} /> : null}
      {children}
    </View>
  );
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

function compactCountLabel(count: number) {
  return count > 99 ? '99+' : String(count);
}

function clampProgress(value: number) {
  return Math.min(1, Math.max(0, value));
}

export function useCollapsibleHomeChrome(scrollTopInset = 0) {
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
      const y = Math.max(0, event.nativeEvent.contentOffset.y + scrollTopInset);
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
    [reducedMotion, scrollTopInset, setProgressValue],
  );

  return { isCompact, onScroll, progress };
}

function HomeCompactAvatarFrame({ progress }: { readonly progress: HomeChromeProgress }) {
  const maskId = useMemo(() => `home-compact-brand-${Math.random().toString(36).slice(2)}`, []);
  const palette = resolveHappyCirclesPalette('brand');
  const opacity = progress.interpolate({
    inputRange: [0, 0.34, 1],
    outputRange: [0, 0.42, 1],
  });
  const rotate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '-45deg'],
  });
  const scale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.9, 1],
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.compactAvatarFrame,
        {
          opacity,
          transform: [{ rotate }, { scale }],
        },
      ]}
    >
      <HappyCirclesOuterSvg
        maskId={maskId}
        palette={palette}
        size={HOME_CHROME_COMPACT_LOGO_SIZE}
      />
    </Animated.View>
  );
}

function HomeActivityButton({ count }: { readonly count: number }) {
  const hasAttention = count > 0;

  return (
    <Link href="/activity" asChild>
      <Pressable
        accessibilityLabel={
          hasAttention ? `${compactCountLabel(count)} notificaciones no vistas` : 'Actividad'
        }
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.activityButton,
          hasAttention ? styles.activityButtonActive : null,
          pressed ? styles.pressed : null,
        ]}
      >
        <Ionicons
          color={hasAttention ? theme.colors.primary : theme.colors.text}
          name={hasAttention ? 'notifications' : 'notifications-outline'}
          size={24}
        />
        {hasAttention ? (
          <View style={styles.activityBadge}>
            <AppText style={styles.activityBadgeText}>{compactCountLabel(count)}</AppText>
          </View>
        ) : null}
      </Pressable>
    </Link>
  );
}

export function HomeCollapsibleChrome({
  avatarLabel,
  avatarUrl,
  isCompact,
  notificationCount,
  progress,
  topInset,
}: {
  readonly avatarLabel: string;
  readonly avatarUrl: string | null;
  readonly isCompact: boolean;
  readonly notificationCount: number;
  readonly progress: HomeChromeProgress;
  readonly topInset: number;
}) {
  const { width } = useWindowDimensions();
  const contentWidth = Math.min(
    HOME_CHROME_CONTENT_MAX_WIDTH,
    Math.max(0, width - theme.spacing.lg * 2),
  );
  const contentLeft = (width - contentWidth) / 2;
  const expandedContentGap = contentWidth < 380 ? theme.spacing.xs : theme.spacing.md;
  const expandedActionTrailingOffset =
    contentWidth < 380 ? theme.spacing.xxs : HOME_CHROME_PROFILE_LEADING_OFFSET;
  const expandedBrandMaxWidth = Math.min(
    HOME_CHROME_EXPANDED_BRAND_WIDTH,
    Math.max(
      HOME_CHROME_EXPANDED_LOGO_SIZE,
      contentWidth -
        HOME_CHROME_PROFILE_BUTTON_SIZE -
        HOME_CHROME_PROFILE_LEADING_OFFSET -
        HOME_CHROME_EXPANDED_ACTION_SIZE -
        expandedActionTrailingOffset -
        expandedContentGap * 2,
    ),
  );
  const rowCenterY = topInset + HOME_CHROME_TOP_GAP + HOME_CHROME_EXPANDED_LOGO_SIZE / 2;
  const profileCenterX =
    contentLeft + HOME_CHROME_PROFILE_LEADING_OFFSET + HOME_CHROME_PROFILE_BUTTON_SIZE / 2;
  const glassExpandedTop = rowCenterY - HOME_CHROME_GLASS_EXPANDED_HEIGHT / 2;
  const glassCompactLeft = profileCenterX - HOME_CHROME_GLASS_COMPACT_SIZE / 2;
  const glassCompactTop = rowCenterY - HOME_CHROME_GLASS_COMPACT_SIZE / 2;
  const glassLeft = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [contentLeft, glassCompactLeft],
  });
  const glassTop = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [glassExpandedTop, glassCompactTop],
  });
  const glassWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [contentWidth, HOME_CHROME_GLASS_COMPACT_SIZE],
  });
  const glassHeight = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [HOME_CHROME_GLASS_EXPANDED_HEIGHT, HOME_CHROME_GLASS_COMPACT_SIZE],
  });
  const glassRadius = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [HOME_CHROME_GLASS_EXPANDED_HEIGHT / 2, HOME_CHROME_GLASS_COMPACT_RADIUS],
  });
  const expandedBrandOpacity = progress.interpolate({
    inputRange: [0, 0.18, 0.62, 1],
    outputRange: [1, 1, 0, 0],
  });
  const expandedBrandClipWidth = progress.interpolate({
    inputRange: [0, 0.04, 0.62, 1],
    outputRange: [expandedBrandMaxWidth, expandedBrandMaxWidth, 0, 0],
  });
  const expandedBrandScale = progress.interpolate({
    inputRange: [0, 0.24, 1],
    outputRange: [1, 0.98, 0.98],
  });
  const expandedBrandTranslateX = progress.interpolate({
    inputRange: [0, 0.24, 1],
    outputRange: [0, -3, -3],
  });
  const expandedBrandTranslateY = progress.interpolate({
    inputRange: [0, 0.24, 1],
    outputRange: [0, -1, -1],
  });
  const actionOpacity = progress.interpolate({
    inputRange: [0, 0.08, 1],
    outputRange: [1, 0, 0],
  });
  const actionScale = progress.interpolate({
    inputRange: [0, 0.16, 1],
    outputRange: [1, 0.9, 0.9],
  });
  const actionTranslateX = progress.interpolate({
    inputRange: [0, 0.16, 1],
    outputRange: [0, -10, -10],
  });
  const actionTranslateY = progress.interpolate({
    inputRange: [0, 0.16, 1],
    outputRange: [0, -2, -2],
  });

  return (
    <View
      pointerEvents="box-none"
      style={[styles.chromeRoot, { height: topInset + HOME_CHROME_EXPANDED_HEIGHT }]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.liquidGlass,
          liquidGlassPlatformStyle,
          {
            borderRadius: glassRadius,
            height: glassHeight,
            left: glassLeft,
            top: glassTop,
            width: glassWidth,
          },
        ]}
      >
        <LiquidGlassSurface />
      </Animated.View>
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
        <View style={[styles.expandedContent, { gap: expandedContentGap }]}>
          <View style={styles.profileCluster}>
            <Link href="/profile" asChild>
              <Pressable
                accessibilityLabel="Abrir perfil"
                accessibilityRole="button"
                style={({ pressed }) => [styles.profileButton, pressed ? styles.pressed : null]}
              >
                <View style={styles.profileVisual}>
                  <HomeCompactAvatarFrame progress={progress} />
                  <View style={styles.avatarAnchor}>
                    <AppAvatar
                      imageUrl={avatarUrl}
                      label={avatarLabel}
                      size={HOME_CHROME_AVATAR_SIZE}
                    />
                  </View>
                </View>
              </Pressable>
            </Link>
          </View>
          <Animated.View
            style={[
              styles.expandedBrand,
              {
                opacity: expandedBrandOpacity,
                width: expandedBrandMaxWidth,
                transform: [
                  { translateX: expandedBrandTranslateX },
                  { translateY: expandedBrandTranslateY },
                  { scale: expandedBrandScale },
                ],
              },
            ]}
          >
            <Animated.View style={[styles.expandedBrandClip, { width: expandedBrandClipWidth }]}>
              <View style={[styles.expandedBrandContent, { width: expandedBrandMaxWidth }]}>
                <HeaderBrandTitle logoSize={60} titleSize={22} />
              </View>
            </Animated.View>
          </Animated.View>
          <Animated.View
            pointerEvents={isCompact ? 'none' : 'auto'}
            style={[
              styles.expandedAction,
              {
                marginRight: expandedActionTrailingOffset,
                opacity: actionOpacity,
                transform: [
                  { translateX: actionTranslateX },
                  { translateY: actionTranslateY },
                  { scale: actionScale },
                ],
              },
            ]}
          >
            <HomeActivityButton count={notificationCount} />
          </Animated.View>
        </View>
      </Animated.View>
    </View>
  );
}

export function HomeRegisterFab({
  bottomInset,
  progress,
}: {
  readonly bottomInset: number;
  readonly isCompact: boolean;
  readonly progress: HomeChromeProgress;
}) {
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const contentWidth = Math.min(
    HOME_CHROME_CONTENT_MAX_WIDTH,
    Math.max(0, windowWidth - theme.spacing.lg * 2),
  );
  const contentRight = Math.max(theme.spacing.lg, (windowWidth - contentWidth) / 2);
  const width = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [HOME_CHROME_FAB_EXPANDED_WIDTH, HOME_CHROME_FAB_COMPACT_SIZE],
  });
  const labelOpacity = progress.interpolate({
    inputRange: [0, 0.08, 1],
    outputRange: [1, 0, 0],
  });
  const labelWidth = progress.interpolate({
    inputRange: [0, 0.16, 1],
    outputRange: [64, 0, 0],
  });
  const labelMarginLeft = progress.interpolate({
    inputRange: [0, 0.16, 1],
    outputRange: [6, 0, 0],
  });

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.fabWrap,
        {
          bottom: 28 + bottomInset,
          height: HOME_CHROME_FAB_COMPACT_SIZE,
          right: contentRight,
          width,
        },
      ]}
    >
      <Pressable
        accessibilityLabel="Registrar movimiento"
        accessibilityRole="button"
        onPress={() => pushRoute(router, '/register')}
        style={({ pressed }) => [styles.fab, pressed ? styles.pressed : null]}
      >
        <LiquidGlassSurface showGlow={false} tintColor="rgba(255, 255, 255, 0.035)" />
        <Ionicons color={theme.colors.text} name="add" size={28} />
        <Animated.View
          pointerEvents="none"
          style={[
            styles.fabLabelWrap,
            {
              marginLeft: labelMarginLeft,
              opacity: labelOpacity,
              width: labelWidth,
            },
          ]}
        >
          <AppText numberOfLines={1} style={styles.fabLabel}>
            Registro
          </AppText>
        </Animated.View>
      </Pressable>
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
  liquidGlass: {
    backgroundColor: liquidGlassBackgroundColor,
    borderColor: 'rgba(255, 255, 255, 0.96)',
    borderWidth: 1.25,
    overflow: 'hidden',
    position: 'absolute',
    zIndex: 1,
  },
  nativeLiquidGlass: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: theme.radius.pill,
  },
  liquidGlassTopGlow: {
    backgroundColor: liquidGlassTopGlowBackgroundColor,
    borderRadius: theme.radius.pill,
    height: 8,
    left: 14,
    opacity: liquidGlassTopGlowOpacity,
    position: 'absolute',
    right: 14,
    top: 5,
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
    overflow: 'visible',
    position: 'relative',
    width: HOME_CHROME_PROFILE_BUTTON_SIZE,
    zIndex: 2,
  },
  profileCluster: {
    height: HOME_CHROME_PROFILE_BUTTON_SIZE,
    marginLeft: HOME_CHROME_PROFILE_LEADING_OFFSET,
    position: 'relative',
    width: HOME_CHROME_PROFILE_BUTTON_SIZE,
    zIndex: 4,
  },
  profileVisual: {
    alignItems: 'center',
    height: HOME_CHROME_COMPACT_LOGO_SIZE,
    justifyContent: 'center',
    left: -(HOME_CHROME_COMPACT_LOGO_SIZE - HOME_CHROME_PROFILE_BUTTON_SIZE) / 2,
    position: 'absolute',
    top: -(HOME_CHROME_COMPACT_LOGO_SIZE - HOME_CHROME_PROFILE_BUTTON_SIZE) / 2,
    width: HOME_CHROME_COMPACT_LOGO_SIZE,
  },
  compactAvatarFrame: {
    height: HOME_CHROME_COMPACT_LOGO_SIZE,
    left: 0,
    position: 'absolute',
    top: 0,
    width: HOME_CHROME_COMPACT_LOGO_SIZE,
    zIndex: 1,
  },
  avatarAnchor: {
    position: 'relative',
    zIndex: 3,
  },
  expandedBrand: {
    alignItems: 'flex-start',
    flexShrink: 0,
    width: HOME_CHROME_EXPANDED_BRAND_WIDTH,
  },
  expandedBrandClip: {
    overflow: 'hidden',
  },
  expandedBrandContent: {
    width: HOME_CHROME_EXPANDED_BRAND_WIDTH,
  },
  expandedAction: {
    alignItems: 'center',
    height: 48,
    justifyContent: 'center',
    marginRight: HOME_CHROME_PROFILE_LEADING_OFFSET,
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
  activityBadge: {
    alignItems: 'center',
    backgroundColor: theme.colors.danger,
    borderColor: theme.colors.surface,
    borderRadius: theme.radius.pill,
    borderWidth: 2,
    height: 19,
    justifyContent: 'center',
    minWidth: 19,
    paddingHorizontal: 5,
    position: 'absolute',
    right: -4,
    top: -4,
  },
  activityBadgeText: {
    color: theme.colors.white,
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 12,
  },
  fabWrap: {
    alignItems: 'center',
    borderRadius: HOME_CHROME_FAB_RADIUS,
    height: HOME_CHROME_FAB_COMPACT_SIZE,
    justifyContent: 'center',
    maxHeight: HOME_CHROME_FAB_COMPACT_SIZE,
    maxWidth: HOME_CHROME_FAB_EXPANDED_WIDTH,
    minHeight: HOME_CHROME_FAB_COMPACT_SIZE,
    minWidth: HOME_CHROME_FAB_COMPACT_SIZE,
    position: 'absolute',
    zIndex: 42,
  },
  fab: {
    alignItems: 'center',
    backgroundColor: fabGlassBackgroundColor,
    borderColor: 'rgba(255, 255, 255, 0.96)',
    borderWidth: 1.25,
    borderRadius: HOME_CHROME_FAB_RADIUS,
    flexDirection: 'row',
    height: HOME_CHROME_FAB_COMPACT_SIZE,
    justifyContent: 'center',
    maxHeight: HOME_CHROME_FAB_COMPACT_SIZE,
    maxWidth: HOME_CHROME_FAB_EXPANDED_WIDTH,
    minHeight: HOME_CHROME_FAB_COMPACT_SIZE,
    minWidth: HOME_CHROME_FAB_COMPACT_SIZE,
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
    ...liquidGlassPlatformStyle,
  },
  fabLabelWrap: {
    overflow: 'hidden',
  },
  fabLabel: {
    color: theme.colors.text,
    fontSize: theme.typography.footnote,
    fontWeight: '800',
    lineHeight: 17,
  },
  pressed: {
    opacity: 0.68,
  },
});
