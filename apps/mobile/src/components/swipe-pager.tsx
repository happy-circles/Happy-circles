import { type ReactNode, useEffect, useLayoutEffect, useRef } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import PagerView, {
  type PageScrollStateChangedNativeEvent,
  type PagerViewOnPageScrollEvent,
  type PagerViewOnPageSelectedEvent,
} from 'react-native-pager-view';

export interface SwipePagerProps<T extends string> {
  readonly accessibilityLabel?: string;
  readonly animateProgrammaticTransitions?: boolean;
  readonly commitPreviewChanges?: boolean;
  readonly loop?: boolean;
  readonly offscreenPageLimit?: number;
  readonly onChange: (value: T) => void;
  readonly onInteractionStateChange?: (isInteracting: boolean) => void;
  readonly onProgressChange?: (progress: SwipePagerProgress<T>) => void;
  readonly onPreviewChange?: (value: T) => void;
  readonly pageStyle?: StyleProp<ViewStyle>;
  readonly renderPage: (value: T, index: number) => ReactNode;
  readonly scrollEnabled?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly value: T;
  readonly values: readonly T[];
}

export type SwipePagerProgress<T extends string> = {
  readonly from: T;
  readonly progress: number;
  readonly to: T;
};

function clampIndex(index: number, maxIndex: number): number {
  return Math.min(Math.max(index, 0), Math.max(maxIndex, 0));
}

