import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  cursor: 0,
  slots: [] as unknown[],
  effects: new Map<number, { dependencies: readonly unknown[]; cleanup?: () => void }>(),
  pendingEffects: [] as Array<() => void>,
}));

function sameDependencies(previous: readonly unknown[] | undefined, next: readonly unknown[]) {
  return Boolean(
    previous &&
    previous.length === next.length &&
    previous.every((value, index) => Object.is(value, next[index])),
  );
}

vi.mock('react', () => ({
  useState: (initial: unknown) => {
    const index = harness.cursor++;
    if (!(index in harness.slots)) {
      const state = {
        value: initial,
        set: (value: unknown) => {
          state.value =
            typeof value === 'function'
              ? (value as (previous: unknown) => unknown)(state.value)
              : value;
        },
      };
      harness.slots[index] = state;
    }
    const state = harness.slots[index] as { value: unknown; set: (value: unknown) => void };
    return [state.value, state.set];
  },
  useRef: (initial: unknown) => {
    const index = harness.cursor++;
    if (!(index in harness.slots)) harness.slots[index] = { current: initial };
    return harness.slots[index];
  },
  useCallback: (callback: unknown, dependencies: readonly unknown[]) => {
    const index = harness.cursor++;
    const previous = harness.slots[index] as
      | { callback: unknown; dependencies: readonly unknown[] }
      | undefined;
    if (!sameDependencies(previous?.dependencies, dependencies)) {
      harness.slots[index] = { callback, dependencies };
      return callback;
    }
    return previous?.callback;
  },
  useEffect: (callback: () => (() => void) | undefined, dependencies: readonly unknown[]) => {
    const index = harness.cursor++;
    const previous = harness.effects.get(index);
    if (!sameDependencies(previous?.dependencies, dependencies)) {
      harness.pendingEffects.push(() => {
        previous?.cleanup?.();
        harness.effects.set(index, { dependencies, cleanup: callback() });
      });
    }
  },
}));
vi.mock('react-native', () => ({ Alert: { alert: vi.fn() } }));
vi.mock('./identity-flow-haptics', () => ({ triggerIdentityWarningHaptic: vi.fn() }));
vi.mock('./app-haptics', () => ({
  triggerAppErrorHaptic: vi.fn(),
  triggerAppSuccessHaptic: vi.fn(),
}));

import { useActionFeedbackOverlay, type ActionFeedbackOverlayOptions } from './action-feedback';
import { triggerAppErrorHaptic, triggerAppSuccessHaptic } from './app-haptics';

function renderHook(options?: ActionFeedbackOverlayOptions) {
  harness.cursor = 0;
  const feedback = useActionFeedbackOverlay(options);
  for (const effect of harness.pendingEffects.splice(0)) effect();
  return feedback;
}

function unmountHook() {
  for (const effect of harness.effects.values()) effect.cleanup?.();
  harness.effects.clear();
  harness.pendingEffects.length = 0;
}

beforeEach(() => {
  harness.cursor = 0;
  harness.slots.length = 0;
  harness.effects.clear();
  harness.pendingEffects.length = 0;
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  unmountHook();
  vi.useRealTimers();
});

describe('server-confirmed action feedback', () => {
  it('keeps a slow action pending until the server resolves, then continues after a short cue', async () => {
    let confirm!: (value: string) => void;
    const server = new Promise<string>((resolve) => {
      confirm = resolve;
    });
    const feedback = renderHook();
    const continueAction = vi.fn();
    const flow = (async () => {
      const result = await feedback.runBlockingAction('acceptFinancialRequest', () => server);
      await feedback.showResult({ title: 'Listo' });
      continueAction(result);
    })();

    renderHook();
    await vi.advanceTimersByTimeAsync(1000);
    expect(renderHook().overlayProps).toMatchObject({ visible: true, variant: 'loading' });
    expect(continueAction).not.toHaveBeenCalled();
    expect(triggerAppSuccessHaptic).not.toHaveBeenCalled();

    confirm('server-confirmed');
    await vi.advanceTimersByTimeAsync(0);
    expect(renderHook().overlayProps).toMatchObject({ visible: true, variant: 'success' });
    expect(triggerAppSuccessHaptic).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(249);
    expect(continueAction).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await flow;
    expect(continueAction).toHaveBeenCalledExactlyOnceWith('server-confirmed');
    expect(renderHook().overlayProps.visible).toBe(false);
  });

  it('does not turn server rejection into a successful completion', async () => {
    const feedback = renderHook();
    await expect(
      feedback.runBlockingAction('acceptFinancialRequest', () =>
        Promise.reject(new Error('La solicitud cambió')),
      ),
    ).rejects.toThrow('La solicitud cambió');
    expect(triggerAppSuccessHaptic).not.toHaveBeenCalled();
    expect(renderHook().overlayProps.visible).toBe(false);
  });

  it('keeps errors readable instead of applying the shorter success duration', async () => {
    const feedback = renderHook();
    const dismissed = vi.fn();
    const result = feedback.showResult({ title: 'No se pudo completar', variant: 'danger' });
    void result.then(dismissed);
    await vi.advanceTimersByTimeAsync(250);
    expect(renderHook().overlayProps).toMatchObject({ visible: true, variant: 'danger' });
    expect(triggerAppErrorHaptic).toHaveBeenCalledOnce();
    expect(dismissed).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1950);
    await result;
    expect(dismissed).toHaveBeenCalledOnce();
    expect(renderHook().overlayProps.visible).toBe(false);
  });

  it('honors a caller duration without delaying the underlying confirmed operation', async () => {
    const feedback = renderHook();
    const dismissed = vi.fn();
    const result = feedback.showResult({ title: 'Listo', durationMs: 900 });
    void result.then(dismissed);
    await vi.advanceTimersByTimeAsync(899);
    expect(dismissed).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await result;
    expect(dismissed).toHaveBeenCalledOnce();
  });

  it('cancels a previous completion timer without hiding or resolving a newer result', async () => {
    const feedback = renderHook();
    const firstDismissed = vi.fn();
    const secondDismissed = vi.fn();
    void feedback.showResult({ title: 'Primero' }).then(firstDismissed);
    await vi.advanceTimersByTimeAsync(100);
    const second = feedback.showResult({ title: 'Segundo' });
    void second.then(secondDismissed);
    await vi.advanceTimersByTimeAsync(150);
    expect(firstDismissed).toHaveBeenCalledOnce();
    expect(secondDismissed).not.toHaveBeenCalled();
    expect(renderHook().overlayProps).toMatchObject({ title: 'Segundo', visible: true });
    await vi.advanceTimersByTimeAsync(100);
    await second;
    expect(secondDismissed).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears pending feedback on unmount so a completed action cannot remain waiting', async () => {
    const feedback = renderHook();
    const dismissed = vi.fn();
    const result = feedback.showResult({ title: 'Listo' });
    void result.then(dismissed);
    unmountHook();
    await result;
    await vi.advanceTimersByTimeAsync(1000);
    expect(dismissed).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
