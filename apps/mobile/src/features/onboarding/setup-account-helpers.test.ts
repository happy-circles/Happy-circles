import { describe, expect, it } from 'vitest';

import {
  resolveSetupAccountRouteParams,
  resolveTrustedDeviceAuthMethods,
  resolveTrustActionLabel,
  validateSetupProfile,
} from './setup-account-helpers';

describe('setup account helpers', () => {
  it('derives trust action labels from available session methods', () => {
    expect(
      resolveTrustActionLabel({
        canTrustCurrentDeviceWithoutPassword: true,
        hasApple: false,
        hasEmailPassword: false,
        hasGoogle: false,
      }),
    ).toBe('Confiar este dispositivo');
    expect(
      resolveTrustActionLabel({
        canTrustCurrentDeviceWithoutPassword: false,
        hasApple: false,
        hasEmailPassword: true,
        hasGoogle: true,
      }),
    ).toBe('Validar con Google');
    expect(
      resolveTrustActionLabel({
        canTrustCurrentDeviceWithoutPassword: false,
        hasApple: false,
        hasEmailPassword: true,
        hasGoogle: false,
      }),
    ).toBe('Validar con clave');
    expect(
      resolveTrustActionLabel({
        canTrustCurrentDeviceWithoutPassword: false,
        hasApple: false,
        hasEmailPassword: false,
        hasGoogle: true,
      }),
    ).toBe('Validar con Google');
    expect(
      resolveTrustActionLabel({
        canTrustCurrentDeviceWithoutPassword: false,
        hasApple: true,
        hasEmailPassword: false,
        hasGoogle: false,
      }),
    ).toBe('Validar con Apple');
  });

  it('orders trusted-device methods with social before password fallback', () => {
    expect(
      resolveTrustedDeviceAuthMethods({
        canTrustCurrentDeviceWithoutPassword: false,
        hasApple: true,
        hasEmailPassword: true,
        hasGoogle: true,
      }),
    ).toEqual(['google', 'apple', 'password']);
    expect(
      resolveTrustedDeviceAuthMethods({
        canTrustCurrentDeviceWithoutPassword: true,
        hasApple: true,
        hasEmailPassword: true,
        hasGoogle: true,
      }),
    ).toEqual(['password', 'google', 'apple']);
  });

  it('normalizes route params from Expo arrays and strings', () => {
    expect(
      resolveSetupAccountRouteParams({
        editPhone: ['true', 'false'],
        returnTo: ['/profile'],
        step: ['security'],
      }),
    ).toEqual({
      editPhoneMode: true,
      requestedStep: 'security',
      returnTo: '/profile',
    });
    expect(
      resolveSetupAccountRouteParams({
        editPhone: 'false',
        returnTo: '/home',
        step: 'profile',
      }),
    ).toEqual({
      editPhoneMode: false,
      requestedStep: 'profile',
      returnTo: '/home',
    });
  });

  it('validates profile fields and reports the first invalid field', () => {
    expect(
      validateSetupProfile({
        fullNameIsUsable: false,
        needsPhoneInput: true,
        phoneNationalNumber: '123',
      }),
    ).toEqual({
      errors: {
        fullName: 'Escribe tu nombre, no el correo.',
        phoneNationalNumber: 'Ingresa un celular valido.',
        photo: undefined,
      },
      firstInvalidField: 'fullName',
    });
    expect(
      validateSetupProfile({
        fullNameIsUsable: true,
        needsPhoneInput: true,
        phoneNationalNumber: '123',
      }),
    ).toMatchObject({
      firstInvalidField: 'phoneNationalNumber',
    });
    expect(
      validateSetupProfile({
        fullNameIsUsable: true,
        needsPhoneInput: false,
        phoneNationalNumber: '',
      }),
    ).toMatchObject({
      firstInvalidField: null,
    });
  });
});
