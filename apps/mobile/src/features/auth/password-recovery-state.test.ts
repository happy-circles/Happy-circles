import { describe, expect, it } from 'vitest';
import { resolvePasswordRecoveryScreenState } from './password-recovery-state';

describe('password recovery screen state', () => {
  it('waits for hydration before declaring a recovery link unavailable', () => {
    expect(
      resolvePasswordRecoveryScreenState({ status: 'loading', isPasswordRecoverySession: false }),
    ).toBe('loading');
    expect(
      resolvePasswordRecoveryScreenState({ status: 'loading', isPasswordRecoverySession: true }),
    ).toBe('loading');
    expect(
      resolvePasswordRecoveryScreenState({
        status: 'signed_out',
        isPasswordRecoverySession: false,
      }),
    ).toBe('unavailable');
  });

  it('allows recovery on an authenticated phone that has not yet been trusted', () => {
    expect(
      resolvePasswordRecoveryScreenState({
        status: 'signed_in_untrusted',
        isPasswordRecoverySession: true,
      }),
    ).toBe('ready');
  });
});
