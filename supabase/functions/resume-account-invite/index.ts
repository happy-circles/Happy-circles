import {
  createServiceRoleClient,
  handleRpc,
  requireAuthenticatedSession,
  requireString,
} from '../_shared/http.ts';
import { notifyAccountInviteReview, readPayloadString } from '../_shared/push-notifications.ts';

Deno.serve((request) =>
  handleRpc(request, async (body, actorUserId, authContext) => {
    const client = createServiceRoleClient();
    const { data, error } = await client.rpc('activate_account_from_pending_invite', {
      p_actor_user_id: actorUserId,
      p_idempotency_key: requireString(body.idempotencyKey, 'idempotencyKey'),
      p_current_device_id: requireString(body.currentDeviceId, 'currentDeviceId'),
      p_current_session_id: requireAuthenticatedSession(authContext),
    });
    if (error) throw error;
    await notifyAccountInviteReview(client, actorUserId, readPayloadString(data, 'inviteId'));
    return data;
  }),
);
