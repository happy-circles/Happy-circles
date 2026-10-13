import { requireAuthorizedDeviceSession } from '../_shared/authorized-device-session.ts';
import { runBackgroundTask } from '../_shared/background-task.ts';
import {
  handleRpc,
  requireString,
  createServiceRoleClient,
  createVerifiedUserClient,
} from '../_shared/http.ts';
import { notifyFinancialRequestPending, readPayloadString } from '../_shared/push-notifications.ts';
import {
  FINANCIAL_REQUEST_SELECT,
  hydrateControlResponse,
} from '../_shared/financial-request-controls.ts';

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
  handleRpc(request, async (body, actorUserId, authContext) => {
    await requireAuthorizedDeviceSession(createVerifiedUserClient(authContext), authContext);
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

    const requestId = readPayloadString(data, 'amendedRequestId');
    await runBackgroundTask(
      () => notifyFinancialRequestPending(client, actorUserId, requestId),
      'financial_request_push_failed',
      { actorUserId, requestId },
    );

    return hydrateControlResponse(
      async (ids) => {
        const result = await client
          .from('financial_requests')
          .select(FINANCIAL_REQUEST_SELECT)
          .in('id', ids)
          .abortSignal(AbortSignal.timeout(2000));
        return { data: result.data as unknown, error: result.error as unknown };
      },
      actorUserId,
      data,
    );
  }),
);
