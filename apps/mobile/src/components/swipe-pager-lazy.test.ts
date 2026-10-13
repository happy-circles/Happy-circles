import React, { createElement } from 'react';
import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

import { shouldMountPagerPage, visitPagerPage } from './swipe-pager-lazy';

const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as {
  renderToStaticMarkup: (node: React.ReactNode) => string;
};

const captured = vi.hoisted(() => ({ pagerProps: {} as Record<string, unknown> }));
vi.mock('react-native', () => ({
  StyleSheet: { create: (styles: unknown) => styles },
  View: ({ children }: { children?: React.ReactNode }) => createElement('div', null, children),
}));
vi.mock('react-native-pager-view', () => ({
  default: (props: { children?: React.ReactNode }) => {
    captured.pagerProps = props;
    return createElement('div', null, props.children);
  },
}));
vi.stubGlobal('React', React);

describe('lazy pager lifecycle', () => {
  it('mounts the first tab only, retains previews and visited tabs, and visits idempotently', () => {
    let visited: ReadonlySet<string> = new Set(['pending']);
    const mounts = (activeValue: string) =>
      ['pending', 'history', 'friends', 'reminders'].filter((pageValue) =>
        shouldMountPagerPage({ activeValue, lazy: true, pageValue, visited }),
      );

    expect(mounts('pending')).toEqual(['pending']);
    visited = visitPagerPage(visited, 'history'); // A swipe preview, even if canceled.
    expect(mounts('pending')).toEqual(['pending', 'history']);
    expect(mounts('history')).toEqual(['pending', 'history']);
    expect(visitPagerPage(visited, 'history')).toBe(visited);
    expect(mounts('friends')).toEqual(['pending', 'history', 'friends']);
    expect(visited.has('friends')).toBe(false); // Current selection mounts without an effect delay.
    expect(
      shouldMountPagerPage({
        activeValue: 'pending',
        lazy: false,
        pageValue: 'reminders',
        visited,
      }),
    ).toBe(true);
  });

  it('renders one native page on opening, compared with every tab in the existing eager mode', async () => {
    const { SwipePager } = await import('./swipe-pager');
    const renderPage = vi.fn((value: string) => createElement('span', null, value));
    const props = {
      onChange: vi.fn(),
      renderPage,
      value: 'transactions',
      values: ['all', 'transactions', 'friends', 'reminders'],
    };

    renderToStaticMarkup(createElement(SwipePager, { ...props, lazy: true }));
    expect(renderPage.mock.calls.map(([value]) => value)).toEqual(['transactions']);
    const children = captured.pagerProps.children as React.ReactElement[];
    expect(children.map((child) => child.key)).toEqual([
      '0:all',
      '1:transactions',
      '2:friends',
      '3:reminders',
    ]);

    renderPage.mockClear();
    renderToStaticMarkup(createElement(SwipePager, props));
    expect(renderPage.mock.calls.map(([value]) => value)).toEqual(props.values);
  });

  it('retains native swipe progress, preview, and selected callbacks with lazy pages', async () => {
    const { SwipePager } = await import('./swipe-pager');
    const onChange = vi.fn();
    const onPreviewChange = vi.fn();
    const onProgressChange = vi.fn();
    renderToStaticMarkup(
      createElement(SwipePager, {
        lazy: true,
        onChange,
        onPreviewChange,
        onProgressChange,
        renderPage: () => null,
        value: 'pending',
        values: ['pending', 'history'],
      }),
    );
    const onPageScroll = captured.pagerProps.onPageScroll as (event: unknown) => void;
    const onPageSelected = captured.pagerProps.onPageSelected as (event: unknown) => void;
    onPageScroll({ nativeEvent: { position: 0, offset: 0.1 } });
    expect(onProgressChange).toHaveBeenLastCalledWith({
      from: 'pending',
      progress: 0.1,
      to: 'history',
    });
    expect(onChange).not.toHaveBeenCalled();
    onPageScroll({ nativeEvent: { position: 0, offset: 0.8 } });
    expect(onPreviewChange).toHaveBeenLastCalledWith('history');
    onPageSelected({ nativeEvent: { position: 1 } });
    expect(onChange).toHaveBeenCalledExactlyOnceWith('history');
  });
});
