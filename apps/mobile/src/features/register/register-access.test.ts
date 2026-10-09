import { describe, expect, it } from 'vitest';

import type { SensitiveMutationSession } from '@/lib/live-data/mutations/sensitive-action-check';
import {
  isRegisterAccessFailure,
  registerRetryConfirmation,
  resolveRegisterAccessIssue,
} from './register-access';

const readySession: SensitiveMutationSession = {
  userId: 'account-a',
  isEmailConfirmed: true,
  profileCompletionState: 'complete',
  isAuthorizedDeviceSession: true,
  isLocked: false,
};

describe('movement access recovery', () => {
  it('keeps the normal fast path free of an authorization prompt', () => {
    expect(resolveRegisterAccessIssue(readySession)).toBeNull();
    expect(registerRetryConfirmation(null)).toBeUndefined();
  });

  it('shows prerequisites in the order they can be resolved', () => {
    const incomplete = {
      ...readySession,
      isEmailConfirmed: false,
      profileCompletionState: 'incomplete',
      isAuthorizedDeviceSession: false,
    };
    expect(resolveRegisterAccessIssue(incomplete)?.kind).toBe('email');
    expect(resolveRegisterAccessIssue({ ...incomplete, isEmailConfirmed: true })?.kind).toBe(
      'profile',
    );
    expect(
      resolveRegisterAccessIssue({
        ...incomplete,
        isEmailConfirmed: true,
        profileCompletionState: 'complete',
      })?.actionLabel,
    ).toBe('Autorizar y registrar');
  });

  it('asks to authorize the current session even when the device was already trusted', () => {
    const issue = resolveRegisterAccessIssue({ ...readySession, isAuthorizedDeviceSession: false });
    expect(issue?.kind).toBe('authorize');
    expect(issue?.message).toContain('borrador');
  });

  it('offers correction continuation after authorization', () => {
    expect(
      resolveRegisterAccessIssue({ ...readySession, isAuthorizedDeviceSession: false }, null, true)
        ?.actionLabel,
    ).toBe('Autorizar y enviar');
  });

  it('recovers a definitive server rejection despite a locally authorized session', () => {
    const failure = { code: 'device_authorization_required', message: 'Changed translation' };
    expect(resolveRegisterAccessIssue(readySession, failure)?.kind).toBe('authorize');
    expect(registerRetryConfirmation(failure)).toBe('device');
  });

  it.each(['identity_confirmation_unavailable', 'identity_confirmation_busy'])(
    'provides a retry when confirmation could not start (%s)',
    (code) => {
      const failure = { code };
      expect(isRegisterAccessFailure(failure)).toBe(true);
      expect(resolveRegisterAccessIssue(readySession, failure)?.actionLabel).toBe(
        'Reintentar confirmación',
      );
      expect(registerRetryConfirmation(failure)).toBe('device');
    },
  );

  it('uses sensitive confirmation for an expired proof rather than resending first', () => {
    const failure = { code: 'recent_auth_required' };
    expect(resolveRegisterAccessIssue(readySession, failure)?.kind).toBe('unlock');
    expect(registerRetryConfirmation(failure)).toBe('sensitive');
  });

  it('does not disguise unrelated network or validation failures as missing authorization', () => {
    expect(isRegisterAccessFailure(new Error('Network request failed'))).toBe(false);
    expect(isRegisterAccessFailure({ code: 'validation_failed' })).toBe(false);
    expect(isRegisterAccessFailure(new Error('device_authorization_required'))).toBe(false);
  });
});
