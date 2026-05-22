import { reportClientErrorSafe } from '@/lib/support-errors';
import { readErrorMessage } from '../session/auth-errors';
import { traceAuthDebugEvent } from './auth-debug';

type SocialAuthProvider = 'apple' | 'google';
type SocialAuthMode = 'link' | 'sign-in';
type SocialAuthStage =
  | 'browser_open'
  | 'link_identity'
  | 'native_credential'
  | 'oauth_callback'
  | 'oauth_start'
  | 'profile_metadata'
  | 'sign_in_with_id_token'
  | 'unexpected';
type SocialAuthEventResult = 'cancelled' | 'started' | 'succeeded';
type AuthFlowSource = 'native_auth' | 'oauth_auth';

export function reportSocialAuthFailure(input: {
  readonly provider: SocialAuthProvider;
  readonly mode: SocialAuthMode;
  readonly stage: SocialAuthStage;
  readonly error?: unknown;
  readonly message?: string;
  readonly reason?: string;
  readonly source?: AuthFlowSource;
}): void {
  const operation = `${input.provider}_${input.mode.replace('-', '_')}_${input.stage}`;
  traceAuthDebugEvent({
    message: input.message ?? readErrorMessage(input.error),
    mode: input.mode,
    provider: input.provider,
    reason: input.reason ?? null,
    result: 'failed',
    source: input.source ?? 'native_auth',
    stage: input.stage,
  });
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
      source: input.source ?? 'native_auth',
    },
  });
}

export function reportSocialAuthEvent(input: {
  readonly provider: SocialAuthProvider;
  readonly mode: SocialAuthMode;
  readonly stage: SocialAuthStage;
  readonly result: SocialAuthEventResult;
  readonly message?: string;
  readonly reason?: string;
  readonly source?: AuthFlowSource;
}): void {
  const operation = `${input.provider}_${input.mode.replace('-', '_')}_${input.stage}`;
  traceAuthDebugEvent({
    message: input.message ?? null,
    mode: input.mode,
    provider: input.provider,
    reason: input.reason ?? null,
    result: input.result,
    source: input.source ?? 'native_auth',
    stage: input.stage,
  });
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
      source: input.source ?? 'native_auth',
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
