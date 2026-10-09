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

import {
  createSupportError,
  isJwtAuthError,
  readFunctionErrorDetails,
  redactSupportErrorText,
} from './support-errors';

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

describe('authentication error details', () => {
  it.each([
    'recent_auth_required',
    'recent_auth_required: Vuelve a confirmar tu identidad.',
    'device_authorization_required',
    'trusted_origin_required',
    'identity_confirmation_unavailable',
  ])('does not treat %s as an expired or invalid JWT', (message) => {
    expect(isJwtAuthError(message)).toBe(false);
  });

  it('preserves a recent-authentication response as a recovery prerequisite', async () => {
    const error = Object.assign(new Error('Edge Function returned a non-2xx status code'), {
      context: Response.json(
        {
          code: 'recent_auth_required',
          error: 'Vuelve a confirmar tu identidad para completar esta acción.',
          requestId: 'request-1',
        },
        { status: 403 },
      ),
    });
    const details = await readFunctionErrorDetails(error);

    expect(details.code).toBe('recent_auth_required');
    expect(details.status).toBe(403);
    expect(isJwtAuthError(details)).toBe(false);
    expect(createSupportError({ ...details, supportId: 'HC-AAAA-BBBB-CCCC' }).code).toBe(
      'recent_auth_required',
    );
  });

  it.each([
    'auth_required',
    'auth_required: Autenticación requerida.',
    'JWT has expired',
    'jwt expired',
    'Invalid JWT',
    'Auth session missing!',
    'Missing Authorization header',
  ])('recognizes an actual authentication failure: %s', (message) => {
    expect(isJwtAuthError(message)).toBe(true);
  });

  it('recognizes the typed authentication code independently of its translated message', () => {
    expect(
      isJwtAuthError({ code: 'auth_required', message: 'Tu sesión necesita renovarse.' }),
    ).toBe(true);
  });
});
