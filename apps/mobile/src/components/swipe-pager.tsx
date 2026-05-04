import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

interface PagerLayout {
  readonly height: number;
  readonly width: number;
}

export interface SwipePagerProps<T extends string> {
  readonly accessibilityLabel?: string;
  readonly onChange: (value: T) => void;
  readonly onPreviewChange?: (value: T) => void;
  readonly pageStyle?: StyleProp<ViewStyle>;
  readonly renderPage: (value: T, index: number) => ReactNode;
  readonly style?: StyleProp<ViewStyle>;
  readonly value: T;
  readonly values: readonly T[];
}

function clampIndex(index: number, maxIndex: number): number {
  return Math.min(Math.max(index, 0), Math.max(maxIndex, 0));
}

export function SwipePager<T extends string>({
  accessibilityLabel,
  onChange,
  onPreviewChange,
  pageStyle,
  renderPage,
  style,
  value,
  values,
}: SwipePagerProps<T>) {
  const scrollRef = useRef<ScrollView>(null);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestOffsetRef = useRef(0);
  const syncedWidthRef = useRef(0);
  const hasSyncedInitialPositionRef = useRef(false);
  const activeIndexRef = useRef(0);
  const settledIndexRef = useRef(0);
  const previewIndexRef = useRef(0);
  const programmaticTargetIndexRef = useRef<number | null>(null);
  const isUserDraggingRef = useRef(false);
  const valuesRef = useRef(values);
  const onChangeRef = useRef(onChange);
  const onPreviewChangeRef = useRef(onPreviewChange);
  const [layout, setLayout] = useState<PagerLayout>({ height: 0, width: 0 });

  const activeIndex = clampIndex(values.indexOf(value), values.length - 1);
  const pageWidth = layout.width;
  const pageHeight = layout.height;

  useEffect(() => {
    valuesRef.current = values;
  }, [values]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onPreviewChangeRef.current = onPreviewChange;
  }, [onPreviewChange]);

  useLayoutEffect(() => {
    activeIndexRef.current = activeIndex;
    previewIndexRef.current = activeIndex;
  }, [activeIndex]);

  useEffect(
    () => () => {
      if (settleTimerRef.current) {
        clearTimeout(settleTimerRef.current);
      }
    },
    [],
  );

  useLayoutEffect(() => {
    if (pageWidth <= 0 || values.length === 0) {
      return;
    }

    if (
      hasSyncedInitialPositionRef.current &&
      settledIndexRef.current === activeIndex &&
      syncedWidthRef.current === pageWidth
    ) {
      return;
    }

    const hasSyncedPosition = hasSyncedInitialPositionRef.current;
    const nextX = activeIndex * pageWidth;
    clearSettleTimer();
    isUserDraggingRef.current = false;
    latestOffsetRef.current = nextX;
    settledIndexRef.current = activeIndex;
    previewIndexRef.current = activeIndex;
    syncedWidthRef.current = pageWidth;
    hasSyncedInitialPositionRef.current = true;
    programmaticTargetIndexRef.current = hasSyncedPosition ? activeIndex : null;
    scrollRef.current?.scrollTo({ animated: false, x: nextX, y: 0 });
  }, [activeIndex, pageWidth, values.length]);

  function clearSettleTimer() {
    if (settleTimerRef.current) {
      clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
  }

  function updatePreviewIndex(nextIndex: number, currentValues = valuesRef.current) {
    const previousPreviewIndex = previewIndexRef.current;
    const nextPreviewValue = currentValues[nextIndex];

    previewIndexRef.current = nextIndex;

    if (nextPreviewValue && nextIndex !== previousPreviewIndex) {
      onPreviewChangeRef.current?.(nextPreviewValue);
    }
  }

  function settleToOffset(offsetX: number) {
    const currentValues = valuesRef.current;

    if (pageWidth <= 0 || currentValues.length === 0) {
      return;
    }

    const programmaticTargetIndex = programmaticTargetIndexRef.current;

    if (programmaticTargetIndex !== null && activeIndexRef.current === programmaticTargetIndex) {
      const targetX = programmaticTargetIndex * pageWidth;

      latestOffsetRef.current = targetX;
      settledIndexRef.current = programmaticTargetIndex;
      syncedWidthRef.current = pageWidth;
      updatePreviewIndex(programmaticTargetIndex, currentValues);
      programmaticTargetIndexRef.current = null;

      if (Math.abs(offsetX - targetX) > 1) {
        scrollRef.current?.scrollTo({ animated: false, x: targetX, y: 0 });
      }

      return;
    }

    const nextIndex = clampIndex(Math.round(offsetX / pageWidth), currentValues.length - 1);
    const nextX = nextIndex * pageWidth;
    const nextValue = currentValues[nextIndex];

    latestOffsetRef.current = nextX;
    settledIndexRef.current = nextIndex;
    syncedWidthRef.current = pageWidth;
    updatePreviewIndex(nextIndex, currentValues);

    if (Math.abs(offsetX - nextX) > 1) {
      scrollRef.current?.scrollTo({ animated: true, x: nextX, y: 0 });
    }

    if (nextValue && nextIndex !== activeIndexRef.current) {
      onChangeRef.current(nextValue);
    }
  }

  function handleLayout(event: LayoutChangeEvent) {
    const nextWidth = Math.round(event.nativeEvent.layout.width);
    const nextHeight = Math.round(event.nativeEvent.layout.height);

    if (nextWidth <= 0 || nextHeight <= 0) {
      return;
    }

    setLayout((current) =>
      Math.abs(current.width - nextWidth) > 1 || Math.abs(current.height - nextHeight) > 1
        ? { height: nextHeight, width: nextWidth }
        : current,
    );
  }

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const offsetX = event.nativeEvent.contentOffset.x;

    if (programmaticTargetIndexRef.current !== null && !isUserDraggingRef.current) {
      const targetIndex = programmaticTargetIndexRef.current;
      const targetX = targetIndex * pageWidth;

      if (pageWidth > 0 && Math.abs(offsetX - targetX) <= 1) {
        latestOffsetRef.current = targetX;
        settledIndexRef.current = targetIndex;
        syncedWidthRef.current = pageWidth;
        updatePreviewIndex(targetIndex);
        programmaticTargetIndexRef.current = null;
      }

      return;
    }

    latestOffsetRef.current = offsetX;

    if (pageWidth <= 0 || valuesRef.current.length === 0) {
      return;
    }

    const nextPreviewIndex = clampIndex(
      Math.round(offsetX / pageWidth),
      valuesRef.current.length - 1,
    );

    if (nextPreviewIndex !== previewIndexRef.current) {
      updatePreviewIndex(nextPreviewIndex);
    }
  }

  function handleScrollBeginDrag() {
    isUserDraggingRef.current = true;
    programmaticTargetIndexRef.current = null;
    clearSettleTimer();
  }

  function handleMomentumScrollBegin() {
    clearSettleTimer();
  }

  function handleMomentumScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    clearSettleTimer();
    settleToOffset(event.nativeEvent.contentOffset.x);
    isUserDraggingRef.current = false;
  }

  function handleScrollEndDrag() {
    clearSettleTimer();
    settleTimerRef.current = setTimeout(() => {
      settleTimerRef.current = null;
      settleToOffset(latestOffsetRef.current);
      isUserDraggingRef.current = false;
    }, 120);
  }

  return (
    <View onLayout={handleLayout} style={[styles.root, style]}>
      <ScrollView
        accessibilityLabel={accessibilityLabel}
        alwaysBounceHorizontal={false}
        bounces={false}
        contentContainerStyle={styles.track}
        decelerationRate="fast"
        directionalLockEnabled
        disableIntervalMomentum
        horizontal
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        onMomentumScrollBegin={handleMomentumScrollBegin}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        onScroll={handleScroll}
        onScrollBeginDrag={handleScrollBeginDrag}
        onScrollEndDrag={handleScrollEndDrag}
        overScrollMode="never"
        pagingEnabled
        ref={scrollRef}
        removeClippedSubviews={false}
        scrollEventThrottle={16}
        showsHorizontalScrollIndicator={false}
        snapToAlignment="start"
        snapToInterval={pageWidth > 0 ? pageWidth : undefined}
        style={styles.scroll}
      >
        {values.map((pageValue, index) => (
          <View
            key={pageValue}
            style={[
              styles.page,
              pageWidth > 0 ? { minHeight: pageHeight, width: pageWidth } : styles.hiddenPage,
              pageStyle,
            ]}
          >
            {renderPage(pageValue, index)}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
  scroll: {
    flex: 1,
    minHeight: 0,
  },
  track: {
    alignItems: 'stretch',
  },
  page: {
    flexGrow: 0,
    flexShrink: 0,
  },
  hiddenPage: {
    width: 0,
  },
});
