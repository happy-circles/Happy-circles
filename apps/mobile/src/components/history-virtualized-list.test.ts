import React, { createElement } from 'react';
import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as {
  renderToStaticMarkup: (node: React.ReactNode) => string;
};
const captured = vi.hoisted(() => ({
  effects: [] as (() => void | (() => void))[],
  listProps: {} as Record<string, unknown>,
  scrollToIndex: vi.fn(),
  scrollToOffset: vi.fn(),
}));
vi.mock('react', async () => ({
  ...(await vi.importActual<typeof React>('react')),
  useEffect: (effect: () => void | (() => void)) => captured.effects.push(effect),
}));
vi.stubGlobal('React', React);
vi.mock('react-native', () => ({
  FlatList: (props: Record<string, unknown>) => {
    captured.listProps = props;
    const ref = props.ref as { current: unknown };
    ref.current = {
      scrollToIndex: captured.scrollToIndex,
      scrollToOffset: captured.scrollToOffset,
    };
    return null;
  },
}));
vi.mock('./branded-refresh-control', () => ({
  BrandedRefreshVirtualizedListContainer: ({
    children,
  }: {
    children: (props: Record<string, unknown>) => React.ReactNode;
  }) => children({ refreshControl: createElement('refresh-control') }),
}));

describe('history list render boundary', () => {
  it('hands every row to RN without constructing offscreen cards on the JS thread', async () => {
    const { HistoryVirtualizedList } = await import('./history-virtualized-list');
    const data = Array.from({ length: 1000 }, (_, index) => ({ id: `request-${index}` }));
    const renderItem = vi.fn(() => createElement('span', null, 'row'));
    const emptyComponent = createElement('span', null, 'empty');
    const extraData = { expanded: 'request-999' };
    renderToStaticMarkup(
      createElement(HistoryVirtualizedList, {
        data,
        emptyComponent,
        extraData,
        focusedId: 'request-999',
        refresh: { refreshing: false, onRefresh: vi.fn() },
        renderItem,
      }),
    );

    // The screen gives a row factory to native virtualization, rather than data.map(factory).
    expect(renderItem).not.toHaveBeenCalled();
    expect(captured.listProps.data).toBe(data);
    expect(captured.listProps.renderItem).toBe(renderItem);
    expect(captured.listProps.extraData).toBe(extraData);
    expect(captured.listProps.ListEmptyComponent).toBe(emptyComponent);
    expect(captured.listProps.initialNumToRender).toBe(8);
    expect(captured.listProps.maxToRenderPerBatch).toBe(8);
    expect(captured.listProps.windowSize).toBe(5);
    expect(captured.listProps.removeClippedSubviews).toBe(false);
    expect(captured.listProps.refreshControl).toBeTruthy();
    const keyExtractor = captured.listProps.keyExtractor as (row: { id: string }) => string;
    expect(data.map(keyExtractor)).toEqual(data.map((row) => row.id));
    expect(new Set(data.map(keyExtractor)).size).toBe(1000);
  });

  it('scrolls a distant focus after mounting and retries dynamic-height measurement without reordering', async () => {
    vi.useFakeTimers();
    captured.effects = [];
    captured.scrollToIndex.mockClear();
    captured.scrollToOffset.mockClear();
    try {
      const { HistoryVirtualizedList } = await import('./history-virtualized-list');
      const data = Array.from({ length: 1000 }, (_, index) => ({ id: `case-${index}` }));
      renderToStaticMarkup(
        createElement(HistoryVirtualizedList, {
          data,
          emptyComponent: createElement('span'),
          focusedId: 'case-999',
          refresh: { refreshing: false, onRefresh: vi.fn() },
          renderItem: () => null,
        }),
      );
      const cleanups = captured.effects.map((effect) => effect());
      vi.advanceTimersByTime(0);
      expect(captured.scrollToIndex).toHaveBeenLastCalledWith({
        animated: false,
        index: 999,
        viewPosition: 0,
      });
      const failedMeasurement = captured.listProps.onScrollToIndexFailed as (metrics: {
        index: number;
        averageItemLength: number;
      }) => void;
      failedMeasurement({ index: 999, averageItemLength: 80 });
      expect(captured.scrollToOffset).toHaveBeenLastCalledWith({ animated: false, offset: 79_920 });
      vi.advanceTimersByTime(100);
      expect(captured.scrollToIndex).toHaveBeenCalledTimes(2);
      expect(captured.listProps.data).toBe(data);
      expect(data[999].id).toBe('case-999');

      failedMeasurement({ index: 999, averageItemLength: 85 });
      for (const cleanup of cleanups) if (cleanup) cleanup();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
