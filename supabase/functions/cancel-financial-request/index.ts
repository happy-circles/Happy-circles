import { requireAuthorizedDeviceSession } from '../_shared/authorized-device-session.ts';
import { handleRpc, createServiceRoleClient, createVerifiedUserClient } from '../_shared/http.ts';
import {
  FINANCIAL_REQUEST_SELECT,
  hydrateControlResponse,
  readControlRequest,
} from '../_shared/financial-request-controls.ts';

Deno.serve((request) =>
  handleRpc(request, async (body, actorUserId, authContext) => {
    await requireAuthorizedDeviceSession(createVerifiedUserClient(authContext), authContext);
    const payload = readControlRequest(body);
    const client = createServiceRoleClient();
    const { data, error } = await client.rpc('cancel_financial_request', {
      p_actor_user_id: actorUserId,
      p_idempotency_key: payload.idempotencyKey,
      p_request_id: payload.requestId,
      p_expected_version: payload.expectedVersion,
    });
    if (error) throw error;
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
