import { createServiceRoleClient, handleRpc, requireString } from '../_shared/http.ts';

Deno.serve((request) =>
  handleRpc(request, async (body, actorUserId) => {
    const client = createServiceRoleClient();
    const { data, error } = await client.rpc('review_external_friendship_invite', {
      p_actor_user_id: actorUserId,
      p_idempotency_key: requireString(body.idempotencyKey, 'idempotencyKey'),
      p_invite_id: requireString(body.inviteId, 'inviteId'),
      p_decision: requireString(body.decision, 'decision'),
    });

    if (error) {
      throw error;
    }

    return data;
  }),
);
