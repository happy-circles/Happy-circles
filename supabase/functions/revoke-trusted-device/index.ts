import {
  createServiceRoleClient,
  handleRpc,
  requireRecentAuthentication,
  requireString,
} from '../_shared/http.ts';

Deno.serve((request) =>
  handleRpc(request, async (body, actorUserId, authContext) => {
    const proof = requireRecentAuthentication(authContext);
    const client = createServiceRoleClient();
    const { data, error } = await client.rpc('revoke_trusted_device', {
      p_actor_user_id: actorUserId,
      p_device_id: requireString(body.deviceId, 'deviceId'),
      p_current_device_id: requireString(body.currentDeviceId, 'currentDeviceId'),
      p_current_session_id: proof.sessionId,
    });
    if (error) throw error;
    return data;
  }),
);
