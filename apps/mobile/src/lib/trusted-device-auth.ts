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
  if (resolveTrustedDeviceAuthMethods(input).length === 0) {
    return 'Confiar este teléfono';
  }

  return 'Confiar este teléfono';
}

export function resolveTrustMethodLabel(input: {
  readonly canTrustCurrentDeviceWithoutPassword: boolean;
  readonly method: TrustedDeviceAuthMethod;
}): string {
  if (input.method === 'google') {
    return 'Continuar con Google';
  }

  if (input.method === 'apple') {
    return 'Continuar con Apple';
  }

  return input.canTrustCurrentDeviceWithoutPassword ? 'Confiar este teléfono' : 'Usar contraseña';
}
