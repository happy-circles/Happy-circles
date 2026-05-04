create or replace function public.cancel_account_invite(
  p_actor_user_id uuid,
  p_idempotency_key text,
  p_invite_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_idempotency public.idempotency_keys%rowtype;
  v_invite public.account_invites%rowtype;
  v_now timestamptz := timezone('utc', now());
  v_response jsonb;
begin
  perform public.assert_request_actor(p_actor_user_id);

  insert into public.idempotency_keys (actor_user_id, operation_name, idempotency_key)
  values (p_actor_user_id, 'cancel_account_invite', p_idempotency_key)
  on conflict (actor_user_id, operation_name, idempotency_key) do nothing;

  select *
    into v_idempotency
  from public.idempotency_keys
  where actor_user_id = p_actor_user_id
    and operation_name = 'cancel_account_invite'
    and idempotency_key = p_idempotency_key
  for update;

  if v_idempotency.response_json is not null then
    return v_idempotency.response_json;
  end if;

  perform 1
  from public.account_invite_deliveries
  where invite_id = p_invite_id
  order by created_at desc
  for update;

  select *
    into v_invite
  from public.account_invites
  where id = p_invite_id
  for update;

  if not found then
    raise exception 'account_invite_not_found';
  end if;

  if v_invite.inviter_user_id <> p_actor_user_id then
    raise exception 'account_invite_not_visible_to_actor';
  end if;

  if public.effective_account_invite_status(v_invite.status, v_invite.expires_at) <> v_invite.status then
    update public.account_invites
    set status = public.effective_account_invite_status(v_invite.status, v_invite.expires_at),
        resolution_actor = coalesce(resolution_actor, 'system'),
        resolution_reason = coalesce(resolution_reason, 'expired_before_cancel'),
        resolved_at = coalesce(resolved_at, v_now),
        updated_at = v_now
    where id = v_invite.id
    returning * into v_invite;
  end if;

  if v_invite.status <> 'pending_activation'
    or v_invite.activated_user_id is not null
    or exists (
      select 1
      from public.account_invite_deliveries delivery
      where delivery.invite_id = v_invite.id
        and (
          delivery.status in ('authenticated', 'activated')
          or delivery.authenticated_user_id is not null
          or delivery.activation_completed_at is not null
        )
    ) then
    raise exception 'account_invite_not_cancelable';
  end if;

  update public.account_invites
  set status = 'canceled',
      resolution_actor = 'sender',
      resolution_reason = 'sender_canceled_activation',
      resolved_at = v_now,
      updated_at = v_now
  where id = v_invite.id
  returning * into v_invite;

  update public.account_invite_deliveries
  set status = 'revoked',
      revoked_at = coalesce(revoked_at, v_now),
      updated_at = v_now
  where invite_id = v_invite.id
    and status = 'issued'
    and authenticated_user_id is null
    and revoked_at is null;

  perform public.append_audit_event(
    p_actor_user_id,
    'account_invite',
    v_invite.id,
    'account_invite_canceled',
    null,
    jsonb_build_object(
      'origin_channel', (
        select delivery.channel
        from public.account_invite_deliveries delivery
        where delivery.invite_id = v_invite.id
        order by delivery.created_at desc
        limit 1
      ),
      'intended_recipient_phone_e164', v_invite.intended_recipient_phone_e164
    )
  );

  v_response := jsonb_build_object(
    'inviteId', v_invite.id,
    'status', v_invite.status,
    'resolvedAt', v_invite.resolved_at
  );

  update public.idempotency_keys
  set response_json = v_response
  where id = v_idempotency.id;

  return v_response;
end;
$$;

revoke all on function public.cancel_account_invite(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.cancel_account_invite(uuid, text, uuid) to service_role;

drop function if exists public.get_account_invite_preview_public(text, boolean, text, uuid);
create or replace function public.get_account_invite_preview_public(
  p_delivery_token text,
  p_record_app_open boolean default true,
  p_client_fingerprint_hash text default null,
  p_actor_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delivery public.account_invite_deliveries%rowtype;
  v_invite public.account_invites%rowtype;
  v_inviter public.user_profiles%rowtype;
  v_now timestamptz := timezone('utc', now());
  v_delivery_token text := nullif(btrim(p_delivery_token), '');
  v_delivery_token_hash text := public.hash_invite_token(p_delivery_token);
  v_fingerprint_hash text := nullif(btrim(p_client_fingerprint_hash), '');
  v_window_started_at timestamptz := date_trunc('hour', timezone('utc', now()));
  v_request_count integer;
  v_effective_invite_status public.account_invite_status;
  v_effective_delivery_status text;
  v_unavailable jsonb := jsonb_build_object(
    'inviteId', null,
    'deliveryId', null,
    'status', 'unavailable',
    'deliveryStatus', 'unavailable',
    'channel', null,
    'expiresAt', null,
    'inviteExpiresAt', null,
    'resolvedAt', null,
    'inviterDisplayName', null,
    'inviterAvatarPath', null,
    'intendedRecipientPhoneMasked', null,
    'reason', 'invite_unavailable'
  );
begin
  if v_delivery_token is null then
    return v_unavailable;
  end if;

  if v_fingerprint_hash is not null then
    insert into public.public_invite_preview_rate_limits (
      token_hash,
      client_fingerprint_hash,
      window_started_at,
      request_count,
      updated_at
    )
    values (
      coalesce(v_delivery_token_hash, public.hash_invite_token('invalid-token')),
      v_fingerprint_hash,
      v_window_started_at,
      1,
      v_now
    )
    on conflict (token_hash, client_fingerprint_hash, window_started_at)
    do update set
      request_count = public.public_invite_preview_rate_limits.request_count + 1,
      updated_at = excluded.updated_at
    returning request_count into v_request_count;

    if v_request_count > 60 then
      raise exception 'invite_preview_rate_limited';
    end if;
  end if;

  select *
    into v_delivery
  from public.account_invite_deliveries
  where v_delivery_token_hash is not null
    and token_hash = v_delivery_token_hash
  order by created_at desc
  limit 1
  for update;

  if not found then
    return v_unavailable;
  end if;

  select *
    into v_invite
  from public.account_invites
  where id = v_delivery.invite_id
  for update;

  if not found then
    return v_unavailable;
  end if;

  v_effective_invite_status := public.effective_account_invite_status(v_invite.status, v_invite.expires_at);
  if v_effective_invite_status <> v_invite.status then
    update public.account_invites
    set status = v_effective_invite_status,
        resolution_actor = coalesce(resolution_actor, 'system'),
        resolution_reason = coalesce(resolution_reason, 'expired_before_preview'),
        resolved_at = coalesce(resolved_at, v_now),
        updated_at = v_now
    where id = v_invite.id
    returning * into v_invite;
  end if;

  v_effective_delivery_status := public.effective_account_invite_delivery_status(
    v_delivery.status,
    v_delivery.expires_at,
    v_delivery.revoked_at
  );
  if v_effective_delivery_status <> v_delivery.status then
    update public.account_invite_deliveries
    set status = v_effective_delivery_status,
        updated_at = v_now
    where id = v_delivery.id
    returning * into v_delivery;
  end if;

  if v_invite.status in ('accepted', 'rejected', 'canceled', 'expired')
    or v_delivery.status in ('revoked', 'expired') then
    select *
      into v_inviter
    from public.user_profiles
    where id = v_invite.inviter_user_id;

    return jsonb_build_object(
      'inviteId', v_invite.id,
      'deliveryId', v_delivery.id,
      'status', v_invite.status,
      'deliveryStatus', v_delivery.status,
      'channel', v_delivery.channel,
      'expiresAt', v_delivery.expires_at,
      'inviteExpiresAt', v_invite.expires_at,
      'resolvedAt', v_invite.resolved_at,
      'inviterDisplayName', coalesce(v_inviter.display_name, 'Persona'),
      'inviterAvatarPath', v_inviter.avatar_path,
      'intendedRecipientPhoneMasked', public.mask_phone_value(v_invite.intended_recipient_phone_e164),
      'reason', case
        when v_invite.status in ('accepted', 'rejected', 'canceled', 'expired') then v_invite.status::text
        when v_delivery.status = 'expired' then 'delivery_expired'
        else 'delivery_revoked'
      end
    );
  end if;

  if v_invite.status <> 'pending_activation'
    or v_delivery.status not in ('issued', 'authenticated')
    or (
      v_invite.activated_user_id is not null
      and (p_actor_user_id is null or v_invite.activated_user_id <> p_actor_user_id)
    )
    or (
      v_delivery.status = 'authenticated'
      and (
        p_actor_user_id is null
        or (
          v_delivery.authenticated_user_id is not null
          and v_delivery.authenticated_user_id <> p_actor_user_id
        )
      )
    ) then
    return v_unavailable;
  end if;

  update public.account_invite_deliveries
  set first_opened_at = coalesce(first_opened_at, v_now),
      last_opened_at = v_now,
      open_count = coalesce(open_count, 0) + 1,
      first_app_opened_at = case
        when p_record_app_open then coalesce(first_app_opened_at, v_now)
        else first_app_opened_at
      end,
      updated_at = v_now
  where id = v_delivery.id
  returning * into v_delivery;

  perform public.append_audit_event(
    null,
    'account_invite',
    v_invite.id,
    'account_invite_opened',
    null,
    jsonb_build_object(
      'delivery_id', v_delivery.id,
      'channel', v_delivery.channel,
      'open_count', v_delivery.open_count
    )
  );

  select *
    into v_inviter
  from public.user_profiles
  where id = v_invite.inviter_user_id;

  return jsonb_build_object(
    'inviteId', v_invite.id,
    'deliveryId', v_delivery.id,
    'status', v_invite.status,
    'deliveryStatus', v_delivery.status,
    'channel', v_delivery.channel,
    'expiresAt', v_delivery.expires_at,
    'inviteExpiresAt', v_invite.expires_at,
    'resolvedAt', null,
    'inviterDisplayName', coalesce(v_inviter.display_name, 'Persona'),
    'inviterAvatarPath', v_inviter.avatar_path,
    'intendedRecipientPhoneMasked', public.mask_phone_value(v_invite.intended_recipient_phone_e164),
    'reason', 'pending_activation'
  );
end;
$$;

revoke all on function public.get_account_invite_preview_public(text, boolean, text, uuid)
  from public, anon, authenticated;
grant execute on function public.get_account_invite_preview_public(text, boolean, text, uuid)
  to service_role;
