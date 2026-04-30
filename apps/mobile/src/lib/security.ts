import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

export interface BiometricSupport {
  readonly available: boolean;
  readonly label: string;
}

export interface BiometricAuthResult {
  readonly success: boolean;
  readonly error: string | null;
}

function resolveBiometricLabel(types: readonly LocalAuthentication.AuthenticationType[]): string {
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
    return Platform.OS === 'ios' ? 'Face ID' : 'reconocimiento facial';
  }

  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
    return Platform.OS === 'ios' ? 'Touch ID' : 'huella';
  }

  return 'biometria';
}

function shouldAllowDeviceFallback(): boolean {
  if (Platform.OS !== 'ios') {
    return false;
  }

  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

export async function getBiometricSupport(): Promise<BiometricSupport> {
  if (Platform.OS === 'web') {
    return { available: false, label: 'biometria' };
  }

  const [hasHardware, isEnrolled, types] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
    LocalAuthentication.supportedAuthenticationTypesAsync(),
  ]);

  const label = resolveBiometricLabel(types);

  return {
    available: hasHardware && isEnrolled,
    label,
  };
}

export async function authenticateWithBiometricsResult(): Promise<BiometricAuthResult> {
  const support = await getBiometricSupport();
  if (!support.available) {
    return {
      success: false,
      error: 'not_available',
    };
  }

  const allowDeviceFallback = shouldAllowDeviceFallback();

  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Desbloquea Happy Circles',
    cancelLabel: 'Cancelar',
    disableDeviceFallback: !allowDeviceFallback,
    fallbackLabel: allowDeviceFallback ? 'Usar codigo' : '',
  });

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
