import { handleRpc, requireString, createServiceRoleClient } from '../_shared/http.ts';

const TRANSACTION_CATEGORIES = new Set([
  'food_drinks',
  'transport',
  'entertainment',
  'services',
  'home',
  'other',
]);

function readTransactionCategory(value: unknown) {
  if (typeof value === 'undefined' || value === null) {
    return 'other';
  }

  if (typeof value !== 'string' || !TRANSACTION_CATEGORIES.has(value)) {
    throw new Error('Invalid category');
  }

  return value;
}

Deno.serve((request) =>
  handleRpc(request, async (body, actorUserId) => {
    const client = createServiceRoleClient();
    const amountMinor = Number(body.amountMinor);
    if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
      throw new Error('Invalid amountMinor');
    }

    const requestKind = requireString(body.requestKind, 'requestKind');
    if (requestKind !== 'balance_increase') {
      throw new Error('Invalid requestKind');
    }
    const category = readTransactionCategory(body.category);

    const { data, error } = await client.rpc('create_balance_request', {
      p_actor_user_id: actorUserId,
      p_idempotency_key: requireString(body.idempotencyKey, 'idempotencyKey'),
      p_request_type: requestKind,
      p_responder_user_id: requireString(body.responderUserId, 'responderUserId'),
      p_debtor_user_id: requireString(body.debtorUserId, 'debtorUserId'),
      p_creditor_user_id: requireString(body.creditorUserId, 'creditorUserId'),
      p_amount_minor: amountMinor,
      p_description: requireString(body.description, 'description'),
      p_category: category,
      p_parent_request_id: null,
      p_target_ledger_transaction_id: null,
    });

    if (error) {
      throw error;
    }

    return data;
  }),
);
