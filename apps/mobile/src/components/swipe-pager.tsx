import { type ReactNode, useEffect, useLayoutEffect, useRef } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import PagerView, {
  type PageScrollStateChangedNativeEvent,
  type PagerViewOnPageScrollEvent,
  type PagerViewOnPageSelectedEvent,
} from 'react-native-pager-view';

export interface SwipePagerProps<T extends string> {
  readonly accessibilityLabel?: string;
  readonly onChange: (value: T) => void;
  readonly onInteractionStateChange?: (isInteracting: boolean) => void;
  readonly onPreviewChange?: (value: T) => void;
  readonly pageStyle?: StyleProp<ViewStyle>;
  readonly renderPage: (value: T, index: number) => ReactNode;
  readonly scrollEnabled?: boolean;
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
  onInteractionStateChange,
  onPreviewChange,
  pageStyle,
  renderPage,
  scrollEnabled = true,
  style,
  value,
  values,
}: SwipePagerProps<T>) {
  const pagerRef = useRef<PagerView>(null);
  const hasMountedPagerRef = useRef(false);
  const activeIndexRef = useRef(clampIndex(values.indexOf(value), values.length - 1));
  const selectedIndexRef = useRef(activeIndexRef.current);
  const previewIndexRef = useRef(activeIndexRef.current);
  const isInteractingRef = useRef(false);
  const programmaticTargetIndexRef = useRef<number | null>(null);
  const valuesRef = useRef(values);
  const onChangeRef = useRef(onChange);
  const onInteractionStateChangeRef = useRef(onInteractionStateChange);
  const onPreviewChangeRef = useRef(onPreviewChange);

  const activeIndex = clampIndex(values.indexOf(value), values.length - 1);

  useEffect(() => {
    valuesRef.current = values;
  }, [values]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onInteractionStateChangeRef.current = onInteractionStateChange;
  }, [onInteractionStateChange]);

  useEffect(() => {
    onPreviewChangeRef.current = onPreviewChange;
  }, [onPreviewChange]);

  useLayoutEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  useEffect(
    () => () => {
      if (isInteractingRef.current) {
        onInteractionStateChangeRef.current?.(false);
      }
    },
    [],
  );

  useLayoutEffect(() => {
    if (values.length === 0) {
      return;
    }

    if (!hasMountedPagerRef.current) {
      hasMountedPagerRef.current = true;
      selectedIndexRef.current = activeIndex;
      previewIndexRef.current = activeIndex;
      return;
    }

    if (selectedIndexRef.current !== activeIndex) {
      programmaticTargetIndexRef.current = activeIndex;
      selectedIndexRef.current = activeIndex;
      updatePreviewIndex(activeIndex);
      pagerRef.current?.setPage(activeIndex);
    }
  }, [activeIndex, values.length]);

  function updatePreviewIndex(nextIndex: number, currentValues = valuesRef.current) {
    const clampedIndex = clampIndex(nextIndex, currentValues.length - 1);
    const previousPreviewIndex = previewIndexRef.current;
    const nextPreviewValue = currentValues[clampedIndex];

    previewIndexRef.current = clampedIndex;

    if (nextPreviewValue && clampedIndex !== previousPreviewIndex) {
      onPreviewChangeRef.current?.(nextPreviewValue);
    }
  }

  function handlePageScroll(event: PagerViewOnPageScrollEvent) {
    if (programmaticTargetIndexRef.current !== null) {
      updatePreviewIndex(programmaticTargetIndexRef.current);
      return;
    }

    const nextPreviewIndex = Math.round(event.nativeEvent.position + event.nativeEvent.offset);

    if (nextPreviewIndex !== previewIndexRef.current) {
      updatePreviewIndex(nextPreviewIndex);
    }
  }

  function handlePageSelected(event: PagerViewOnPageSelectedEvent) {
    const currentValues = valuesRef.current;
    const nextIndex = clampIndex(Math.round(event.nativeEvent.position), currentValues.length - 1);
    const nextValue = currentValues[nextIndex];
    const wasProgrammaticTransition = programmaticTargetIndexRef.current !== null;

    selectedIndexRef.current = nextIndex;
    programmaticTargetIndexRef.current = null;
    updatePreviewIndex(nextIndex, currentValues);

    if (wasProgrammaticTransition) {
      isInteractingRef.current = false;
      onInteractionStateChangeRef.current?.(false);
    }

    if (nextValue && nextIndex !== activeIndexRef.current) {
      activeIndexRef.current = nextIndex;
      onChangeRef.current(nextValue);
    }
  }

  function handlePageScrollStateChanged(event: PageScrollStateChangedNativeEvent) {
    const pageScrollState = event.nativeEvent.pageScrollState;

    if (pageScrollState === 'dragging') {
      programmaticTargetIndexRef.current = null;
    }

    if (pageScrollState === 'idle' && programmaticTargetIndexRef.current !== null) {
      updatePreviewIndex(programmaticTargetIndexRef.current);
      programmaticTargetIndexRef.current = null;
    }

    const isInteracting = pageScrollState !== 'idle';

    if (isInteractingRef.current === isInteracting) {
      return;
    }

    isInteractingRef.current = isInteracting;
    onInteractionStateChangeRef.current?.(isInteracting);
  }

  return (
    <View style={[styles.root, style]}>
      <PagerView
        accessibilityLabel={accessibilityLabel}
        initialPage={activeIndex}
        keyboardDismissMode="on-drag"
        onPageScroll={handlePageScroll}
        onPageScrollStateChanged={handlePageScrollStateChanged}
        onPageSelected={handlePageSelected}
        overScrollMode="never"
        ref={pagerRef}
        scrollEnabled={scrollEnabled}
        style={styles.pager}
      >
        {values.map((pageValue, index) => (
          <View collapsable={false} key={pageValue} style={[styles.page, pageStyle]}>
            {renderPage(pageValue, index)}
          </View>
        ))}
      </PagerView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
  pager: {
    flex: 1,
    minHeight: 0,
  },
  page: {
    flex: 1,
  },
});
