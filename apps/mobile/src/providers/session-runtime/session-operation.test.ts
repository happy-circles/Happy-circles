import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  SessionOperationTimeoutError,
  sessionOperationErrorMessage,
  settledValueOr,
  withSessionOperationTimeout,
} from './session-operation';

describe('session operation helpers', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns a source result and clears its timeout', async () => {
    vi.useFakeTimers();

    await expect(withSessionOperationTimeout('get-session', Promise.resolve('ready'), 500)).resolves.toBe(
      'ready',
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects a stalled operation with a typed timeout error', async () => {
    vi.useFakeTimers();
    const result = withSessionOperationTimeout('load-account', new Promise(() => undefined), 500);
    const expectation = expect(result).rejects.toMatchObject({
      code: 'session_operation_timeout',
      operation: 'load-account',
    });

    await vi.advanceTimersByTimeAsync(500);
    await expectation;
  });

  it('maps only timeout errors to a recoverable connection message', () => {
    expect(sessionOperationErrorMessage(new SessionOperationTimeoutError('sign-up'))).toContain(
      'Inténtalo de nuevo',
    );
    expect(sessionOperationErrorMessage(new Error('boom'), 'fallback')).toBe('fallback');
  });

  it('uses settled values without letting optional bootstrap failures abort hydration', () => {
    expect(settledValueOr({ status: 'fulfilled', value: 'saved' }, 'fallback')).toBe('saved');
    expect(settledValueOr({ status: 'rejected', reason: new Error('unavailable') }, 'fallback')).toBe(
      'fallback',
    );
  });
});
