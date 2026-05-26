import { createServiceRoleClient, handlePublicRpc, jsonResponse } from '../_shared/http.ts';

const pushWorkerSecret =
  readEnvSecret('PUSH_NOTIFICATION_WORKER_SECRET') ??
  readEnvSecret('GRAPH_CYCLE_WORKER_SECRET') ??
  '';
const EXPO_PUSH_SEND_URL = 'https://exp.host/--/api/v2/push/send';

interface ClaimedPushEvent {
  readonly id: string;
  readonly recipient_user_id: string;
  readonly notification_key: string;
  readonly source_kind: string;
  readonly source_item_id: string;
  readonly title: string;
  readonly body: string;
  readonly href: string;
  readonly attempts: number;
  readonly max_attempts: number;
}

interface PushDeviceRow {
  readonly id: string;
  readonly expo_push_token: string;
}

function readEnvSecret(name: string): string | null {
  const value = Deno.env.get(name)?.trim();
  return value ? value : null;
}

function checkWorkerAccess(request: Request): Response | null {
  if (!pushWorkerSecret) {
    return jsonResponse(503, {
      error: 'Worker no configurado.',
      code: 'worker_not_configured',
    });
  }

  if (request.headers.get('x-worker-secret') !== pushWorkerSecret) {
    return jsonResponse(403, {
      error: 'Worker no autorizado.',
      code: 'forbidden',
    });
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Invalid ${field}`);
  }

  return value.trim();
}

function parseClaimedPushEvent(value: unknown): ClaimedPushEvent {
  if (!isRecord(value)) {
    throw new Error('Invalid push event');
  }

  const attempts = Number(value.attempts);
  const maxAttempts = Number(value.max_attempts);

  if (!Number.isInteger(attempts) || !Number.isInteger(maxAttempts)) {
    throw new Error('Invalid push event attempts');
  }

  return {
    attempts,
    body: requireString(value.body, 'event.body'),
    href: requireString(value.href, 'event.href'),
    id: requireString(value.id, 'event.id'),
    max_attempts: maxAttempts,
    notification_key: requireString(value.notification_key, 'event.notification_key'),
    recipient_user_id: requireString(value.recipient_user_id, 'event.recipient_user_id'),
    source_item_id: requireString(value.source_item_id, 'event.source_item_id'),
    source_kind: requireString(value.source_kind, 'event.source_kind'),
    title: requireString(value.title, 'event.title'),
  };
}

function parseDevices(value: unknown): PushDeviceRow[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }

    const id = typeof item.id === 'string' ? item.id : null;
    const expoPushToken =
      typeof item.expo_push_token === 'string' ? item.expo_push_token.trim() : null;

    return id && expoPushToken ? [{ id, expo_push_token: expoPushToken }] : [];
  });
}

async function updateEventStatus(
  client: ReturnType<typeof createServiceRoleClient>,
  event: ClaimedPushEvent,
  status: 'failed' | 'pending' | 'sent' | 'skipped',
  lastError?: string,
): Promise<void> {
  const timestamp = new Date().toISOString();
  const payload: Record<string, unknown> = {
    last_error: lastError ?? null,
    processing_started_at: null,
    status,
    worker_id: null,
  };

  if (status === 'sent') {
    payload.sent_at = timestamp;
  }

  if (status === 'skipped') {
    payload.skipped_at = timestamp;
  }

  const { error } = await client
    .from('push_notification_events')
    .update(payload)
    .eq('id', event.id);

  if (error) {
    throw error;
  }
}

async function disableDevices(
  client: ReturnType<typeof createServiceRoleClient>,
  devices: readonly PushDeviceRow[],
): Promise<void> {
  if (devices.length === 0) {
    return;
  }

  const { error } = await client
    .from('push_devices')
    .update({
      disabled_at: new Date().toISOString(),
      enabled: false,
    })
    .in(
      'id',
      devices.map((device) => device.id),
    );

  if (error) {
    throw error;
  }
}

function parseExpoTicketErrors(payload: unknown, devices: readonly PushDeviceRow[]) {
  const data = isRecord(payload) && Array.isArray(payload.data) ? payload.data : [];
  let okCount = 0;
  const invalidDevices: PushDeviceRow[] = [];
  const errors: string[] = [];

  data.forEach((ticket, index) => {
    const record = isRecord(ticket) ? ticket : {};
    if (record.status === 'ok') {
      okCount += 1;
      return;
    }

    const details = isRecord(record.details) ? record.details : {};
    const errorCode =
      typeof details.error === 'string'
        ? details.error
        : typeof record.message === 'string'
          ? record.message
          : 'unknown';
    errors.push(errorCode);

    if (details.error === 'DeviceNotRegistered') {
      const device = devices[index];
      if (device) {
        invalidDevices.push(device);
      }
    }
  });

  return { errors, invalidDevices, okCount };
}

Deno.serve((request) => {
  const accessResponse = checkWorkerAccess(request);
  if (accessResponse) {
    return accessResponse;
  }

  return handlePublicRpc(
    request,
    async (body) => {
      const client = createServiceRoleClient();
      const limit = Number(body.limit ?? 25);
      if (!Number.isInteger(limit) || limit <= 0 || limit > 100) {
        throw new Error('Invalid limit');
      }

      const workerId =
        typeof body.workerId === 'string' && body.workerId.trim().length > 0
          ? body.workerId.trim()
          : `push-worker-${crypto.randomUUID()}`;
      const { data, error } = await client.rpc('claim_push_notification_events', {
        p_limit: limit,
        p_worker_id: workerId,
      });

      if (error) {
        throw error;
      }

      const events = Array.isArray(data) ? data.map(parseClaimedPushEvent) : [];
      const results: unknown[] = [];

      for (const event of events) {
        try {
          const devicesResult = await client
            .from('push_devices')
            .select('id, expo_push_token')
            .eq('user_id', event.recipient_user_id)
            .eq('enabled', true);

          if (devicesResult.error) {
            throw devicesResult.error;
          }

          const devices = parseDevices(devicesResult.data);

          if (devices.length === 0) {
            await updateEventStatus(client, event, 'skipped', 'no_active_push_devices');
            results.push({ eventId: event.id, status: 'skipped' });
            continue;
          }

          const expoResponse = await fetch(EXPO_PUSH_SEND_URL, {
            method: 'POST',
            headers: {
              accept: 'application/json',
              'content-type': 'application/json',
            },
            body: JSON.stringify(
              devices.map((device) => ({
                badge: 1,
                body: event.body,
                channelId: 'happy-pending',
                data: {
                  href: event.href,
                  notificationKey: event.notification_key,
                  sourceItemId: event.source_item_id,
                  sourceKind: event.source_kind,
                },
                priority: 'high',
                sound: 'default',
                title: event.title,
                to: device.expo_push_token,
              })),
            ),
          });

          const expoPayload = await expoResponse.json().catch(() => ({}));
          if (!expoResponse.ok) {
            const nextStatus = event.attempts >= event.max_attempts ? 'failed' : 'pending';
            await updateEventStatus(client, event, nextStatus, `expo_http_${expoResponse.status}`);
            results.push({ eventId: event.id, status: nextStatus });
            continue;
          }

          const { errors, invalidDevices, okCount } = parseExpoTicketErrors(expoPayload, devices);
          await disableDevices(client, invalidDevices);

          if (okCount > 0) {
            await updateEventStatus(client, event, 'sent');
            results.push({ eventId: event.id, sentDevices: okCount, status: 'sent' });
            continue;
          }

          const onlyInvalidDevices =
            invalidDevices.length > 0 && invalidDevices.length === devices.length;
          if (onlyInvalidDevices) {
            await updateEventStatus(client, event, 'skipped', 'all_devices_not_registered');
            results.push({ eventId: event.id, status: 'skipped' });
            continue;
          }

          const nextStatus = event.attempts >= event.max_attempts ? 'failed' : 'pending';
          await updateEventStatus(
            client,
            event,
            nextStatus,
            errors.slice(0, 3).join(',') || 'expo_push_failed',
          );
          results.push({ eventId: event.id, status: nextStatus });
        } catch (error) {
          const nextStatus = event.attempts >= event.max_attempts ? 'failed' : 'pending';
          await updateEventStatus(
            client,
            event,
            nextStatus,
            error instanceof Error ? error.message : String(error),
          );
          results.push({ eventId: event.id, status: nextStatus });
        }
      }

      return {
        processedCount: results.length,
        results,
        status: 'processed',
      };
    },
    {
      maxBodyBytes: 16 * 1024,
      rateLimit: {
        actorRequired: false,
        limit: 60,
        scope: 'send-push-notifications',
        windowSeconds: 60,
      },
    },
  );
});
