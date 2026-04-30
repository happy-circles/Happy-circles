import { triggerGraphCycleWorker } from '../_shared/cycle-worker.ts';
import { handleRpc, requireString, createServiceRoleClient } from '../_shared/http.ts';

Deno.serve((request) =>
  handleRpc(request, async (body, actorUserId) => {
    const client = createServiceRoleClient();
    const { data, error } = await client.rpc('accept_financial_request', {
      p_actor_user_id: actorUserId,
      p_idempotency_key: requireString(body.idempotencyKey, 'idempotencyKey'),
      p_request_id: requireString(body.requestId, 'requestId'),
    });

    if (error) {
      throw error;
    }

    triggerGraphCycleWorker(1);

    if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
      return data;
    }

    return {
      result: data,
    };
  }),
);
