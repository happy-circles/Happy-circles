import { createServiceRoleClient, handleRpc } from '../_shared/http.ts';

function readObject(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid ${field}`);
  }

  return value as Record<string, unknown>;
}

function readEvents(value: unknown): unknown[] {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value) || value.length > 20) {
    throw new Error('Invalid events');
  }

  return value;
}

Deno.serve((request) =>
  handleRpc(request, async (body, actorUserId) => {
    const client = createServiceRoleClient();
    const clientSession = readObject(body.clientSession, 'clientSession');
    const events = readEvents(body.events);

    const { data, error } = await client.rpc('ingest_product_analytics', {
      p_actor_user_id: actorUserId,
      p_client_session: clientSession,
      p_events: events,
    });

    if (error) {
      throw error;
    }

    return data;
  }),
);
