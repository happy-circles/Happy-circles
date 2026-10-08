import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createVisualTransition,
  scheduleAfterVisualFrame,
  VISUAL_TRANSITION_FRAME_TIMEOUT_MS,
} from './visual-transition';

describe('visual transition recovery', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 1),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('releases the blocking layer when the native frame callback never arrives', async () => {
    const transition = createVisualTransition(6500);
    const releaseLayer = vi.fn();
    transition.subscribeFallback(releaseLayer);
    const frame = transition.waitForFrame();

    await vi.advanceTimersByTimeAsync(VISUAL_TRANSITION_FRAME_TIMEOUT_MS);

    expect(await frame).toBe(false);
    expect(transition.isActive()).toBe(false);
    expect(releaseLayer).toHaveBeenCalledOnce();
    expect(cancelAnimationFrame).toHaveBeenCalledWith(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('enforces the overall deadline when an animation completion signal never arrives', async () => {
    const transition = createVisualTransition(6500);
    const releaseLayer = vi.fn();
    const unsubscribeSignal = vi.fn();
    transition.subscribeFallback(releaseLayer);
    const signal = transition.waitForSignal(() => unsubscribeSignal, 10000);

    await vi.advanceTimersByTimeAsync(6499);
    expect(releaseLayer).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(await signal).toBe(false);
    expect(releaseLayer).toHaveBeenCalledOnce();
    expect(unsubscribeSignal).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('releases pending preparation and the layer when a visual operation rejects', async () => {
    const transition = createVisualTransition(1600);
    const releaseLayer = vi.fn();
    transition.subscribeFallback(releaseLayer);
    const pending = transition.waitFor(new Promise<void>(() => undefined));
    const failing = transition.waitFor(Promise.reject(new Error('measurement failed')));

    expect(await failing).toBeUndefined();
    expect(await pending).toBeUndefined();
    expect(releaseLayer).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels stale waits without releasing a newer screen layer', async () => {
    const transition = createVisualTransition(6500);
    const releaseLayer = vi.fn();
    transition.subscribeFallback(releaseLayer);
    const pending = transition.waitForFrame();

    transition.cancel();
    await vi.advanceTimersByTimeAsync(10000);

    expect(await pending).toBe(false);
    expect(releaseLayer).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps the successful launch animation path active and cleans its completed frame', async () => {
    vi.stubGlobal('requestAnimationFrame', (callback: (timestamp: number) => void) =>
      setTimeout(() => callback(Date.now()), 16),
    );
    vi.stubGlobal('cancelAnimationFrame', (frame: ReturnType<typeof setTimeout>) =>
      clearTimeout(frame),
    );
    const transition = createVisualTransition(6500);
    const releaseLayer = vi.fn();
    transition.subscribeFallback(releaseLayer);
    const frame = transition.waitForFrame();
    await vi.advanceTimersByTimeAsync(16);
    expect(await frame).toBe(true);
    expect(transition.isActive()).toBe(true);
    transition.cancel();
    expect(releaseLayer).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not extend the layer deadline when reduced motion restarts its visual effect', async () => {
    const deadline = Date.now() + 6500;
    const original = createVisualTransition(deadline - Date.now());
    await vi.advanceTimersByTimeAsync(4000);
    original.cancel();
    const restarted = createVisualTransition(Math.max(0, deadline - Date.now()));
    const releaseLayer = vi.fn();
    restarted.subscribeFallback(releaseLayer);
    const pending = restarted.waitForSignal(() => () => undefined, 10000);
    await vi.advanceTimersByTimeAsync(2500);
    expect(await pending).toBe(false);
    expect(releaseLayer).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('requests hiding the native splash once when the frame is missing and ignores a late frame', async () => {
    let lateFrame: (() => void) | undefined;
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
      lateFrame = callback;
      return 2;
    });
    const hideSplash = vi.fn(() => Promise.resolve());
    const cancel = scheduleAfterVisualFrame(hideSplash);
    await vi.advanceTimersByTimeAsync(VISUAL_TRANSITION_FRAME_TIMEOUT_MS);
    expect(hideSplash).toHaveBeenCalledOnce();
    lateFrame?.();
    await vi.advanceTimersByTimeAsync(1000);
    expect(hideSplash).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    cancel();
  });

  it('preserves hiding the native splash on the first available frame', async () => {
    vi.stubGlobal('requestAnimationFrame', (callback: (timestamp: number) => void) =>
      setTimeout(() => callback(Date.now()), 16),
    );
    vi.stubGlobal('cancelAnimationFrame', (frame: ReturnType<typeof setTimeout>) =>
      clearTimeout(frame),
    );
    const hideSplash = vi.fn();
    const cancel = scheduleAfterVisualFrame(hideSplash);
    await vi.advanceTimersByTimeAsync(15);
    expect(hideSplash).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(hideSplash).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    cancel();
  });

  it('does not hide a later native splash after the navigator that scheduled it unmounts', async () => {
    const hideSplash = vi.fn();
    const cancel = scheduleAfterVisualFrame(hideSplash);
    cancel();
    await vi.advanceTimersByTimeAsync(1000);
    expect(hideSplash).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
