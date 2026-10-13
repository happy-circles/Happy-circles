import { requireAuthorizedDeviceSession } from '../_shared/authorized-device-session.ts';
import {
  handleRpc,
  requireString,
  createServiceRoleClient,
  createVerifiedUserClient,
} from '../_shared/http.ts';
import {
  FINANCIAL_REQUEST_SELECT,
  hydrateControlResponse,
} from '../_shared/financial-request-controls.ts';

Deno.serve((request) =>
  handleRpc(request, async (body, actorUserId, authContext) => {
    await requireAuthorizedDeviceSession(createVerifiedUserClient(authContext), authContext);
    const client = createServiceRoleClient();
    const { data, error } = await client.rpc('reject_financial_request', {
      p_actor_user_id: actorUserId,
      p_idempotency_key: requireString(body.idempotencyKey, 'idempotencyKey'),
      p_request_id: requireString(body.requestId, 'requestId'),
    });

    if (error) {
      throw error;
    }

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
