import { createServiceRoleClient, handleRpc, requireString } from '../_shared/http.ts';
import { notifyFriendshipInviteReview, readPayloadString } from '../_shared/push-notifications.ts';

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

    await notifyFriendshipInviteReview(client, actorUserId, readPayloadString(data, 'inviteId'));

    return data;
  }),
);
