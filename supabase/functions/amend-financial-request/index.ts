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

    const { data, error } = await client.rpc('amend_financial_request', {
      p_actor_user_id: actorUserId,
      p_idempotency_key: requireString(body.idempotencyKey, 'idempotencyKey'),
      p_request_id: requireString(body.requestId, 'requestId'),
      p_amount_minor: amountMinor,
      p_description: requireString(body.description, 'description'),
      p_category: readTransactionCategory(body.category),
    });

    if (error) {
      throw error;
    }

    return data;
  }),
);
