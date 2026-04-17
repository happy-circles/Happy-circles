import { createServiceRoleClient, handleRpc, requireString } from '../_shared/http.ts';

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

    return data;
  }),
);
