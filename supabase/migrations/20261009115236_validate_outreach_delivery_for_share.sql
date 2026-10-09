-- The Invitar command can share its freshly validated delivery without opening it.
-- Keep QR/public preview and resend endpoints unchanged.
create or replace function app_private.validate_account_invite_delivery_for_share(
  p_actor_user_id uuid,
  p_phone_e164 text,
  p_result jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, app_private, pg_temp
as $$
declare
  v_phone text := nullif(btrim(p_phone_e164), '');
  v_token text := nullif(btrim(p_result ->> 'deliveryToken'), '');
  v_invite_id uuid;
  v_delivery_id uuid;
  v_invite public.account_invites%rowtype;
  v_delivery public.account_invite_deliveries%rowtype;
  v_checked_at timestamptz;
begin
  perform public.assert_request_actor(p_actor_user_id);
  if p_actor_user_id is null or v_phone is null or v_token is null
    or p_result ->> 'channel' is distinct from 'remote' then
    raise exception 'account_invite_delivery_not_available';
  end if;

  begin
    v_invite_id := (p_result ->> 'inviteId')::uuid;
    v_delivery_id := (p_result ->> 'deliveryId')::uuid;
  exception when invalid_text_representation then
    raise exception 'account_invite_delivery_not_available';
  end;

  -- create_account_invite already holds these rows in invite -> delivery order.
  -- Do not acquire preview's advisory lock after row locks: that would invert
  -- preview/cancel lock ordering. Ownership is checked before locking a row.
  select * into v_invite
  from public.account_invites
  where id = v_invite_id
    and inviter_user_id = p_actor_user_id
    and intended_recipient_phone_e164 = v_phone
  for update;
  if not found then raise exception 'account_invite_delivery_not_available'; end if;

  select * into v_delivery
  from public.account_invite_deliveries
  where id = v_delivery_id and invite_id = v_invite.id
  for update;
  if not found then raise exception 'account_invite_delivery_not_available'; end if;

  if v_delivery.token_hash is distinct from public.hash_invite_token(v_token)
    or v_delivery.channel <> 'remote'
    or v_invite.status <> 'pending_activation'
    or v_delivery.status not in ('issued', 'authenticated')
    or v_delivery.revoked_at is not null
    or (v_invite.activated_user_id is not null
      and v_invite.activated_user_id <> p_actor_user_id)
    or (v_delivery.authenticated_user_id is not null
      and v_delivery.authenticated_user_id <> p_actor_user_id) then
    raise exception 'account_invite_delivery_not_available';
  end if;

  -- now() is transaction-start time; a lock wait must not extend validity.
  v_checked_at := clock_timestamp();
  if v_invite.expires_at <= v_checked_at or v_delivery.expires_at <= v_checked_at then
    raise exception 'account_invite_delivery_expired';
  end if;

  -- Canonical fields come from current rows, not an idempotency response.
  -- Reading here never increments open counters or records a preview audit.
  return jsonb_build_object(
    'result', jsonb_build_object(
      'inviteId', v_invite.id,
      'deliveryId', v_delivery.id,
      'deliveryToken', v_token,
      'status', v_invite.status,
      'channel', v_delivery.channel,
      'originChannel', v_delivery.channel,
      'expiresAt', v_delivery.expires_at,
      'inviteExpiresAt', v_invite.expires_at,
      'intendedRecipientAlias', v_invite.intended_recipient_alias,
      'intendedRecipientPhoneE164', v_invite.intended_recipient_phone_e164,
      'intendedRecipientPhoneLabel', v_invite.intended_recipient_phone_label
    ),
    'deliveryValidation', jsonb_build_object(
      'status', 'current',
      'ownerUserId', v_invite.inviter_user_id,
      'phoneE164', v_invite.intended_recipient_phone_e164,
      'inviteId', v_invite.id,
      'deliveryId', v_delivery.id,
      'channel', v_delivery.channel,
      'deliveryStatus', v_delivery.status,
      'validatedAt', v_checked_at,
      'expiresAt', v_delivery.expires_at,
      'inviteExpiresAt', v_invite.expires_at
    )
  );
end;
$$;

revoke all on function app_private.validate_account_invite_delivery_for_share(uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function app_private.validate_account_invite_delivery_for_share(uuid, text, jsonb)
  to service_role;

create or replace function public.create_people_outreach(
  p_actor_user_id uuid, p_idempotency_key text, p_channel public.account_invite_channel,
  p_source_context text default null, p_intended_recipient_alias text default null,
  p_intended_recipient_phone_e164 text default null, p_intended_recipient_phone_label text default null
)
returns jsonb language plpgsql security definer set search_path = public, app_private, pg_temp
as $$
declare
  v_phone text := nullif(btrim(p_intended_recipient_phone_e164), '');
  v_target public.user_profiles%rowtype;
  v_target_found boolean;
  v_command public.idempotency_keys%rowtype;
  v_relationship_id uuid;
  v_result jsonb;
  v_response jsonb;
  v_validated_delivery jsonb;
begin
  perform public.assert_request_actor(p_actor_user_id);
  if v_phone is null then raise exception 'contact_phone_required'; end if;
  v_command := app_private.begin_friendship_command(p_actor_user_id, 'create_people_outreach', p_idempotency_key,
    jsonb_build_object('phone', v_phone, 'channel', p_channel, 'sourceContext', nullif(btrim(p_source_context), ''),
      'alias', nullif(btrim(p_intended_recipient_alias), ''), 'label', nullif(btrim(p_intended_recipient_phone_label), '')));
  if v_command.response_json is not null then
    -- Account tokens remain outside response_json and are re-derived by their existing RPC.
    if v_command.response_json ->> 'kind' <> 'account_invite' then
      return v_command.response_json - 'deliveryValidation';
    end if;
    v_result := public.create_account_invite(p_actor_user_id, p_idempotency_key, p_channel, p_source_context,
      p_intended_recipient_alias, v_phone, p_intended_recipient_phone_label);
    v_response := jsonb_set(v_command.response_json - 'deliveryValidation', '{result}', v_result);
  else
    select * into v_target from public.user_profiles
    where phone_e164 = v_phone and public.profile_phone_identity_ready(user_profiles) and id <> p_actor_user_id
    limit 1;
    v_target_found := found;
    if v_target_found and v_target.account_access_state = 'active' then
      select id into v_relationship_id from public.relationships
      where user_low_id = least(p_actor_user_id, v_target.id)
        and user_high_id = greatest(p_actor_user_id, v_target.id) and status = 'active';
      if v_relationship_id is null then
        -- This command owns expiry, pairing and absent-row serialization. Do not
        -- short circuit here using the raw pending status or hold its locks backwards.
        begin
          v_result := public.create_internal_friendship_invite(p_actor_user_id, p_idempotency_key, v_target.id, p_source_context);
        exception when others then
          if sqlerrm <> 'relationship_already_exists' then raise; end if;
          select id into v_relationship_id from public.relationships
          where user_low_id = least(p_actor_user_id, v_target.id)
            and user_high_id = greatest(p_actor_user_id, v_target.id) and status = 'active';
          if v_relationship_id is null then raise; end if;
        end;
      end if;
      if v_relationship_id is not null then
        v_response := jsonb_build_object('kind', 'already_related', 'status', 'already_related',
          'relationshipId', v_relationship_id, 'matchedUserId', v_target.id, 'displayName', v_target.display_name);
      else
        v_response := jsonb_build_object('kind', 'friendship',
          'status', case when coalesce((v_result ->> 'created')::boolean, false) then 'active_user' else 'pending_friendship' end,
          'inviteId', v_result ->> 'inviteId', 'friendshipDirection', v_result ->> 'friendshipDirection',
          'matchedUserId', v_target.id, 'displayName', v_target.display_name, 'result', v_result);
      end if;
    else
      v_result := public.create_account_invite(p_actor_user_id, p_idempotency_key, p_channel, p_source_context,
        p_intended_recipient_alias, v_phone, p_intended_recipient_phone_label);
      v_response := jsonb_build_object('kind', 'account_invite',
        'status', case when v_target_found then 'pending_activation' else 'no_account' end,
        'matchedUserId', case when v_target_found then v_target.id else null end,
        'displayName', case when v_target_found then v_target.display_name else null end, 'result', v_result);
    end if;
  end if;

  -- A replay can contain an old status or expiry even though the token is stable.
  -- Revalidate the actual locked rows on every remote account response.
  if v_response ->> 'kind' = 'account_invite' and p_channel = 'remote' then
    v_validated_delivery := app_private.validate_account_invite_delivery_for_share(
      p_actor_user_id, v_phone, v_response -> 'result');
    v_response := jsonb_set(v_response, '{result}', v_validated_delivery -> 'result')
      || jsonb_build_object('deliveryValidation', v_validated_delivery -> 'deliveryValidation');
  end if;

  -- Validation is point-in-time metadata, never a reusable cached permission.
  perform app_private.finish_friendship_command(v_command.id,
    (v_response - 'deliveryValidation') #- '{result,deliveryToken}');
  return v_response;
end;
$$;
