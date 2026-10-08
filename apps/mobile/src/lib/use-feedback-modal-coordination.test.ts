import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { IdentityModalPresentation } from './identity-modal-coordination';

const harness = vi.hoisted(() => ({
  cursor: 0,
  slots: [] as unknown[],
  effects: new Map<number, { dependencies: readonly unknown[]; cleanup?: () => void }>(),
  platform: 'ios',
}));

vi.mock('react', () => ({
  useState: (initial: () => unknown) => {
    const index = harness.cursor++;
    if (!(index in harness.slots)) harness.slots[index] = initial();
    return [harness.slots[index]];
  },
  useRef: (initial: unknown) => {
    const index = harness.cursor++;
    if (!(index in harness.slots)) harness.slots[index] = { current: initial };
    return harness.slots[index];
  },
  useCallback: (callback: unknown) => callback,
  useSyncExternalStore: (_subscribe: unknown, snapshot: () => boolean) => snapshot(),
  useLayoutEffect: (callback: () => (() => void) | undefined, dependencies: readonly unknown[]) => {
    const index = harness.cursor++;
    const previous = harness.effects.get(index);
    if (
      !previous ||
      previous.dependencies.length !== dependencies.length ||
      previous.dependencies.some((value, offset) => !Object.is(value, dependencies[offset]))
    ) {
      previous?.cleanup?.();
      harness.effects.set(index, { dependencies, cleanup: callback() });
    }
  },
}));
vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return harness.platform;
    },
  },
}));

import { beginIdentityConfirmationPresentation } from './identity-modal-coordination';
import { useFeedbackModalCoordination } from './use-feedback-modal-coordination';

let presentation: IdentityModalPresentation | null = null;

function renderHook(mounted: boolean) {
  harness.cursor = 0;
  return useFeedbackModalCoordination(mounted);
}

beforeEach(() => {
  harness.cursor = 0;
  harness.slots = [];
  harness.effects.clear();
  harness.platform = 'ios';
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(0), 16),
  );
  vi.stubGlobal('cancelAnimationFrame', (frame: ReturnType<typeof setTimeout>) =>
    clearTimeout(frame),
  );
});

afterEach(() => {
  for (const effect of harness.effects.values()) effect.cleanup?.();
  presentation?.release();
  presentation = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('financial feedback modal suspension hook', () => {
  it('hides native feedback immediately even if its exit animation keeps mounted=true', async () => {
    expect(renderHook(true).nativeVisible).toBe(true);
    presentation = beginIdentityConfirmationPresentation();
    const ready = vi.fn();
    void presentation.ready.then(ready);
    const modal = renderHook(true);
    expect(modal.suspended).toBe(true);
    expect(modal.nativeVisible).toBe(false);
    // A late show callback must not register a hidden modal again.
    modal.onShow();
    await Promise.resolve();
    expect(ready).not.toHaveBeenCalled();
    modal.onDismiss();
    await expect(presentation.ready).resolves.toBe(true);
    presentation.release();
    expect(renderHook(true).nativeVisible).toBe(true);
  });

  it('does not require an iOS-only callback to acknowledge Android feedback dismissal', async () => {
    harness.platform = 'android';
    renderHook(true);
    presentation = beginIdentityConfirmationPresentation();
    expect(renderHook(true).nativeVisible).toBe(false);
    await vi.advanceTimersByTimeAsync(16);
    await expect(presentation.ready).resolves.toBe(true);
    const closing = presentation.closing(false);
    await vi.advanceTimersByTimeAsync(16);
    await expect(closing).resolves.toBeUndefined();
    expect(renderHook(true).nativeVisible).toBe(true);
  });

  it('never presents delayed busy feedback while an inline confirmation owns the native modal', async () => {
    renderHook(false);
    presentation = beginIdentityConfirmationPresentation();
    await expect(presentation.ready).resolves.toBe(true);
    expect(renderHook(true).nativeVisible).toBe(false);
    presentation.release();
    expect(renderHook(true).nativeVisible).toBe(true);
  });
});
