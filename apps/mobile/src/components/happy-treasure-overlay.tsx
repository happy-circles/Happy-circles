import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Modal,
  Platform,
  StyleSheet,
  View,
} from 'react-native';

import { AppText } from '@/components/app-text';
import { HappyCirclesMotion } from '@/components/happy-circles-motion';
import { triggerAppEmphasisHaptic, triggerAppSuccessHaptic } from '@/lib/app-haptics';
import { theme } from '@/lib/theme';
import { useAppTheme } from '@/providers/theme-provider';

const SHOULD_USE_NATIVE_DRIVER = Platform.OS !== 'web';
const REWARD_EXIT_DELAY_MS = 840;

export interface HappyTreasureRewardInput {
  readonly message?: string;
  readonly scoreDelta: number;
  readonly startingTotalFaces: number;
  readonly title?: string;
}

interface HappyTreasureRewardState extends HappyTreasureRewardInput {
  readonly key: number;
}

const COIN_SPECS = [
  { burstX: -82, burstY: -78, targetX: 86, targetY: -118, rotate: '-28deg' },
  { burstX: -46, burstY: -112, targetX: 72, targetY: -126, rotate: '18deg' },
  { burstX: 0, burstY: -132, targetX: 58, targetY: -118, rotate: '-12deg' },
  { burstX: 48, burstY: -108, targetX: 44, targetY: -124, rotate: '26deg' },
  { burstX: 88, burstY: -72, targetX: 30, targetY: -112, rotate: '-18deg' },
  { burstX: -64, burstY: -34, targetX: 78, targetY: -104, rotate: '32deg' },
  { burstX: 62, burstY: -30, targetX: 46, targetY: -106, rotate: '-34deg' },
] as const;

function compactNumber(value: number): string {
  if (value > 9999) {
    return `${Math.floor(value / 1000)}k`;
  }

  return String(value);
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

function RewardCoin({
  index,
  progress,
}: {
  readonly index: number;
  readonly progress: Animated.Value;
}) {
  const activeTheme = useAppTheme();
  const spec = COIN_SPECS[index % COIN_SPECS.length];
  const translateX = progress.interpolate({
    inputRange: [0, 0.44, 1],
    outputRange: [0, spec.burstX, spec.targetX],
  });
  const translateY = progress.interpolate({
    inputRange: [0, 0.44, 1],
    outputRange: [0, spec.burstY, spec.targetY],
  });
  const scale = progress.interpolate({
    inputRange: [0, 0.16, 0.72, 1],
    outputRange: [0.35, 1.08, 0.96, 0.28],
  });
  const opacity = progress.interpolate({
    inputRange: [0, 0.08, 0.76, 1],
    outputRange: [0, 1, 1, 0],
  });
  const rotate = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: ['0deg', spec.rotate, '0deg'],
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.coin,
        {
          backgroundColor: activeTheme.colors.treasure,
          borderColor: activeTheme.colors.whiteAlphaStrong,
          opacity,
          transform: [{ translateX }, { translateY }, { rotate }, { scale }],
        },
      ]}
    >
      <Ionicons color={activeTheme.colors.white} name="happy" size={15} />
    </Animated.View>
  );
}

function TreasureChest({ openProgress }: { readonly openProgress: Animated.Value }) {
  const activeTheme = useAppTheme();
  const lidTranslateY = openProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -24],
  });
  const lidRotate = openProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '-16deg'],
  });
  const glowOpacity = openProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.08, 0.62],
  });
  const glowScale = openProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.72, 1.18],
  });

  return (
    <View style={styles.chestStage}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.chestGlow,
          {
            backgroundColor: activeTheme.colors.treasure,
            opacity: glowOpacity,
            transform: [{ scale: glowScale }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.chestLid,
          {
            backgroundColor: activeTheme.colors.treasure,
            borderColor: activeTheme.colors.whiteAlphaStrong,
            transform: [{ translateY: lidTranslateY }, { rotate: lidRotate }],
          },
        ]}
      >
        <View style={[styles.chestLidBand, { backgroundColor: activeTheme.colors.primary }]} />
      </Animated.View>
      <View
        style={[
          styles.chestBase,
          {
            backgroundColor: activeTheme.colors.treasure,
            borderColor: activeTheme.colors.whiteAlphaStrong,
          },
        ]}
      >
        <View style={[styles.chestBand, { backgroundColor: activeTheme.colors.primary }]} />
        <View style={[styles.chestLock, { backgroundColor: activeTheme.colors.white }]}>
          <Ionicons color={activeTheme.colors.treasure} name="happy" size={15} />
        </View>
      </View>
    </View>
  );
}

