import { createServiceRoleClient, handleRpc, requireString } from '../_shared/http.ts';

function readOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

Deno.serve((request) =>
  handleRpc(request, async (body, actorUserId) => {
    const client = createServiceRoleClient();
    const startedAt = readOptionalString(body.startedAt) ?? new Date().toISOString();

    const { data, error } = await client.rpc('start_app_session', {
      p_actor_user_id: actorUserId,
      p_client_session_id: requireString(body.clientSessionId, 'clientSessionId'),
      p_platform: requireString(body.platform, 'platform'),
      p_app_version: readOptionalString(body.appVersion),
      p_device_id: readOptionalString(body.deviceId),
      p_started_at: startedAt,
    });

    if (error) {
      throw error;
    }

    return { sessionId: data };
  }),
);
