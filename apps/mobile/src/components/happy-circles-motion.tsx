import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, View } from 'react-native';

import {
  HappyCirclesBottomPieceSvg,
  HappyCirclesCenterSvg,
  HappyCirclesGlyph,
  HappyCirclesLeftPieceSvg,
  HappyCirclesOuterSvg,
  HappyCirclesRightPieceSvg,
  HappyCirclesTopPieceSvg,
  type HappyCirclesTone,
  resolveHappyCirclesPalette,
} from '@/components/happy-circles-glyph';

type HappyCirclesMotionVariant = 'idle' | 'splash' | 'loading' | 'refresh' | 'success' | 'wink';
const SHOULD_USE_NATIVE_DRIVER = Platform.OS !== 'web';

export interface HappyCirclesMotionProps {
  readonly active?: boolean;
  readonly color?: string;
  readonly size?: number;
  readonly style?: StyleProp<ViewStyle>;
  readonly tone?: HappyCirclesTone;
  readonly variant?: HappyCirclesMotionVariant;
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

function createMaskId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

function AbsoluteLayer({
  children,
  size,
  style,
}: {
  readonly children: ReactNode;
  readonly size: number;
  readonly style?: StyleProp<ViewStyle>;
}) {
  return (
    <Animated.View
      style={[
        styles.layer,
        {
          height: size,
          width: size,
        },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
}

export function HappyCirclesMotion({
  active = true,
  color,
  size = 52,
  style,
  tone = 'brand',
  variant = 'idle',
}: HappyCirclesMotionProps) {
  const reducedMotion = useReducedMotion();
  const palette = resolveHappyCirclesPalette(tone, color);
  const outerMaskId = useMemo(() => createMaskId('happy-circles-outer'), []);
  const topMaskId = useMemo(() => createMaskId('happy-circles-top'), []);
  const leftMaskId = useMemo(() => createMaskId('happy-circles-left'), []);
  const rightMaskId = useMemo(() => createMaskId('happy-circles-right'), []);
  const progress = useRef(new Animated.Value(variant === 'splash' ? 0 : 1)).current;
  const rotation = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const success = useRef(new Animated.Value(0)).current;
  const wink = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    progress.stopAnimation();

    if (!active || reducedMotion) {
      progress.setValue(1);
      return;
    }

    if (variant === 'splash') {
      progress.setValue(0);
      Animated.timing(progress, {
        duration: 700,
        easing: Easing.out(Easing.cubic),
        toValue: 1,
        useNativeDriver: SHOULD_USE_NATIVE_DRIVER,
      }).start();
      return;
    }

    if (variant === 'refresh') {
      progress.setValue(0.45);
      Animated.timing(progress, {
        duration: 360,
        easing: Easing.out(Easing.cubic),
        toValue: 1,
        useNativeDriver: SHOULD_USE_NATIVE_DRIVER,
      }).start();
      return;
    }

    progress.setValue(1);
  }, [active, progress, reducedMotion, variant]);

  useEffect(() => {
    rotation.stopAnimation();
    rotation.setValue(0);

    if (!active || reducedMotion || (variant !== 'loading' && variant !== 'refresh')) {
      return;
    }

    const loop = Animated.loop(
      Animated.timing(rotation, {
        duration: variant === 'refresh' ? 1200 : 1400,
        easing: Easing.linear,
        toValue: 1,
        useNativeDriver: SHOULD_USE_NATIVE_DRIVER,
      }),
    );

    loop.start();
    return () => {
      loop.stop();
    };
  }, [active, reducedMotion, rotation, variant]);

  useEffect(() => {
    pulse.stopAnimation();
    pulse.setValue(0);

    if (!active || reducedMotion || (variant !== 'loading' && variant !== 'refresh')) {
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          duration: 550,
          easing: Easing.inOut(Easing.quad),
          toValue: 1,
          useNativeDriver: SHOULD_USE_NATIVE_DRIVER,
        }),
        Animated.timing(pulse, {
          duration: 550,
          easing: Easing.inOut(Easing.quad),
          toValue: 0,
          useNativeDriver: SHOULD_USE_NATIVE_DRIVER,
        }),
      ]),
    );

