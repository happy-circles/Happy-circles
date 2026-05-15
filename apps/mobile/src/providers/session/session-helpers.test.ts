import { describe, expect, it, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';

vi.mock('expo-secure-store', () => ({
  deleteItemAsync: vi.fn(),
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
}));

vi.mock('react-native', () => ({
  Platform: {
    OS: 'web',
  },
}));

import {
  deriveAccountAccessState,
  deriveDeviceTrustState,
  deriveProfileCompletionState,
  isAuthUserEmailConfirmed,
  resolveStatusAfterAccountLoad,
} from './account-state';
import {
  extractAuthCallbackCode,
  extractAuthCallbackTokens,
  isPasswordRecoveryCallbackUrl,
} from './auth-callbacks';
import { deriveLinkedMethods, normalizeIdentityProvider } from './linked-methods';
import { isRememberedAccountSnapshot } from './remembered-account';
import { buildSetupState } from './setup-state';
import { formatStepUpErrorMessage } from './step-up';
import type { TrustedDeviceRow, UserProfileRow } from './types';

function profile(value: Partial<UserProfileRow>): UserProfileRow {
  return {
    id: 'user-1',
    email: 'ana@example.com',
    display_name: 'Ana Gomez',
    avatar_path: null,
    account_access_state: 'active',
    invited_by_user_id: null,
    activated_via_account_invite_id: null,
    activated_at: null,
    phone_country_iso2: 'CO',
    phone_country_calling_code: '+57',
    phone_national_number: '3001112233',
    phone_e164: '+573001112233',
    phone_verified_at: null,
    created_at: '2026-05-05T12:00:00.000Z',
    updated_at: '2026-05-05T12:00:00.000Z',
    ...value,
  } as UserProfileRow;
}

function trustedDevice(value: Partial<TrustedDeviceRow>): TrustedDeviceRow {
  return {
    id: 'device-row-1',
    user_id: 'user-1',
    device_id: 'device-1',
    platform: 'ios',
    device_name: 'iPhone',
    app_version: '1.0.0',
    trust_state: 'trusted',
    trusted_at: null,
    revoked_at: null,
    last_seen_at: '2026-05-05T12:00:00.000Z',
    created_at: '2026-05-05T12:00:00.000Z',
    updated_at: '2026-05-05T12:00:00.000Z',
    ...value,
  } as TrustedDeviceRow;
}

describe('session auth callback helpers', () => {
  it('extracts tokens, codes and recovery intent from app callback urls', () => {
    expect(
      extractAuthCallbackTokens(
        'happycircles://join#access_token=access-1&refresh_token=refresh-1&type=recovery',
      ),
    ).toEqual({ accessToken: 'access-1', refreshToken: 'refresh-1' });
    expect(extractAuthCallbackCode('happycircles://join?code=oauth-code#ignored=true')).toBe(
      'oauth-code',
    );
    expect(isPasswordRecoveryCallbackUrl('happycircles://reset-password?code=abc')).toBe(true);
    expect(isPasswordRecoveryCallbackUrl('happycircles://join#type=recovery')).toBe(true);
  });
});

describe('session state helpers', () => {
  it('derives account, profile, device and status states', () => {
    expect(deriveAccountAccessState(profile({ account_access_state: 'needs_invite' }))).toBe(
      'needs_invite',
    );
    expect(deriveProfileCompletionState(profile({ phone_e164: null }), true)).toBe('incomplete');
    expect(deriveProfileCompletionState(profile({}), true)).toBe('complete');
    expect(deriveDeviceTrustState(trustedDevice({ trust_state: 'revoked' }))).toBe('revoked');
    expect(
      resolveStatusAfterAccountLoad({
        hasSession: true,
        biometricsEnabled: true,
        deviceTrustState: 'trusted',
        initialLock: true,
        preserveLocked: false,
      }),
    ).toBe('signed_in_locked');
  });

  it('builds setup state from profile, email and permissions', () => {
    expect(
      buildSetupState({
        profile: profile({ phone_e164: null }),
        isEmailConfirmed: false,
        deviceTrustState: 'trusted',
        biometricAvailable: true,
        contactsPermissionStatus: 'granted',
        notificationsPermissionStatus: 'denied',
        emptyState: {
          requiredComplete: false,
          pendingRequiredSteps: [],
          emailConfirmed: false,
          securityPending: false,
          biometricsEligible: false,
          contactsPermissionStatus: 'loading',
          notificationsPermissionStatus: 'loading',
        },
      }),
    ).toMatchObject({
      requiredComplete: false,
      pendingRequiredSteps: ['email', 'profile'],
      securityPending: false,
      biometricsEligible: true,
      contactsPermissionStatus: 'granted',
      notificationsPermissionStatus: 'denied',
    });
  });

  it('detects confirmed auth users without requiring profile data', () => {
    expect(isAuthUserEmailConfirmed({ email: 'ana@example.com', email_confirmed_at: null })).toBe(
      false,
    );
    expect(
      isAuthUserEmailConfirmed({
        email: 'ana@example.com',
        email_confirmed_at: '2026-05-05T12:00:00.000Z',
      }),
    ).toBe(true);
  });
});

describe('session linked methods helpers', () => {
  it('normalizes providers and merges identity sources', () => {
    const session = {
      user: {
        app_metadata: {
          provider: 'email',
          providers: ['google'],
        },
        identities: [{ provider: 'apple' }],
      },
    } as Session;

    expect(normalizeIdentityProvider('Google')).toBe('google');
    expect(
      deriveLinkedMethods({
        session,
        profile: profile({ phone_e164: '+573001112233' }),
        identities: [{ provider: 'email' }],
      }),
    ).toMatchObject({
      hasEmailPassword: true,
      hasGoogle: true,
      hasApple: true,
      hasPhone: true,
    });
  });
});

describe('session remembered account helpers', () => {
  it('validates the stored remembered account shape tightly', () => {
    expect(
      isRememberedAccountSnapshot({
        userId: 'user-1',
        displayName: 'Ana',
        email: null,
        avatarPath: null,
        accountAccessState: 'active',
        lastUsedAt: '2026-05-05T12:00:00.000Z',
      }),
    ).toBe(true);
    expect(isRememberedAccountSnapshot({ userId: 'user-1', accountAccessState: 'loading' })).toBe(
      false,
    );
  });
});

describe('session step-up helpers', () => {
  it('keeps sensitive action error copy deterministic', () => {
    expect(formatStepUpErrorMessage('cambiar el perfil', 'Face ID', 'device_untrusted')).toBe(
      'Este dispositivo aun no es confiable. Validalo primero desde Perfil.',
    );
    expect(
      formatStepUpErrorMessage('agregar una contraseña', 'Face ID', 'authentication_failed'),
    ).toBe(
      'No se pudo validar Face ID para agregar una contraseña.',
    );
  });
});
