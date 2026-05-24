import * as AppleAuthentication from 'expo-apple-authentication';

import type { supabase } from '@/lib/supabase';
import { buildAppleFullName, generateSecureNonce, hashNonceForApple } from '../session/apple-auth';
import {
  formatSupabaseAuthErrorMessage,
  formatValidationMessage,
  readErrorMessage,
} from '../session/auth-errors';

type SupabaseClient = NonNullable<typeof supabase>;
type NativeAppleMode = 'link' | 'sign-in';
type NativeAppleStage =
  | 'link_identity'
  | 'native_credential'
  | 'profile_metadata'
  | 'sign_in_with_id_token'
  | 'unexpected';

export interface NativeAppleFailureReport {
  readonly provider: 'apple';
  readonly mode: NativeAppleMode;
  readonly stage: NativeAppleStage;
  readonly error?: unknown;
  readonly message?: string;
  readonly reason?: string;
}

export interface NativeAppleResult {
  readonly message: string;
  readonly userId: string | null;
}

export async function performNativeAppleAuth(input: {
  readonly client: SupabaseClient;
  readonly mode: NativeAppleMode;
  readonly reportFailure: (failure: NativeAppleFailureReport) => void;
}): Promise<NativeAppleResult> {
  const available = await AppleAuthentication.isAvailableAsync().catch(() => false);
  if (!available) {
    return {
      message: 'Apple no está disponible en este dispositivo.',
      userId: null,
    };
  }

  try {
    const nonce = generateSecureNonce();
    const appleNonce = await hashNonceForApple(nonce);
    const credential = await AppleAuthentication.signInAsync({
      nonce: appleNonce,
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    if (!credential.identityToken) {
      input.reportFailure({
        message: 'Apple did not return an identity token.',
        mode: input.mode,
        provider: 'apple',
        reason: 'missing_identity_token',
        stage: 'native_credential',
      });

      return {
        message: 'Apple no devolvió la credencial necesaria.',
        userId: null,
      };
    }

    if (input.mode === 'link') {
      const authApi = input.client.auth as unknown as {
        readonly linkIdentity?: (linkInput: {
          readonly provider: 'apple';
          readonly token: string;
          readonly nonce: string;
        }) => Promise<{ error?: { message: string } | null }>;
      };

      if (typeof authApi.linkIdentity !== 'function') {
        input.reportFailure({
          message: 'No pudimos vincular Apple en esta version de la app.',
          mode: input.mode,
          provider: 'apple',
          reason: 'link_identity_unavailable',
          stage: 'link_identity',
        });

        return {
          message: 'No pudimos vincular Apple en esta versión de la app.',
          userId: null,
        };
      }

      const { error } = await authApi.linkIdentity({
        provider: 'apple',
        token: credential.identityToken,
        nonce,
      });

      if (error) {
        input.reportFailure({
          error,
          message: error.message,
          mode: input.mode,
          provider: 'apple',
          reason: 'supabase_error',
          stage: 'link_identity',
        });

        return {
          message: formatSupabaseAuthErrorMessage(error.message, 'apple'),
          userId: null,
        };
      }
    } else {
      const { error } = await input.client.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
        nonce,
      });

      if (error) {
        input.reportFailure({
          error,
          message: error.message,
          mode: input.mode,
          provider: 'apple',
          reason: 'supabase_error',
          stage: 'sign_in_with_id_token',
        });

        return {
          message: formatSupabaseAuthErrorMessage(error.message, 'apple'),
          userId: null,
        };
      }
    }

    const fullName = buildAppleFullName(credential.fullName);
    if (fullName) {
      const { error: metadataError } = await input.client.auth.updateUser({
        data: {
          display_name: fullName,
          full_name: fullName,
          given_name: credential.fullName?.givenName?.trim() ?? null,
          family_name: credential.fullName?.familyName?.trim() ?? null,
        },
      });

      if (metadataError) {
        input.reportFailure({
          error: metadataError,
          message: metadataError.message,
          mode: input.mode,
          provider: 'apple',
          reason: 'metadata_update_error',
          stage: 'profile_metadata',
        });
        console.warn(
          'Failed to persist Apple full name metadata',
          metadataError instanceof Error ? metadataError.message : String(metadataError),
        );
      }
    }

    const { data } = await input.client.auth.getSession();
    return {
      message: input.mode === 'link' ? 'Apple vinculado.' : 'Sesión iniciada.',
      userId: data.session?.user.id ?? null,
    };
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { readonly code?: string }).code === 'ERR_REQUEST_CANCELED'
    ) {
      return {
        message:
          input.mode === 'link'
            ? 'Vinculación con Apple cancelada.'
            : 'Inicio con Apple cancelado.',
        userId: null,
      };
    }

    input.reportFailure({
      error,
      message: readErrorMessage(error),
      mode: input.mode,
      provider: 'apple',
      reason: 'unexpected_exception',
      stage: 'unexpected',
    });

    return {
      message: formatValidationMessage(error),
      userId: null,
    };
  }
}
