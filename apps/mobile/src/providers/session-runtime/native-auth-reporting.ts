import { reportClientErrorSafe } from '@/lib/support-errors';
import { readErrorMessage } from '../session/auth-errors';

type NativeAuthProvider = 'apple' | 'google';
type NativeAuthMode = 'link' | 'sign-in';
type NativeAuthStage =
  | 'browser_open'
  | 'link_identity'
  | 'native_credential'
  | 'oauth_callback'
  | 'oauth_start'
  | 'profile_metadata'
  | 'sign_in_with_id_token'
  | 'unexpected';
type NativeAuthEventResult = 'cancelled' | 'started' | 'succeeded';

export function reportNativeAuthFailure(input: {
  readonly provider: NativeAuthProvider;
  readonly mode: NativeAuthMode;
  readonly stage: NativeAuthStage;
  readonly error?: unknown;
  readonly message?: string;
  readonly reason?: string;
}): void {
  const operation = `${input.provider}_${input.mode.replace('-', '_')}_${input.stage}`;
  reportClientErrorSafe({
    error: input.error,
    errorCode: operation,
    errorMessage: input.message ?? readErrorMessage(input.error),
    fatal: false,
    kind: 'client_action',
    metadata: {
      action: input.provider,
      operation,
      reason: input.reason ?? null,
      result: 'failed',
      source: 'native_auth',
    },
  });
}

export function reportNativeAuthEvent(input: {
  readonly provider: NativeAuthProvider;
  readonly mode: NativeAuthMode;
  readonly stage: NativeAuthStage;
  readonly result: NativeAuthEventResult;
  readonly message?: string;
  readonly reason?: string;
}): void {
  const operation = `${input.provider}_${input.mode.replace('-', '_')}_${input.stage}`;
  reportClientErrorSafe({
    errorCode: operation,
    errorMessage: input.message ?? operation,
    fatal: false,
    kind: 'client_action',
    metadata: {
      action: input.provider,
      operation,
      reason: input.reason ?? null,
      result: input.result,
      source: 'native_auth',
    },
  });
}

export function shouldFallbackToSupabaseGoogleOAuth(message: string): boolean {
  const normalized = message.trim().toLocaleLowerCase('en-US');

  if (normalized.includes('cancelad') || normalized.includes('en curso')) {
    return false;
  }

  return (
    normalized.includes('google nativo') ||
    normalized.includes('expo_public_google_web_client_id') ||
    normalized.includes('no se pudo iniciar google') ||
    normalized.includes('credenciales') ||
    normalized.includes('play services')
  );
}
