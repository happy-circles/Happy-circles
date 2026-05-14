import { Ionicons } from '@expo/vector-icons';
import { type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  type ScrollView,
  type StyleProp,
  type TextStyle,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';

import { AppText } from '@/components/app-text';

export type LoopingInsightOption<T extends string> = {
  readonly label: string;
  readonly value: T;
};

export type LoopingInsightSwitcherStyles = {
  readonly filterRail: StyleProp<ViewStyle>;
  readonly filterStack: StyleProp<ViewStyle>;
  readonly filterViewport: StyleProp<ViewStyle>;
  readonly metricCarouselButton: StyleProp<ViewStyle>;
  readonly metricCarouselItem: StyleProp<ViewStyle>;
  readonly metricCarouselItemPressed: StyleProp<ViewStyle>;
  readonly metricCarouselShadow: StyleProp<ViewStyle>;
  readonly metricCarouselText: StyleProp<TextStyle>;
  readonly podiumPager: StyleProp<ViewStyle>;
  readonly podiumPagerPage: StyleProp<ViewStyle>;
  readonly syncedPodiumPage: StyleProp<ViewStyle>;
  readonly syncedPodiumTrack: StyleProp<ViewStyle>;
};

const SCROLL_SETTLE_EPSILON = 0.5;
const PROGRAMMATIC_SCROLL_FALLBACK_MS = 700;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function indexForOffset(offsetX: number, pageWidth: number, maxIndex: number): number {
  if (pageWidth <= 0) {
    return 0;
  }

  return clamp(Math.round(offsetX / pageWidth), 0, maxIndex);
}

export function LoopingInsightSwitcher<T extends string>({
  activeValue,
  colorForValue,
  compactLabelForValue,
  fallbackWidth,
  iconForValue,
  itemGap,
  itemWidth,
  onChange,
  options,
  renderPage,
  styles,
  values,
}: {
  readonly activeValue: T;
  readonly colorForValue: (value: T) => string;
  readonly compactLabelForValue: (value: T) => string;
  readonly fallbackWidth: number;
  readonly iconForValue: (value: T) => keyof typeof Ionicons.glyphMap;
  readonly itemGap: number;
  readonly itemWidth: number;
  readonly onChange: (value: T) => void;
  readonly options: readonly LoopingInsightOption<T>[];
  readonly renderPage: (value: T) => ReactNode;
  readonly styles: LoopingInsightSwitcherStyles;
  readonly values: readonly T[];
}) {
  const { width: windowWidth } = useWindowDimensions();
  const initialIndex = clamp(values.indexOf(activeValue), 0, Math.max(values.length - 1, 0));
  const [renderWindowCenterIndex, setRenderWindowCenterIndex] = useState(initialIndex);
  const [visualValue, setVisualValue] = useState(activeValue);
  const [podiumWidth, setPodiumWidth] = useState(0);
  const [filterWidth, setFilterWidth] = useState(0);
  const activeIndexRef = useRef(initialIndex);
  const activeValueRef = useRef(activeValue);
  const renderWindowCenterIndexRef = useRef(initialIndex);
  const visualValueRef = useRef(activeValue);
  const onChangeRef = useRef(onChange);
  const valuesRef = useRef(values);
  const pendingInternalValueRef = useRef<T | null>(null);
  const programmaticCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const podiumScrollRef = useRef<ScrollView | null>(null);
  const positionProgress = useRef(new Animated.Value(initialIndex)).current;
  const maxIndex = Math.max(values.length - 1, 0);
  const measuredWindowWidth = windowWidth > 0 ? windowWidth : fallbackWidth;
  const resolvedPodiumWidth = podiumWidth > 0 ? podiumWidth : measuredWindowWidth;
  const resolvedFilterWidth = filterWidth > 0 ? filterWidth : measuredWindowWidth;
  const lastPodiumOffsetXRef = useRef(initialIndex * resolvedPodiumWidth);
  const syncedPodiumWidthRef = useRef(resolvedPodiumWidth);
  const resolvedPodiumWidthRef = useRef(resolvedPodiumWidth);
  const itemStep = itemWidth + itemGap;
  const filterSidePadding = Math.max(0, (resolvedFilterWidth - itemWidth) / 2);
  const filterTrackWidth =
    filterSidePadding * 2 + values.length * itemWidth + Math.max(0, values.length - 1) * itemGap;
  const filterTrackStyle = {
    paddingLeft: filterSidePadding,
    paddingRight: filterSidePadding,
    transform: [
      {
        translateX: Animated.multiply(positionProgress, -itemStep),
      },
    ],
    width: filterTrackWidth,
  };
  const optionByValue = useMemo(() => new Map(options.map((option) => [option.value, option])), [
    options,
  ]);

  activeValueRef.current = activeValue;
  onChangeRef.current = onChange;
  valuesRef.current = values;
  resolvedPodiumWidthRef.current = resolvedPodiumWidth;

  function valueAtIndex(index: number): T | null {
    const currentValues = valuesRef.current;

    if (currentValues.length === 0) {
      return null;
    }

    return currentValues[clamp(Math.round(index), 0, currentValues.length - 1)] ?? null;
  }

  function updateVisualValue(nextValue: T | null) {
    if (!nextValue || visualValueRef.current === nextValue) {
      return;
    }

    visualValueRef.current = nextValue;
    setVisualValue(nextValue);
  }

  function updateRenderWindowCenter(index: number) {
    const targetIndex = clamp(Math.round(index), 0, maxIndex);

    if (renderWindowCenterIndexRef.current === targetIndex) {
      return;
    }

    renderWindowCenterIndexRef.current = targetIndex;
    setRenderWindowCenterIndex(targetIndex);
  }

  function shouldRenderPodiumPage(index: number): boolean {
    return (
      Math.abs(index - renderWindowCenterIndex) <= 1 || Math.abs(index - activeIndexRef.current) <= 1
    );
  }

  function clearProgrammaticCommitTimer() {
    if (!programmaticCommitTimerRef.current) {
      return;
    }

    clearTimeout(programmaticCommitTimerRef.current);
    programmaticCommitTimerRef.current = null;
  }

  function scrollToIndex(index: number, animated: boolean) {
    const pageWidth = resolvedPodiumWidthRef.current;

    if (pageWidth <= 0) {
      return;
    }

    podiumScrollRef.current?.scrollTo({
      animated,
      x: index * pageWidth,
      y: 0,
    });

    if (!animated) {
      lastPodiumOffsetXRef.current = index * pageWidth;
      positionProgress.setValue(index);
    }
  }

  function commitIndex(index: number) {
    const targetIndex = clamp(Math.round(index), 0, maxIndex);
    const nextValue = valueAtIndex(targetIndex);

    if (!nextValue) {
      return;
    }

    clearProgrammaticCommitTimer();
    activeIndexRef.current = targetIndex;
    updateRenderWindowCenter(targetIndex);
    positionProgress.setValue(targetIndex);
    updateVisualValue(nextValue);

    if (nextValue === activeValueRef.current) {
      return;
    }

    pendingInternalValueRef.current = nextValue;
    onChangeRef.current(nextValue);
  }

  function scheduleProgrammaticCommit(index: number) {
    clearProgrammaticCommitTimer();
    programmaticCommitTimerRef.current = setTimeout(() => {
      programmaticCommitTimerRef.current = null;
      const pageWidth = resolvedPodiumWidthRef.current;
      const targetIndex = clamp(Math.round(index), 0, maxIndex);
      const targetOffset = targetIndex * pageWidth;

      if (
        pageWidth > 0 &&
        Math.abs(lastPodiumOffsetXRef.current - targetOffset) > SCROLL_SETTLE_EPSILON
      ) {
        scrollToIndex(targetIndex, false);
      }

      commitIndex(index);
    }, PROGRAMMATIC_SCROLL_FALLBACK_MS);
  }

  useEffect(
    () => () => {
      clearProgrammaticCommitTimer();
    },
    [],
  );

  useLayoutEffect(() => {
    if (values.length === 0) {
      return;
    }

    if (pendingInternalValueRef.current === activeValue) {
      pendingInternalValueRef.current = null;
      updateVisualValue(activeValue);
      return;
    }

    pendingInternalValueRef.current = null;
    const nextIndex = clamp(values.indexOf(activeValue), 0, maxIndex);
    const indexChanged = activeIndexRef.current !== nextIndex;
    const pageWidthChanged =
      Math.abs(syncedPodiumWidthRef.current - resolvedPodiumWidth) > SCROLL_SETTLE_EPSILON;

    if (indexChanged) {
      activeIndexRef.current = nextIndex;
      positionProgress.setValue(nextIndex);
    }

    updateRenderWindowCenter(nextIndex);
    updateVisualValue(activeValue);

    if (indexChanged || pageWidthChanged) {
      syncedPodiumWidthRef.current = resolvedPodiumWidth;
      scrollToIndex(nextIndex, podiumWidth > 0 && indexChanged);
    }
  }, [activeValue, maxIndex, podiumWidth, positionProgress, resolvedPodiumWidth, values]);

  function handlePodiumLayout(event: LayoutChangeEvent) {
    const nextWidth = event.nativeEvent.layout.width;

    if (nextWidth <= 0 || Math.abs(nextWidth - podiumWidth) <= 0.5) {
      return;
    }

    setPodiumWidth(nextWidth);
  }

  function handleFilterLayout(event: LayoutChangeEvent) {
    const nextWidth = event.nativeEvent.layout.width;

    if (nextWidth > 0 && Math.abs(nextWidth - filterWidth) > 0.5) {
      setFilterWidth(nextWidth);
    }
  }

  function handlePodiumScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const pageWidth = resolvedPodiumWidthRef.current;

    if (pageWidth <= 0) {
      return;
    }

    const offsetX = event.nativeEvent.contentOffset.x;

    lastPodiumOffsetXRef.current = offsetX;
    positionProgress.setValue(clamp(offsetX / pageWidth, 0, maxIndex));
  }

  function settlePodiumOffset(offsetX: number) {
    const pageWidth = resolvedPodiumWidthRef.current;

    if (pageWidth <= 0) {
      return;
    }

    const nextIndex = indexForOffset(offsetX, pageWidth, maxIndex);
    const targetOffset = nextIndex * pageWidth;

    if (Math.abs(offsetX - targetOffset) > SCROLL_SETTLE_EPSILON) {
      scrollToIndex(nextIndex, true);
      scheduleProgrammaticCommit(nextIndex);
      return;
    }

    commitIndex(nextIndex);
  }

  function handlePodiumScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    settlePodiumOffset(event.nativeEvent.contentOffset.x);
  }

  function handlePodiumScrollEndDrag(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const velocityX = event.nativeEvent.velocity?.x ?? 0;

    if (Math.abs(velocityX) <= 0.01) {
      settlePodiumOffset(event.nativeEvent.contentOffset.x);
    }
  }

  return (
    <>
      <Animated.ScrollView
        bounces={false}
        contentContainerStyle={styles.syncedPodiumTrack}
        decelerationRate="fast"
        directionalLockEnabled
        disableIntervalMomentum
        horizontal
        keyboardDismissMode="on-drag"
        nestedScrollEnabled
        onLayout={handlePodiumLayout}
        onMomentumScrollEnd={handlePodiumScrollEnd}
        onScroll={handlePodiumScroll}
        onScrollEndDrag={handlePodiumScrollEndDrag}
        overScrollMode="never"
        pagingEnabled
        ref={podiumScrollRef}
        scrollEnabled={maxIndex > 0}
        scrollEventThrottle={16}
        showsHorizontalScrollIndicator={false}
        snapToInterval={resolvedPodiumWidth}
        style={styles.podiumPager}
      >
        {values.map((pageValue, pageIndex) =>
          pageValue ? (
            <View
              collapsable={false}
              key={`${pageIndex}:${pageValue}`}
              style={[
                styles.syncedPodiumPage,
                styles.podiumPagerPage,
                { width: resolvedPodiumWidth },
              ]}
            >
              {shouldRenderPodiumPage(pageIndex) ? renderPage(pageValue) : null}
            </View>
          ) : null,
        )}
      </Animated.ScrollView>

      <View onLayout={handleFilterLayout} style={styles.filterStack}>
        <View style={styles.filterViewport}>
          <Animated.View style={[styles.filterRail, filterTrackStyle]}>
            {values.map((optionValue, optionIndex) => {
              const option = optionValue ? optionByValue.get(optionValue) : null;

              if (!option || !optionValue) {
                return null;
              }

              const selected = optionValue === visualValue;
              const color = colorForValue(optionValue);
              const focusStyle = {
                opacity: positionProgress.interpolate({
                  extrapolate: 'clamp',
                  inputRange: [optionIndex - 1, optionIndex, optionIndex + 1],
                  outputRange: [0.44, 1, 0.44],
                }),
                transform: [
                  {
                    scale: positionProgress.interpolate({
                      extrapolate: 'clamp',
                      inputRange: [optionIndex - 1, optionIndex, optionIndex + 1],
                      outputRange: [0.96, 1.04, 0.96],
                    }),
                  },
                ],
              };
              const shadowStyle = {
                opacity: positionProgress.interpolate({
                  extrapolate: 'clamp',
                  inputRange: [optionIndex - 1, optionIndex, optionIndex + 1],
                  outputRange: [0, 0.48, 0],
                }),
              };

              return (
                <Animated.View
                  key={`${optionIndex}:${option.value}`}
                  style={[styles.metricCarouselItem, focusStyle]}
                >
                  <Pressable
                    accessibilityLabel={`Ver podio por ${option.label}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => {
                      updateRenderWindowCenter(optionIndex);

                      if (optionIndex === activeIndexRef.current) {
                        return;
                      }

                      scrollToIndex(optionIndex, true);
                      scheduleProgrammaticCommit(optionIndex);
                    }}
                    style={({ pressed }) => [
                      styles.metricCarouselButton,
                      pressed ? styles.metricCarouselItemPressed : null,
                    ]}
                  >
                    <Ionicons color={color} name={iconForValue(optionValue)} size={18} />
                    <AppText
                      adjustsFontSizeToFit
                      minimumFontScale={0.78}
                      numberOfLines={1}
                      style={[styles.metricCarouselText, { color }]}
                    >
                      {compactLabelForValue(optionValue)}
                    </AppText>
                    <Animated.View
                      style={[styles.metricCarouselShadow, { backgroundColor: color }, shadowStyle]}
                    />
                  </Pressable>
                </Animated.View>
              );
            })}
          </Animated.View>
        </View>
      </View>
    </>
  );
}
