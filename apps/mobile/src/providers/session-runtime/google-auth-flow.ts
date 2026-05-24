import { performSupabaseGoogleOAuth } from './google-oauth';
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
  traceAuthDebugEvent({
    metadata: { platform: input.platform },
    mode: input.mode,
    provider: 'google',
    result: 'started',
    source: 'oauth_auth',
    stage: 'flow_start',
  });

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
