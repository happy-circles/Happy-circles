import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  IDENTITY_MODAL_DISMISS_TIMEOUT_MS,
  IdentityModalCoordinator,
} from './identity-modal-coordination';

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(0), 16),
  );
  vi.stubGlobal('cancelAnimationFrame', (frame: ReturnType<typeof setTimeout>) =>
    clearTimeout(frame),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('identity and financial feedback native modal coordination', () => {
  it('adds no wait when a confirmation begins before delayed feedback is shown', async () => {
    const coordinator = new IdentityModalCoordinator();
    coordinator.registerFeedbackModal();
    const presentation = coordinator.begin();
    await expect(presentation.ready).resolves.toBe(true);
    expect(coordinator.isSuspended()).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    presentation.release();
    await expect(presentation.closed).resolves.toBeUndefined();
  });

  it('waits for every visible feedback dismissal after a late server authorization rejection', async () => {
    const coordinator = new IdentityModalCoordinator();
    const transaction = coordinator.registerFeedbackModal();
    const circle = coordinator.registerFeedbackModal();
    transaction.presented();
    circle.presented();
    const presentation = coordinator.begin();
    const ready = vi.fn();
    void presentation.ready.then(ready);
    await Promise.resolve();
    expect(ready).not.toHaveBeenCalled();
    transaction.dismissed();
    await Promise.resolve();
    expect(ready).not.toHaveBeenCalled();
    circle.dismissed();
    await expect(presentation.ready).resolves.toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    presentation.release();
  });

  it('settles a missing native dismiss callback without allowing a second modal to open blindly', async () => {
    const coordinator = new IdentityModalCoordinator();
    const feedback = coordinator.registerFeedbackModal();
    feedback.presented();
    const presentation = coordinator.begin();
    await vi.advanceTimersByTimeAsync(IDENTITY_MODAL_DISMISS_TIMEOUT_MS);
    await expect(presentation.ready).resolves.toBe(false);
    // Caller cancels the confirmation; feedback may then show its ordinary error result.
    presentation.release();
    expect(coordinator.isSuspended()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('settles a cancelled or unmounted provider and ignores a late feedback callback', async () => {
    const coordinator = new IdentityModalCoordinator();
    const feedback = coordinator.registerFeedbackModal();
    feedback.presented();
    const presentation = coordinator.begin();
    presentation.release();
    feedback.dismissed();
    await expect(presentation.ready).resolves.toBe(false);
    await expect(presentation.closed).resolves.toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels presentation if its feedback host unmounts before native dismissal is acknowledged', async () => {
    const coordinator = new IdentityModalCoordinator();
    const feedback = coordinator.registerFeedbackModal();
    feedback.presented();
    const presentation = coordinator.begin();
    feedback.unregister();
    await expect(presentation.ready).resolves.toBe(false);
    presentation.release();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps feedback hidden until identity onDismiss and protects the next lease from old callbacks', async () => {
    const coordinator = new IdentityModalCoordinator();
    const first = coordinator.begin();
    const closed = first.closing(true);
    expect(coordinator.isSuspended()).toBe(true);
    const concurrent = coordinator.begin();
    await expect(concurrent.ready).resolves.toBe(false);
    concurrent.release();
    expect(coordinator.isSuspended()).toBe(true);
    first.release();
    await expect(closed).resolves.toBeUndefined();
    const second = coordinator.begin();
    first.release();
    expect(coordinator.isSuspended()).toBe(true);
    second.release();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('bounds a lost identity onDismiss callback and resolves closing once', async () => {
    const coordinator = new IdentityModalCoordinator();
    const presentation = coordinator.begin();
    const closing = presentation.closing(true);
    expect(presentation.closing(true)).toBe(closing);
    await vi.advanceTimersByTimeAsync(IDENTITY_MODAL_DISMISS_TIMEOUT_MS);
    await expect(closing).resolves.toBeUndefined();
    expect(coordinator.isSuspended()).toBe(false);
    presentation.release();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('resumes after the committed Android/web hide without a fixed native dismissal delay', async () => {
    const coordinator = new IdentityModalCoordinator();
    const presentation = coordinator.begin();
    const closing = presentation.closing(false);
    expect(coordinator.isSuspended()).toBe(true);
    await vi.advanceTimersByTimeAsync(16);
    await expect(closing).resolves.toBeUndefined();
    expect(coordinator.isSuspended()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('settles Android/web closing if animation frames never arrive', async () => {
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const coordinator = new IdentityModalCoordinator();
    const presentation = coordinator.begin();
    const closing = presentation.closing(false);
    await vi.advanceTimersByTimeAsync(121);
    await expect(closing).resolves.toBeUndefined();
    expect(coordinator.isSuspended()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('notifies suspension and restoration once while preserving subscription cleanup', () => {
    const coordinator = new IdentityModalCoordinator();
    const listener = vi.fn();
    const unsubscribe = coordinator.subscribe(listener);
    const presentation = coordinator.begin();
    presentation.release();
    presentation.release();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    coordinator.begin().release();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