    loop.start();
    return () => {
      loop.stop();
    };
  }, [active, pulse, reducedMotion, variant]);

  useEffect(() => {
    success.stopAnimation();
    success.setValue(0);

    if (!active || reducedMotion || variant !== 'success') {
      return;
    }

    Animated.sequence([
      Animated.timing(success, {
        duration: 210,
        easing: Easing.out(Easing.cubic),
        toValue: 1,
        useNativeDriver: SHOULD_USE_NATIVE_DRIVER,
      }),
      Animated.timing(success, {
        duration: 340,
        easing: Easing.out(Easing.cubic),
        toValue: 0,
        useNativeDriver: SHOULD_USE_NATIVE_DRIVER,
      }),
    ]).start();
  }, [active, reducedMotion, success, variant]);

  useEffect(() => {
    wink.stopAnimation();
    wink.setValue(0);

    if (!active || reducedMotion || variant !== 'wink') {
      return;
    }

    Animated.sequence([
      Animated.timing(wink, {
        duration: 90,
        easing: Easing.out(Easing.quad),
        toValue: 1,
        useNativeDriver: SHOULD_USE_NATIVE_DRIVER,
      }),
      Animated.timing(wink, {
        duration: 90,
        easing: Easing.in(Easing.quad),
        toValue: 0,
        useNativeDriver: SHOULD_USE_NATIVE_DRIVER,
      }),
    ]).start();
  }, [active, reducedMotion, variant, wink]);

  if (variant === 'idle' || reducedMotion) {
    return <HappyCirclesGlyph color={color} size={size} style={style} tone={tone} />;
  }

  const rotate = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
  const introOpacity = progress.interpolate({
    inputRange: [0, 0.35, 1],
    outputRange: [0, 0.78, 1],
  });
  const introScale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.86, 1],
  });
  const topTranslate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-size * 0.42, 0],
  });
  const leftTranslate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-size * 0.38, 0],
  });
  const rightTranslate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [size * 0.38, 0],
  });
  const bottomTranslate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [size * 0.42, 0],
  });
  const centerPulseScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.045],
  });
  const successScale = success.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.1],
  });
  const centerScale = variant === 'success' ? successScale : centerPulseScale;
  const normalCenterOpacity = wink.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });
  const winkCenterOpacity = wink.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const showSplashPieces = variant === 'splash';

  return (
    <View
      accessibilityLabel="Happy Circles"
      accessibilityRole="image"
      style={[styles.root, { height: size, width: size }, style]}
    >
      {showSplashPieces ? (
        <>
          <AbsoluteLayer
            size={size}
            style={{
              opacity: introOpacity,
              transform: [{ translateY: topTranslate }, { scale: introScale }],
            }}
          >
            <HappyCirclesTopPieceSvg maskId={topMaskId} palette={palette} size={size} />
          </AbsoluteLayer>
          <AbsoluteLayer
            size={size}
            style={{
              opacity: introOpacity,
              transform: [{ translateX: leftTranslate }, { scale: introScale }],
            }}
          >
            <HappyCirclesLeftPieceSvg maskId={leftMaskId} palette={palette} size={size} />
          </AbsoluteLayer>
          <AbsoluteLayer
            size={size}
            style={{
              opacity: introOpacity,
              transform: [{ translateX: rightTranslate }, { scale: introScale }],
            }}
          >
            <HappyCirclesRightPieceSvg maskId={rightMaskId} palette={palette} size={size} />
          </AbsoluteLayer>
          <AbsoluteLayer
            size={size}
            style={{
              opacity: introOpacity,
              transform: [{ translateY: bottomTranslate }, { scale: introScale }],
            }}
          >
            <HappyCirclesBottomPieceSvg palette={palette} size={size} />
          </AbsoluteLayer>
        </>
      ) : (
        <AbsoluteLayer
          size={size}
          style={{
            opacity: introOpacity,
            transform: [{ rotate }, { scale: introScale }],
          }}
        >
          <HappyCirclesOuterSvg maskId={outerMaskId} palette={palette} size={size} />
        </AbsoluteLayer>
      )}

      <AbsoluteLayer
        size={size}
        style={{
          opacity: variant === 'wink' ? normalCenterOpacity : introOpacity,
          transform: [{ scale: centerScale }],
        }}
      >
        <HappyCirclesCenterSvg palette={palette} size={size} />
      </AbsoluteLayer>

      {variant === 'wink' ? (
        <AbsoluteLayer
          size={size}
          style={{
            opacity: winkCenterOpacity,
            transform: [{ scale: centerScale }],
          }}
        >
          <HappyCirclesCenterSvg palette={palette} size={size} wink />
        </AbsoluteLayer>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    overflow: 'visible',
    position: 'relative',
  },
  layer: {
    left: 0,
    position: 'absolute',
    top: 0,
  },
});
