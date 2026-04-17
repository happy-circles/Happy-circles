import { createServiceRoleClient, handleRpc, requireString } from '../_shared/http.ts';

Deno.serve((request) =>
  handleRpc(request, async (body, actorUserId) => {
    const client = createServiceRoleClient();
    const { data, error } = await client.rpc('create_people_outreach', {
      p_actor_user_id: actorUserId,
      p_idempotency_key: requireString(body.idempotencyKey, 'idempotencyKey'),
      p_channel: requireString(body.channel, 'channel'),
      p_source_context:
        typeof body.sourceContext === 'string' && body.sourceContext.trim().length > 0
          ? body.sourceContext.trim()
          : null,
      p_intended_recipient_alias:
        typeof body.intendedRecipientAlias === 'string' &&
        body.intendedRecipientAlias.trim().length > 0
          ? body.intendedRecipientAlias.trim()
          : null,
      p_intended_recipient_phone_e164:
        typeof body.intendedRecipientPhoneE164 === 'string' &&
        body.intendedRecipientPhoneE164.trim().length > 0
          ? body.intendedRecipientPhoneE164.trim()
          : null,
      p_intended_recipient_phone_label:
        typeof body.intendedRecipientPhoneLabel === 'string' &&
        body.intendedRecipientPhoneLabel.trim().length > 0
          ? body.intendedRecipientPhoneLabel.trim()
          : null,
    });

    if (error) {
      throw error;
    }

    return data;
  }),
);
