import {
  createServiceRoleClient,
  handleRpc,
  requireAuthenticatedSession,
  requireString,
} from '../_shared/http.ts';
import { notifyAccountInviteReview, readPayloadString } from '../_shared/push-notifications.ts';
import { activateAccountInviteWithLegacyFallback } from './compat.ts';

Deno.serve((request) =>
  handleRpc(request, async (body, actorUserId, authContext) => {
    const client = createServiceRoleClient();
    const { data, error } = await activateAccountInviteWithLegacyFallback(
      async (parameters) => {
        const result = await client.rpc('activate_account_from_invite', parameters);
        return { data: result.data, error: result.error };
      },
      {
        actorUserId,
        idempotencyKey: requireString(body.idempotencyKey, 'idempotencyKey'),
        deliveryToken: requireString(body.deliveryToken, 'deliveryToken'),
        currentDeviceId: requireString(body.currentDeviceId, 'currentDeviceId'),
        currentSessionId: requireAuthenticatedSession(authContext),
      },
      () => {
        console.warn('account_invite_activation_legacy_fallback', {
          code: 'activation_device_not_trusted',
          compatibilityMode: 'legacy_unbound_device',
        });
      },
    );

    if (error) {
      throw error;
    }

    await notifyAccountInviteReview(client, actorUserId, readPayloadString(data, 'inviteId'));

    return data;
  }),
);
