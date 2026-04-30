import { triggerGraphCycleWorker } from '../_shared/cycle-worker.ts';
import { createServiceRoleClient, handleRpc, requireString } from '../_shared/http.ts';

Deno.serve((request) =>
  handleRpc(request, async (body, actorUserId) => {
    const client = createServiceRoleClient();
    const { data, error } = await client.rpc('enqueue_manual_graph_cycle_job', {
      p_actor_user_id: actorUserId,
      p_idempotency_key: requireString(body.idempotencyKey, 'idempotencyKey'),
    });

    if (error) {
      throw error;
    }

    triggerGraphCycleWorker(1);

    return data;
  }),
);
