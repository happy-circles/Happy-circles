import { handleRpc, requireString, createServiceRoleClient } from '../_shared/http.ts';

Deno.serve((request) =>
  handleRpc(request, async (body, actorUserId) => {
    const client = createServiceRoleClient();
    const { data, error } = await client.rpc('get_profile_connection_preview', {
      p_actor_user_id: actorUserId,
      p_connection_token: requireString(body.connectionToken, 'connectionToken'),
    });

    if (error) {
      throw error;
    }

    return data;
  }),
);
