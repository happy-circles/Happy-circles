import { createServiceRoleClient, handleRpc, requireString } from '../_shared/http.ts';
import { notifyAccountInviteReview, readPayloadString } from '../_shared/push-notifications.ts';

Deno.serve((request) =>
  handleRpc(request, async (body, actorUserId) => {
    const client = createServiceRoleClient();
    const { data, error } = await client.rpc('activate_account_from_invite', {
      p_actor_user_id: actorUserId,
      p_idempotency_key: requireString(body.idempotencyKey, 'idempotencyKey'),
      p_delivery_token: requireString(body.deliveryToken, 'deliveryToken'),
      p_current_device_id: requireString(body.currentDeviceId, 'currentDeviceId'),
    });

    if (error) {
      throw error;
    }

    await notifyAccountInviteReview(client, actorUserId, readPayloadString(data, 'inviteId'));

    return data;
  }),
);
