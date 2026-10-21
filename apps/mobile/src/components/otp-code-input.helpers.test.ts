import { describe, expect, it } from 'vitest';

import { normalizeOtpCode } from './otp-code-input.helpers';

describe('OTP code normalization', () => {
  it('keeps all eight digits when a copied code contains spaces or line breaks', () => {
    expect(normalizeOtpCode(' 12 34\n56-78 ')).toBe('12345678');
    expect(normalizeOtpCode('12\u00a034\u00a056\u00a078')).toBe('12345678');
  });

  it('preserves leading zeroes from copied codes', () => {
    expect(normalizeOtpCode('00 12 34 56')).toBe('00123456');
  });

  it('limits the code after removing formatting rather than cutting the clipboard text first', () => {
    expect(normalizeOtpCode('\n 0123 4567 89 ')).toBe('01234567');
    expect(normalizeOtpCode('123 456 789', 6)).toBe('123456');
  });

  it('does not turn empty or non-numeric clipboard content into a code', () => {
    expect(normalizeOtpCode('')).toBe('');
    expect(normalizeOtpCode('Happy Circles')).toBe('');
  });
});
