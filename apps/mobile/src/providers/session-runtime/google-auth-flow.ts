import { performSupabaseGoogleOAuth } from './google-oauth';
import { performNativeGoogleAuth } from './google-native-auth';
import { traceAuthDebugEvent } from './auth-debug';
import { reportSocialAuthEvent, reportSocialAuthFailure } from './social-auth-reporting';

type GoogleAuthMode = 'link' | 'sign-in';
type GoogleAuthPlatform = string;
type SupabaseGoogleOAuth = typeof performSupabaseGoogleOAuth;
type SupabaseGoogleClient = Parameters<SupabaseGoogleOAuth>[0]['client'];
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
  const useNativeGoogleAuth = input.platform !== 'web';

  traceAuthDebugEvent({
    metadata: { platform: input.platform },
    mode: input.mode,
    provider: 'google',
    result: 'started',
    source: useNativeGoogleAuth ? 'native_auth' : 'oauth_auth',
    stage: 'flow_start',
  });

  if (useNativeGoogleAuth) {
    const nativeResult = await performNativeGoogleAuth({
      client: input.client,
      mode: input.mode,
      reportFailure: (failure) =>
        reportSocialAuthFailure({
          ...failure,
          mode: input.mode,
          source: 'native_auth',
        }),
    });

    if (!nativeResult.failureCode && nativeResult.userId) {
      reportSocialAuthEvent({
        message:
          input.mode === 'link'
            ? 'Google linked with native auth.'
            : 'Google sign in completed with native auth.',
        mode: input.mode,
        provider: 'google',
        reason: input.mode === 'link' ? 'google_linked' : 'session_created',
        result: 'succeeded',
        source: 'native_auth',
        stage: input.mode === 'link' ? 'link_identity' : 'sign_in_with_id_token',
      });
      return nativeResult;
    }

    return nativeResult;
  }

  return performSupabaseGoogleOAuth({
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
}
