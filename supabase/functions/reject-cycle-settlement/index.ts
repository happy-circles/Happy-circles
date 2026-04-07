import { handleRpc, requireString, createServiceRoleClient } from '../_shared/http.ts';

Deno.serve((request) =>
  handleRpc(request, async (body, actorUserId) => {
    const client = createServiceRoleClient();
    const { data, error } = await client.rpc('decide_cycle_settlement', {
      p_actor_user_id: actorUserId,
      p_idempotency_key: requireString(body.idempotencyKey, 'idempotencyKey'),
      p_proposal_id: requireString(body.proposalId, 'proposalId'),
      p_decision: 'rejected',
    });

    if (error) {
      throw error;
    }

    return data;
  }),
);
