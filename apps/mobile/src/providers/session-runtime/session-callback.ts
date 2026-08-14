import type { Session } from '@supabase/supabase-js';

import { appConfig } from '@/lib/config';
import { reportClientErrorSafe } from '@/lib/support-errors';
import {
  extractAuthCallbackCode,
  extractAuthCallbackTokens,
  isAppAuthCallbackUrl,
  isPasswordRecoveryCallbackUrl,
} from '../session/auth-callbacks';
import { traceAuthDebugEvent } from './auth-debug';
import { SESSION_AUTH_OPERATION_TIMEOUT_MS, withSessionOperationTimeout } from './session-operation';

interface AuthCallbackClient {
  readonly auth: {
    exchangeCodeForSession(code: string): Promise<{
      data: { session: Session | null };
      error: { message: string } | null;
    }>;
    setSession(tokens: { access_token: string; refresh_token: string }): Promise<{
      data: { session: Session | null };
      error: { message: string } | null;
    }>;
  };
}

function reportCallbackFailure(operation: 'exchange_code_for_session' | 'set_session_from_callback', error: { message: string }) {
  reportClientErrorSafe({
    error,
    errorCode: `auth_callback_${operation}`,
    errorMessage: error.message,
    fatal: false,
    kind: 'client_action',
    metadata: { operation, reason: 'supabase_error', result: 'failed', source: 'auth_callback' },
  });
}

export async function applyAuthSessionFromUrl(input: {
  readonly client: AuthCallbackClient | null;
  readonly onPasswordRecoverySession: (session: Session) => void;
  readonly url: string | null;
}): Promise<boolean> {
  if (!input.client || !input.url) {
    return false;
  }
  if (!isAppAuthCallbackUrl(input.url, appConfig.appWebOrigin)) {
    return false;
  }

  const passwordRecovery = isPasswordRecoveryCallbackUrl(input.url);
  const authCode = extractAuthCallbackCode(input.url);
  const tokens = extractAuthCallbackTokens(input.url);
  if (!authCode && !tokens) {
    return false;
  }

  const mode = passwordRecovery ? 'password-recovery' : 'sign-in';
  const stage = authCode ? 'exchange_code_for_session' : 'set_session_from_tokens';
  traceAuthDebugEvent({ mode, provider: 'supabase', result: 'started', source: 'session_callback', stage });

  const result = authCode
    ? await withSessionOperationTimeout(
        stage,
        input.client.auth.exchangeCodeForSession(authCode),
        SESSION_AUTH_OPERATION_TIMEOUT_MS,
      )
    : await withSessionOperationTimeout(
        stage,
        input.client.auth.setSession({
          access_token: tokens!.accessToken,
          refresh_token: tokens!.refreshToken,
        }),
        SESSION_AUTH_OPERATION_TIMEOUT_MS,
      );

  if (result.error) {
    traceAuthDebugEvent({
      message: result.error.message,
      mode,
      provider: 'supabase',
      reason: 'supabase_error',
      result: 'failed',
      source: 'session_callback',
      stage,
    });
    reportCallbackFailure(authCode ? 'exchange_code_for_session' : 'set_session_from_callback', result.error);
    return false;
  }

  if (passwordRecovery && result.data.session) {
    input.onPasswordRecoverySession(result.data.session);
  }
  traceAuthDebugEvent({
    metadata: { hasSession: Boolean(result.data.session), passwordRecovery },
    mode,
    provider: 'supabase',
    result: 'succeeded',
    source: 'session_callback',
    stage,
  });
  return true;
}
