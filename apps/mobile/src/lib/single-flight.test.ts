import { describe, expect, it, vi } from 'vitest';

import { runSingleFlight, type SingleFlightRef } from './single-flight';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, reject, resolve };
}

describe('runSingleFlight', () => {
  it('shares a hung promise across repeated taps instead of starting twice', async () => {
    const pending = deferred<string>();
    const action = vi.fn(() => pending.promise);
    const ref: SingleFlightRef<string> = { current: null };

    const first = runSingleFlight(ref, action);
    const second = runSingleFlight(ref, action);

    expect(first).toBe(second);
    expect(action).toHaveBeenCalledTimes(1);

    pending.resolve('done');
    await expect(first).resolves.toBe('done');
    await Promise.resolve();
    expect(ref.current).toBeNull();
  });

  it('unlocks after rejection so an explicit retry can start', async () => {
    const firstAttempt = deferred<void>();
    const action = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(() => firstAttempt.promise)
      .mockResolvedValueOnce(undefined);
    const ref: SingleFlightRef<void> = { current: null };

    const first = runSingleFlight(ref, action);
    firstAttempt.reject(new Error('offline'));
    await expect(first).rejects.toThrow('offline');
    await Promise.resolve();

    await expect(runSingleFlight(ref, action)).resolves.toBeUndefined();
    expect(action).toHaveBeenCalledTimes(2);
  });
});
