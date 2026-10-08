import { createServiceRoleClient, handleRpc, requireStringArray } from '../_shared/http.ts';
import {
  CONTACT_DISCOVERY_REGISTRATION_RATE_LIMITS,
  readDiscoverySessionId,
  validateContactPhoneBatch,
} from '../_shared/contact-discovery.ts';

Deno.serve((request) =>
  handleRpc(
    request,
    async (body, actorUserId) => {
      const phones = requireStringArray(body.phoneE164List, 'phoneE164List');
      validateContactPhoneBatch(phones);
      const { data, error } = await createServiceRoleClient().rpc('register_contact_discovery', {
        p_actor_user_id: actorUserId,
        p_phone_e164_list: phones,
        p_discovery_session_id: readDiscoverySessionId(body.discoverySessionId, true),
      });
      if (error) throw error;
      return data;
    },
    { rateLimit: CONTACT_DISCOVERY_REGISTRATION_RATE_LIMITS },
  ),
);
