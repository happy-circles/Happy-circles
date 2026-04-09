import { proposeAutomaticCycleSettlement } from '../_shared/cycle.ts';
import { handleRpc, requireString, createServiceRoleClient } from '../_shared/http.ts';

Deno.serve((request) =>
  handleRpc(request, async (body, actorUserId) => {
    const client = createServiceRoleClient();
    const { data, error } = await client.rpc('execute_cycle_settlement', {
      p_actor_user_id: actorUserId,
      p_idempotency_key: requireString(body.idempotencyKey, 'idempotencyKey'),
      p_proposal_id: requireString(body.proposalId, 'proposalId'),
    });

    if (error) {
      throw error;
    }

    const proposalId = requireString(body.proposalId, 'proposalId');
    const nextCycleProposal = await proposeAutomaticCycleSettlement(
      client,
      actorUserId,
      `auto_cycle_after_execution_${proposalId}`,
    );

    if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
      return {
        ...data,
        nextAutoCycleProposal: nextCycleProposal,
      };
    }

    return {
      result: data,
      nextAutoCycleProposal: nextCycleProposal,
    };
  }),
);
