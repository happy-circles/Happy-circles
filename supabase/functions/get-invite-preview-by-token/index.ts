import { handleRpc, requireString, createServiceRoleClient } from '../_shared/http.ts';

Deno.serve((request) =>
  handleRpc(request, async (body, actorUserId) => {
    const client = createServiceRoleClient();
    const { data, error } = await client.rpc('get_invite_preview_by_token', {
      p_actor_user_id: actorUserId,
      p_invite_token: requireString(body.inviteToken, 'inviteToken'),
    });

    if (error) {
      throw error;
    }

    return data;
  }),
);
