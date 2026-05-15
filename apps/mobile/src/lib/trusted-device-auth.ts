import type { TrustedDeviceAuthMethod } from '@/providers/session/types';

export interface TrustedDeviceAuthAvailability {
  readonly canTrustCurrentDeviceWithoutPassword: boolean;
  readonly hasApple: boolean;
  readonly hasEmailPassword: boolean;
  readonly hasGoogle: boolean;
}

export function resolveTrustedDeviceAuthMethods(
  input: TrustedDeviceAuthAvailability,
): readonly TrustedDeviceAuthMethod[] {
  const methods: TrustedDeviceAuthMethod[] = [];

  if (input.canTrustCurrentDeviceWithoutPassword) {
    methods.push('password');
  }

  if (input.hasGoogle) {
    methods.push('google');
  }

  if (input.hasApple) {
    methods.push('apple');
  }

  if (!input.canTrustCurrentDeviceWithoutPassword && input.hasEmailPassword) {
    methods.push('password');
  }

  return methods;
}

export function resolveTrustActionLabel(input: TrustedDeviceAuthAvailability): string {
  const method = resolveTrustedDeviceAuthMethods(input)[0] ?? null;

  if (input.canTrustCurrentDeviceWithoutPassword && method === 'password') {
    return 'Confiar este dispositivo';
  }

  if (method === 'google') {
    return 'Validar con Google';
  }

  if (method === 'apple') {
    return 'Validar con Apple';
  }

  if (method === 'password') {
    return 'Validar con contraseña';
  }

  return 'Validar dispositivo';
}

export function resolveTrustMethodLabel(input: {
  readonly canTrustCurrentDeviceWithoutPassword: boolean;
  readonly method: TrustedDeviceAuthMethod;
}): string {
  if (input.method === 'google') {
    return 'Validar con Google';
  }

  if (input.method === 'apple') {
    return 'Validar con Apple';
  }

  return input.canTrustCurrentDeviceWithoutPassword
    ? 'Confiar este dispositivo'
    : 'Validar con contraseña';
}
