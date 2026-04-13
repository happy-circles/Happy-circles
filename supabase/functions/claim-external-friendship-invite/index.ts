import { createServiceRoleClient, handleRpc, requireString } from '../_shared/http.ts';

Deno.serve((request) =>
  handleRpc(request, async (body, actorUserId) => {
    const client = createServiceRoleClient();
    const { data, error } = await client.rpc('claim_external_friendship_invite', {
      p_actor_user_id: actorUserId,
      p_idempotency_key: requireString(body.idempotencyKey, 'idempotencyKey'),
      p_delivery_token: requireString(body.deliveryToken, 'deliveryToken'),
    });

    if (error) {
      throw error;
    }

    return data;
  }),
);
