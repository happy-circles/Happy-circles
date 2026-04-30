import {
  analyticsMetadataSchema,
  recordProductEventSchema,
  startAppSessionSchema,
  type AnalyticsEventName,
  type AnalyticsScreenName,
} from '@happy-circles/shared';

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

async function parseFunctionError(error: unknown): Promise<string> {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
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
  const result = await supabase.functions.invoke<{ readonly sessionId: string }>(
    'start-app-session',
    {
      body: payload,
    },
  );

  if (result.error) {
    throw new Error(await parseFunctionError(result.error));
  }

  const sessionId = result.data?.sessionId ?? null;
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

  const result = await supabase.functions.invoke('record-product-event', {
    body: payload,
  });

  if (result.error) {
    throw new Error(await parseFunctionError(result.error));
  }
}

export function recordProductEventSafe(input: RecordProductEventInput): void {
  void recordProductEvent(input).catch((error) => {
    console.warn(
      'Failed to record product analytics event',
      error instanceof Error ? error.message : String(error),
    );
  });
}
