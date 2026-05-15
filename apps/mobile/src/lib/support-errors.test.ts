import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  Platform: {
    OS: 'web',
  },
}));

vi.mock('./config', () => ({
  appConfig: {
    supabaseAnonKey: '',
    supabaseUrl: '',
  },
}));

vi.mock('./device-trust', () => ({
  getCurrentAppVersion: () => 'test',
}));

vi.mock('./supabase', () => ({
  supabase: null,
}));

import { redactSupportErrorText } from './support-errors';

describe('support error redaction', () => {
  it('redacts tokens from support error text before reporting', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnopqrstuvwxyz';
    const text = redactSupportErrorText(
      `Request failed Authorization: Bearer ${jwt} standalone ${jwt} https://app.test/join/invite_token_123456789?access_token=secret-token&code=otp-code secret=super-secret`,
      1000,
    );

    expect(text).toContain('Authorization=[redacted]');
    expect(text).toContain('[redacted_jwt]');
    expect(text).toContain('access_token=[redacted]');
    expect(text).toContain('code=[redacted]');
    expect(text).toContain('secret=[redacted]');
    expect(text).toContain('/join/[redacted]');
    expect(text).not.toContain(jwt);
    expect(text).not.toContain('secret-token');
    expect(text).not.toContain('otp-code');
    expect(text).not.toContain('super-secret');
    expect(text).not.toContain('invite_token_123456789');
  });
});
