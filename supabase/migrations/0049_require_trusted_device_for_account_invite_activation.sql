create or replace function public.activate_account_from_invite(
  p_actor_user_id uuid,
  p_idempotency_key text,
  p_delivery_token text,
  p_current_device_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_idempotency public.idempotency_keys%rowtype;
  v_delivery public.account_invite_deliveries%rowtype;
  v_invite public.account_invites%rowtype;
  v_actor_profile public.user_profiles%rowtype;
  v_trusted_device public.trusted_devices%rowtype;
  v_relationship_id uuid;
  v_now timestamptz := timezone('utc', now());
  v_phone_matches boolean := false;
  v_response jsonb;
begin
  perform public.assert_request_actor(p_actor_user_id);

  if nullif(btrim(p_current_device_id), '') is null then
    raise exception 'activation_device_not_trusted';
  end if;

  insert into public.idempotency_keys (actor_user_id, operation_name, idempotency_key)
  values (p_actor_user_id, 'activate_account_from_invite', p_idempotency_key)
  on conflict (actor_user_id, operation_name, idempotency_key) do nothing;

  select *
    into v_idempotency
  from public.idempotency_keys
  where actor_user_id = p_actor_user_id
    and operation_name = 'activate_account_from_invite'
    and idempotency_key = p_idempotency_key
  for update;

  if v_idempotency.response_json is not null then
    return v_idempotency.response_json;
  end if;

  select *
    into v_delivery
  from public.account_invite_deliveries
  where token_hash = public.hash_invite_token(p_delivery_token)
  order by created_at desc
  limit 1
  for update;

  if not found then
    raise exception 'account_invite_delivery_not_found';
  end if;

  select *
    into v_invite
  from public.account_invites
  where id = v_delivery.invite_id
  for update;

  if not found then
    raise exception 'account_invite_not_found';
  end if;

  if public.effective_account_invite_status(v_invite.status, v_invite.expires_at) <> v_invite.status then
    update public.account_invites
    set status = public.effective_account_invite_status(v_invite.status, v_invite.expires_at),
        resolution_actor = coalesce(resolution_actor, 'system'),
        resolution_reason = coalesce(resolution_reason, 'expired_before_activation'),
        resolved_at = coalesce(resolved_at, v_now),
        updated_at = v_now
    where id = v_invite.id
    returning * into v_invite;
  end if;

  if public.effective_account_invite_delivery_status(v_delivery.status, v_delivery.expires_at, v_delivery.revoked_at) <> v_delivery.status then
    update public.account_invite_deliveries
    set status = public.effective_account_invite_delivery_status(v_delivery.status, v_delivery.expires_at, v_delivery.revoked_at),
        updated_at = v_now
    where id = v_delivery.id
    returning * into v_delivery;
  end if;

  if v_invite.inviter_user_id = p_actor_user_id then
    raise exception 'cannot_activate_own_invite';
  end if;

  if v_invite.status not in ('pending_activation', 'pending_inviter_review', 'accepted') then
    raise exception 'account_invite_not_open';
  end if;

  if v_delivery.status not in ('issued', 'authenticated', 'activated') then
    if v_delivery.status = 'expired' then
      raise exception 'account_invite_delivery_expired';
    end if;
    raise exception 'account_invite_delivery_not_available';
  end if;

  if v_invite.activated_user_id is not null
    and v_invite.activated_user_id <> p_actor_user_id then
    raise exception 'account_invite_already_used';
  end if;

  if v_delivery.authenticated_user_id is not null
    and v_delivery.authenticated_user_id <> p_actor_user_id then
    raise exception 'account_invite_already_used';
  end if;

  select *
    into v_actor_profile
  from public.user_profiles
  where id = p_actor_user_id;

  if not found then
    raise exception 'actor_profile_not_found';
  end if;

  if length(btrim(coalesce(v_actor_profile.display_name, ''))) < 3
    or position('@' in btrim(coalesce(v_actor_profile.display_name, ''))) > 0 then
    raise exception 'activation_profile_incomplete';
  end if;

  if nullif(btrim(v_actor_profile.phone_e164), '') is null then
    raise exception 'activation_phone_required';
  end if;

  select *
    into v_trusted_device
  from public.trusted_devices
  where user_id = p_actor_user_id
    and device_id = btrim(p_current_device_id)
  order by created_at desc
  limit 1
  for update;

  if not found or v_trusted_device.trust_state <> 'trusted' then
    raise exception 'activation_device_not_trusted';
  end if;

  update public.account_invite_deliveries
  set status = case when status = 'issued' then 'authenticated' else status end,
      authenticated_user_id = coalesce(authenticated_user_id, p_actor_user_id),
      authenticated_at = coalesce(authenticated_at, timezone('utc', now())),
      updated_at = timezone('utc', now())
  where id = v_delivery.id
  returning * into v_delivery;

  v_phone_matches :=
    v_invite.intended_recipient_phone_e164 is null
    or btrim(v_invite.intended_recipient_phone_e164) = btrim(v_actor_profile.phone_e164);

  update public.user_profiles
  set account_access_state = 'active',
      invited_by_user_id = v_invite.inviter_user_id,
      activated_via_account_invite_id = v_invite.id,
      activated_at = coalesce(activated_at, v_now)
  where id = p_actor_user_id
  returning * into v_actor_profile;

  update public.account_invite_deliveries
  set status = 'revoked',
      revoked_at = coalesce(revoked_at, v_now),
      updated_at = v_now
  where invite_id = v_invite.id
    and id <> v_delivery.id
    and status in ('issued', 'authenticated')
    and revoked_at is null;

  if v_phone_matches then
    insert into public.relationships (user_low_id, user_high_id, status)
    values (
      least(v_invite.inviter_user_id, p_actor_user_id),
      greatest(v_invite.inviter_user_id, p_actor_user_id),
      'active'
    )
    on conflict (user_low_id, user_high_id)
    do update set status = 'active'
    returning id into v_relationship_id;

    perform public.ensure_relationship_accounts(v_relationship_id);

    update public.account_invites
    set activated_user_id = p_actor_user_id,
        linked_relationship_id = v_relationship_id,
        status = 'accepted',
        activated_at = coalesce(activated_at, v_now),
        resolution_actor = 'system',
        resolution_reason = 'activation_phone_match_auto_accepted',
        resolved_at = v_now,
        updated_at = v_now
    where id = v_invite.id
    returning * into v_invite;

    update public.account_invite_deliveries
    set status = 'activated',
        activation_completed_at = coalesce(activation_completed_at, v_now),
        updated_at = v_now
    where id = v_delivery.id
    returning * into v_delivery;

    perform public.append_audit_event(
      p_actor_user_id,
      'account_invite',
      v_invite.id,
      'account_invite_activated',
      null,
      jsonb_build_object(
        'delivery_id', v_delivery.id,
        'relationship_id', v_relationship_id,
        'resolution_reason', 'activation_phone_match_auto_accepted'
      )
    );

    perform public.append_audit_event(
      p_actor_user_id,
      'account_invite',
      v_invite.id,
      'account_invite_accepted',
      null,
      jsonb_build_object(
        'relationship_id', v_relationship_id,
        'activated_user_id', p_actor_user_id
      )
    );

    v_response := jsonb_build_object(
      'inviteId', v_invite.id,
      'deliveryId', v_delivery.id,
      'status', v_invite.status,
      'resolvedAt', v_invite.resolved_at,
      'relationshipId', v_relationship_id
    );
  else
    update public.account_invites
    set activated_user_id = p_actor_user_id,
        status = 'pending_inviter_review',
        activated_at = coalesce(activated_at, v_now),
        updated_at = v_now
    where id = v_invite.id
    returning * into v_invite;

    update public.account_invite_deliveries
    set status = 'activated',
        activation_completed_at = coalesce(activation_completed_at, v_now),
        updated_at = v_now
    where id = v_delivery.id
    returning * into v_delivery;

    perform public.append_audit_event(
      p_actor_user_id,
      'account_invite',
      v_invite.id,
      'account_invite_activated',
      null,
      jsonb_build_object(
        'delivery_id', v_delivery.id,
        'activated_user_id', p_actor_user_id,
        'resolution_reason', 'activation_requires_sender_review'
      )
    );

    v_response := jsonb_build_object(
      'inviteId', v_invite.id,
      'deliveryId', v_delivery.id,
      'status', v_invite.status,
      'activatedAt', v_invite.activated_at,
      'actorRole', 'claimant'
    );
  end if;

  update public.idempotency_keys
  set response_json = v_response
  where id = v_idempotency.id;

  return v_response;
end;
$$;

grant execute on function public.activate_account_from_invite(
  uuid,
  text,
  text,
  text
) to service_role;
