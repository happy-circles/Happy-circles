import { type ReactElement, useCallback, useEffect, useRef } from 'react';
import { FlatList, type ListRenderItem, type StyleProp, type ViewStyle } from 'react-native';

import {
  BrandedRefreshVirtualizedListContainer,
  type BrandedRefreshProps,
} from './branded-refresh-control';
import { focusedListIndex, HISTORY_LIST_RENDER_WINDOW } from './history-virtualized-list-policy';

interface HistoryVirtualizedListProps<T extends { readonly id: string }> {
  readonly contentContainerStyle?: StyleProp<ViewStyle>;
  readonly data: readonly T[];
  readonly emptyComponent: ReactElement;
  readonly extraData?: unknown;
  readonly focusedId?: string | null;
  readonly refresh: BrandedRefreshProps;
  readonly renderItem: ListRenderItem<T>;
  readonly style?: StyleProp<ViewStyle>;
}

const MAX_FOCUS_SCROLL_RETRIES = 6;

/** Dynamic-height rows stay virtualized, including a deep link far down the history. */
export function HistoryVirtualizedList<T extends { readonly id: string }>({
  contentContainerStyle,
  data,
  emptyComponent,
  extraData,
  focusedId,
  refresh,
  renderItem,
  style,
}: HistoryVirtualizedListProps<T>) {
  const listRef = useRef<FlatList<T>>(null);
  const focusRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusRetriesRef = useRef(0);
  const appliedFocusRef = useRef<string | null>(null);
  const focusIndex = focusedListIndex(data, focusedId);
  const focusIndexRef = useRef(focusIndex);
  focusIndexRef.current = focusIndex;

  const cancelFocusRetry = useCallback(() => {
    if (focusRetryTimerRef.current) {
      clearTimeout(focusRetryTimerRef.current);
      focusRetryTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!focusedId) {
      appliedFocusRef.current = null;
      cancelFocusRetry();
      return;
    }
    if (focusIndex < 0 || appliedFocusRef.current === focusedId) return;

    cancelFocusRetry();
    appliedFocusRef.current = focusedId;
    focusRetriesRef.current = 0;
    focusRetryTimerRef.current = setTimeout(() => {
      focusRetryTimerRef.current = null;
      if (focusIndexRef.current >= 0) {
        listRef.current?.scrollToIndex({
          animated: false,
          index: focusIndexRef.current,
          viewPosition: 0,
        });
      }
    }, 0);
  }, [cancelFocusRetry, focusIndex, focusedId]);

  useEffect(() => cancelFocusRetry, [cancelFocusRetry]);

  const handleScrollToIndexFailed = useCallback(
    ({
      averageItemLength,
      index,
    }: {
      readonly averageItemLength: number;
      readonly index: number;
    }) => {
      if (index !== focusIndexRef.current || focusRetriesRef.current >= MAX_FOCUS_SCROLL_RETRIES)
        return;

      focusRetriesRef.current += 1;
      listRef.current?.scrollToOffset({ animated: false, offset: averageItemLength * index });
      cancelFocusRetry();
      // Let the newly visible cells measure before retrying their exact position.
      focusRetryTimerRef.current = setTimeout(() => {
        focusRetryTimerRef.current = null;
        if (focusIndexRef.current >= 0) {
          listRef.current?.scrollToIndex({
            animated: false,
            index: focusIndexRef.current,
            viewPosition: 0,
          });
        }
      }, 100);
    },
    [cancelFocusRetry],
  );

  return (
    <BrandedRefreshVirtualizedListContainer refresh={refresh}>
      {(refreshProps) => (
        <FlatList
          {...refreshProps}
          {...HISTORY_LIST_RENDER_WINDOW}
          ListEmptyComponent={emptyComponent}
          contentContainerStyle={contentContainerStyle}
          data={data}
          extraData={extraData}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          onScrollToIndexFailed={handleScrollToIndexFailed}
          ref={listRef}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
          style={style}
        />
      )}
    </BrandedRefreshVirtualizedListContainer>
  );
}
