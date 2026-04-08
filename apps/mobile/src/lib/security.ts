import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

export interface BiometricSupport {
  readonly available: boolean;
  readonly label: string;
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

  const label = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)
    ? 'Face ID'
    : types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)
      ? 'huella'
      : 'biometria';

  return {
    available: hasHardware && isEnrolled,
    label,
  };
}

export async function authenticateWithBiometrics(): Promise<boolean> {
  const support = await getBiometricSupport();
  if (!support.available) {
    return false;
  }

  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Desbloquea Happy Circles',
    cancelLabel: 'Cancelar',
    disableDeviceFallback: false,
  });

  return result.success;
}
