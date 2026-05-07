import {
  GoogleSignin,
  isCancelledResponse,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { Platform } from 'react-native';

import { appConfig } from '@/lib/config';

export interface NativeGoogleCredential {
  readonly idToken: string;
  readonly accessToken: string;
  readonly displayName: string | null;
  readonly givenName: string | null;
  readonly familyName: string | null;
  readonly email: string | null;
  readonly photoUrl: string | null;
}

export type NativeGoogleCredentialResult =
  | {
      readonly ok: true;
      readonly credential: NativeGoogleCredential;
    }
  | {
      readonly ok: false;
      readonly message: string;
    };

let configuredKey: string | null = null;

function resolveConfigurationKey(): string {
  return [
    appConfig.googleWebClientId,
    appConfig.googleIosClientId,
    appConfig.googleAndroidClientId,
    Platform.OS,
  ].join('|');
}

function configureGoogleSignIn(): NativeGoogleCredentialResult | null {
  const key = resolveConfigurationKey();

  if (!appConfig.googleWebClientId) {
    return {
      ok: false,
      message: 'Configura EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID para usar Google.',
    };
  }

  if (configuredKey === key) {
    return null;
  }

  GoogleSignin.configure({
    webClientId: appConfig.googleWebClientId,
    iosClientId:
      Platform.OS === 'ios' && appConfig.googleIosClientId
        ? appConfig.googleIosClientId
        : undefined,
    offlineAccess: false,
    profileImageSize: 160,
  });

  configuredKey = key;
  return null;
}

function formatGoogleSignInError(error: unknown): NativeGoogleCredentialResult {
  if (isErrorWithCode(error)) {
    if (error.code === statusCodes.SIGN_IN_CANCELLED) {
      return {
        ok: false,
        message: 'Inicio con Google cancelado.',
      };
    }

    if (error.code === statusCodes.IN_PROGRESS) {
      return {
        ok: false,
        message: 'Google ya tiene una validacion en curso.',
      };
    }

    if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      return {
        ok: false,
        message: 'Google Play Services no esta disponible o necesita actualizarse.',
      };
    }
  }

  return {
    ok: false,
    message: error instanceof Error ? error.message : 'No se pudo iniciar Google.',
  };
}

export async function getNativeGoogleCredential(): Promise<NativeGoogleCredentialResult> {
  if (Platform.OS === 'web') {
    return {
      ok: false,
      message: 'Google nativo no esta disponible en web.',
    };
  }

  const configurationError = configureGoogleSignIn();
  if (configurationError) {
    return configurationError;
  }

  try {
    if (Platform.OS === 'android') {
      await GoogleSignin.hasPlayServices({
        showPlayServicesUpdateDialog: true,
      });
    }

    await GoogleSignin.signOut().catch(() => null);
    const response = await GoogleSignin.signIn();

    if (isCancelledResponse(response)) {
      return {
        ok: false,
        message: 'Inicio con Google cancelado.',
      };
    }

    if (!isSuccessResponse(response)) {
      return {
        ok: false,
        message: 'No se pudo iniciar Google.',
      };
    }

    const tokens = await GoogleSignin.getTokens();
    const idToken = response.data.idToken ?? tokens.idToken;

    if (!idToken || !tokens.accessToken) {
      return {
        ok: false,
        message: 'Google no devolvio credenciales validas.',
      };
    }

    return {
      ok: true,
      credential: {
        idToken,
        accessToken: tokens.accessToken,
        displayName: response.data.user.name ?? null,
        givenName: response.data.user.givenName ?? null,
        familyName: response.data.user.familyName ?? null,
        email: response.data.user.email ?? null,
        photoUrl: response.data.user.photo ?? null,
      },
    };
  } catch (error) {
    return formatGoogleSignInError(error);
  }
}
