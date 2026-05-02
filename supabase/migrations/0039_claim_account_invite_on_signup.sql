create or replace function public.claim_account_invite_for_registration_hash(
  p_user_id uuid,
  p_delivery_token_hash text,
  p_email text,
  p_phone_e164 text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_delivery public.account_invite_deliveries%rowtype;
  v_invite public.account_invites%rowtype;
  v_profile public.user_profiles%rowtype;
  v_now timestamptz := timezone('utc', now());
  v_delivery_token_hash text := nullif(btrim(p_delivery_token_hash), '');
  v_effective_invite_status public.account_invite_status;
  v_effective_delivery_status text;
  v_was_authenticated boolean := false;
begin
  if p_user_id is null then
    raise exception 'invalid_user_id';
  end if;

  if v_delivery_token_hash is null then
    return null;
  end if;

  if v_delivery_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_account_invite_delivery_token_hash';
  end if;

  select *
    into v_profile
  from public.user_profiles
  where id = p_user_id
  for update;

  if not found then
    raise exception 'actor_profile_not_found';
  end if;

  if lower(btrim(coalesce(v_profile.email, ''))) <> lower(btrim(coalesce(p_email, ''))) then
    raise exception 'actor_mismatch';
  end if;

  if btrim(coalesce(v_profile.phone_e164, '')) <> btrim(coalesce(p_phone_e164, '')) then
    raise exception 'actor_mismatch';
  end if;

  select *
    into v_delivery
  from public.account_invite_deliveries
  where token_hash = v_delivery_token_hash
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

  v_effective_invite_status :=
    public.effective_account_invite_status(v_invite.status, v_invite.expires_at);

  if v_effective_invite_status <> v_invite.status then
    update public.account_invites
    set status = v_effective_invite_status,
        resolution_actor = coalesce(resolution_actor, 'system'),
        resolution_reason = coalesce(resolution_reason, 'expired_before_registration_claim'),
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

  if v_invite.inviter_user_id = p_user_id then
    raise exception 'cannot_activate_own_invite';
  end if;

  if v_invite.status <> 'pending_activation' then
    raise exception 'account_invite_not_open';
  end if;

  if v_delivery.status not in ('issued', 'authenticated') then
    if v_delivery.status = 'expired' then
      raise exception 'account_invite_delivery_expired';
    end if;
    raise exception 'account_invite_delivery_not_available';
  end if;

  if v_invite.activated_user_id is not null
    and v_invite.activated_user_id <> p_user_id then
    raise exception 'account_invite_already_used';
  end if;

  if v_delivery.authenticated_user_id is not null
    and v_delivery.authenticated_user_id <> p_user_id then
    raise exception 'account_invite_already_used';
  end if;

  v_was_authenticated :=
    v_delivery.status = 'authenticated'
    and v_delivery.authenticated_user_id = p_user_id;

  update public.account_invites
  set activated_user_id = coalesce(activated_user_id, p_user_id),
      updated_at = v_now
  where id = v_invite.id
  returning * into v_invite;

  update public.account_invite_deliveries
  set status = 'authenticated',
      authenticated_user_id = coalesce(authenticated_user_id, p_user_id),
      authenticated_at = coalesce(authenticated_at, v_now),
      updated_at = v_now
  where id = v_delivery.id
  returning * into v_delivery;

  update public.account_invite_deliveries
  set status = 'revoked',
      revoked_at = coalesce(revoked_at, v_now),
      updated_at = v_now
  where invite_id = v_invite.id
    and id <> v_delivery.id
    and status in ('issued', 'authenticated')
    and revoked_at is null;

  if not v_was_authenticated then
    perform public.append_audit_event(
      p_user_id,
      'account_invite',
      v_invite.id,
      'account_invite_authenticated',
      null,
      jsonb_build_object(
        'delivery_id', v_delivery.id,
        'authenticated_user_id', p_user_id,
        'claim_stage', 'registration'
      )
    );
  end if;

  return jsonb_build_object(
    'inviteId', v_invite.id,
    'deliveryId', v_delivery.id,
    'status', v_invite.status,
    'deliveryStatus', v_delivery.status,
    'authenticatedUserId', v_delivery.authenticated_user_id,
    'authenticatedAt', v_delivery.authenticated_at
  );
end;
$$;

revoke all on function public.claim_account_invite_for_registration_hash(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.claim_account_invite_for_registration_hash(uuid, text, text, text)
  to service_role;

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
  v_relationship_id uuid;
  v_now timestamptz := timezone('utc', now());
  v_phone_matches boolean := false;
  v_response jsonb;
begin
  perform public.assert_request_actor(p_actor_user_id);
  perform nullif(btrim(p_current_device_id), '');

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

  if nullif(btrim(v_actor_profile.avatar_path), '') is null then
    raise exception 'activation_avatar_required';
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

drop function if exists public.get_account_invite_preview_public(text, boolean, text);
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

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone_country_iso2 text;
  v_phone_country_calling_code text;
  v_phone_national_number text;
  v_phone_e164 text;
  v_account_invite_delivery_token_hash text;
begin
  v_phone_country_iso2 := nullif(upper(coalesce(new.raw_user_meta_data ->> 'phone_country_iso2', '')), '');
  v_phone_country_calling_code := nullif(coalesce(new.raw_user_meta_data ->> 'phone_country_calling_code', ''), '');
  v_phone_national_number := nullif(coalesce(new.raw_user_meta_data ->> 'phone_national_number', ''), '');
  v_phone_e164 := nullif(coalesce(new.raw_user_meta_data ->> 'phone_e164', ''), '');
  v_account_invite_delivery_token_hash :=
    nullif(coalesce(new.raw_user_meta_data ->> 'account_invite_delivery_token_hash', ''), '');

  insert into public.user_profiles (
    id,
    email,
    display_name,
    phone_country_iso2,
    phone_country_calling_code,
    phone_national_number,
    phone_e164,
    account_access_state
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    v_phone_country_iso2,
    v_phone_country_calling_code,
    v_phone_national_number,
    v_phone_e164,
    'needs_invite'
  )
  on conflict (id) do update
  set email = excluded.email,
      display_name = excluded.display_name,
      phone_country_iso2 = coalesce(excluded.phone_country_iso2, public.user_profiles.phone_country_iso2),
      phone_country_calling_code = coalesce(excluded.phone_country_calling_code, public.user_profiles.phone_country_calling_code),
      phone_national_number = coalesce(excluded.phone_national_number, public.user_profiles.phone_national_number),
      phone_e164 = coalesce(excluded.phone_e164, public.user_profiles.phone_e164);

  if v_account_invite_delivery_token_hash is not null then
    perform public.claim_account_invite_for_registration_hash(
      new.id,
      v_account_invite_delivery_token_hash,
      new.email,
      v_phone_e164
    );
  end if;

  return new;
end;
$$;
