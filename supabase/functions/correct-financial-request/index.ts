import { requireAuthorizedDeviceSession } from '../_shared/authorized-device-session.ts';
import { handleRpc, createServiceRoleClient, createVerifiedUserClient } from '../_shared/http.ts';
import {
  FINANCIAL_REQUEST_SELECT,
  hydrateControlResponse,
  readCorrection,
} from '../_shared/financial-request-controls.ts';
import { notifyFinancialRequestPending, readPayloadString } from '../_shared/push-notifications.ts';

Deno.serve((request) =>
  handleRpc(request, async (body, actorUserId, authContext) => {
    await requireAuthorizedDeviceSession(createVerifiedUserClient(authContext), authContext);
    const payload = readCorrection(body);
    const client = createServiceRoleClient();
    const { data, error } = await client.rpc('correct_financial_request', {
      p_actor_user_id: actorUserId,
      p_idempotency_key: payload.idempotencyKey,
      p_request_id: payload.requestId,
      p_amount_minor: payload.amountMinor,
      p_description: payload.description,
      p_category: payload.category,
      p_expected_version: payload.expectedVersion,
    });
    if (error) throw error;
    // Push delivery is an independent effect after the committed transaction.
    try {
      await notifyFinancialRequestPending(
        client,
        actorUserId,
        readPayloadString(data, 'correctedRequestId'),
      );
    } catch {
      console.warn('correct_financial_request_push_enqueue_failed');
    }
    return hydrateControlResponse(
      async (ids) => {
        const result = await client
          .from('financial_requests')
          .select(FINANCIAL_REQUEST_SELECT)
          .in('id', ids);
        return { data: result.data as unknown, error: result.error as unknown };
      },
      actorUserId,
      data,
    );
  }),
);
