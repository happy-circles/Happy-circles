import type { supabase } from '@/lib/supabase';
import {
  formatSupabaseAuthErrorMessage,
  formatValidationMessage,
  readErrorMessage,
} from '../session/auth-errors';
import { getNativeGoogleCredential } from './google-auth';

type SupabaseClient = NonNullable<typeof supabase>;
type NativeGoogleMode = 'link' | 'sign-in';
export type NativeGoogleFailureCode =
  | 'already_in_progress'
  | 'cancelled'
  | 'identity_conflict'
  | 'link_identity_unavailable'
  | 'manual_linking_disabled'
  | 'native_configuration_missing'
  | 'native_credential_failed'
  | 'native_unavailable'
  | 'play_services_unavailable'
  | 'provider_disabled'
  | 'supabase_token_rejected'
  | 'unexpected';
type NativeGoogleStage =
  | 'link_identity'
  | 'native_credential'
  | 'profile_metadata'
  | 'sign_in_with_id_token'
  | 'unexpected';

export interface NativeGoogleFailureReport {
  readonly provider: 'google';
  readonly mode: NativeGoogleMode;
  readonly stage: NativeGoogleStage;
  readonly error?: unknown;
  readonly message?: string;
  readonly reason?: string;
}

export interface NativeGoogleResult {
  readonly failureCode?: NativeGoogleFailureCode;
  readonly message: string;
  readonly shouldFallbackToOAuth?: boolean;
  readonly userId: string | null;
}

function isNativeAuthCancellationMessage(message: string): boolean {
  return message.toLocaleLowerCase('en-US').includes('cancelad');
}

function classifyNativeCredentialFailure(message: string): {
  readonly failureCode: NativeGoogleFailureCode;
  readonly shouldFallbackToOAuth: boolean;
} {
  const normalized = message.trim().toLocaleLowerCase('en-US');

  if (normalized.includes('cancelad')) {
    return { failureCode: 'cancelled', shouldFallbackToOAuth: false };
  }

  if (normalized.includes('en curso')) {
    return { failureCode: 'already_in_progress', shouldFallbackToOAuth: false };
  }

  if (normalized.includes('expo_public_google_web_client_id')) {
    return { failureCode: 'native_configuration_missing', shouldFallbackToOAuth: true };
  }

  if (normalized.includes('play services')) {
    return { failureCode: 'play_services_unavailable', shouldFallbackToOAuth: true };
  }

  if (normalized.includes('google nativo')) {
    return { failureCode: 'native_unavailable', shouldFallbackToOAuth: true };
  }

  return { failureCode: 'native_credential_failed', shouldFallbackToOAuth: true };
}

function classifySupabaseGoogleFailure(message: string): {
  readonly failureCode: NativeGoogleFailureCode;
  readonly shouldFallbackToOAuth: boolean;
} {
  const normalized = message.trim().toLocaleLowerCase('en-US');

  if (
    normalized.includes('manual linking') ||
    normalized.includes('identity linking') ||
    normalized.includes('linking is not enabled')
  ) {
    return { failureCode: 'manual_linking_disabled', shouldFallbackToOAuth: false };
  }

  if (
    normalized.includes('identity_already_exists') ||
    normalized.includes('identity already exists') ||
    normalized.includes('already linked') ||
    normalized.includes('already been linked')
  ) {
    return { failureCode: 'identity_conflict', shouldFallbackToOAuth: false };
  }

  if (normalized.includes('provider') && normalized.includes('disabled')) {
    return { failureCode: 'provider_disabled', shouldFallbackToOAuth: false };
  }

  return { failureCode: 'supabase_token_rejected', shouldFallbackToOAuth: true };
}

export async function performNativeGoogleAuth(input: {
  readonly client: SupabaseClient;
  readonly mode: NativeGoogleMode;
  readonly reportFailure: (failure: NativeGoogleFailureReport) => void;
}): Promise<NativeGoogleResult> {
  try {
    const credentialResult = await getNativeGoogleCredential();
    if (!credentialResult.ok) {
      const message =
        input.mode === 'link' && credentialResult.message === 'Inicio con Google cancelado.'
          ? 'Vinculación con Google cancelada.'
          : credentialResult.message;

      const failure = classifyNativeCredentialFailure(message);

      if (!isNativeAuthCancellationMessage(message)) {
        input.reportFailure({
          message,
          mode: input.mode,
          provider: 'google',
          reason: failure.failureCode,
          stage: 'native_credential',
        });
      }

      return {
        ...failure,
        message,
        userId: null,
      };
    }

    const { credential } = credentialResult;

    if (input.mode === 'link') {
      const authApi = input.client.auth as unknown as {
        readonly linkIdentity?: (linkInput: {
          readonly provider: 'google';
          readonly token: string;
          readonly access_token: string;
        }) => Promise<{ error?: { message: string } | null }>;
      };

      if (typeof authApi.linkIdentity !== 'function') {
        input.reportFailure({
          message: 'No pudimos vincular Google en esta versión de la app.',
          mode: input.mode,
          provider: 'google',
          reason: 'link_identity_unavailable',
          stage: 'link_identity',
        });

        return {
          message: 'No pudimos vincular Google en esta versión de la app.',
          userId: null,
        };
      }

      const { error } = await authApi.linkIdentity({
        provider: 'google',
        token: credential.idToken,
        access_token: credential.accessToken,
      });

      if (error) {
        const failure = classifySupabaseGoogleFailure(error.message);
        input.reportFailure({
          error,
          message: error.message,
          mode: input.mode,
          provider: 'google',
          reason: failure.failureCode,
          stage: 'link_identity',
        });

        return {
          ...failure,
          message: formatSupabaseAuthErrorMessage(error.message, 'google'),
          userId: null,
        };
      }
    } else {
      const { error } = await input.client.auth.signInWithIdToken({
        provider: 'google',
        token: credential.idToken,
        access_token: credential.accessToken,
      });

      if (error) {
        const failure = classifySupabaseGoogleFailure(error.message);
        input.reportFailure({
          error,
          message: error.message,
          mode: input.mode,
          provider: 'google',
          reason: failure.failureCode,
          stage: 'sign_in_with_id_token',
        });

        return {
          ...failure,
          message: formatSupabaseAuthErrorMessage(error.message, 'google'),
          userId: null,
        };
      }
    }

    if (credential.displayName || credential.givenName || credential.familyName) {
      const { error: metadataError } = await input.client.auth.updateUser({
        data: {
          display_name: credential.displayName,
          full_name: credential.displayName,
          given_name: credential.givenName,
          family_name: credential.familyName,
          avatar_url: credential.photoUrl,
        },
      });

      if (metadataError) {
        input.reportFailure({
          error: metadataError,
          message: metadataError.message,
          mode: input.mode,
          provider: 'google',
          reason: 'metadata_update_error',
          stage: 'profile_metadata',
        });
        console.warn(
          'Failed to persist Google profile metadata',
          metadataError instanceof Error ? metadataError.message : String(metadataError),
        );
      }
    }

    const { data } = await input.client.auth.getSession();
    return {
      message: input.mode === 'link' ? 'Google vinculado.' : 'Sesión iniciada.',
      userId: data.session?.user.id ?? null,
    };
  } catch (error) {
    input.reportFailure({
      error,
      message: readErrorMessage(error),
      mode: input.mode,
      provider: 'google',
      reason: 'unexpected_exception',
      stage: 'unexpected',
    });

    return {
      failureCode: 'unexpected',
      message: formatValidationMessage(error),
      shouldFallbackToOAuth: true,
      userId: null,
    };
  }
}
