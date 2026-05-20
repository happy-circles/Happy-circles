import type { supabase } from '@/lib/supabase';
import {
  formatSupabaseAuthErrorMessage,
  formatValidationMessage,
  readErrorMessage,
} from '../session/auth-errors';
import { getNativeGoogleCredential } from './google-auth';

type SupabaseClient = NonNullable<typeof supabase>;
type NativeGoogleMode = 'link' | 'sign-in';
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
  readonly message: string;
  readonly userId: string | null;
}

function isNativeAuthCancellationMessage(message: string): boolean {
  return message.toLocaleLowerCase('en-US').includes('cancelad');
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

      if (!isNativeAuthCancellationMessage(message)) {
        input.reportFailure({
          message,
          mode: input.mode,
          provider: 'google',
          reason: 'credential_result',
          stage: 'native_credential',
        });
      }

      return {
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
        input.reportFailure({
          error,
          message: error.message,
          mode: input.mode,
          provider: 'google',
          reason: 'supabase_error',
          stage: 'link_identity',
        });

        return {
          message: formatSupabaseAuthErrorMessage(error.message),
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
        input.reportFailure({
          error,
          message: error.message,
          mode: input.mode,
          provider: 'google',
          reason: 'supabase_error',
          stage: 'sign_in_with_id_token',
        });

        return {
          message: formatSupabaseAuthErrorMessage(error.message),
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
      message: formatValidationMessage(error),
      userId: null,
    };
  }
}
