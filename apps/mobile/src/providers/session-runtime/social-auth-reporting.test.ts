import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/support-errors', () => ({
  reportClientErrorSafe: vi.fn(),
}));

vi.mock('./auth-debug', () => ({
  traceAuthDebugEvent: vi.fn(),
}));

import { shouldFallbackToSupabaseGoogleOAuth } from './social-auth-reporting';

describe('social auth reporting helpers', () => {
  it('uses structured Google native fallback decisions before UI messages', () => {
    expect(
      shouldFallbackToSupabaseGoogleOAuth({
        failureCode: 'supabase_token_rejected',
        message: 'Correo o contrasena incorrectos.',
        shouldFallbackToOAuth: true,
      }),
    ).toBe(true);

    expect(
      shouldFallbackToSupabaseGoogleOAuth({
        failureCode: 'identity_conflict',
        message: 'Ese metodo de acceso ya esta vinculado.',
        shouldFallbackToOAuth: false,
      }),
    ).toBe(false);
  });

  it('keeps message fallback for older callers', () => {
    expect(shouldFallbackToSupabaseGoogleOAuth('Google nativo no esta disponible.')).toBe(true);
    expect(shouldFallbackToSupabaseGoogleOAuth('Inicio con Google cancelado.')).toBe(false);
  });
});
