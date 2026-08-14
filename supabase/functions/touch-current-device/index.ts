import { createServiceRoleClient, handleRpc, requireString } from '../_shared/http.ts';

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

Deno.serve((request) =>
  handleRpc(request, async (body, actorUserId) => {
    const client = createServiceRoleClient();
    const { data, error } = await client.rpc('touch_current_device', {
      p_actor_user_id: actorUserId,
      p_device_id: requireString(body.deviceId, 'deviceId'),
      p_platform: requireString(body.platform, 'platform'),
      p_device_name: optionalString(body.deviceName),
      p_app_version: optionalString(body.appVersion),
    });
    if (error) throw error;
    return data;
  }),
);
