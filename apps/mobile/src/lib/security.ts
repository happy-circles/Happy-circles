import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';
import { queryBiometricSupport } from './biometric-support-query';

export interface BiometricSupport {
  readonly available: boolean;
  readonly label: string;
}

export interface BiometricAuthResult {
  readonly success: boolean;
  readonly error: string | null;
  readonly message?: string;
}

export interface BiometricSupportRefreshResult extends BiometricSupport {
  /** A failed status query is different from confirmed lack of enrolled biometrics. */
  readonly error: string | null;
}

function resolveBiometricLabel(types: readonly LocalAuthentication.AuthenticationType[]): string {
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
    return Platform.OS === 'ios' ? 'Face ID' : 'reconocimiento facial';
  }

  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
    return Platform.OS === 'ios' ? 'Touch ID' : 'huella';
  }

  return 'biometría';
}

function shouldAllowDeviceFallback(): boolean {
  if (Platform.OS !== 'ios') {
    return false;
  }

  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

export async function getBiometricSupport(): Promise<BiometricSupport> {
  if (Platform.OS === 'web') {
    return { available: false, label: 'biometría' };
  }

  return queryBiometricSupport({
    hasHardware: LocalAuthentication.hasHardwareAsync,
    isEnrolled: LocalAuthentication.isEnrolledAsync,
    supportedTypes: LocalAuthentication.supportedAuthenticationTypesAsync,
    labelForTypes: resolveBiometricLabel,
  });
}

export async function authenticateWithBiometricsResult(): Promise<BiometricAuthResult> {
  let support: BiometricSupport;
  try {
    support = await getBiometricSupport();
  } catch {
    return {
      success: false,
      error: 'biometric_status_failed',
      message:
        'No pudimos consultar la biometría del teléfono. Inténtalo de nuevo o usa otro método.',
    };
  }
  if (!support.available) {
    return {
      success: false,
      error: 'not_available',
    };
  }

  const allowDeviceFallback = shouldAllowDeviceFallback();

  let result: LocalAuthentication.LocalAuthenticationResult;
  try {
    result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Desbloquea Happy Circles',
      cancelLabel: 'Cancelar',
      disableDeviceFallback: !allowDeviceFallback,
      fallbackLabel: allowDeviceFallback ? 'Usar código' : '',
    });
  } catch {
    return {
      success: false,
      error: 'authentication_failed',
      message: 'No pudimos abrir la validación del teléfono. Inténtalo de nuevo o usa otro método.',
    };
  }

  if (result.success) {
    return {
      success: true,
      error: null,
    };
  }

  return {
    success: false,
    error: result.error ?? 'unknown',
  };
}

export async function authenticateWithBiometrics(): Promise<boolean> {
  const result = await authenticateWithBiometricsResult();
  return result.success;
}
