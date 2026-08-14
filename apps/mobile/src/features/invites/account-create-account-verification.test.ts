import { describe, expect, it } from 'vitest';

import {
  ACCOUNT_VERIFICATION_SIGN_IN_HREF,
  EMAIL_OTP_RESEND_COOLDOWN_MS,
  emailOtpResendAvailableAt,
  emailOtpResendSecondsRemaining,
  formatEmailOtpResendLabel,
} from './account-create-account-verification';

describe('account create account verification', () => {
  it('returns to sign in without leaking invite or email data in the route', () => {
    expect(ACCOUNT_VERIFICATION_SIGN_IN_HREF).toBe('/join?mode=sign-in');
    expect(ACCOUNT_VERIFICATION_SIGN_IN_HREF).not.toContain('@');
    expect(ACCOUNT_VERIFICATION_SIGN_IN_HREF).not.toContain('token');
  });

  it('starts a sixty-second resend cooldown', () => {
    expect(emailOtpResendAvailableAt(1_000)).toBe(1_000 + EMAIL_OTP_RESEND_COOLDOWN_MS);
  });

  it('rounds the remaining cooldown up and never returns a negative value', () => {
    expect(emailOtpResendSecondsRemaining(61_000, 1_000)).toBe(60);
    expect(emailOtpResendSecondsRemaining(61_000, 1_001)).toBe(60);
    expect(emailOtpResendSecondsRemaining(61_000, 60_999)).toBe(1);
    expect(emailOtpResendSecondsRemaining(61_000, 61_000)).toBe(0);
    expect(emailOtpResendSecondsRemaining(61_000, 62_000)).toBe(0);
    expect(emailOtpResendSecondsRemaining(Number.NaN, 1_000)).toBe(0);
  });

  it('keeps the resend state visible in its label', () => {
    expect(formatEmailOtpResendLabel({ resendBusy: false, resendCooldownSeconds: 60 })).toBe(
      'Reenviar código en 1:00',
    );
    expect(formatEmailOtpResendLabel({ resendBusy: false, resendCooldownSeconds: 9.2 })).toBe(
      'Reenviar código en 0:10',
    );
    expect(formatEmailOtpResendLabel({ resendBusy: false, resendCooldownSeconds: 0 })).toBe(
      'Reenviar código',
    );
    expect(formatEmailOtpResendLabel({ resendBusy: true, resendCooldownSeconds: 42 })).toBe(
      'Enviando...',
    );
  });
});
