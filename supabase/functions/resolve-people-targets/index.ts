import {
  createServiceRoleClient,
  handleRpc,
  requireStringArray,
} from '../_shared/http.ts';

Deno.serve((request) =>
  handleRpc(request, async (body, actorUserId) => {
    const client = createServiceRoleClient();
    const { data, error } = await client.rpc('resolve_people_targets', {
      p_actor_user_id: actorUserId,
      p_phone_e164_list: requireStringArray(body.phoneE164List, 'phoneE164List'),
    });

    if (error) {
      throw error;
    }

    return data;
  }),
);
