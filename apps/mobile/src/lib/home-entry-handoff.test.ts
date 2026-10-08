import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type RafCallback = (timestamp: number) => void;

async function loadHomeEntryHandoff() {
  vi.resetModules();
  const [handoff, remeasure] = await Promise.all([
    import('@/lib/home-entry-handoff'),
    import('@/lib/launch-target-remeasure'),
  ]);

  return { handoff, remeasure };
}

describe('home entry handoff coordinator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (callback: RafCallback) =>
      setTimeout(() => callback(Date.now()), 0),
    );
    vi.stubGlobal('cancelAnimationFrame', (handle: ReturnType<typeof setTimeout>) => {
      clearTimeout(handle);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.resetModules();
  });

  it('dedupes concurrent handoff preparation requests', async () => {
    const { handoff, remeasure } = await loadHomeEntryHandoff();
    const events: string[] = [];
    const requestIds: number[] = [];
    let remeasureCount = 0;
    const unsubscribe = handoff.subscribeHomeEntryHandoff((request) => {
      events.push(`handoff:${request.id}`);
      requestIds.push(request.id);
      request.completeSourceCentering();
    });
    const unsubscribeRemeasure = remeasure.subscribeLaunchTargetRemeasure(() => {
      events.push('remeasure');
      remeasureCount += 1;
    });

    const firstRequest = handoff.beginHomeEntryHandoffAfterScrollReset();
    const secondRequest = handoff.beginHomeEntryHandoffAfterScrollReset();

    await vi.advanceTimersByTimeAsync(1000);
    await Promise.all([firstRequest, secondRequest]);

    expect(requestIds).toEqual([1]);
    expect(events[0]).toBe('handoff:1');
    expect(remeasureCount).toBe(1);
    unsubscribe();
    unsubscribeRemeasure();
  });

  it('keeps the request pending until source centering settles or the guard resolves', async () => {
    const { handoff } = await loadHomeEntryHandoff();
    let settled = false;

    const request = handoff.beginHomeEntryHandoff({ waitForSourceCentering: true });
    void request.then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(419);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(20);
    await request;

    expect(settled).toBe(true);
  });

  it('publishes increasing home-ready versions', async () => {
    const { handoff } = await loadHomeEntryHandoff();
    const versions: number[] = [];
    const unsubscribe = handoff.subscribeHomeEntryReady((version) => {
      versions.push(version);
    });

    const initialVersion = handoff.getHomeEntryReadyVersion();
    handoff.markHomeEntryReady();
    handoff.markHomeEntryReady();

    expect(versions).toEqual([initialVersion + 1, initialVersion + 2]);
    expect(handoff.getHomeEntryReadyVersion()).toBe(initialVersion + 2);
    unsubscribe();
  });

  it('still informs a waiting layer when another home-ready subscriber throws', async () => {
    const { handoff } = await loadHomeEntryHandoff();
    handoff.subscribeHomeEntryReady(() => {
      throw new Error('broken visual subscriber');
    });
    const onReady = vi.fn();
    handoff.subscribeHomeEntryReady(onReady);
    expect(() => handoff.markHomeEntryReady()).not.toThrow();
    expect(onReady).toHaveBeenCalledWith(1);
  });

  it('unblocks navigation and releases the layer when iOS stops delivering frames', async () => {
    const { handoff } = await loadHomeEntryHandoff();
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 1),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const releaseLayer = vi.fn();
    const unsubscribe = handoff.subscribeHomeEntryHandoff((request) => {
      request.subscribePreparationFallback(releaseLayer);
      request.completeSourceCentering();
    });
    let navigated = false;
    const navigation = handoff.beginHomeEntryHandoffAfterScrollReset().then(() => {
      navigated = true;
    });

    await vi.advanceTimersByTimeAsync(200);
    await navigation;

    expect(navigated).toBe(true);
    expect(releaseLayer).toHaveBeenCalledOnce();
    unsubscribe();
  });

  it('allows navigation when keyboard preparation never finishes', async () => {
    const { handoff } = await loadHomeEntryHandoff();
    const { registerIdentityFlowKeyboardResetForHandoff } = await import('./identity-flow-scroll');
    const unregisterKeyboard = registerIdentityFlowKeyboardResetForHandoff(
      () => new Promise<void>(() => undefined),
    );
    const releaseLayer = vi.fn();
    const unsubscribe = handoff.subscribeHomeEntryHandoff((request) => {
      request.subscribePreparationFallback(releaseLayer);
      request.completeSourceCentering();
    });
    let navigated = false;
    const navigation = handoff.beginHomeEntryHandoffAfterScrollReset().then(() => {
      navigated = true;
    });

    await vi.advanceTimersByTimeAsync(1599);
    expect(navigated).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await navigation;

    expect(navigated).toBe(true);
    expect(releaseLayer).toHaveBeenCalledOnce();
    unregisterKeyboard();
    unsubscribe();
  });

  it('continues navigation and dismisses the layer when animation frames never arrive', async () => {
    vi.stubGlobal('requestAnimationFrame', () => 1);
    const { handoff } = await loadHomeEntryHandoff();
    const dismissLayer = vi.fn();
    handoff.subscribeHomeEntryHandoff((request) => {
      request.completeSourceCentering();
      request.subscribePreparationFallback(dismissLayer);
    });
    const request = handoff.beginHomeEntryHandoffAfterScrollReset();
    await vi.advanceTimersByTimeAsync(1600);
    await request;
    expect(dismissLayer).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('bounds a stuck keyboard reset and never resumes scrolling after it settles late', async () => {
    const { handoff, remeasure } = await loadHomeEntryHandoff();
    const scroll = await import('@/lib/identity-flow-scroll');
    let releaseKeyboard: (() => void) | undefined;
    scroll.registerIdentityFlowKeyboardResetForHandoff(
      () =>
        new Promise<void>((resolve) => {
          releaseKeyboard = resolve;
        }),
    );
    const remeasureListener = vi.fn();
    remeasure.subscribeLaunchTargetRemeasure(remeasureListener);
    const dismissLayer = vi.fn();
    handoff.subscribeHomeEntryHandoff((request) => {
      request.completeSourceCentering();
      request.subscribePreparationFallback(dismissLayer);
    });
    const request = handoff.beginHomeEntryHandoffAfterScrollReset();
    await vi.advanceTimersByTimeAsync(1600);
    await request;
    releaseKeyboard?.();
    await vi.advanceTimersByTimeAsync(1000);
    expect(dismissLayer).toHaveBeenCalledOnce();
    expect(remeasureListener).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('releases failed visual listeners and allows a subsequent handoff', async () => {
    const { handoff } = await loadHomeEntryHandoff();
    const dismissLayer = vi.fn();
    handoff.subscribeHomeEntryHandoff((request) => {
      request.completeSourceCentering();
      request.subscribePreparationFallback(dismissLayer);
    });
    const unsubscribeBroken = handoff.subscribeHomeEntryHandoff(() => {
      throw new Error('broken overlay');
    });
    await handoff.beginHomeEntryHandoffAfterScrollReset();
    expect(dismissLayer).toHaveBeenCalledOnce();
    unsubscribeBroken();
    const nextRequest = handoff.beginHomeEntryHandoffAfterScrollReset();
    await vi.advanceTimersByTimeAsync(1000);
    await nextRequest;
    expect(dismissLayer).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('continues navigation when keyboard preparation rejects asynchronously', async () => {
    const { handoff } = await loadHomeEntryHandoff();
    const scroll = await import('@/lib/identity-flow-scroll');
    scroll.registerIdentityFlowKeyboardResetForHandoff(() =>
      Promise.reject(new Error('keyboard failure')),
    );
    const dismissLayer = vi.fn();
    handoff.subscribeHomeEntryHandoff((request) => {
      request.completeSourceCentering();
      request.subscribePreparationFallback(dismissLayer);
    });
    const request = handoff.beginHomeEntryHandoffAfterScrollReset();
    await vi.advanceTimersByTimeAsync(1000);
    await request;
    expect(dismissLayer).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not scroll a newly mounted screen after a delayed keyboard reset', async () => {
    const { handoff } = await loadHomeEntryHandoff();
    const scroll = await import('@/lib/identity-flow-scroll');
    const originalScroll = vi.fn();
    const nextScroll = vi.fn();
    const removeOriginal = scroll.registerIdentityFlowScrollView(
      {
        current: { scrollTo: originalScroll } as never,
      },
      { viewportHeight: 800 },
    );
    let releaseKeyboard: (() => void) | undefined;
    scroll.registerIdentityFlowKeyboardResetForHandoff(
      () =>
        new Promise<void>((resolve) => {
          releaseKeyboard = resolve;
        }),
    );
    const dismissLayer = vi.fn();
    handoff.subscribeHomeEntryHandoff((request) => {
      request.completeSourceCentering();
      request.subscribePreparationFallback(dismissLayer);
    });
    const request = handoff.beginHomeEntryHandoffAfterScrollReset();
    await vi.advanceTimersByTimeAsync(10);
    removeOriginal();
    scroll.registerIdentityFlowScrollView(
      { current: { scrollTo: nextScroll } as never },
      { viewportHeight: 800 },
    );
    releaseKeyboard?.();
    await request;
    expect(nextScroll).not.toHaveBeenCalled();
    expect(dismissLayer).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
