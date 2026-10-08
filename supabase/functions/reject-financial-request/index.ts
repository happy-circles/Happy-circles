import { requireAuthorizedDeviceSession } from '../_shared/authorized-device-session.ts';
import {
  handleRpc,
  requireString,
  createServiceRoleClient,
  createVerifiedUserClient,
} from '../_shared/http.ts';

Deno.serve((request) =>
  handleRpc(request, async (body, actorUserId, authContext) => {
    await requireAuthorizedDeviceSession(createVerifiedUserClient(authContext), authContext);
    const client = createServiceRoleClient();
    const { data, error } = await client.rpc('reject_financial_request', {
      p_actor_user_id: actorUserId,
      p_idempotency_key: requireString(body.idempotencyKey, 'idempotencyKey'),
      p_request_id: requireString(body.requestId, 'requestId'),
    });

    if (error) {
      throw error;
    }

    return data;
  }),
);
