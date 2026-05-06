import { triggerGraphCycleWorker } from '../_shared/cycle-worker.ts';
import { handleRpc, requireString, createServiceRoleClient } from '../_shared/http.ts';

Deno.serve((request) =>
  handleRpc(request, async (body, actorUserId) => {
    const client = createServiceRoleClient();
    const { data, error } = await client.rpc('decide_cycle_settlement', {
      p_actor_user_id: actorUserId,
      p_idempotency_key: requireString(body.idempotencyKey, 'idempotencyKey'),
      p_proposal_id: requireString(body.proposalId, 'proposalId'),
      p_decision: 'approved',
    });

    if (error) {
      throw error;
    }

    if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
      const status = (data as Record<string, unknown>).status;
      if (status === 'executed' || status === 'stale') {
        triggerGraphCycleWorker(3);
      }
    }

    return data;
  }),
);
