import { Platform } from 'react-native';

import { appConfig } from '@/lib/config';

type AuthDebugSource = 'native_auth' | 'oauth_auth' | 'session_callback';
type AuthDebugResult = 'blocked' | 'cancelled' | 'failed' | 'skipped' | 'started' | 'succeeded';
type AuthDebugMetadata = Readonly<Record<string, string | number | boolean | null | undefined>>;

export interface AuthDebugEvent {
  readonly provider: 'apple' | 'google' | 'supabase';
  readonly mode?: 'link' | 'password-recovery' | 'sign-in';
  readonly source: AuthDebugSource;
  readonly stage: string;
  readonly result: AuthDebugResult;
  readonly message?: string | null;
  readonly metadata?: AuthDebugMetadata;
  readonly reason?: string | null;
}

const SECRET_KEY_PATTERN = /(access|auth|code|credential|email|id[_-]?token|password|refresh|secret|token|url)/i;
const SECRET_VALUE_PATTERN =
  /(access_token|refresh_token|id_token|code|password|secret|apikey|api_key)=([^&#\s]+)/gi;

export function isAuthDebugEnabled(): boolean {
  const value = appConfig.authDebugEnabled.trim().toLocaleLowerCase('en-US');
  return value === '1' || value === 'true' || value === 'yes';
}

function redactDebugText(value: string): string {
  return value
    .replace(SECRET_VALUE_PATTERN, '$1=[redacted]')
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[redacted_jwt]')
    .slice(0, 180);
}

function sanitizeMetadata(metadata: AuthDebugMetadata | undefined): AuthDebugMetadata | undefined {
  if (!metadata) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => {
      if (value === undefined) {
        return [key, undefined];
      }

      if (SECRET_KEY_PATTERN.test(key)) {
        return [key, '[redacted]'];
      }

      return [key, typeof value === 'string' ? redactDebugText(value) : value];
    }),
  );
}

export function traceAuthDebugEvent(event: AuthDebugEvent): void {
  if (!isAuthDebugEnabled()) {
    return;
  }

  const details = {
    message: event.message ? redactDebugText(event.message) : undefined,
    metadata: sanitizeMetadata(event.metadata),
    mode: event.mode,
    platform: Platform.OS,
    provider: event.provider,
    reason: event.reason ?? undefined,
    result: event.result,
    source: event.source,
    stage: event.stage,
  };

  const normalizedDetails = Object.fromEntries(
    Object.entries(details).filter(([, value]) => value !== undefined),
  );
  const serializedDetails = JSON.stringify(normalizedDetails);

  if (event.result === 'failed' || event.result === 'blocked') {
    console.warn('[auth-debug]', serializedDetails);
    return;
  }

  console.info('[auth-debug]', serializedDetails);
}
