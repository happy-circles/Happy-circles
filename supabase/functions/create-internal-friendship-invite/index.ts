import { createServiceRoleClient, handleRpc, requireString } from '../_shared/http.ts';
import {
  notifyInternalFriendshipInvite,
  readPayloadString,
} from '../_shared/push-notifications.ts';

Deno.serve((request) =>
  handleRpc(request, async (body, actorUserId) => {
    const client = createServiceRoleClient();
    const { data, error } = await client.rpc('create_internal_friendship_invite', {
      p_actor_user_id: actorUserId,
      p_idempotency_key: requireString(body.idempotencyKey, 'idempotencyKey'),
      p_target_user_id: requireString(body.targetUserId, 'targetUserId'),
      p_source_context:
        typeof body.sourceContext === 'string' && body.sourceContext.trim().length > 0
          ? body.sourceContext.trim()
          : null,
    });

    if (error) {
      throw error;
    }

    await notifyInternalFriendshipInvite(client, actorUserId, readPayloadString(data, 'inviteId'));

    return data;
  }),
);
