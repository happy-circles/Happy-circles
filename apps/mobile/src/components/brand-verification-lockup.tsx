import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';

import {
  BrandLockup,
  HEADER_BRAND_GAP,
  HEADER_BRAND_TITLE_LINE_HEIGHT,
  HEADER_BRAND_TITLE_SIZE,
  HEADER_BRAND_TITLE_WIDTH,
} from '@/components/brand-lockup';
import {
  HappyCirclesCenterSvg,
  HappyCirclesOuterSvg,
  resolveHappyCirclesPalette,
} from '@/components/happy-circles-glyph';
import { theme } from '@/lib/theme';

export type BrandVerificationState = 'idle' | 'loading' | 'success' | 'error';

export const BRAND_VERIFICATION_EASING = Easing.bezier(0.16, 1, 0.3, 1);

const DEFAULT_SIZE = 74;
const DEFAULT_RESULT_MS = 520;
const AVATAR_MARK_FACE_VIEW_BOX = '290 290 100 100';
const SPIN_FULL_TURN_MS = 1200;
const SPIN_RELEASE_MIN_MS = 220;
const SPIN_RELEASE_MAX_MS = 640;
const SPIN_RELEASE_EPSILON = 0.025;

function createMaskId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

function normalizeSpinValue(value: number) {
  return ((value % 1) + 1) % 1;
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

export function BrandVerificationMark({
  center,
  centerGlyphSize,
  centerGlyphViewBox,
  centerSize,
  outerRotationDegrees = 0,
  replaceCenterOnResult,
  resultTone,
  showOuterInIdle = false,
  size = DEFAULT_SIZE,
  state,
  style,
}: {
  readonly center?: ReactNode;
  readonly centerGlyphSize?: number;
  readonly centerGlyphViewBox?: string;
  readonly centerSize?: number;
  readonly outerRotationDegrees?: number;
  readonly replaceCenterOnResult?: boolean;
  readonly resultTone?: string;
  readonly showOuterInIdle?: boolean;
  readonly size?: number;
  readonly state: BrandVerificationState;
  readonly style?: StyleProp<ViewStyle>;
}) {
  const reducedMotion = useReducedMotion();
  const hasCustomCenter = center !== undefined;
  const shouldReplaceCenterOnResult = replaceCenterOnResult ?? true;
  const isResultState = state === 'success' || state === 'error';
  const shouldShowOuter = showOuterInIdle || state !== 'idle';
  const resolvedCenterSize = centerSize ?? (hasCustomCenter ? Math.round(size * 0.72) : size);
  const loadingMotion = useRef(new Animated.Value(state === 'loading' ? 1 : 0)).current;
  const outerMotion = useRef(new Animated.Value(shouldShowOuter ? 1 : 0)).current;
  const resultMotion = useRef(
    new Animated.Value(state === 'success' || state === 'error' ? 1 : 0),
  ).current;
  const spinMotion = useRef(new Animated.Value(0)).current;
  const spinReleaseRef = useRef<Animated.CompositeAnimation | null>(null);
  const spinWasLoadingRef = useRef(state === 'loading');
  const maskId = useMemo(() => createMaskId('brand-verification'), []);
  const brandPalette = useMemo(() => resolveHappyCirclesPalette('brand'), []);
  const idlePalette = useMemo(
    () => ({
      ...brandPalette,
      face: theme.colors.brandNavy,
      faceDetail: theme.colors.white,
    }),
    [brandPalette],
  );
  const loadingPalette = useMemo(
    () => ({
      ...brandPalette,
      face: theme.colors.brandCoral,
      faceDetail: theme.colors.white,
    }),
    [brandPalette],
  );
  const resultPalette = useMemo(
    () => ({
      ...brandPalette,
      face: resultTone ?? (state === 'error' ? theme.colors.danger : theme.colors.success),
      faceDetail: theme.colors.white,
    }),
    [brandPalette, resultTone, state],
  );

  useEffect(() => {
    Animated.timing(loadingMotion, {
      duration: reducedMotion ? 140 : 260,
      easing: reducedMotion ? Easing.out(Easing.quad) : BRAND_VERIFICATION_EASING,
      toValue: state === 'loading' ? 1 : 0,
      useNativeDriver: true,
    }).start();
  }, [loadingMotion, reducedMotion, state]);

  useEffect(() => {
    Animated.timing(outerMotion, {
      duration: reducedMotion ? 140 : 240,
      easing: reducedMotion ? Easing.out(Easing.quad) : BRAND_VERIFICATION_EASING,
      toValue: shouldShowOuter ? 1 : 0,
      useNativeDriver: true,
    }).start();
  }, [outerMotion, reducedMotion, shouldShowOuter]);

  useEffect(() => {
    resultMotion.stopAnimation();

    if (state !== 'success' && state !== 'error') {
      resultMotion.setValue(0);
      return;
    }

    resultMotion.setValue(0);
    Animated.sequence([
      Animated.timing(resultMotion, {
        duration: reducedMotion ? 140 : 170,
        easing: Easing.out(Easing.quad),
        toValue: 1,
        useNativeDriver: true,
      }),
      Animated.timing(resultMotion, {
        duration: reducedMotion ? 0 : 210,
        easing: BRAND_VERIFICATION_EASING,
        toValue: reducedMotion ? 1 : 0.82,
        useNativeDriver: true,
      }),
      Animated.timing(resultMotion, {
        duration: reducedMotion ? 0 : 140,
        easing: BRAND_VERIFICATION_EASING,
        toValue: 1,
        useNativeDriver: true,
      }),
    ]).start();
  }, [reducedMotion, resultMotion, state]);

  useEffect(() => {
    if (spinReleaseRef.current) {
      spinReleaseRef.current.stop();
      spinReleaseRef.current = null;
    }

    if (state !== 'loading' || reducedMotion) {
      const shouldReleaseSpin = spinWasLoadingRef.current && !reducedMotion;
      spinWasLoadingRef.current = false;

      spinMotion.stopAnimation((currentValue) => {
        const normalizedSpin = normalizeSpinValue(currentValue);

        if (
          !shouldReleaseSpin ||
          normalizedSpin <= SPIN_RELEASE_EPSILON ||
          normalizedSpin >= 1 - SPIN_RELEASE_EPSILON
        ) {
          spinMotion.setValue(0);
          return;
        }

        spinMotion.setValue(normalizedSpin);

        const remainingTurn = 1 - normalizedSpin;
        const releaseDuration = Math.max(
          SPIN_RELEASE_MIN_MS,
          Math.min(SPIN_RELEASE_MAX_MS, remainingTurn * SPIN_FULL_TURN_MS),
        );
        const releaseAnimation = Animated.timing(spinMotion, {
          duration: releaseDuration,
          easing: BRAND_VERIFICATION_EASING,
          toValue: 1,
          useNativeDriver: true,
        });

        spinReleaseRef.current = releaseAnimation;
        releaseAnimation.start(({ finished }) => {
          if (finished) {
            spinMotion.setValue(0);
          }
          if (spinReleaseRef.current === releaseAnimation) {
            spinReleaseRef.current = null;
          }
        });
      });
      return undefined;
    }

    spinWasLoadingRef.current = true;
    spinMotion.stopAnimation();
    spinMotion.setValue(0);

    const spinLoop = Animated.loop(
      Animated.timing(spinMotion, {
        duration: SPIN_FULL_TURN_MS,
        easing: Easing.linear,
        toValue: 1,
        useNativeDriver: true,
      }),
    );

    spinLoop.start();

    return () => {
      spinLoop.stop();
    };
  }, [reducedMotion, spinMotion, state]);

  const rotate = spinMotion.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
  const outerTransform =
    outerRotationDegrees === 0
      ? [{ rotate }]
      : [{ rotate: `${outerRotationDegrees}deg` }, { rotate }];
  const defaultIdleCenterOpacity = loadingMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });
  const defaultCenterLayerSize = hasCustomCenter
    ? size
    : Math.min(size, Math.max(1, centerGlyphSize ?? size));
  const defaultCenterLayerOffset = (size - defaultCenterLayerSize) / 2;
  const defaultCenterViewBox = hasCustomCenter ? undefined : centerGlyphViewBox;
  const resultLayerSize = hasCustomCenter ? resolvedCenterSize : defaultCenterLayerSize;
  const resultLayerOffset = (size - resultLayerSize) / 2;
  const resultLayerScale = resultMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [0.9, 1],
  });

  return (
    <View style={[styles.markStage, { height: size, width: size }, style]}>
      <Animated.View
        style={[
          styles.logoLayer,
          {
            height: size,
            opacity: outerMotion,
            transform: outerTransform,
            width: size,
          },
        ]}
      >
        <HappyCirclesOuterSvg maskId={maskId} palette={brandPalette} size={size} />
      </Animated.View>

      {hasCustomCenter ? (
        <View
          style={[
            styles.customCenterLayer,
            {
              borderRadius: resolvedCenterSize / 2,
              height: resolvedCenterSize,
              left: (size - resolvedCenterSize) / 2,
              opacity: shouldReplaceCenterOnResult && isResultState ? 0 : 1,
              top: (size - resolvedCenterSize) / 2,
              width: resolvedCenterSize,
            },
          ]}
        >
          {center}
        </View>
      ) : (
        <>
          <Animated.View
            style={[
              styles.logoLayer,
              {
                height: defaultCenterLayerSize,
                left: defaultCenterLayerOffset,
                opacity: defaultIdleCenterOpacity,
                top: defaultCenterLayerOffset,
                width: defaultCenterLayerSize,
              },
            ]}
          >
            <HappyCirclesCenterSvg
              palette={idlePalette}
              size={defaultCenterLayerSize}
              viewBox={defaultCenterViewBox}
            />
          </Animated.View>
          <Animated.View
            style={[
              styles.logoLayer,
              {
                height: defaultCenterLayerSize,
                left: defaultCenterLayerOffset,
                opacity: loadingMotion,
                top: defaultCenterLayerOffset,
                width: defaultCenterLayerSize,
              },
            ]}
          >
            <HappyCirclesCenterSvg
              palette={loadingPalette}
              size={defaultCenterLayerSize}
              viewBox={defaultCenterViewBox}
            />
          </Animated.View>
        </>
      )}

      <Animated.View
        style={[
          styles.logoLayer,
          {
            height: resultLayerSize,
            left: resultLayerOffset,
            opacity: hasCustomCenter
              ? shouldReplaceCenterOnResult && isResultState
                ? 1
                : 0
              : shouldReplaceCenterOnResult
                ? resultMotion
                : 0,
            top: resultLayerOffset,
            transform: [{ scale: resultLayerScale }],
            width: resultLayerSize,
          },
        ]}
      >
        <HappyCirclesCenterSvg
          palette={resultPalette}
          size={resultLayerSize}
          viewBox={hasCustomCenter ? AVATAR_MARK_FACE_VIEW_BOX : defaultCenterViewBox}
          wink={state === 'success'}
        />
      </Animated.View>
    </View>
  );
}

