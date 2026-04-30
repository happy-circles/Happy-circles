create extension if not exists pgcrypto with schema extensions;

create or replace function public.hash_invite_token(p_token text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when nullif(btrim(coalesce(p_token, '')), '') is null then null
    else encode(extensions.digest(btrim(p_token), 'sha256'), 'hex')
  end
$$;

revoke all on function public.hash_invite_token(text) from public, anon, authenticated;
grant execute on function public.hash_invite_token(text) to service_role;

create or replace function public.assert_request_actor(p_actor_user_id uuid)
returns void
language plpgsql
stable
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
begin
  if v_auth_user_id is not null and v_auth_user_id <> p_actor_user_id then
    raise exception 'actor_mismatch';
  end if;
end;
$$;

revoke all on function public.assert_request_actor(uuid) from public, anon, authenticated;
grant execute on function public.assert_request_actor(uuid) to service_role;

alter table public.friendship_invite_deliveries
  add column if not exists token_hash text;

alter table public.account_invite_deliveries
  add column if not exists token_hash text;

update public.friendship_invite_deliveries
set token_hash = public.hash_invite_token(token)
where token_hash is null
  and token is not null;

update public.account_invite_deliveries
set token_hash = public.hash_invite_token(token)
where token_hash is null
  and token is not null;

do $$
begin
  if exists (
    select 1
    from public.friendship_invite_deliveries
    where token_hash is null
  ) then
    raise exception 'friendship_invite_delivery_token_hash_backfill_incomplete';
  end if;

  if exists (
    select 1
    from public.account_invite_deliveries
    where token_hash is null
  ) then
    raise exception 'account_invite_delivery_token_hash_backfill_incomplete';
  end if;
end;
$$;

alter table public.friendship_invite_deliveries
  alter column token_hash set not null;

alter table public.account_invite_deliveries
  alter column token_hash set not null;

drop trigger if exists set_friendship_invite_delivery_token_hash on public.friendship_invite_deliveries;
drop trigger if exists set_account_invite_delivery_token_hash on public.account_invite_deliveries;
drop function if exists public.set_invite_delivery_token_hash();

drop index if exists public.friendship_invite_deliveries_token_hash_unique_idx;
create unique index friendship_invite_deliveries_token_hash_unique_idx
  on public.friendship_invite_deliveries (token_hash);

drop index if exists public.account_invite_deliveries_token_hash_unique_idx;
create unique index account_invite_deliveries_token_hash_unique_idx
  on public.account_invite_deliveries (token_hash);

update public.idempotency_keys
set response_json = response_json - 'deliveryToken'
where response_json ? 'deliveryToken';

create or replace function public.create_external_friendship_invite(
  p_actor_user_id uuid,
  p_idempotency_key text,
  p_channel public.friendship_invite_channel,
  p_source_context text default null,
  p_intended_recipient_alias text default null,
  p_intended_recipient_phone_e164 text default null,
  p_intended_recipient_phone_label text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_idempotency public.idempotency_keys%rowtype;
  v_invite public.friendship_invites%rowtype;
  v_delivery public.friendship_invite_deliveries%rowtype;
  v_response jsonb;
  v_delivery_expires_at timestamptz;
  v_delivery_token text;
  v_alias text := nullif(btrim(p_intended_recipient_alias), '');
  v_phone_e164 text := nullif(btrim(p_intended_recipient_phone_e164), '');
  v_phone_label text := nullif(btrim(p_intended_recipient_phone_label), '');
  v_source_context text := nullif(btrim(p_source_context), '');
begin
  perform public.assert_request_actor(p_actor_user_id);

  if p_channel not in ('remote', 'qr') then
    raise exception 'external_channel_required';
  end if;

  if p_channel = 'remote' and (v_alias is null or v_phone_e164 is null) then
    raise exception 'contact_reference_required';
  end if;

  if not public.friendship_identity_ready(p_actor_user_id) then
    raise exception 'identity_incomplete';
  end if;

  update public.friendship_invites
  set status = 'expired',
      resolution_actor = coalesce(resolution_actor, 'system'::public.friendship_invite_resolution_actor),
      resolution_reason = coalesce(resolution_reason, 'claim_window_expired'),
      resolved_at = coalesce(resolved_at, timezone('utc', now()))
  where inviter_user_id = p_actor_user_id
    and flow = 'external'
    and status in ('pending_claim', 'pending_sender_review')
    and expires_at <= timezone('utc', now());

  update public.friendship_invite_deliveries
  set status = 'expired'
  where status = 'issued'
    and expires_at <= timezone('utc', now());

  insert into public.idempotency_keys (actor_user_id, operation_name, idempotency_key)
  values (p_actor_user_id, 'create_external_friendship_invite', p_idempotency_key)
  on conflict (actor_user_id, operation_name, idempotency_key) do nothing;

  select *
    into v_idempotency
  from public.idempotency_keys
  where actor_user_id = p_actor_user_id
    and operation_name = 'create_external_friendship_invite'
    and idempotency_key = p_idempotency_key
  for update;

  if v_idempotency.response_json is not null
    and v_idempotency.response_json ? 'deliveryToken' then
    return v_idempotency.response_json;
  end if;

  select *
    into v_invite
  from public.friendship_invites
  where inviter_user_id = p_actor_user_id
    and flow = 'external'
    and status = 'pending_claim'
    and origin_channel = p_channel
    and coalesce(intended_recipient_alias, '') = coalesce(v_alias, '')
    and coalesce(intended_recipient_phone_e164, '') = coalesce(v_phone_e164, '')
  order by created_at desc
  limit 1
  for update;

  if not found then
    insert into public.friendship_invites (
      inviter_user_id,
      flow,
      origin_channel,
      status,
      intended_recipient_alias,
      intended_recipient_phone_e164,
      intended_recipient_phone_label,
      source_context,
      expires_at
    )
    values (
      p_actor_user_id,
      'external',
      p_channel,
      'pending_claim',
      v_alias,
      v_phone_e164,
      v_phone_label,
      v_source_context,
      timezone('utc', now()) + interval '7 days'
    )
    returning * into v_invite;

    perform public.append_audit_event(
      p_actor_user_id,
      'friendship_invite',
      v_invite.id,
      'friendship_invite_created',
      null,
      jsonb_build_object(
        'flow', 'external',
        'origin_channel', p_channel,
        'source_context', v_source_context,
        'intended_recipient_alias', v_alias,
        'intended_recipient_phone_e164', v_phone_e164,
        'intended_recipient_phone_label', v_phone_label
      )
    );
  else
    update public.friendship_invites
    set intended_recipient_phone_label = coalesce(v_phone_label, intended_recipient_phone_label),
        source_context = coalesce(v_source_context, source_context)
    where id = v_invite.id
    returning * into v_invite;
  end if;

  if p_channel = 'remote' then
    v_delivery_expires_at := timezone('utc', now()) + interval '7 days';

    update public.friendship_invites
    set expires_at = v_delivery_expires_at,
        resolved_at = null,
        resolution_actor = null,
        resolution_reason = null
    where id = v_invite.id
    returning * into v_invite;
  else
    update public.friendship_invite_deliveries
    set status = 'revoked',
        revoked_at = coalesce(revoked_at, timezone('utc', now())),
        updated_at = timezone('utc', now())
    where invite_id = v_invite.id
      and channel = 'qr'
      and status = 'issued'
      and revoked_at is null;

    v_delivery_expires_at := timezone('utc', now()) + interval '10 minutes';
  end if;

  v_delivery_token := public.generate_short_token(18);

  insert into public.friendship_invite_deliveries (
    invite_id,
    token_hash,
    channel,
    source_context,
    status,
    expires_at
  )
  values (
    v_invite.id,
    public.hash_invite_token(v_delivery_token),
    p_channel,
    v_source_context,
    'issued',
    v_delivery_expires_at
  )
  returning * into v_delivery;

  perform public.append_audit_event(
    p_actor_user_id,
    'friendship_invite',
    v_invite.id,
    'friendship_invite_delivery_created',
    null,
    jsonb_build_object(
      'delivery_id', v_delivery.id,
      'channel', p_channel,
      'source_context', v_source_context,
      'intended_recipient_alias', v_alias,
      'intended_recipient_phone_e164', v_phone_e164,
      'intended_recipient_phone_label', v_phone_label,
      'expires_at', v_delivery.expires_at
    )
  );

  v_response := jsonb_build_object(
    'inviteId', v_invite.id,
    'deliveryId', v_delivery.id,
    'deliveryToken', v_delivery_token,
    'flow', v_invite.flow,
    'status', public.effective_friendship_invite_status(v_invite.status, v_invite.expires_at),
    'channel', v_delivery.channel,
    'originChannel', v_invite.origin_channel,
    'expiresAt', v_delivery.expires_at,
    'inviteExpiresAt', v_invite.expires_at,
    'intendedRecipientAlias', v_invite.intended_recipient_alias,
    'intendedRecipientPhoneE164', v_invite.intended_recipient_phone_e164,
    'intendedRecipientPhoneLabel', v_invite.intended_recipient_phone_label
  );

  update public.idempotency_keys
  set response_json = v_response - 'deliveryToken'
  where id = v_idempotency.id;

  return v_response;
end;
$$;

create or replace function public.get_friendship_invite_preview(
  p_actor_user_id uuid,
  p_delivery_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delivery public.friendship_invite_deliveries%rowtype;
  v_invite public.friendship_invites%rowtype;
  v_inviter_profile public.user_profiles%rowtype;
  v_existing_relationship_id uuid;
  v_actor_role text := 'none';
  v_flags jsonb;
  v_invite_status public.friendship_invite_status;
  v_delivery_status public.friendship_invite_delivery_status;
  v_reason text := 'ready';
begin
  perform public.assert_request_actor(p_actor_user_id);

  select *
    into v_delivery
  from public.friendship_invite_deliveries
  where token_hash = public.hash_invite_token(p_delivery_token)
  order by created_at desc
  limit 1
  for update;

  if not found then
    raise exception 'friendship_delivery_not_found';
  end if;

  select *
    into v_invite
  from public.friendship_invites
  where id = v_delivery.invite_id
  for update;

  if not found then
    raise exception 'friendship_invite_not_found';
  end if;

  v_invite_status := public.effective_friendship_invite_status(v_invite.status, v_invite.expires_at);
  v_delivery_status := public.effective_friendship_delivery_status(
    v_delivery.status,
    v_delivery.expires_at,
    v_delivery.revoked_at
  );

  if v_invite.status <> v_invite_status then
    update public.friendship_invites
    set status = v_invite_status,
        resolution_actor = coalesce(resolution_actor, 'system'::public.friendship_invite_resolution_actor),
        resolution_reason = coalesce(resolution_reason, 'expired_before_preview'),
        resolved_at = coalesce(resolved_at, timezone('utc', now()))
    where id = v_invite.id
    returning * into v_invite;
  end if;

  if v_delivery.status <> v_delivery_status then
    update public.friendship_invite_deliveries
    set status = v_delivery_status,
        revoked_at = case when v_delivery_status = 'revoked' then coalesce(revoked_at, timezone('utc', now())) else revoked_at end
    where id = v_delivery.id
    returning * into v_delivery;
  end if;

  select *
    into v_inviter_profile
  from public.user_profiles
  where id = v_invite.inviter_user_id;

  select id
    into v_existing_relationship_id
  from public.relationships
  where user_low_id = least(v_invite.inviter_user_id, p_actor_user_id)
    and user_high_id = greatest(v_invite.inviter_user_id, p_actor_user_id)
    and status = 'active';

  if p_actor_user_id = v_invite.inviter_user_id then
    v_actor_role := 'sender';
  elsif p_actor_user_id = v_invite.target_user_id then
    v_actor_role := 'recipient';
  elsif p_actor_user_id = v_invite.claimant_user_id then
    v_actor_role := 'claimant';
  end if;

  v_flags := public.friendship_identity_flags(p_actor_user_id);

  if v_invite_status in ('accepted', 'rejected', 'canceled', 'expired') then
    v_reason := v_invite_status::text;
  elsif p_actor_user_id = v_invite.inviter_user_id then
    v_reason := case
      when v_invite_status = 'pending_sender_review' then 'sender_review'
      else 'sender_view'
    end;
  elsif v_existing_relationship_id is not null then
    v_reason := 'already_connected';
  elsif not public.friendship_identity_ready(p_actor_user_id) then
    v_reason := 'identity_incomplete';
  elsif v_delivery_status = 'expired' then
    v_reason := 'expired';
  elsif v_delivery_status = 'revoked' then
    v_reason := 'delivery_revoked';
  elsif v_invite_status = 'pending_sender_review' and v_invite.claimant_user_id is not null and v_invite.claimant_user_id <> p_actor_user_id then
    v_reason := 'claimed_by_other';
  end if;

  return jsonb_build_object(
    'inviteId', v_invite.id,
    'deliveryId', v_delivery.id,
    'flow', v_invite.flow,
    'status', v_invite_status,
    'channel', v_delivery.channel,
    'originChannel', v_invite.origin_channel,
    'expiresAt', case
      when v_invite_status = 'pending_claim' then v_delivery.expires_at
      else v_invite.expires_at
    end,
    'resolvedAt', v_invite.resolved_at,
    'actorRole', v_actor_role,
    'inviterDisplayName', coalesce(v_inviter_profile.display_name, 'Persona'),
    'intendedRecipientAlias', v_invite.intended_recipient_alias,
    'intendedRecipientPhoneE164', v_invite.intended_recipient_phone_e164,
    'intendedRecipientPhoneLabel', v_invite.intended_recipient_phone_label,
    'claimantSnapshot', v_invite.claimant_snapshot,
    'identityFlags', v_flags,
    'canClaim',
      v_invite.flow = 'external'
      and v_invite_status = 'pending_claim'
      and v_delivery_status = 'issued'
      and p_actor_user_id <> v_invite.inviter_user_id
      and v_existing_relationship_id is null
      and public.friendship_identity_ready(p_actor_user_id),
    'canApprove',
      v_invite.flow = 'external'
      and v_actor_role = 'sender'
      and v_invite_status = 'pending_sender_review',
    'canReject',
      (
        v_invite.flow = 'external'
        and v_actor_role = 'sender'
        and v_invite_status = 'pending_sender_review'
      )
      or (
        v_invite.flow = 'internal'
        and v_actor_role = 'recipient'
        and v_invite_status = 'pending_recipient'
      ),
    'canRespond',
      v_invite.flow = 'internal'
      and v_actor_role = 'recipient'
      and v_invite_status = 'pending_recipient',
    'reason', v_reason
  );
end;
$$;

create or replace function public.claim_external_friendship_invite(
  p_actor_user_id uuid,
  p_idempotency_key text,
  p_delivery_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_idempotency public.idempotency_keys%rowtype;
  v_delivery public.friendship_invite_deliveries%rowtype;
  v_invite public.friendship_invites%rowtype;
  v_actor_profile public.user_profiles%rowtype;
  v_existing_relationship_id uuid;
  v_relationship_id uuid;
  v_phone_matches_intended boolean := false;
  v_response jsonb;
begin
  perform public.assert_request_actor(p_actor_user_id);

  if not public.friendship_identity_ready(p_actor_user_id) then
    raise exception 'identity_incomplete';
  end if;

  insert into public.idempotency_keys (actor_user_id, operation_name, idempotency_key)
  values (p_actor_user_id, 'claim_external_friendship_invite', p_idempotency_key)
  on conflict (actor_user_id, operation_name, idempotency_key) do nothing;

  select *
    into v_idempotency
  from public.idempotency_keys
  where actor_user_id = p_actor_user_id
    and operation_name = 'claim_external_friendship_invite'
    and idempotency_key = p_idempotency_key
  for update;

  if v_idempotency.response_json is not null then
    return v_idempotency.response_json;
  end if;

  select *
    into v_delivery
  from public.friendship_invite_deliveries
  where token_hash = public.hash_invite_token(p_delivery_token)
  order by created_at desc
  limit 1
  for update;

  if not found then
    raise exception 'friendship_delivery_not_found';
  end if;

  select *
    into v_invite
  from public.friendship_invites
  where id = v_delivery.invite_id
  for update;

  if not found then
    raise exception 'friendship_invite_not_found';
  end if;

  if public.effective_friendship_invite_status(v_invite.status, v_invite.expires_at) <> v_invite.status then
    update public.friendship_invites
    set status = public.effective_friendship_invite_status(v_invite.status, v_invite.expires_at),
        resolution_actor = coalesce(resolution_actor, 'system'::public.friendship_invite_resolution_actor),
        resolution_reason = coalesce(resolution_reason, 'expired_before_claim'),
        resolved_at = coalesce(resolved_at, timezone('utc', now()))
    where id = v_invite.id
    returning * into v_invite;
  end if;

  if public.effective_friendship_delivery_status(v_delivery.status, v_delivery.expires_at, v_delivery.revoked_at) <> v_delivery.status then
    update public.friendship_invite_deliveries
    set status = public.effective_friendship_delivery_status(v_delivery.status, v_delivery.expires_at, v_delivery.revoked_at)
    where id = v_delivery.id
    returning * into v_delivery;
  end if;

  if v_invite.flow <> 'external' then
    raise exception 'invite_not_external';
  end if;

  if v_invite.inviter_user_id = p_actor_user_id then
    raise exception 'cannot_claim_own_invite';
  end if;

  if v_invite.status <> 'pending_claim' then
    raise exception 'invite_not_pending_claim';
  end if;

  if v_delivery.status <> 'issued' then
    if v_delivery.status = 'expired' then
      raise exception 'delivery_expired';
    end if;
    raise exception 'delivery_not_available';
  end if;

  if v_invite.claimant_user_id is not null and v_invite.claimant_user_id <> p_actor_user_id then
    raise exception 'invite_already_claimed';
  end if;

  select id
    into v_existing_relationship_id
  from public.relationships
  where user_low_id = least(v_invite.inviter_user_id, p_actor_user_id)
    and user_high_id = greatest(v_invite.inviter_user_id, p_actor_user_id)
    and status = 'active';

  if v_existing_relationship_id is not null then
    raise exception 'relationship_already_exists';
  end if;

  select *
    into v_actor_profile
  from public.user_profiles
  where id = p_actor_user_id;

  if not found then
    raise exception 'actor_profile_not_found';
  end if;

  v_phone_matches_intended :=
    v_invite.intended_recipient_phone_e164 is not null
    and nullif(btrim(v_actor_profile.phone_e164), '') is not null
    and btrim(v_actor_profile.phone_e164) = btrim(v_invite.intended_recipient_phone_e164);

  update public.friendship_invite_deliveries
  set status = 'claimed',
      claimed_at = timezone('utc', now()),
      claimed_by_user_id = p_actor_user_id
  where id = v_delivery.id
  returning * into v_delivery;

  update public.friendship_invite_deliveries
  set status = 'revoked',
      revoked_at = coalesce(revoked_at, timezone('utc', now()))
  where invite_id = v_invite.id
    and id <> v_delivery.id
    and status = 'issued'
    and revoked_at is null;

  perform public.append_audit_event(
    p_actor_user_id,
    'friendship_invite',
    v_invite.id,
    'friendship_invite_claimed',
    null,
    jsonb_build_object(
      'delivery_id', v_delivery.id,
      'channel', v_delivery.channel,
      'claimed_by_user_id', p_actor_user_id,
      'auto_accepted', v_phone_matches_intended
    )
  );

  if v_phone_matches_intended then
    insert into public.relationships (user_low_id, user_high_id, status)
    values (
      least(v_invite.inviter_user_id, p_actor_user_id),
      greatest(v_invite.inviter_user_id, p_actor_user_id),
      'active'
    )
    on conflict (user_low_id, user_high_id)
    do update set status = 'active'
    returning id into v_relationship_id;

    update public.friendship_invites
    set claimant_user_id = p_actor_user_id,
        claimant_snapshot = public.build_friendship_claimant_snapshot(p_actor_user_id),
        relationship_id = v_relationship_id,
        status = 'accepted',
        resolution_actor = 'system',
        resolution_reason = 'claim_phone_match_auto_accepted',
        resolved_at = timezone('utc', now())
    where id = v_invite.id
    returning * into v_invite;

    perform public.ensure_relationship_accounts(v_relationship_id);

    perform public.append_audit_event(
      p_actor_user_id,
      'friendship_invite',
      v_invite.id,
      'friendship_invite_accepted',
      null,
      jsonb_build_object(
        'relationship_id', v_relationship_id,
        'claimed_by_user_id', p_actor_user_id,
        'resolution_reason', 'claim_phone_match_auto_accepted'
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
    update public.friendship_invites
    set claimant_user_id = p_actor_user_id,
        claimant_snapshot = public.build_friendship_claimant_snapshot(p_actor_user_id),
        status = 'pending_sender_review',
        expires_at = timezone('utc', now()) + interval '72 hours'
    where id = v_invite.id
    returning * into v_invite;

    v_response := jsonb_build_object(
      'inviteId', v_invite.id,
      'deliveryId', v_delivery.id,
      'status', v_invite.status,
      'expiresAt', v_invite.expires_at,
      'actorRole', 'claimant'
    );
  end if;

  update public.idempotency_keys
  set response_json = v_response
  where id = v_idempotency.id;

  return v_response;
end;
$$;

create or replace function public.create_account_invite(
  p_actor_user_id uuid,
  p_idempotency_key text,
  p_channel public.account_invite_channel,
  p_source_context text default null,
  p_intended_recipient_alias text default null,
  p_intended_recipient_phone_e164 text default null,
  p_intended_recipient_phone_label text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_idempotency public.idempotency_keys%rowtype;
  v_actor_profile public.user_profiles%rowtype;
  v_invite public.account_invites%rowtype;
  v_delivery public.account_invite_deliveries%rowtype;
  v_response jsonb;
  v_delivery_expires_at timestamptz;
  v_delivery_token text;
  v_alias text := nullif(btrim(p_intended_recipient_alias), '');
  v_phone_e164 text := nullif(btrim(p_intended_recipient_phone_e164), '');
  v_phone_label text := nullif(btrim(p_intended_recipient_phone_label), '');
  v_source_context text := nullif(btrim(p_source_context), '');
begin
  perform public.assert_request_actor(p_actor_user_id);

  if p_channel not in ('remote', 'qr') then
    raise exception 'account_invite_channel_required';
  end if;

  if v_phone_e164 is null then
    raise exception 'contact_phone_required';
  end if;

  select *
    into v_actor_profile
  from public.user_profiles
  where id = p_actor_user_id;

  if not found then
    raise exception 'actor_profile_not_found';
  end if;

  if v_actor_profile.account_access_state <> 'active' then
    raise exception 'actor_account_not_active';
  end if;

  if not public.friendship_identity_ready(p_actor_user_id) then
    raise exception 'identity_incomplete';
  end if;

  if nullif(btrim(v_actor_profile.phone_e164), '') is not null
    and btrim(v_actor_profile.phone_e164) = v_phone_e164 then
    raise exception 'cannot_invite_self';
  end if;

  update public.account_invites
  set status = 'expired',
      resolution_actor = coalesce(resolution_actor, 'system'),
      resolution_reason = coalesce(resolution_reason, 'activation_window_expired'),
      resolved_at = coalesce(resolved_at, timezone('utc', now())),
      updated_at = timezone('utc', now())
  where inviter_user_id = p_actor_user_id
    and status in ('pending_activation', 'pending_inviter_review')
    and expires_at <= timezone('utc', now());

  update public.account_invite_deliveries
  set status = 'expired',
      updated_at = timezone('utc', now())
  where status = 'issued'
    and expires_at <= timezone('utc', now());

  insert into public.idempotency_keys (actor_user_id, operation_name, idempotency_key)
  values (p_actor_user_id, 'create_account_invite', p_idempotency_key)
  on conflict (actor_user_id, operation_name, idempotency_key) do nothing;

  select *
    into v_idempotency
  from public.idempotency_keys
  where actor_user_id = p_actor_user_id
    and operation_name = 'create_account_invite'
    and idempotency_key = p_idempotency_key
  for update;

  if v_idempotency.response_json is not null
    and v_idempotency.response_json ? 'deliveryToken' then
    return v_idempotency.response_json;
  end if;

  select *
    into v_invite
  from public.account_invites
  where inviter_user_id = p_actor_user_id
    and coalesce(intended_recipient_phone_e164, '') = coalesce(v_phone_e164, '')
    and status in ('pending_activation', 'pending_inviter_review')
  order by created_at desc
  limit 1
  for update;

  if not found then
    insert into public.account_invites (
      inviter_user_id,
      status,
      intended_recipient_alias,
      intended_recipient_phone_e164,
      intended_recipient_phone_label,
      source_context,
      expires_at
    )
    values (
      p_actor_user_id,
      'pending_activation',
      v_alias,
      v_phone_e164,
      v_phone_label,
      v_source_context,
      timezone('utc', now()) + interval '7 days'
    )
    returning * into v_invite;

    perform public.append_audit_event(
      p_actor_user_id,
      'account_invite',
      v_invite.id,
      'account_invite_created',
      null,
      jsonb_build_object(
        'origin_channel', p_channel,
        'source_context', v_source_context,
        'intended_recipient_alias', v_alias,
        'intended_recipient_phone_e164', v_phone_e164,
        'intended_recipient_phone_label', v_phone_label
      )
    );
  else
    update public.account_invites
    set intended_recipient_alias = coalesce(v_alias, intended_recipient_alias),
        intended_recipient_phone_label = coalesce(v_phone_label, intended_recipient_phone_label),
        source_context = coalesce(v_source_context, source_context),
        updated_at = timezone('utc', now())
    where id = v_invite.id
    returning * into v_invite;
  end if;

  if p_channel = 'remote' then
    v_delivery_expires_at := timezone('utc', now()) + interval '7 days';
  else
    update public.account_invite_deliveries
    set status = 'revoked',
        revoked_at = coalesce(revoked_at, timezone('utc', now())),
        updated_at = timezone('utc', now())
    where invite_id = v_invite.id
      and channel = 'qr'
      and status = 'issued'
      and revoked_at is null;

    v_delivery_expires_at := timezone('utc', now()) + interval '10 minutes';
  end if;

  update public.account_invites
  set expires_at = greatest(expires_at, v_delivery_expires_at),
      updated_at = timezone('utc', now())
  where id = v_invite.id
  returning * into v_invite;

  v_delivery_token := public.generate_short_token(18);

  insert into public.account_invite_deliveries (
    invite_id,
    token_hash,
    channel,
    source_context,
    status,
    expires_at
  )
  values (
    v_invite.id,
    public.hash_invite_token(v_delivery_token),
    p_channel,
    v_source_context,
    'issued',
    v_delivery_expires_at
  )
  returning * into v_delivery;

  perform public.append_audit_event(
    p_actor_user_id,
    'account_invite',
    v_invite.id,
    'account_invite_delivery_created',
    null,
    jsonb_build_object(
      'delivery_id', v_delivery.id,
      'channel', p_channel,
      'source_context', v_source_context,
      'expires_at', v_delivery.expires_at
    )
  );

  v_response := jsonb_build_object(
    'inviteId', v_invite.id,
    'deliveryId', v_delivery.id,
    'deliveryToken', v_delivery_token,
    'status', public.effective_account_invite_status(v_invite.status, v_invite.expires_at),
    'channel', v_delivery.channel,
    'originChannel', p_channel,
    'expiresAt', v_delivery.expires_at,
    'inviteExpiresAt', v_invite.expires_at,
    'intendedRecipientAlias', v_invite.intended_recipient_alias,
    'intendedRecipientPhoneE164', v_invite.intended_recipient_phone_e164,
    'intendedRecipientPhoneLabel', v_invite.intended_recipient_phone_label
  );

  update public.idempotency_keys
  set response_json = v_response - 'deliveryToken'
  where id = v_idempotency.id;

  return v_response;
end;
$$;

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

  perform public.append_audit_event(
    p_actor_user_id,
    'account_invite',
    v_invite.id,
    'account_invite_authenticated',
    null,
    jsonb_build_object(
      'delivery_id', v_delivery.id,
      'authenticated_user_id', p_actor_user_id
    )
  );

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

drop view if exists public.v_friendship_invite_deliveries_live;
create view public.v_friendship_invite_deliveries_live
with (security_invoker = true)
as
select
  delivery.id,
  delivery.invite_id,
  delivery.channel,
  delivery.source_context,
  public.effective_friendship_delivery_status(
    delivery.status,
    delivery.expires_at,
    delivery.revoked_at
  ) as status,
  delivery.created_at,
  delivery.updated_at,
  delivery.expires_at,
  delivery.claimed_at,
  delivery.claimed_by_user_id,
  delivery.revoked_at
from public.friendship_invite_deliveries delivery;

drop view if exists public.v_account_invite_deliveries_live;
create view public.v_account_invite_deliveries_live
with (security_invoker = true)
as
select
  delivery.id,
  delivery.invite_id,
  delivery.channel,
  delivery.source_context,
  public.effective_account_invite_delivery_status(
    delivery.status,
    delivery.expires_at,
    delivery.revoked_at
  ) as status,
  delivery.expires_at,
  delivery.revoked_at,
  delivery.first_opened_at,
  delivery.last_opened_at,
  delivery.open_count,
  delivery.first_app_opened_at,
  delivery.authenticated_user_id,
  delivery.authenticated_at,
  delivery.activation_completed_at,
  delivery.created_at,
  delivery.updated_at
from public.account_invite_deliveries delivery;

alter view public.v_friendship_invites_live set (security_invoker = true);
alter view public.v_account_invites_live set (security_invoker = true);

grant select on public.v_friendship_invite_deliveries_live to authenticated;
grant select on public.v_account_invite_deliveries_live to authenticated;
grant select on public.v_friendship_invites_live to authenticated;
grant select on public.v_account_invites_live to authenticated;

drop index if exists public.friendship_invite_deliveries_token_unique_idx;
drop index if exists public.account_invite_deliveries_token_unique_idx;

alter table public.friendship_invite_deliveries
  drop column if exists token;

alter table public.account_invite_deliveries
  drop column if exists token;

create table if not exists public.public_invite_preview_rate_limits (
  token_hash text not null,
  client_fingerprint_hash text not null,
  window_started_at timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (token_hash, client_fingerprint_hash, window_started_at)
);

alter table public.public_invite_preview_rate_limits enable row level security;
revoke all on public.public_invite_preview_rate_limits from public, anon, authenticated;
grant select, insert, update on public.public_invite_preview_rate_limits to service_role;

drop function if exists public.get_account_invite_preview_public(text, boolean);
create or replace function public.get_account_invite_preview_public(
  p_delivery_token text,
  p_record_app_open boolean default true,
  p_client_fingerprint_hash text default null
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
    or v_delivery.status not in ('issued', 'authenticated') then
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

revoke all on function public.get_account_invite_preview_public(text, boolean, text)
  from public, anon, authenticated;
grant execute on function public.get_account_invite_preview_public(text, boolean, text)
  to service_role;

do $$
declare
  v_function record;
begin
  for v_function in
    select p.oid::regprocedure as function_signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and exists (
        select 1
        from unnest(coalesce(p.proargnames, array[]::text[])) as arg_name
        where arg_name = 'p_actor_user_id'
      )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', v_function.function_signature);
    execute format('grant execute on function %s to service_role', v_function.function_signature);
  end loop;
end;
$$;

drop policy if exists app_settings_select_authenticated on public.app_settings;
drop policy if exists app_settings_select_public on public.app_settings;
drop policy if exists app_settings_select_public_allowlist on public.app_settings;
create policy app_settings_select_public_allowlist
on public.app_settings
for select
to authenticated, anon
using (key in ('currency', 'app_web_origin', 'mobile_min_supported_version'));

create or replace view public.v_user_profiles_private
with (security_invoker = true)
as
select
  id,
  email,
  display_name,
  avatar_path,
  account_access_state,
  invited_by_user_id,
  activated_via_account_invite_id,
  activated_at,
  phone_country_iso2,
  phone_country_calling_code,
  phone_national_number,
  phone_e164,
  phone_verified_at,
  created_at,
  updated_at
from public.user_profiles
where id = auth.uid();

create or replace view public.v_user_profiles_visible
with (security_invoker = true)
as
select
  id,
  display_name,
  avatar_path,
  account_access_state,
  created_at,
  updated_at
from public.user_profiles
where id = auth.uid()
  or exists (
    select 1
    from public.relationships relationship
    where relationship.status = 'active'
      and (
        (relationship.user_low_id = auth.uid() and relationship.user_high_id = user_profiles.id)
        or
        (relationship.user_high_id = auth.uid() and relationship.user_low_id = user_profiles.id)
      )
  );

grant select on public.v_user_profiles_private to authenticated;
grant select on public.v_user_profiles_visible to authenticated;
