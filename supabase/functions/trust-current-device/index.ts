import {
  createServiceRoleClient,
  handleRpc,
  requireRecentAuthentication,
  requireString,
} from '../_shared/http.ts';

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

Deno.serve((request) =>
  handleRpc(request, async (body, actorUserId, authContext) => {
    const proof = requireRecentAuthentication(authContext);
    const client = createServiceRoleClient();
    const { data, error } = await client.rpc('trust_current_device', {
      p_actor_user_id: actorUserId,
      p_device_id: requireString(body.deviceId, 'deviceId'),
      p_platform: requireString(body.platform, 'platform'),
      p_device_name: optionalString(body.deviceName),
      p_app_version: optionalString(body.appVersion),
      // These values are derived exclusively from the JWT verified by getClaims/getUser.
      p_session_id: proof.sessionId,
      p_proof_method: proof.method,
      p_proof_at: proof.authenticatedAt,
    });
    if (error) throw error;
    return data;
  }),
);
