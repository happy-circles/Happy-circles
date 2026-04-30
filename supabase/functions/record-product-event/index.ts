import { createServiceRoleClient, handleRpc, requireString } from '../_shared/http.ts';

function readOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

Deno.serve((request) =>
  handleRpc(request, async (body, actorUserId) => {
    const client = createServiceRoleClient();
    const occurredAt = readOptionalString(body.occurredAt) ?? new Date().toISOString();

    const { data, error } = await client.rpc('record_product_event', {
      p_actor_user_id: actorUserId,
      p_client_event_id: requireString(body.clientEventId, 'clientEventId'),
      p_session_id: requireString(body.sessionId, 'sessionId'),
      p_event_name: requireString(body.eventName, 'eventName'),
      p_occurred_at: occurredAt,
      p_screen_name: readOptionalString(body.screenName),
      p_metadata_json: readMetadata(body.metadata),
    });

    if (error) {
      throw error;
    }

    return { eventId: data };
  }),
);
