import { describe, expect, it } from 'vitest';
import { resolveTrustedDeviceAuthMethods, resolveTrustMethodLabel } from './trusted-device-auth';

describe('device trust authentication choices', () => {
  it('offers server reuse for a recent Google login without inventing a password method', () => {
    expect(
      resolveTrustedDeviceAuthMethods({
        canTrustCurrentDeviceWithoutPassword: true,
        hasGoogle: true,
        hasApple: false,
        hasEmailPassword: false,
      }),
    ).toEqual(['recent_auth', 'google']);
    expect(
      resolveTrustMethodLabel({
        method: 'recent_auth',
        canTrustCurrentDeviceWithoutPassword: true,
      }),
    ).toBe('Confiar este teléfono');
  });

  it('offers a password only when the account actually has one', () => {
    expect(
      resolveTrustedDeviceAuthMethods({
        canTrustCurrentDeviceWithoutPassword: false,
        hasGoogle: false,
        hasApple: false,
        hasEmailPassword: true,
      }),
    ).toEqual(['password']);
    expect(
      resolveTrustMethodLabel({
        method: 'password',
        canTrustCurrentDeviceWithoutPassword: true,
      }),
    ).toBe('Usar contraseña');
  });
});
