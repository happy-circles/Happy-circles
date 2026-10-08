import { createServiceRoleClient, handleRpc, requireString } from '../_shared/http.ts';
import { readPayloadString, triggerPushNotificationWorker } from '../_shared/push-notifications.ts';

Deno.serve((request) =>
  handleRpc(request, async (body, actorUserId) => {
    const client = createServiceRoleClient();
    const { data, error } = await client.rpc('remind_friendship_invite', {
      p_actor_user_id: actorUserId,
      p_idempotency_key: requireString(body.idempotencyKey, 'idempotencyKey'),
      p_invite_id: requireString(body.inviteId, 'inviteId'),
    });
    if (error) throw error;
    if (readPayloadString(data, 'reminderStatus') === 'queued') {
      triggerPushNotificationWorker(10);
    }
    return data;
  }),
);
