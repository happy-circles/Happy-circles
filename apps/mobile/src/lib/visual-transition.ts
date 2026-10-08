export const VISUAL_TRANSITION_FRAME_TIMEOUT_MS = 120;
export const IDENTITY_HANDOFF_PREPARATION_TIMEOUT_MS = 1600;

export interface VisualTransition {
  readonly isActive: () => boolean;
  readonly cancel: () => void;
  readonly fallback: () => void;
  readonly subscribeFallback: (listener: () => void) => () => void;
  readonly wait: (ms: number) => Promise<boolean>;
  readonly waitFor: <T>(source: PromiseLike<T>) => Promise<T | undefined>;
  readonly waitForFrame: () => Promise<boolean>;
  readonly waitForSignal: (
    subscribe: (complete: () => void) => () => void,
    timeoutMs: number,
  ) => Promise<boolean>;
}

/** Runs once after a frame, or its guard; cancellation prevents a pending action. */
export function scheduleAfterVisualFrame(action: () => void | PromiseLike<void>): () => void {
  let cancelled = false;
  const transition = createVisualTransition(VISUAL_TRANSITION_FRAME_TIMEOUT_MS + 1);
  void transition
    .waitForFrame()
    .then(async () => {
      transition.cancel();
      if (!cancelled) await action();
    })
    .catch(() => undefined);
  return () => {
    cancelled = true;
    transition.cancel();
  };
}

/** A visual failure ends preparation; it must never hold successful authentication. */
export function createVisualTransition(timeoutMs: number): VisualTransition {
  let active = true;
  let fellBack = false;
  const pending = new Set<() => void>();
  const fallbackListeners = new Set<() => void>();
  const deadline = setTimeout(fallback, timeoutMs);

  function cancel() {
    if (!active) return;
    active = false;
    clearTimeout(deadline);
    [...pending].forEach((cleanup) => {
      try {
        cleanup();
      } catch {
        // Cleanup of one native subscription must not strand other waiting work.
      }
    });
    pending.clear();
  }

  function fallback() {
    if (!active) return;
    fellBack = true;
    cancel();
    fallbackListeners.forEach((listener) => {
      try {
        listener();
      } catch {
        // One visual subscriber must not prevent the others from releasing their layers.
      }
    });
    fallbackListeners.clear();
  }

  function waitFor<T>(source: PromiseLike<T>): Promise<T | undefined> {
    return new Promise((resolve) => {
      let settled = false;
      function finish(value?: T) {
        if (settled) return;
        settled = true;
        pending.delete(cleanup);
        resolve(value);
      }
      function cleanup() {
        finish();
      }
      // Observe rejection even if cancellation happened before the source settled.
      Promise.resolve(source).then((value) => finish(active ? value : undefined), fallback);
      if (active) pending.add(cleanup);
      else finish();
    });
  }

  function waitForSignal(
    subscribe: (complete: () => void) => () => void,
    timeout: number,
  ): Promise<boolean> {
    if (!active) return Promise.resolve(false);
    return new Promise((resolve) => {
      let settled = false;
      let unsubscribe: (() => void) | undefined;
      const timer = setTimeout(() => finish(false), timeout);
      function finish(completed: boolean) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        pending.delete(cleanup);
        try {
          unsubscribe?.();
        } catch {
          // The wait still settles if native cancellation is unavailable.
        }
        resolve(completed);
      }
      function cleanup() {
        finish(false);
      }
      pending.add(cleanup);
      try {
        unsubscribe = subscribe(() => finish(true));
        if (settled) unsubscribe();
      } catch {
        fallback();
      }
    });
  }

  return {
    isActive: () => active,
    cancel,
    fallback,
    subscribeFallback(listener) {
      if (fellBack) listener();
      else if (active) fallbackListeners.add(listener);
      return () => fallbackListeners.delete(listener);
    },
    wait(ms) {
      return waitForSignal((complete) => {
        const timer = setTimeout(complete, ms);
        return () => clearTimeout(timer);
      }, ms + 1);
    },
    waitFor,
    waitForFrame() {
      if (!active) return Promise.resolve(false);
      return waitForSignal((complete) => {
        const frameTimeout = setTimeout(fallback, VISUAL_TRANSITION_FRAME_TIMEOUT_MS);
        let frame: ReturnType<typeof requestAnimationFrame>;
        try {
          frame = requestAnimationFrame(complete);
        } catch (error) {
          clearTimeout(frameTimeout);
          throw error;
        }
        return () => {
          clearTimeout(frameTimeout);
          cancelAnimationFrame(frame);
        };
      }, VISUAL_TRANSITION_FRAME_TIMEOUT_MS + 1);
    },
    waitForSignal,
  };
}
