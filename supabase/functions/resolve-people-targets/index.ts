import { createServiceRoleClient, handleRpc, requireStringArray } from '../_shared/http.ts';
import {
  CONTACT_RESOLUTION_RATE_LIMITS,
  readDiscoverySessionId,
  validateContactPhoneBatch,
} from '../_shared/contact-discovery.ts';

Deno.serve((request) =>
  handleRpc(
    request,
    async (body, actorUserId) => {
      const client = createServiceRoleClient();
      const phones = requireStringArray(body.phoneE164List, 'phoneE164List');
      validateContactPhoneBatch(phones);
      const { data, error } = await client.rpc('resolve_people_targets_observed', {
        p_actor_user_id: actorUserId,
        p_phone_e164_list: phones,
        p_discovery_session_id: readDiscoverySessionId(body.discoverySessionId),
      });

      if (error) {
        throw error;
      }

      return data;
    },
    { rateLimit: CONTACT_RESOLUTION_RATE_LIMITS },
  ),
);
