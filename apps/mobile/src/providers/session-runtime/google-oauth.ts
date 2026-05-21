import type { Session } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';

import { buildSocialOAuthRedirect } from '@/lib/auth-redirects';
import type { supabase } from '@/lib/supabase';
import {
  formatSupabaseAuthErrorMessage,
  formatValidationMessage,
  readErrorMessage,
} from '../session/auth-errors';
import { normalizeIdentityProvider } from '../session/linked-methods';
import type { AuthIdentity } from '../session/types';

type SupabaseClient = NonNullable<typeof supabase>;
type GoogleOAuthMode = 'link' | 'sign-in';
type GoogleOAuthStage = 'browser_open' | 'oauth_callback' | 'oauth_start' | 'unexpected';
type GoogleOAuthEventResult = 'cancelled' | 'started' | 'succeeded';

export interface GoogleOAuthFailureReport {
  readonly provider: 'google';
  readonly mode: GoogleOAuthMode;
  readonly stage: GoogleOAuthStage;
  readonly error?: unknown;
  readonly message?: string;
  readonly reason?: string;
}

export interface GoogleOAuthEventReport {
  readonly provider: 'google';
  readonly mode: GoogleOAuthMode;
  readonly stage: GoogleOAuthStage;
  readonly result: GoogleOAuthEventResult;
  readonly message?: string;
  readonly reason?: string;
}

export interface GoogleOAuthResult {
  readonly message: string;
  readonly userId: string | null;
}

void WebBrowser.maybeCompleteAuthSession();

async function dismissStaleAuthBrowser(): Promise<void> {
  try {
    await WebBrowser.dismissBrowser();
  } catch {
    // No-op: there may be no browser session to dismiss on this platform.
  }
}

function buildGoogleOAuthRedirect(mode: GoogleOAuthMode): string {
  const callbackMode = mode === 'link' ? 'google-link' : 'google';
  return buildSocialOAuthRedirect(`/setup-account?auth_callback=${callbackMode}`);
}

function hasGoogleIdentity(currentSession: Session | null): boolean {
  const identities =
    (currentSession?.user as { readonly identities?: readonly AuthIdentity[] | null } | undefined)
      ?.identities ?? [];
  return identities.some((identity) => normalizeIdentityProvider(identity.provider) === 'google');
}

async function resolveUserIdentities(
  client: SupabaseClient,
  currentSession: Session,
): Promise<readonly AuthIdentity[]> {
  const authApi = client.auth as unknown as {
    readonly getUserIdentities?: () => Promise<{
      data?: { identities?: readonly AuthIdentity[] | null };
    }>;
  };

  if (typeof authApi.getUserIdentities === 'function') {
    try {
      const result = await authApi.getUserIdentities();
      return result.data?.identities ?? [];
    } catch {
      return [];
    }
  }

  const user = currentSession.user as { readonly identities?: readonly AuthIdentity[] | null };
  return user.identities ?? [];
}

export async function performSupabaseGoogleOAuth(input: {
  readonly applySessionFromUrl: (url: string | null) => Promise<boolean>;
  readonly client: SupabaseClient;
  readonly mode: GoogleOAuthMode;
  readonly reportEvent?: (event: GoogleOAuthEventReport) => void;
  readonly reportFailure: (failure: GoogleOAuthFailureReport) => void;
}): Promise<GoogleOAuthResult> {
  try {
    const redirectTo = buildGoogleOAuthRedirect(input.mode);
    const { data, error } =
      input.mode === 'link'
        ? await input.client.auth.linkIdentity({
            provider: 'google',
            options: {
              redirectTo,
              skipBrowserRedirect: true,
            },
          })
        : await input.client.auth.signInWithOAuth({
            provider: 'google',
            options: {
              redirectTo,
              skipBrowserRedirect: true,
            },
          });

    if (error || !data?.url) {
      const message = error?.message ?? 'Google no devolvio una URL de autorizacion.';
      input.reportFailure({
        error,
        message,
        mode: input.mode,
        provider: 'google',
        reason: error ? 'supabase_error' : 'missing_oauth_url',
        stage: 'oauth_start',
      });

      return {
        message: formatSupabaseAuthErrorMessage(message),
        userId: null,
      };
    }

    input.reportEvent?.({
      message: 'Google OAuth URL created.',
      mode: input.mode,
      provider: 'google',
      reason: 'oauth_url_created',
      result: 'succeeded',
      stage: 'oauth_start',
    });

    await dismissStaleAuthBrowser();
    input.reportEvent?.({
      message: 'Opening Google auth session.',
      mode: input.mode,
      provider: 'google',
      reason: 'browser_open_attempt',
      result: 'started',
      stage: 'browser_open',
    });

    let result: Awaited<ReturnType<typeof WebBrowser.openAuthSessionAsync>>;
    try {
      result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    } catch (error) {
      input.reportFailure({
        error,
        message: readErrorMessage(error),
        mode: input.mode,
        provider: 'google',
        reason: 'browser_open_failed',
        stage: 'browser_open',
      });

      return {
        message: formatValidationMessage(error),
        userId: null,
      };
    }

    if (result.type !== 'success') {
      input.reportEvent?.({
        message: `Google auth session returned ${result.type}.`,
        mode: input.mode,
        provider: 'google',
        reason: result.type,
        result: 'cancelled',
        stage: 'browser_open',
      });

      return {
        message:
          input.mode === 'link'
            ? 'Vinculacion con Google cancelada.'
            : 'Inicio con Google cancelado.',
        userId: null,
      };
    }

    input.reportEvent?.({
      message: 'Google OAuth callback received.',
      mode: input.mode,
      provider: 'google',
      reason: 'callback_received',
      result: 'started',
      stage: 'oauth_callback',
    });

    const callbackApplied = await input.applySessionFromUrl(result.url);
    const { data: sessionData } = await input.client.auth.getSession();
    if (input.mode === 'link') {
      const identities = sessionData.session
        ? await resolveUserIdentities(input.client, sessionData.session)
        : [];
      const googleLinked =
        hasGoogleIdentity(sessionData.session) ||
        identities.some((identity) => normalizeIdentityProvider(identity.provider) === 'google');

      if (googleLinked) {
        input.reportEvent?.({
          message: 'Google linked.',
          mode: input.mode,
          provider: 'google',
          reason: 'google_linked',
          result: 'succeeded',
          stage: 'oauth_callback',
        });

        return {
          message: 'Google vinculado.',
          userId: sessionData.session?.user.id ?? null,
        };
      }
    } else if (sessionData.session) {
      input.reportEvent?.({
        message: 'Google sign in completed.',
        mode: input.mode,
        provider: 'google',
        reason: 'session_created',
        result: 'succeeded',
        stage: 'oauth_callback',
      });

      return {
        message: 'Sesión iniciada.',
        userId: sessionData.session.user.id,
      };
    }

    input.reportFailure({
      message: 'No pudimos completar el callback de Google.',
      mode: input.mode,
      provider: 'google',
      reason: callbackApplied ? 'missing_verified_session' : 'callback_not_applied',
      stage: 'oauth_callback',
    });

    return {
      message: 'No pudimos completar Google. Intentalo de nuevo.',
      userId: null,
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
