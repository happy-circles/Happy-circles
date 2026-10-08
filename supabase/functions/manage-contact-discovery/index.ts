import { createServiceRoleClient, handleRpc, requireStringArray } from '../_shared/http.ts';
import {
  readDiscoverySessionId,
  validateDiscoveryWatchBatch,
} from '../_shared/contact-discovery.ts';

Deno.serve((request) =>
  handleRpc(
    request,
    async (body, actorUserId) => {
      if (body.action !== 'renew' && body.action !== 'stop' && body.action !== 'remove') {
        throw new Error('Invalid action');
      }
      const watchIds =
        body.action === 'remove' ? requireStringArray(body.watchIds, 'watchIds') : null;
      if (watchIds) validateDiscoveryWatchBatch(watchIds);
      const { data, error } = await createServiceRoleClient().rpc('manage_contact_discovery', {
        p_actor_user_id: actorUserId,
        p_discovery_session_id: readDiscoverySessionId(body.discoverySessionId, true),
        p_action: body.action,
        ...(watchIds ? { p_watch_ids: watchIds } : {}),
      });
      if (error) throw error;
      return data;
    },
    { rateLimit: { scope: 'manage-contact-discovery', limit: 20, windowSeconds: 60 } },
  ),
);
