import { handleRpc, requireString, createServiceRoleClient } from '../_shared/http.ts';

Deno.serve((request) =>
  handleRpc(request, async (body, actorUserId) => {
    const client = createServiceRoleClient();
    const { data, error } = await client.rpc('create_relationship_invite', {
      p_actor_user_id: actorUserId,
      p_idempotency_key: requireString(body.idempotencyKey, 'idempotencyKey'),
      p_invitee_user_id: requireString(body.inviteeUserId, 'inviteeUserId'),
    });

    if (error) {
      throw error;
    }

    return data;
  }),
);
