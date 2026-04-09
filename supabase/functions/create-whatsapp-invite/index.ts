import { handleRpc, requireString, createServiceRoleClient } from '../_shared/http.ts';

Deno.serve((request) =>
  handleRpc(request, async (body, actorUserId) => {
    const client = createServiceRoleClient();
    const { data, error } = await client.rpc('create_contact_invite', {
      p_actor_user_id: actorUserId,
      p_idempotency_key: requireString(body.idempotencyKey, 'idempotencyKey'),
      p_invitee_name: requireString(body.inviteeName, 'inviteeName'),
      p_invitee_phone_country_iso2: requireString(body.phoneCountryIso2, 'phoneCountryIso2'),
      p_invitee_phone_country_calling_code: requireString(
        body.phoneCountryCallingCode,
        'phoneCountryCallingCode',
      ),
      p_invitee_phone_national_number: requireString(body.phoneNationalNumber, 'phoneNationalNumber'),
    });

    if (error) {
      throw error;
    }

    return data;
  }),
);