export function SwipePager<T extends string>({
  accessibilityLabel,
  animateProgrammaticTransitions = true,
  commitPreviewChanges = false,
  loop = false,
  offscreenPageLimit,
  onChange,
  onInteractionStateChange,
  onProgressChange,
  onPreviewChange,
  pageStyle,
  renderPage,
  scrollEnabled = true,
  style,
  value,
  values,
}: SwipePagerProps<T>) {
  const shouldLoop = loop && values.length > 1;
  const pagerValues =
    shouldLoop && values[0] && values[values.length - 1]
      ? [values[values.length - 1], ...values, values[0]]
      : values;
  const pagerRef = useRef<PagerView>(null);
  const hasMountedPagerRef = useRef(false);
  const activeIndexRef = useRef(clampIndex(values.indexOf(value), values.length - 1));
  const selectedPageIndexRef = useRef(
    shouldLoop ? activeIndexRef.current + 1 : activeIndexRef.current,
  );
  const previewIndexRef = useRef(activeIndexRef.current);
  const isInteractingRef = useRef(false);
  const programmaticTargetPageIndexRef = useRef<number | null>(null);
  const valuesRef = useRef(values);
  const loopRef = useRef(loop);
  const onChangeRef = useRef(onChange);
  const onInteractionStateChangeRef = useRef(onInteractionStateChange);
  const onProgressChangeRef = useRef(onProgressChange);
  const onPreviewChangeRef = useRef(onPreviewChange);

  const activeIndex = clampIndex(values.indexOf(value), values.length - 1);
  const activePageIndex = shouldLoop ? activeIndex + 1 : activeIndex;

  useEffect(() => {
    valuesRef.current = values;
  }, [values]);

  useEffect(() => {
    loopRef.current = loop;
  }, [loop]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onInteractionStateChangeRef.current = onInteractionStateChange;
  }, [onInteractionStateChange]);

  useEffect(() => {
    onProgressChangeRef.current = onProgressChange;
  }, [onProgressChange]);

  useEffect(() => {
    onPreviewChangeRef.current = onPreviewChange;
  }, [onPreviewChange]);

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

    const previousActiveIndex = activeIndexRef.current;
    const targetPageIndex = pagerIndexForProgrammaticTarget(activeIndex, previousActiveIndex);
    const normalizedTargetPageIndex = normalizePagerIndex(targetPageIndex);

    if (!hasMountedPagerRef.current) {
      hasMountedPagerRef.current = true;
      activeIndexRef.current = activeIndex;
      selectedPageIndexRef.current = activePageIndex;
      previewIndexRef.current = activeIndex;
      return;
    }

    if (selectedPageIndexRef.current !== targetPageIndex) {
      programmaticTargetPageIndexRef.current = targetPageIndex;
      activeIndexRef.current = activeIndex;
      selectedPageIndexRef.current = normalizedTargetPageIndex;
      updatePreviewIndex(targetPageIndex);
      if (animateProgrammaticTransitions) {
        pagerRef.current?.setPage(targetPageIndex);
      } else {
        jumpToPagerIndex(targetPageIndex);
        programmaticTargetPageIndexRef.current = null;
      }
      return;
    }

    activeIndexRef.current = activeIndex;
  }, [activeIndex, activePageIndex, animateProgrammaticTransitions, shouldLoop, values.length]);

  function canLoop(currentValues = valuesRef.current): boolean {
    return loopRef.current && currentValues.length > 1;
  }

  function pagerIndexForProgrammaticTarget(
    nextValueIndex: number,
    previousValueIndex: number,
    currentValues = valuesRef.current,
  ): number {
    if (!canLoop(currentValues)) {
      return nextValueIndex;
    }

    const lastValueIndex = currentValues.length - 1;

    if (previousValueIndex === lastValueIndex && nextValueIndex === 0) {
      return currentValues.length + 1;
    }

    if (previousValueIndex === 0 && nextValueIndex === lastValueIndex) {
      return 0;
    }

    return nextValueIndex + 1;
  }

  function valueIndexForPagerIndex(pageIndex: number, currentValues = valuesRef.current): number {
    const maxValueIndex = currentValues.length - 1;

    if (!canLoop(currentValues)) {
      return clampIndex(pageIndex, maxValueIndex);
    }

    if (pageIndex <= 0) {
      return maxValueIndex;
    }

    if (pageIndex >= currentValues.length + 1) {
      return 0;
    }

    return clampIndex(pageIndex - 1, maxValueIndex);
  }

  function normalizePagerIndex(pageIndex: number, currentValues = valuesRef.current): number {
    if (!canLoop(currentValues)) {
      return clampIndex(pageIndex, currentValues.length - 1);
    }

    if (pageIndex <= 0) {
      return currentValues.length;
    }

    if (pageIndex >= currentValues.length + 1) {
      return 1;
    }

    return clampIndex(pageIndex, currentValues.length + 1);
  }

  function jumpToPagerIndex(index: number) {
    const pager = pagerRef.current as
      | (PagerView & { setPageWithoutAnimation?: (pageIndex: number) => void })
      | null;

    if (pager?.setPageWithoutAnimation) {
      pager.setPageWithoutAnimation(index);
      return;
    }

    pager?.setPage(index);
  }

  function updatePreviewIndex(nextPageIndex: number, currentValues = valuesRef.current) {
    const valueIndex = valueIndexForPagerIndex(nextPageIndex, currentValues);
    const previousPreviewIndex = previewIndexRef.current;
    const nextPreviewValue = currentValues[valueIndex];

    previewIndexRef.current = valueIndex;

    if (nextPreviewValue && valueIndex !== previousPreviewIndex) {
      onPreviewChangeRef.current?.(nextPreviewValue);
    }
  }

  function commitPreviewedValue(currentValues = valuesRef.current) {
    const nextValueIndex = previewIndexRef.current;
    const nextValue = currentValues[nextValueIndex];

    if (!nextValue || nextValueIndex === activeIndexRef.current) {
      return;
    }

    activeIndexRef.current = nextValueIndex;
    selectedPageIndexRef.current = canLoop(currentValues) ? nextValueIndex + 1 : nextValueIndex;
    onChangeRef.current(nextValue);
  }

  function emitProgress(scrollPosition: number, currentValues = valuesRef.current) {
    const currentPageIndex = selectedPageIndexRef.current;
    const rawDistance = scrollPosition - currentPageIndex;
    const distance = Math.max(-1, Math.min(1, rawDistance));
    const progress = Math.abs(distance);
    const fromValue = currentValues[valueIndexForPagerIndex(currentPageIndex, currentValues)];
    const toPageIndex =
      distance < 0 ? currentPageIndex - 1 : distance > 0 ? currentPageIndex + 1 : currentPageIndex;
    const toValue = currentValues[valueIndexForPagerIndex(toPageIndex, currentValues)];

    if (!fromValue || !toValue) {
      return;
    }

    onProgressChangeRef.current?.({
      from: fromValue,
      progress,
      to: toValue,
    });
  }

  function handlePageScroll(event: PagerViewOnPageScrollEvent) {
    if (programmaticTargetPageIndexRef.current !== null) {
      updatePreviewIndex(programmaticTargetPageIndexRef.current);
      return;
    }

    const scrollPosition = event.nativeEvent.position + event.nativeEvent.offset;
    const nextPreviewPageIndex = Math.round(scrollPosition);
    const nextPreviewValueIndex = valueIndexForPagerIndex(nextPreviewPageIndex);

    emitProgress(scrollPosition);

    if (nextPreviewValueIndex !== previewIndexRef.current) {
      updatePreviewIndex(nextPreviewPageIndex);
    }

    if (commitPreviewChanges && nextPreviewValueIndex !== activeIndexRef.current) {
      commitPreviewedValue();
    }
  }

  function handlePageSelected(event: PagerViewOnPageSelectedEvent) {
    const currentValues = valuesRef.current;
    const maxPageIndex = canLoop(currentValues)
      ? currentValues.length + 1
      : currentValues.length - 1;
    const nextPageIndex = clampIndex(Math.round(event.nativeEvent.position), maxPageIndex);
    const nextValueIndex = valueIndexForPagerIndex(nextPageIndex, currentValues);
    const normalizedPageIndex = normalizePagerIndex(nextPageIndex, currentValues);
    const nextValue = currentValues[nextValueIndex];
    const wasProgrammaticTransition = programmaticTargetPageIndexRef.current !== null;

    selectedPageIndexRef.current = normalizedPageIndex;
    programmaticTargetPageIndexRef.current = null;
    updatePreviewIndex(nextPageIndex, currentValues);
    emitProgress(normalizedPageIndex, currentValues);

    if (normalizedPageIndex !== nextPageIndex) {
      jumpToPagerIndex(normalizedPageIndex);
    }

    if (wasProgrammaticTransition) {
      isInteractingRef.current = false;
      onInteractionStateChangeRef.current?.(false);
    }

    if (nextValue && nextValueIndex !== activeIndexRef.current) {
      activeIndexRef.current = nextValueIndex;
      onChangeRef.current(nextValue);
    }
  }

  function handlePageScrollStateChanged(event: PageScrollStateChangedNativeEvent) {
    const pageScrollState = event.nativeEvent.pageScrollState;

    if (pageScrollState === 'idle' && programmaticTargetPageIndexRef.current !== null) {
      updatePreviewIndex(programmaticTargetPageIndexRef.current);
      programmaticTargetPageIndexRef.current = null;
    }

    if (pageScrollState === 'idle' && commitPreviewChanges) {
      commitPreviewedValue();
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
        initialPage={activePageIndex}
        keyboardDismissMode="on-drag"
        onPageScroll={handlePageScroll}
        onPageScrollStateChanged={handlePageScrollStateChanged}
        onPageSelected={handlePageSelected}
        overScrollMode="never"
        offscreenPageLimit={offscreenPageLimit}
        ref={pagerRef}
        scrollEnabled={scrollEnabled}
        style={styles.pager}
      >
        {pagerValues.map((pageValue, pageIndex) => (
          <View
            collapsable={false}
            key={`${pageIndex}:${pageValue}`}
            style={[styles.page, pageStyle]}
          >
            {renderPage(pageValue, valueIndexForPagerIndex(pageIndex))}
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
