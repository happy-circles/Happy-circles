import { detectFirstCycleSettlement } from '../_shared/cycle.ts';
import { handleRpc, requireString, createServiceRoleClient } from '../_shared/http.ts';

function parseAmountMinor(value: unknown): number {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error('Invalid amount_minor');
    }

    return value;
  }

  if (typeof value === 'string' && /^[0-9]+$/.test(value)) {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) {
      throw new Error('Invalid amount_minor');
    }

    return parsed;
  }

  throw new Error('Invalid amount_minor');
}

Deno.serve((request) =>
  handleRpc(request, async (body, actorUserId) => {
    const client = createServiceRoleClient();
    const maxCycles = Number(body.maxCycles ?? 1);
    if (!Number.isInteger(maxCycles) || maxCycles <= 0) {
      throw new Error('Invalid maxCycles');
    }

    const [{ data: edges, error: edgesError }, { data: hashData, error: hashError }] = await Promise.all([
      client.from('v_pair_net_edges_authoritative').select('debtor_user_id, creditor_user_id, amount_minor'),
      client.rpc('compute_graph_snapshot_hash'),
    ]);

    if (edgesError) {
      throw edgesError;
    }

    if (hashError) {
      throw hashError;
    }

    const draft = detectFirstCycleSettlement(
      (edges ?? []).map((edge) => {
        return {
          debtor_user_id: requireString(edge.debtor_user_id, 'debtor_user_id'),
          creditor_user_id: requireString(edge.creditor_user_id, 'creditor_user_id'),
          amount_minor: parseAmountMinor(edge.amount_minor),
        };
      }),
    );

    if (!draft) {
      return { status: 'no_cycles', maxCycles };
    }

    const { data, error } = await client.rpc('propose_cycle_settlement', {
      p_actor_user_id: actorUserId,
      p_idempotency_key: requireString(body.idempotencyKey, 'idempotencyKey'),
      p_graph_snapshot_hash: requireString(hashData, 'graphSnapshotHash'),
      p_graph_snapshot: edges ?? [],
      p_movements_json: draft.movements,
      p_participant_user_ids: draft.participantUserIds,
    });

    if (error) {
      throw error;
    }

    return data;
  }),
);
