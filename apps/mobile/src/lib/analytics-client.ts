import {
  analyticsMetadataSchema,
  ingestProductAnalyticsSchema,
  productAnalyticsEventSchema,
  startAppSessionSchema,
  type AnalyticsEventName,
  type AnalyticsScreenName,
} from '@happy-circles/shared';

import { appConfig } from './config';
import { getStoredItem, setStoredItem } from './storage';
import { supabase } from './supabase';

type AnalyticsMetadata = Partial<Record<string, string | number | boolean | null>>;
type ProductAnalyticsEventPayload = ReturnType<typeof productAnalyticsEventSchema.parse>;
type StartAnalyticsSessionPayload = ReturnType<typeof startAppSessionSchema.parse>;

const ANALYTICS_QUEUE_STORAGE_KEY = 'happy-circles.analytics.queue.v1';
const ANALYTICS_QUEUE_MAX_EVENTS = 100;
const ANALYTICS_QUEUE_BATCH_SIZE = 20;
const ANALYTICS_QUEUE_TTL_MS = 72 * 60 * 60 * 1000;

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
let activeAnalyticsClientSession: StartAnalyticsSessionPayload | null = null;
let flushInFlight: Promise<void> | null = null;

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
  functionName: 'analytics-ingest' | 'record-product-event' | 'start-app-session',
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
  activeAnalyticsClientSession = null;
}

function trimQueue(events: readonly ProductAnalyticsEventPayload[]): ProductAnalyticsEventPayload[] {
  const cutoff = Date.now() - ANALYTICS_QUEUE_TTL_MS;

  return events
    .filter((event) => {
      const occurredAt = Date.parse(event.occurredAt);
      return Number.isFinite(occurredAt) && occurredAt >= cutoff;
    })
    .slice(-ANALYTICS_QUEUE_MAX_EVENTS);
}

async function readAnalyticsQueue(): Promise<ProductAnalyticsEventPayload[]> {
  const stored = await getStoredItem(ANALYTICS_QUEUE_STORAGE_KEY);
  if (!stored) {
    return [];
  }

  try {
    const parsed = JSON.parse(stored) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return trimQueue(
      parsed.flatMap((event) => {
        const result = productAnalyticsEventSchema.safeParse(event);
        return result.success ? [result.data] : [];
      }),
    );
  } catch {
    return [];
  }
}

async function writeAnalyticsQueue(events: readonly ProductAnalyticsEventPayload[]): Promise<void> {
  await setStoredItem(ANALYTICS_QUEUE_STORAGE_KEY, JSON.stringify(trimQueue(events)));
}

async function enqueueAnalyticsEvent(event: ProductAnalyticsEventPayload): Promise<void> {
  const queue = await readAnalyticsQueue();
  const withoutDuplicate = queue.filter((queued) => queued.clientEventId !== event.clientEventId);
  await writeAnalyticsQueue([...withoutDuplicate, event]);
}

async function invokeAnalyticsIngest(
  clientSession: StartAnalyticsSessionPayload,
  events: readonly ProductAnalyticsEventPayload[],
): Promise<{ readonly acceptedEventCount: number; readonly sessionId: string }> {
  const payload = ingestProductAnalyticsSchema.parse({
    clientSession,
    events,
  });

  return invokeAnalyticsFunction('analytics-ingest', payload);
}

export function flushProductAnalyticsEvents(): Promise<void> {
  if (!supabase || !activeAnalyticsClientSession) {
    return Promise.resolve();
  }

  if (flushInFlight) {
    return flushInFlight;
  }

  flushInFlight = (async () => {
    while (activeAnalyticsClientSession) {
      const queue = await readAnalyticsQueue();
      if (queue.length === 0) {
        await writeAnalyticsQueue([]);
        return;
      }

      const batch = queue.slice(0, ANALYTICS_QUEUE_BATCH_SIZE);
      await invokeAnalyticsIngest(activeAnalyticsClientSession, batch);

      const sentIds = new Set(batch.map((event) => event.clientEventId));
      const latestQueue = await readAnalyticsQueue();
      await writeAnalyticsQueue(latestQueue.filter((event) => !sentIds.has(event.clientEventId)));
    }
  })().finally(() => {
    flushInFlight = null;
  });

  return flushInFlight;
}

export async function startProductAnalyticsSession(
  input: StartAnalyticsSessionInput,
): Promise<string | null> {
  if (!supabase) {
    return null;
  }

  const payload = startAppSessionSchema.parse(input);
  const result = await invokeAnalyticsIngest(payload, []);

  const sessionId = result.sessionId ?? null;
  activeAnalyticsSessionId = sessionId;
  activeAnalyticsClientSession = payload;
  void flushProductAnalyticsEvents().catch(() => undefined);
  return sessionId;
}

export async function recordProductEvent(input: RecordProductEventInput): Promise<void> {
  if (!supabase) {
    return;
  }

  const payload = productAnalyticsEventSchema.parse({
    clientEventId: createRandomId(input.eventName),
    eventName: input.eventName,
    occurredAt: new Date().toISOString(),
    screenName: input.screenName ?? null,
    metadata: analyticsMetadataSchema.parse(input.metadata ?? {}),
  });

  await enqueueAnalyticsEvent(payload);

  if (activeAnalyticsSessionId) {
    void flushProductAnalyticsEvents().catch(() => undefined);
  }
}

export function recordProductEventSafe(input: RecordProductEventInput): void {
  void recordProductEvent(input).catch(() => undefined);
}
