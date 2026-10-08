import { afterEach, describe, expect, it, vi } from 'vitest';
import { queryBiometricSupport } from './biometric-support-query';

afterEach(() => vi.useRealTimers());

describe('reading current biometric support', () => {
  it('recognizes enrollment added in Settings on the next query', async () => {
    let enrolled = false;
    const query = () =>
      queryBiometricSupport({
        hasHardware: async () => true,
        isEnrolled: async () => enrolled,
        supportedTypes: async () => ['fingerprint'],
        labelForTypes: () => 'huella',
      });
    expect(await query()).toEqual({ available: false, label: 'huella' });
    enrolled = true;
    expect(await query()).toEqual({ available: true, label: 'huella' });
  });

  it('reports a native query failure as an error rather than unsupported hardware', async () => {
    await expect(
      queryBiometricSupport({
        hasHardware: async () => {
          throw new Error('native service unavailable');
        },
        isEnrolled: async () => true,
        supportedTypes: async () => ['face'],
        labelForTypes: () => 'reconocimiento facial',
      }),
    ).rejects.toThrow('native service unavailable');
  });

  it('finishes a stalled native status query and allows a subsequent retry', async () => {
    vi.useFakeTimers();
    const stalled = queryBiometricSupport({
      hasHardware: () => new Promise<boolean>(() => undefined),
      isEnrolled: async () => true,
      supportedTypes: async () => ['face'],
      labelForTypes: () => 'Face ID',
      timeoutMs: 100,
    });
    const rejected = expect(stalled).rejects.toThrow('biometric_support_timeout');
    await vi.advanceTimersByTimeAsync(100);
    await rejected;
    expect(
      await queryBiometricSupport({
        hasHardware: async () => true,
        isEnrolled: async () => true,
        supportedTypes: async () => ['face'],
        labelForTypes: () => 'Face ID',
      }),
    ).toEqual({ available: true, label: 'Face ID' });
    expect(vi.getTimerCount()).toBe(0);
  });
});