function HappyTreasureOverlay({
  message,
  onFinished,
  scoreDelta,
  startingTotalFaces,
  title = 'Circle completado',
}: HappyTreasureRewardInput & {
  readonly onFinished: () => void;
}) {
  const activeTheme = useAppTheme();
  const reducedMotion = useReducedMotion();
  const opacity = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(0.94)).current;
  const cardTranslateY = useRef(new Animated.Value(18)).current;
  const openProgress = useRef(new Animated.Value(0)).current;
  const burstProgress = useRef(new Animated.Value(0)).current;
  const countProgress = useRef(new Animated.Value(0)).current;
  const [displayedTotal, setDisplayedTotal] = useState(startingTotalFaces);
  const safeScoreDelta = Math.max(1, Math.round(scoreDelta));
  const finalTotalFaces = startingTotalFaces + safeScoreDelta;
  const subtitle = message ?? `Ganaste +${safeScoreDelta} Happy puntos`;

  useEffect(() => {
    setDisplayedTotal(startingTotalFaces);
    const listenerId = countProgress.addListener(({ value }) => {
      setDisplayedTotal(startingTotalFaces + Math.round(safeScoreDelta * value));
    });

    return () => {
      countProgress.removeListener(listenerId);
    };
  }, [countProgress, safeScoreDelta, startingTotalFaces]);

  useEffect(() => {
    opacity.setValue(0);
    cardScale.setValue(0.94);
    cardTranslateY.setValue(18);
    openProgress.setValue(0);
    burstProgress.setValue(0);
    countProgress.setValue(0);
    triggerAppEmphasisHaptic();

    const successTimeout = setTimeout(
      () => {
        triggerAppSuccessHaptic();
      },
      reducedMotion ? 220 : 620,
    );

    const enter = Animated.parallel([
      Animated.timing(opacity, {
        duration: 170,
        easing: Easing.out(Easing.cubic),
        toValue: 1,
        useNativeDriver: SHOULD_USE_NATIVE_DRIVER,
      }),
      Animated.spring(cardScale, {
        damping: 16,
        mass: 0.78,
        stiffness: 180,
        toValue: 1,
        useNativeDriver: SHOULD_USE_NATIVE_DRIVER,
      }),
      Animated.timing(cardTranslateY, {
        duration: 190,
        easing: Easing.out(Easing.cubic),
        toValue: 0,
        useNativeDriver: SHOULD_USE_NATIVE_DRIVER,
      }),
    ]);
    const reward = reducedMotion
      ? Animated.parallel([
          Animated.timing(openProgress, {
            duration: 180,
            easing: Easing.out(Easing.cubic),
            toValue: 1,
            useNativeDriver: SHOULD_USE_NATIVE_DRIVER,
          }),
          Animated.timing(burstProgress, {
            duration: 220,
            easing: Easing.out(Easing.cubic),
            toValue: 1,
            useNativeDriver: SHOULD_USE_NATIVE_DRIVER,
          }),
          Animated.timing(countProgress, {
            duration: 220,
            easing: Easing.out(Easing.cubic),
            toValue: 1,
            useNativeDriver: false,
          }),
        ])
      : Animated.sequence([
          Animated.delay(120),
          Animated.spring(openProgress, {
            damping: 12,
            mass: 0.75,
            stiffness: 170,
            toValue: 1,
            useNativeDriver: SHOULD_USE_NATIVE_DRIVER,
          }),
          Animated.parallel([
            Animated.timing(burstProgress, {
              duration: 1180,
              easing: Easing.bezier(0.18, 0.86, 0.22, 1),
              toValue: 1,
              useNativeDriver: SHOULD_USE_NATIVE_DRIVER,
            }),
            Animated.timing(countProgress, {
              duration: 960,
              easing: Easing.out(Easing.cubic),
              toValue: 1,
              useNativeDriver: false,
            }),
          ]),
        ]);
    const exit = Animated.parallel([
      Animated.timing(opacity, {
        duration: 170,
        easing: Easing.in(Easing.cubic),
        toValue: 0,
        useNativeDriver: SHOULD_USE_NATIVE_DRIVER,
      }),
      Animated.timing(cardScale, {
        duration: 170,
        easing: Easing.in(Easing.cubic),
        toValue: 0.97,
        useNativeDriver: SHOULD_USE_NATIVE_DRIVER,
      }),
      Animated.timing(cardTranslateY, {
        duration: 170,
        easing: Easing.in(Easing.cubic),
        toValue: 10,
        useNativeDriver: SHOULD_USE_NATIVE_DRIVER,
      }),
    ]);
    const animation = Animated.sequence([
      enter,
      reward,
      Animated.delay(REWARD_EXIT_DELAY_MS),
      exit,
    ]);

    animation.start(({ finished }) => {
      if (finished) {
        onFinished();
      }
    });

    return () => {
      clearTimeout(successTimeout);
      animation.stop();
    };
  }, [
    burstProgress,
    cardScale,
    cardTranslateY,
    countProgress,
    onFinished,
    openProgress,
    opacity,
    reducedMotion,
  ]);

  const coins = useMemo(
    () =>
      COIN_SPECS.map((_, index) => (
        <RewardCoin index={index} key={`coin-${index}`} progress={burstProgress} />
      )),
    [burstProgress],
  );

  return (
    <Modal
      animationType="none"
      onRequestClose={onFinished}
      statusBarTranslucent
      transparent
      visible
    >
      <Animated.View style={[styles.scrim, { backgroundColor: activeTheme.colors.scrim, opacity }]}>
        <Animated.View
          accessibilityLabel={`${title}. ${subtitle}. Total ${compactNumber(finalTotalFaces)} Happy puntos.`}
          accessibilityRole="summary"
          accessibilityViewIsModal
          accessible
          style={[
            styles.card,
            {
              backgroundColor: activeTheme.colors.floatingSurface,
              borderColor: activeTheme.colors.hairline,
              ...activeTheme.shadow.floating,
              transform: [{ translateY: cardTranslateY }, { scale: cardScale }],
            },
          ]}
        >
          <View style={styles.counterRow}>
            <View
              style={[
                styles.counterPill,
                {
                  backgroundColor: activeTheme.colors.treasureSoft,
                  borderColor: activeTheme.colors.treasure,
                },
              ]}
            >
              <Ionicons color={activeTheme.colors.treasure} name="happy" size={20} />
              <AppText style={[styles.counterValue, { color: activeTheme.colors.text }]}>
                {compactNumber(displayedTotal)}
              </AppText>
            </View>
          </View>

          <View style={styles.stage}>
            <View style={styles.motionMark}>
              <HappyCirclesMotion
                color={activeTheme.colors.treasure}
                size={54}
                tone="mono"
                variant="wink"
              />
            </View>
            {coins}
            <TreasureChest openProgress={openProgress} />
          </View>

          <View style={styles.copy}>
            <AppText
              adjustsFontSizeToFit
              minimumFontScale={0.86}
              numberOfLines={1}
              style={[styles.title, { color: activeTheme.colors.text }]}
            >
              {title}
            </AppText>
            <AppText
              adjustsFontSizeToFit
              minimumFontScale={0.82}
              numberOfLines={1}
              style={[styles.message, { color: activeTheme.colors.textMuted }]}
            >
              {subtitle}
            </AppText>
          </View>

          <View style={styles.deltaRow}>
            <View
              style={[
                styles.deltaBadge,
                {
                  backgroundColor: activeTheme.colors.treasureSoft,
                  borderColor: activeTheme.colors.treasure,
                },
              ]}
            >
              <AppText style={[styles.deltaText, { color: activeTheme.colors.treasure }]}>
                +{safeScoreDelta}
              </AppText>
            </View>
            <AppText style={[styles.deltaLabel, { color: activeTheme.colors.textMuted }]}>
              total {compactNumber(finalTotalFaces)}
            </AppText>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

export function useHappyTreasureReward(): {
  readonly clearReward: () => void;
  readonly rewardOverlay: ReactNode;
  readonly showReward: (input: HappyTreasureRewardInput) => Promise<void>;
} {
  const [reward, setReward] = useState<HappyTreasureRewardState | null>(null);
  const resolveRef = useRef<(() => void) | null>(null);

  const finishCurrentReward = useCallback(() => {
    if (resolveRef.current) {
      resolveRef.current();
      resolveRef.current = null;
    }
  }, []);

  const clearReward = useCallback(() => {
    setReward(null);
    finishCurrentReward();
  }, [finishCurrentReward]);

  const showReward = useCallback(
    (input: HappyTreasureRewardInput) => {
      finishCurrentReward();

      return new Promise<void>((resolve) => {
        resolveRef.current = resolve;
        setReward({
          ...input,
          key: Date.now(),
          scoreDelta: Math.max(1, Math.round(input.scoreDelta)),
          startingTotalFaces: Math.max(0, Math.round(input.startingTotalFaces)),
        });
      });
    },
    [finishCurrentReward],
  );

  const handleFinished = useCallback(() => {
    setReward(null);
    finishCurrentReward();
  }, [finishCurrentReward]);

  return {
    clearReward,
    rewardOverlay: reward ? (
      <HappyTreasureOverlay
        key={reward.key}
        message={reward.message}
        onFinished={handleFinished}
        scoreDelta={reward.scoreDelta}
        startingTotalFaces={reward.startingTotalFaces}
        title={reward.title}
      />
    ) : null,
    showReward,
  };
}

const styles = StyleSheet.create({
  scrim: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  card: {
    alignItems: 'center',
    borderRadius: theme.radius.large,
    borderWidth: 1,
    gap: theme.spacing.md,
    maxWidth: 360,
    overflow: 'hidden',
    padding: theme.spacing.lg,
    width: '100%',
  },
  counterRow: {
    alignItems: 'flex-end',
    alignSelf: 'stretch',
  },
  counterPill: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    minHeight: 42,
    minWidth: 92,
    paddingHorizontal: theme.spacing.sm,
  },
  counterValue: {
    fontSize: theme.typography.title3,
    fontWeight: '900',
    lineHeight: 23,
  },
  stage: {
    alignItems: 'center',
    height: 196,
    justifyContent: 'flex-end',
    overflow: 'visible',
    position: 'relative',
    width: 260,
  },
  motionMark: {
    left: 18,
    opacity: 0.36,
    position: 'absolute',
    top: 4,
  },
  coin: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    borderWidth: 1.5,
    height: 30,
    justifyContent: 'center',
    left: 115,
    position: 'absolute',
    top: 112,
    width: 30,
    zIndex: 4,
  },
  chestStage: {
    alignItems: 'center',
    height: 126,
    justifyContent: 'flex-end',
    position: 'relative',
    width: 178,
  },
  chestGlow: {
    borderRadius: 90,
    height: 150,
    position: 'absolute',
    top: -46,
    width: 150,
  },
  chestLid: {
    borderRadius: 18,
    borderWidth: 2,
    height: 54,
    overflow: 'hidden',
    position: 'absolute',
    top: 16,
    width: 148,
    zIndex: 3,
  },
  chestLidBand: {
    bottom: 0,
    height: 12,
    left: 0,
    opacity: 0.82,
    position: 'absolute',
    right: 0,
  },
  chestBase: {
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 2,
    height: 78,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 158,
    zIndex: 2,
  },
  chestBand: {
    bottom: 0,
    left: 0,
    opacity: 0.84,
    position: 'absolute',
    top: 0,
    width: 18,
  },
  chestLock: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  copy: {
    alignItems: 'center',
    alignSelf: 'stretch',
    gap: 4,
  },
  title: {
    fontSize: theme.typography.title2,
    fontWeight: '900',
    lineHeight: 28,
    textAlign: 'center',
  },
  message: {
    fontSize: theme.typography.callout,
    fontWeight: '700',
    lineHeight: 20,
    textAlign: 'center',
  },
  deltaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  deltaBadge: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 34,
    minWidth: 58,
    paddingHorizontal: theme.spacing.sm,
  },
  deltaText: {
    fontSize: theme.typography.callout,
    fontWeight: '900',
    lineHeight: 18,
  },
  deltaLabel: {
    fontSize: theme.typography.footnote,
    fontWeight: '700',
    lineHeight: 18,
  },
});