export function BrandVerificationLockup({
  center,
  centerSize,
  outerRotationDegrees,
  replaceCenterOnResult,
  accessibilityLabel = 'Happy Circles',
  gap = HEADER_BRAND_GAP,
  resultTone,
  size = DEFAULT_SIZE,
  state,
  style,
  title = 'Happy Circles',
  titleLineHeight,
  titleSize = HEADER_BRAND_TITLE_SIZE,
  titleWidth = HEADER_BRAND_TITLE_WIDTH,
}: {
  readonly center?: ReactNode;
  readonly centerSize?: number;
  readonly outerRotationDegrees?: number;
  readonly replaceCenterOnResult?: boolean;
  readonly accessibilityLabel?: string;
  readonly gap?: number;
  readonly resultTone?: string;
  readonly size?: number;
  readonly state: BrandVerificationState;
  readonly style?: StyleProp<ViewStyle>;
  readonly title?: string;
  readonly titleLineHeight?: number;
  readonly titleSize?: number;
  readonly titleWidth?: number;
}) {
  const reducedMotion = useReducedMotion();
  const focusMotion = useRef(new Animated.Value(state === 'loading' ? 1 : 0)).current;

  useEffect(() => {
    let duration = 420;
    if (state === 'loading') {
      duration = 360;
    }
    if (reducedMotion) {
      duration = 140;
    }

    Animated.timing(focusMotion, {
      duration,
      easing: reducedMotion ? Easing.out(Easing.quad) : BRAND_VERIFICATION_EASING,
      toValue: state === 'loading' ? 1 : 0,
      useNativeDriver: true,
    }).start();
  }, [focusMotion, reducedMotion, state]);

  const titleLineHeightValue =
    titleLineHeight ??
    (titleSize === HEADER_BRAND_TITLE_SIZE
      ? HEADER_BRAND_TITLE_LINE_HEIGHT
      : Math.round(titleSize * 1.25));
  const lockupWidth = size + gap + titleWidth;
  const lockupLogoCenterOffset = (titleWidth + gap) / 2;
  const titleOpacity = focusMotion.interpolate({
    inputRange: [0, 0.72, 1],
    outputRange: reducedMotion ? [1, 1, 1] : [1, 0.2, 0],
  });
  const titleTranslateY = focusMotion.interpolate({
    inputRange: [0, 1],
    outputRange: reducedMotion ? [0, 0] : [0, 20],
  });
  const lockupTranslateX = focusMotion.interpolate({
    inputRange: [0, 1],
    outputRange: reducedMotion ? [0, 0] : [0, lockupLogoCenterOffset],
  });

  return (
    <Animated.View style={[styles.container, { minHeight: size }, style]}>
      <BrandLockup
        accessibilityLabel={accessibilityLabel}
        gap={gap}
        logo={
          <BrandVerificationMark
            center={center}
            centerSize={centerSize}
            outerRotationDegrees={outerRotationDegrees}
            replaceCenterOnResult={replaceCenterOnResult}
            resultTone={resultTone}
            size={size}
            state={state}
          />
        }
        logoSize={size}
        logoStyle={styles.logoStage}
        style={[
          styles.lockup,
          {
            transform: [{ translateX: lockupTranslateX }],
            width: lockupWidth,
          },
        ]}
        title={title}
        titleContainerStyle={[
          {
            opacity: titleOpacity,
            transform: [{ translateY: titleTranslateY }],
            width: titleWidth,
          },
        ]}
        titleLineHeight={titleLineHeightValue}
        titleSize={titleSize}
      />
    </Animated.View>
  );
}

export const BRAND_VERIFICATION_RESULT_MS = DEFAULT_RESULT_MS;

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  lockup: {
    minHeight: DEFAULT_SIZE,
  },
  markStage: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
    position: 'relative',
  },
  logoStage: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    justifyContent: 'center',
    overflow: 'visible',
    position: 'relative',
  },
  logoLayer: {
    left: 0,
    position: 'absolute',
    top: 0,
  },
  customCenterLayer: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
  },
});
