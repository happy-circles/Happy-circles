import { performNativeGoogleAuth } from './google-native-auth';
import { performSupabaseGoogleOAuth } from './google-oauth';
import { traceAuthDebugEvent } from './auth-debug';
import {
  reportSocialAuthEvent,
  reportSocialAuthFailure,
  shouldFallbackToSupabaseGoogleOAuth,
} from './social-auth-reporting';

type GoogleAuthMode = 'link' | 'sign-in';
type GoogleAuthPlatform = string;
type NativeGoogleAuth = typeof performNativeGoogleAuth;
type SupabaseGoogleOAuth = typeof performSupabaseGoogleOAuth;
type SupabaseGoogleClient = Parameters<NativeGoogleAuth>[0]['client'];
type ApplySessionFromUrl = Parameters<SupabaseGoogleOAuth>[0]['applySessionFromUrl'];

export interface GoogleAuthFlowInput {
  readonly applySessionFromUrl: ApplySessionFromUrl;
  readonly client: SupabaseGoogleClient;
  readonly mode: GoogleAuthMode;
  readonly platform: GoogleAuthPlatform;
}

export async function performGoogleAuthFlow(input: GoogleAuthFlowInput): Promise<{
  readonly message: string;
  readonly userId: string | null;
}> {
  traceAuthDebugEvent({
    metadata: { platform: input.platform },
    mode: input.mode,
    provider: 'google',
    result: 'started',
    source: input.platform === 'web' ? 'oauth_auth' : 'native_auth',
    stage: 'flow_start',
  });

  const runSupabaseGoogleOAuth = () =>
    performSupabaseGoogleOAuth({
      applySessionFromUrl: input.applySessionFromUrl,
      client: input.client,
      mode: input.mode,
      reportEvent: (event) =>
        reportSocialAuthEvent({
          ...event,
          mode: input.mode,
          source: 'oauth_auth',
        }),
      reportFailure: (failure) =>
        reportSocialAuthFailure({
          ...failure,
          mode: input.mode,
          source: 'oauth_auth',
        }),
    });

  if (input.platform === 'web') {
    return runSupabaseGoogleOAuth();
  }

  const nativeResult = await performNativeGoogleAuth({
    client: input.client,
    mode: input.mode,
    reportFailure: (failure) =>
      reportSocialAuthFailure({
        ...failure,
        mode: input.mode,
      }),
  });

  if (nativeResult.userId || !shouldFallbackToSupabaseGoogleOAuth(nativeResult.message)) {
    traceAuthDebugEvent({
      message: nativeResult.message,
      mode: input.mode,
      provider: 'google',
      result: nativeResult.userId ? 'succeeded' : 'blocked',
      source: 'native_auth',
      stage: nativeResult.userId ? 'native_session_created' : 'native_result_returned',
    });
    return nativeResult;
  }

  reportSocialAuthEvent({
    message: 'Falling back to Supabase Google OAuth.',
    mode: input.mode,
    provider: 'google',
    reason: 'native_google_unavailable',
    result: 'started',
    source: 'oauth_auth',
    stage: 'oauth_start',
  });

  return runSupabaseGoogleOAuth();
}
