import {
  analyticsMetadataSchema,
  recordProductEventSchema,
  startAppSessionSchema,
  type AnalyticsEventName,
  type AnalyticsScreenName,
} from '@happy-circles/shared';

import { appConfig } from './config';
import { supabase } from './supabase';

type AnalyticsMetadata = Partial<Record<string, string | number | boolean | null>>;

interface StartAnalyticsSessionInput {
  readonly clientSessionId: string;
  readonly platform: string;
  readonly appVersion: string | null;
  readonly deviceId: string | null;
  readonly startedAt: string;
}

interface RecordProductEventInput {
  readonly eventName: AnalyticsEventName;
  readonly screenName?: AnalyticsScreenName | null;
  readonly metadata?: AnalyticsMetadata;
}

let activeAnalyticsSessionId: string | null = null;

function createRandomId(prefix: string): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `${prefix}:${globalThis.crypto.randomUUID()}`;
  }

  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2, 14)}`;
}

async function wait(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function getCurrentAccessToken(): Promise<string | null> {
  if (!supabase) {
    return null;
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token ?? null;

    if (accessToken) {
      return accessToken;
    }

    if (attempt < 2) {
      await wait(250 * (attempt + 1));
    }
  }

  return null;
}

async function invokeAnalyticsFunction<TResult>(
  functionName: 'record-product-event' | 'start-app-session',
  payload: Record<string, unknown>,
): Promise<TResult> {
  const accessToken = await getCurrentAccessToken();
  if (!accessToken) {
    throw new Error('No active Supabase auth session for product analytics.');
  }

  const response = await fetch(
    `${appConfig.supabaseUrl.replace(/\/+$/, '')}/functions/v1/${functionName}`,
    {
      body: JSON.stringify(payload),
      headers: {
        Accept: 'application/json',
        apikey: appConfig.supabaseAnonKey,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'x-client-info': 'happy-circles-mobile',
      },
      method: 'POST',
    },
  );

  const responseText = await response.text();
  const responseBody = responseText ? (JSON.parse(responseText) as unknown) : null;

  if (!response.ok) {
    const message =
      responseBody && typeof responseBody === 'object' && 'error' in responseBody
        ? String(responseBody.error)
        : `Product analytics function ${functionName} failed with HTTP ${response.status}.`;

    throw new Error(message);
  }

  return responseBody as TResult;
}

export function createAnalyticsClientSessionId(): string {
  return createRandomId('mobile-session');
}

export function resetProductAnalyticsSession() {
  activeAnalyticsSessionId = null;
}

export async function startProductAnalyticsSession(
  input: StartAnalyticsSessionInput,
): Promise<string | null> {
  if (!supabase) {
    return null;
  }

  const payload = startAppSessionSchema.parse(input);
  const result = await invokeAnalyticsFunction<{ readonly sessionId: string }>(
    'start-app-session',
    payload,
  );

  const sessionId = result.sessionId ?? null;
  activeAnalyticsSessionId = sessionId;
  return sessionId;
}

export async function recordProductEvent(input: RecordProductEventInput): Promise<void> {
  if (!supabase || !activeAnalyticsSessionId) {
    return;
  }

  const payload = recordProductEventSchema.parse({
    clientEventId: createRandomId(input.eventName),
    sessionId: activeAnalyticsSessionId,
    eventName: input.eventName,
    occurredAt: new Date().toISOString(),
    screenName: input.screenName ?? null,
    metadata: analyticsMetadataSchema.parse(input.metadata ?? {}),
  });

  await invokeAnalyticsFunction('record-product-event', payload);
}

export function recordProductEventSafe(input: RecordProductEventInput): void {
  void recordProductEvent(input).catch(() => undefined);
}
