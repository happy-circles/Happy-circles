import { handleRpc, requireString, createServiceRoleClient } from '../_shared/http.ts';

Deno.serve((request) =>
  handleRpc(request, async (body, actorUserId) => {
    const client = createServiceRoleClient();
    const amountMinor = Number(body.amountMinor);
    if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
      throw new Error('Invalid amountMinor');
    }

    const { data, error } = await client.rpc('create_financial_request', {
      p_actor_user_id: actorUserId,
      p_idempotency_key: requireString(body.idempotencyKey, 'idempotencyKey'),
      p_request_type: 'manual_settlement',
      p_responder_user_id: requireString(body.responderUserId, 'responderUserId'),
      p_debtor_user_id: requireString(body.debtorUserId, 'debtorUserId'),
      p_creditor_user_id: requireString(body.creditorUserId, 'creditorUserId'),
      p_amount_minor: amountMinor,
      p_description: requireString(body.description, 'description'),
      p_parent_request_id: null,
      p_target_ledger_transaction_id: null,
    });

    if (error) {
      throw error;
    }

    return data;
  }),
);
