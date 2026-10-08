import { createServiceRoleClient, handleRpc } from '../_shared/http.ts';
import { readDiscoverySessionId } from '../_shared/contact-discovery.ts';

Deno.serve((request) =>
  handleRpc(
    request,
    async (body, actorUserId) => {
      if (body.action !== 'renew' && body.action !== 'stop') {
        throw new Error('Invalid action');
      }
      const { data, error } = await createServiceRoleClient().rpc('manage_contact_discovery', {
        p_actor_user_id: actorUserId,
        p_discovery_session_id: readDiscoverySessionId(body.discoverySessionId, true),
        p_action: body.action,
      });
      if (error) throw error;
      return data;
    },
    { rateLimit: { scope: 'manage-contact-discovery', limit: 20, windowSeconds: 60 } },
  ),
);
