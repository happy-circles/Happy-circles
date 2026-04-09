import { proposeAutomaticCycleSettlement } from '../_shared/cycle.ts';
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

    const requestId = requireString(body.requestId, 'requestId');
    const cycleProposal = await proposeAutomaticCycleSettlement(
      client,
      actorUserId,
      `auto_cycle_after_request_${requestId}`,
    );

    if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
      return {
        ...data,
        autoCycleProposal: cycleProposal,
      };
    }

    return {
      result: data,
      autoCycleProposal: cycleProposal,
    };
  }),
);
