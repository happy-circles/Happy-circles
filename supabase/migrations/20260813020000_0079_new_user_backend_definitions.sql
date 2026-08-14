-- New-user backend hardening functions and ACL definitions.
-- This migration is deliberately additive: legacy RPC signatures remain available,
-- while sensitive state transitions are moved behind service-role-only functions.

set local lock_timeout = '10s';
set local statement_timeout = '60s';

-- Changing a phone invalidates OTP proof. Until an SMS verifier exists, Phase A
-- preserves production behavior by treating the replacement as a legacy identity.
create or replace function public.clear_phone_verification_on_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if nullif(btrim(new.phone_e164), '') is null then
      new.phone_verified_at := null;
      new.phone_identity_legacy_at := null;
    elsif new.phone_verified_at is null then
      new.phone_identity_legacy_at := coalesce(
        new.phone_identity_legacy_at,
        timezone('utc', now())
      );
    else
      new.phone_identity_legacy_at := null;
    end if;
  elsif new.phone_e164 is distinct from old.phone_e164 then
    if nullif(btrim(new.phone_e164), '') is null then
      new.phone_verified_at := null;
      new.phone_identity_legacy_at := null;
    elsif current_user in ('authenticated', 'anon')
      or new.phone_verified_at is null
      or new.phone_verified_at is not distinct from old.phone_verified_at then
      new.phone_verified_at := null;
      new.phone_identity_legacy_at := timezone('utc', now());
    else
      new.phone_identity_legacy_at := null;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.clear_phone_verification_on_change() from public, anon, authenticated;

-- Internal onboarding/claim/lease fields are not selectable from user_profiles.
-- This no-argument RPC exposes exactly one caller-owned row and cannot be used
-- to probe another profile identifier.
create or replace function public.get_current_user_private_profile()
returns table (
  id uuid,
  email text,
  display_name text,
  avatar_path text,
  account_access_state public.account_access_state,
  invited_by_user_id uuid,
  activated_via_account_invite_id uuid,
  activated_at timestamptz,
  pending_account_invite_id uuid,
  pending_account_invite_delivery_id uuid,
  account_invite_claimed_at timestamptz,
  account_invite_claim_expires_at timestamptz,
  phone_country_iso2 text,
  phone_country_calling_code text,
  phone_national_number text,
  phone_e164 text,
  phone_identity_legacy_at timestamptz,
  phone_verified_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  deletion_requested_at timestamptz,
  deleted_at timestamptz,
  onboarding_completed_at timestamptz,
  welcome_email_queued_at timestamptz,
  welcome_email_sent_at timestamptz,
  welcome_email_last_error text,
  welcome_email_lease_id uuid
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    profile.id,
    profile.email,
    profile.display_name,
    profile.avatar_path,
    profile.account_access_state,
    profile.invited_by_user_id,
    profile.activated_via_account_invite_id,
    profile.activated_at,
    profile.pending_account_invite_id,
    profile.pending_account_invite_delivery_id,
    profile.account_invite_claimed_at,
    profile.account_invite_claim_expires_at,
    profile.phone_country_iso2,
    profile.phone_country_calling_code,
    profile.phone_national_number,
    profile.phone_e164,
    profile.phone_identity_legacy_at,
    profile.phone_verified_at,
    profile.created_at,
    profile.updated_at,
    profile.deletion_requested_at,
    profile.deleted_at,
    profile.onboarding_completed_at,
    profile.welcome_email_queued_at,
    profile.welcome_email_sent_at,
    profile.welcome_email_last_error,
    profile.welcome_email_lease_id
  from public.user_profiles profile
  where profile.id = (select auth.uid())
  limit 1;
$$;

revoke all on function public.get_current_user_private_profile()
  from public, anon, authenticated;
grant execute on function public.get_current_user_private_profile()
  to authenticated;

create or replace function public.mark_profile_phone_verified(
  p_actor_user_id uuid,
  p_phone_e164 text
)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_verified_at timestamptz := timezone('utc', now());
begin
  perform public.assert_request_actor(p_actor_user_id);

  update public.user_profiles
  set phone_verified_at = v_verified_at,
      phone_identity_legacy_at = null
  where id = p_actor_user_id
    and nullif(btrim(phone_e164), '') = nullif(btrim(p_phone_e164), '');

  if not found then
    raise exception 'phone_verification_target_mismatch';
  end if;

  return v_verified_at;
end;
$$;

revoke all on function public.mark_profile_phone_verified(uuid, text)
  from public, anon, authenticated;
grant execute on function public.mark_profile_phone_verified(uuid, text) to service_role;

create or replace function public.profile_phone_identity_ready(
  p_profile public.user_profiles
)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select p_profile.phone_e164 is not null
    and (
      p_profile.phone_verified_at is not null
      or p_profile.phone_identity_legacy_at is not null
    );
$$;

revoke all on function public.profile_phone_identity_ready(public.user_profiles)
  from public, anon, authenticated;
grant execute on function public.profile_phone_identity_ready(public.user_profiles)
  to service_role;

create or replace function public.touch_current_device(
  p_actor_user_id uuid,
  p_device_id text,
  p_platform text,
  p_device_name text default null,
  p_app_version text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_device public.trusted_devices%rowtype;
  v_device_id text := nullif(btrim(p_device_id), '');
  v_platform text := nullif(btrim(p_platform), '');
begin
  perform public.assert_request_actor(p_actor_user_id);
  if v_device_id is null or length(v_device_id) > 256 then
    raise exception 'invalid_device_id';
  end if;
  if v_platform is null or length(v_platform) > 64 then
    raise exception 'invalid_platform';
  end if;

  insert into public.trusted_devices (
    user_id, device_id, platform, device_name, app_version, trust_state, last_seen_at
  )
  values (
    p_actor_user_id,
    v_device_id,
    v_platform,
    left(nullif(btrim(p_device_name), ''), 160),
    left(nullif(btrim(p_app_version), ''), 80),
    'pending',
    timezone('utc', now())
  )
  on conflict (user_id, device_id) do update
  set platform = excluded.platform,
      device_name = coalesce(excluded.device_name, public.trusted_devices.device_name),
      app_version = coalesce(excluded.app_version, public.trusted_devices.app_version),
      last_seen_at = excluded.last_seen_at,
      -- A new client progressively retires an unbound legacy trust when that
      -- exact device next checks in. Installed clients are not reset en masse.
      trust_state = case
        when public.trusted_devices.trust_state = 'trusted'
          and public.trusted_devices.trusted_session_id is null
          then 'pending'
        else public.trusted_devices.trust_state
      end,
      trusted_at = case
        when public.trusted_devices.trust_state = 'trusted'
          and public.trusted_devices.trusted_session_id is null
          then null
        else public.trusted_devices.trusted_at
      end,
      revoked_at = case
        when public.trusted_devices.trust_state = 'trusted'
          and public.trusted_devices.trusted_session_id is null
          then null
        else public.trusted_devices.revoked_at
      end
  returning * into v_device;

  return jsonb_build_object(
    'deviceId', v_device.device_id,
    'trustState', v_device.trust_state,
    'trustedAt', v_device.trusted_at,
    'revokedAt', v_device.revoked_at,
    'lastSeenAt', v_device.last_seen_at
  );
end;
$$;

create or replace function public.trust_current_device(
  p_actor_user_id uuid,
  p_device_id text,
  p_platform text,
  p_device_name text,
  p_app_version text,
  p_session_id text,
  p_proof_method text,
  p_proof_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_device public.trusted_devices%rowtype;
  v_now timestamptz := timezone('utc', now());
  v_proof_method text := nullif(btrim(p_proof_method), '');
begin
  perform public.assert_request_actor(p_actor_user_id);
  if nullif(btrim(p_device_id), '') is null
    or length(btrim(p_device_id)) > 256
    or nullif(btrim(p_platform), '') is null
    or length(btrim(p_platform)) > 64
    or length(btrim(coalesce(p_device_name, ''))) > 160
    or length(btrim(coalesce(p_app_version, ''))) > 80
    or nullif(btrim(p_session_id), '') is null
    or length(btrim(p_session_id)) > 256
    or v_proof_method is null
    or v_proof_method not in ('aal2', 'oauth', 'otp', 'password')
    or p_proof_at is null
    or p_proof_at > v_now + interval '1 minute'
    or (v_proof_method <> 'aal2' and p_proof_at < v_now - interval '5 minutes') then
    raise exception 'recent_auth_required';
  end if;

  insert into public.trusted_devices (
    user_id, device_id, platform, device_name, app_version,
    trust_state, trusted_at, last_seen_at,
    trusted_session_id, trust_proof_method, trust_proof_at
  )
  values (
    p_actor_user_id,
    btrim(p_device_id),
    btrim(p_platform),
    left(nullif(btrim(p_device_name), ''), 160),
    left(nullif(btrim(p_app_version), ''), 80),
    'trusted',
    v_now,
    v_now,
    btrim(p_session_id),
    v_proof_method,
    p_proof_at
  )
  on conflict (user_id, device_id) do update
  set platform = excluded.platform,
      device_name = coalesce(excluded.device_name, public.trusted_devices.device_name),
      app_version = coalesce(excluded.app_version, public.trusted_devices.app_version),
      trust_state = 'trusted',
      trusted_at = v_now,
      revoked_at = null,
      last_seen_at = v_now,
      trusted_session_id = excluded.trusted_session_id,
      trust_proof_method = excluded.trust_proof_method,
      trust_proof_at = excluded.trust_proof_at
  returning * into v_device;

  perform public.append_audit_event(
    p_actor_user_id, 'trusted_device', v_device.id, 'trusted_device_trusted', null,
    jsonb_build_object('device_id', v_device.device_id, 'proof_method', v_proof_method)
  );

  return jsonb_build_object(
    'deviceId', v_device.device_id,
    'trustState', v_device.trust_state,
    'trustedAt', v_device.trusted_at
  );
end;
$$;

create or replace function public.revoke_trusted_device(
  p_actor_user_id uuid,
  p_device_id text,
  p_current_device_id text,
  p_current_session_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_device public.trusted_devices%rowtype;
begin
  perform public.assert_request_actor(p_actor_user_id);

  if not exists (
    select 1 from public.trusted_devices
    where user_id = p_actor_user_id
      and device_id = nullif(btrim(p_current_device_id), '')
      and trust_state = 'trusted'
      and trusted_session_id = nullif(btrim(p_current_session_id), '')
  ) then
    raise exception 'trusted_origin_required';
  end if;

  update public.trusted_devices
  set trust_state = 'revoked',
      revoked_at = timezone('utc', now()),
      trusted_at = null,
      trusted_session_id = null,
      trust_proof_method = null,
      trust_proof_at = null
  where user_id = p_actor_user_id
    and device_id = nullif(btrim(p_device_id), '')
  returning * into v_device;

  if not found then
    raise exception 'device_not_found';
  end if;

  perform public.append_audit_event(
    p_actor_user_id, 'trusted_device', v_device.id, 'trusted_device_revoked', null,
    jsonb_build_object('device_id', v_device.device_id)
  );

  return jsonb_build_object(
    'deviceId', v_device.device_id,
    'trustState', v_device.trust_state,
    'revokedAt', v_device.revoked_at
  );
end;
$$;

revoke all on function public.touch_current_device(uuid, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.trust_current_device(uuid, text, text, text, text, text, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.revoke_trusted_device(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.touch_current_device(uuid, text, text, text, text) to service_role;
grant execute on function public.trust_current_device(uuid, text, text, text, text, text, text, timestamptz) to service_role;
grant execute on function public.revoke_trusted_device(uuid, text, text, text) to service_role;

-- Deterministic, secret-backed invite delivery tokens make a successful create
-- request replayable without storing the raw bearer token in application tables.
insert into app_private.backend_secrets (name, secret)
values ('account_invite_delivery_hmac_v1', extensions.gen_random_bytes(32))
on conflict (name) do nothing;

create or replace function app_private.derive_account_invite_delivery_token(
  p_actor_user_id uuid,
  p_idempotency_key text,
  p_request_hash text
)
returns text
language sql
stable
security definer
set search_path = app_private, extensions, pg_temp
as $$
  select encode(
    extensions.hmac(
      convert_to(p_actor_user_id::text || '|' || p_idempotency_key || '|' || p_request_hash, 'UTF8'),
      secret,
      'sha256'
    ),
    'hex'
  )
  from app_private.backend_secrets
  where name = 'account_invite_delivery_hmac_v1';
$$;

revoke all on function app_private.derive_account_invite_delivery_token(uuid, text, text)
  from public, anon, authenticated;
grant execute on function app_private.derive_account_invite_delivery_token(uuid, text, text)
  to service_role;

create or replace function public.release_stale_account_invite_claims(
  p_limit integer default 100
)
returns integer
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_record record;
  v_released integer := 0;
  v_now timestamptz := timezone('utc', now());
begin
  for v_record in
    select invite.id as invite_id,
           delivery.id as delivery_id,
           delivery.authenticated_user_id as user_id
    from public.account_invites invite
    join public.account_invite_deliveries delivery
      on delivery.invite_id = invite.id
     and delivery.authenticated_user_id = invite.activated_user_id
    join public.user_profiles claimant
      on claimant.id = delivery.authenticated_user_id
     and claimant.account_access_state = 'needs_activation'
     and claimant.pending_account_invite_id = invite.id
     and claimant.pending_account_invite_delivery_id = delivery.id
    where invite.status = 'pending_activation'
      and invite.activated_user_id is not null
      and delivery.status = 'authenticated'
      and delivery.claim_expires_at < v_now
    order by invite.id
    limit greatest(1, least(coalesce(p_limit, 100), 1000))
    for update of invite skip locked
  loop
    -- Every invite workflow takes locks in invite -> delivery order.
    perform 1
    from public.account_invite_deliveries
    where id = v_record.delivery_id
    for update;

    update public.account_invite_deliveries
    set status = 'revoked',
        revoked_at = coalesce(revoked_at, v_now),
        claim_expires_at = null,
        updated_at = v_now
    where id = v_record.delivery_id
      and status = 'authenticated';

    if not found then
      continue;
    end if;

    update public.account_invites
    set activated_user_id = null,
        updated_at = v_now
    where id = v_record.invite_id
      and status = 'pending_activation'
      and activated_user_id = v_record.user_id;

    update public.user_profiles
    set account_access_state = 'needs_invite',
        pending_account_invite_id = null,
        pending_account_invite_delivery_id = null,
        account_invite_claimed_at = null,
        account_invite_claim_expires_at = null
    where id = v_record.user_id
      and account_access_state = 'needs_activation'
      and pending_account_invite_delivery_id = v_record.delivery_id;

    perform public.append_audit_event(
      v_record.user_id,
      'account_invite',
      v_record.invite_id,
      'account_invite_claim_released',
      null,
      jsonb_build_object('delivery_id', v_record.delivery_id, 'reason', 'claim_expired_before_activation')
    );
    v_released := v_released + 1;
  end loop;

  return v_released;
end;
$$;

create or replace function public.release_stale_account_invite_claim_for_phone(
  p_inviter_user_id uuid,
  p_phone_e164 text
)
returns integer
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_invite public.account_invites%rowtype;
  v_delivery public.account_invite_deliveries%rowtype;
  v_now timestamptz := timezone('utc', now());
begin
  select * into v_invite
  from public.account_invites
  where inviter_user_id = p_inviter_user_id
    and intended_recipient_phone_e164 = nullif(btrim(p_phone_e164), '')
    and status = 'pending_activation'
    and activated_user_id is not null
  order by created_at desc
  limit 1
  for update;
  if not found then return 0; end if;

  select * into v_delivery
  from public.account_invite_deliveries
  where invite_id = v_invite.id
    and authenticated_user_id = v_invite.activated_user_id
    and status = 'authenticated'
    and claim_expires_at < v_now
  order by authenticated_at desc
  limit 1
  for update;
  if not found then return 0; end if;

  if not exists (
    select 1
    from public.user_profiles claimant
    where claimant.id = v_delivery.authenticated_user_id
      and claimant.account_access_state = 'needs_activation'
      and claimant.pending_account_invite_id = v_invite.id
      and claimant.pending_account_invite_delivery_id = v_delivery.id
  ) then
    return 0;
  end if;

  update public.account_invite_deliveries
  set status = 'revoked', revoked_at = coalesce(revoked_at, v_now),
      claim_expires_at = null, updated_at = v_now
  where id = v_delivery.id;
  update public.account_invites
  set activated_user_id = null, updated_at = v_now
  where id = v_invite.id and activated_user_id = v_delivery.authenticated_user_id;
  update public.user_profiles
  set account_access_state = 'needs_invite',
      pending_account_invite_id = null,
      pending_account_invite_delivery_id = null,
      account_invite_claimed_at = null,
      account_invite_claim_expires_at = null
  where id = v_delivery.authenticated_user_id
    and account_access_state = 'needs_activation'
    and pending_account_invite_delivery_id = v_delivery.id;

  perform public.append_audit_event(
    v_delivery.authenticated_user_id,
    'account_invite', v_invite.id, 'account_invite_claim_released', null,
    jsonb_build_object('delivery_id', v_delivery.id, 'reason', 'claim_expired_before_activation')
  );
  return 1;
end;
$$;

revoke all on function public.release_stale_account_invite_claims(integer)
  from public, anon, authenticated;
revoke all on function public.release_stale_account_invite_claim_for_phone(uuid, text)
  from public, anon, authenticated;
grant execute on function public.release_stale_account_invite_claims(integer) to service_role;
grant execute on function public.release_stale_account_invite_claim_for_phone(uuid, text)
  to service_role;

-- Materialize claims created by the pre-0073 signup trigger before the new
-- pending-reference columns existed. Ambiguous ownership aborts the migration;
-- every unambiguous in-flight claimant receives one bounded 24-hour rollout grace.
create or replace function app_private.backfill_legacy_account_invite_claims()
returns jsonb
language plpgsql
security definer
set search_path = public, auth, app_private, pg_temp
as $$
declare
  v_expected_count integer := 0;
  v_delivery_count integer := 0;
  v_profile_count integer := 0;
  v_expected_stale integer := 0;
  v_released_count integer := 0;
  v_batch_count integer := 0;
  v_now timestamptz := timezone('utc', now());
begin
  lock table public.account_invites in exclusive mode;
  lock table public.account_invite_deliveries in exclusive mode;
  lock table public.user_profiles in exclusive mode;

  if exists (
    select 1
    from public.account_invites invite
    left join public.account_invite_deliveries delivery
      on delivery.invite_id = invite.id
     and delivery.authenticated_user_id = invite.activated_user_id
     and delivery.status = 'authenticated'
     and delivery.revoked_at is null
    where invite.status = 'pending_activation'
      and invite.activated_user_id is not null
    group by invite.id
    having count(delivery.id) <> 1
  ) then
    raise exception 'legacy_account_invite_claim_delivery_conflict';
  end if;

  if exists (
    select 1
    from public.account_invites invite
    where invite.status = 'pending_activation'
      and invite.activated_user_id is not null
    group by invite.activated_user_id
    having count(*) <> 1
  ) then
    raise exception 'legacy_account_invite_claim_actor_conflict';
  end if;

  if exists (
    select 1
    from public.account_invites invite
    join public.account_invite_deliveries delivery
      on delivery.invite_id = invite.id
     and delivery.authenticated_user_id = invite.activated_user_id
     and delivery.status = 'authenticated'
     and delivery.revoked_at is null
    left join public.user_profiles profile on profile.id = invite.activated_user_id
    left join auth.users auth_user on auth_user.id = invite.activated_user_id
    where invite.status = 'pending_activation'
      and invite.activated_user_id is not null
      and (
        profile.id is null
        or auth_user.id is null
        or delivery.authenticated_at is null
        or profile.account_access_state not in ('needs_invite', 'needs_activation')
        or profile.activated_via_account_invite_id is not null
        or (
          profile.invited_by_user_id is not null
          and profile.invited_by_user_id <> invite.inviter_user_id
        )
        or not (
          (
            profile.pending_account_invite_id is null
            and profile.pending_account_invite_delivery_id is null
          )
          or (
            profile.pending_account_invite_id = invite.id
            and profile.pending_account_invite_delivery_id = delivery.id
          )
        )
      )
  ) then
    raise exception 'legacy_account_invite_claim_needs_manual_review';
  end if;

  with candidates as (
    select
      invite.id as invite_id,
      invite.inviter_user_id,
      delivery.id as delivery_id,
      delivery.authenticated_user_id as user_id,
      delivery.authenticated_at,
      least(
        invite.expires_at,
        delivery.expires_at,
        greatest(
          coalesce(delivery.claim_expires_at, delivery.authenticated_at + interval '24 hours'),
          coalesce(
            profile.account_invite_claim_expires_at,
            delivery.authenticated_at + interval '24 hours'
          ),
          v_now + interval '24 hours'
        )
      ) as claim_expires_at
    from public.account_invites invite
    join public.account_invite_deliveries delivery
      on delivery.invite_id = invite.id
     and delivery.authenticated_user_id = invite.activated_user_id
     and delivery.status = 'authenticated'
     and delivery.revoked_at is null
    join public.user_profiles profile on profile.id = invite.activated_user_id
    where invite.status = 'pending_activation'
      and invite.activated_user_id is not null
  )
  select count(*), count(*) filter (where claim_expires_at < v_now)
    into v_expected_count, v_expected_stale
  from candidates;

  with candidates as (
    select
      delivery.id as delivery_id,
      least(
        invite.expires_at,
        delivery.expires_at,
        greatest(
          coalesce(delivery.claim_expires_at, delivery.authenticated_at + interval '24 hours'),
          coalesce(
            profile.account_invite_claim_expires_at,
            delivery.authenticated_at + interval '24 hours'
          ),
          v_now + interval '24 hours'
        )
      ) as claim_expires_at
    from public.account_invites invite
    join public.account_invite_deliveries delivery
      on delivery.invite_id = invite.id
     and delivery.authenticated_user_id = invite.activated_user_id
     and delivery.status = 'authenticated'
     and delivery.revoked_at is null
    join public.user_profiles profile on profile.id = invite.activated_user_id
    where invite.status = 'pending_activation'
      and invite.activated_user_id is not null
  )
  update public.account_invite_deliveries delivery
  set claim_expires_at = candidate.claim_expires_at,
      updated_at = v_now
  from candidates candidate
  where delivery.id = candidate.delivery_id;
  get diagnostics v_delivery_count = row_count;

  with candidates as (
    select
      invite.id as invite_id,
      invite.inviter_user_id,
      delivery.id as delivery_id,
      delivery.authenticated_user_id as user_id,
      delivery.authenticated_at,
      least(
        invite.expires_at,
        delivery.expires_at,
        greatest(
          coalesce(delivery.claim_expires_at, delivery.authenticated_at + interval '24 hours'),
          coalesce(
            profile.account_invite_claim_expires_at,
            delivery.authenticated_at + interval '24 hours'
          ),
          v_now + interval '24 hours'
        )
      ) as claim_expires_at
    from public.account_invites invite
    join public.account_invite_deliveries delivery
      on delivery.invite_id = invite.id
     and delivery.authenticated_user_id = invite.activated_user_id
     and delivery.status = 'authenticated'
     and delivery.revoked_at is null
    join public.user_profiles profile on profile.id = invite.activated_user_id
    where invite.status = 'pending_activation'
      and invite.activated_user_id is not null
  )
  update public.user_profiles profile
  set account_access_state = 'needs_activation',
      invited_by_user_id = coalesce(profile.invited_by_user_id, candidate.inviter_user_id),
      pending_account_invite_id = candidate.invite_id,
      pending_account_invite_delivery_id = candidate.delivery_id,
      account_invite_claimed_at = coalesce(
        profile.account_invite_claimed_at,
        candidate.authenticated_at
      ),
      account_invite_claim_expires_at = candidate.claim_expires_at
  from candidates candidate
  where profile.id = candidate.user_id;
  get diagnostics v_profile_count = row_count;

  if v_delivery_count <> v_expected_count or v_profile_count <> v_expected_count then
    raise exception 'legacy_account_invite_claim_backfill_count_mismatch';
  end if;

  loop
    v_batch_count := public.release_stale_account_invite_claims(1000);
    v_released_count := v_released_count + v_batch_count;
    exit when v_batch_count = 0;
  end loop;

  if v_released_count <> v_expected_stale then
    raise exception 'legacy_account_invite_claim_release_count_mismatch';
  end if;

  return jsonb_build_object(
    'materializedCount', v_expected_count,
    'liveCount', v_expected_count - v_released_count,
    'releasedCount', v_released_count
  );
end;
$$;

revoke all on function app_private.backfill_legacy_account_invite_claims()
  from public, anon, authenticated;
grant execute on function app_private.backfill_legacy_account_invite_claims()
  to service_role;

create or replace function public.claim_account_invite_for_registration_hash(
  p_user_id uuid,
  p_delivery_token_hash text,
  p_email text,
  p_phone_e164 text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_delivery_id uuid;
  v_invite_id uuid;
  v_delivery public.account_invite_deliveries%rowtype;
  v_invite public.account_invites%rowtype;
  v_profile public.user_profiles%rowtype;
  v_now timestamptz := timezone('utc', now());
  v_token_hash text := nullif(btrim(p_delivery_token_hash), '');
  v_claim_expires_at timestamptz;
  v_was_authenticated boolean := false;
begin
  if p_user_id is null then
    raise exception 'invalid_user_id';
  end if;
  if not exists (
    select 1
    from auth.users auth_user
    where auth_user.id = p_user_id
      and auth_user.email_confirmed_at is not null
  ) then
    raise exception 'email_confirmation_required';
  end if;
  if v_token_hash is null then
    return null;
  end if;
  if v_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_account_invite_delivery_token_hash';
  end if;

  select delivery.id, delivery.invite_id
    into v_delivery_id, v_invite_id
  from public.account_invite_deliveries delivery
  where delivery.token_hash = v_token_hash
  order by delivery.created_at desc
  limit 1;

  if v_delivery_id is null then
    raise exception 'account_invite_delivery_not_found';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_invite_id::text, 73001));

  select * into v_invite
  from public.account_invites
  where id = v_invite_id
  for update;
  if not found then
    raise exception 'account_invite_not_found';
  end if;

  select * into v_delivery
  from public.account_invite_deliveries
  where id = v_delivery_id
  for update;
  if not found then
    raise exception 'account_invite_delivery_not_found';
  end if;

  select * into v_profile
  from public.user_profiles
  where id = p_user_id
  for update;
  if not found then
    raise exception 'actor_profile_not_found';
  end if;

  if (
      nullif(btrim(p_email), '') is not null
      and lower(btrim(coalesce(v_profile.email, ''))) <> lower(btrim(p_email))
    )
    or (
      nullif(btrim(p_phone_e164), '') is not null
      and btrim(coalesce(v_profile.phone_e164, '')) <> btrim(p_phone_e164)
    ) then
    raise exception 'actor_mismatch';
  end if;
  if nullif(btrim(v_profile.phone_e164), '') is null then
    raise exception 'activation_phone_required';
  end if;

  if v_profile.account_access_state = 'active'
    and v_profile.activated_via_account_invite_id is distinct from v_invite.id then
    raise exception 'actor_account_already_active';
  end if;

  if public.effective_account_invite_status(v_invite.status, v_invite.expires_at)
      <> v_invite.status then
    update public.account_invites
    set status = public.effective_account_invite_status(status, expires_at),
        resolution_actor = coalesce(resolution_actor, 'system'),
        resolution_reason = coalesce(resolution_reason, 'expired_before_registration_claim'),
        resolved_at = coalesce(resolved_at, v_now),
        updated_at = v_now
    where id = v_invite.id
    returning * into v_invite;
  end if;

  if public.effective_account_invite_delivery_status(
      v_delivery.status, v_delivery.expires_at, v_delivery.revoked_at
    ) <> v_delivery.status then
    update public.account_invite_deliveries
    set status = public.effective_account_invite_delivery_status(status, expires_at, revoked_at),
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
  v_claim_expires_at := least(v_delivery.expires_at, v_now + interval '24 hours');

  update public.account_invites
  set activated_user_id = coalesce(activated_user_id, p_user_id),
      updated_at = v_now
  where id = v_invite.id
  returning * into v_invite;

  update public.account_invite_deliveries
  set status = 'authenticated',
      authenticated_user_id = coalesce(authenticated_user_id, p_user_id),
      authenticated_at = coalesce(authenticated_at, v_now),
      claim_expires_at = coalesce(claim_expires_at, v_claim_expires_at),
      updated_at = v_now
  where id = v_delivery.id
  returning * into v_delivery;

  update public.user_profiles
  set account_access_state = 'needs_activation',
      invited_by_user_id = v_invite.inviter_user_id,
      pending_account_invite_id = v_invite.id,
      pending_account_invite_delivery_id = v_delivery.id,
      account_invite_claimed_at = coalesce(account_invite_claimed_at, v_now),
      account_invite_claim_expires_at = v_delivery.claim_expires_at
  where id = p_user_id
  returning * into v_profile;

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
        'claim_stage', 'registration',
        'claim_expires_at', v_delivery.claim_expires_at
      )
    );
  end if;

  return jsonb_build_object(
    'inviteId', v_invite.id,
    'deliveryId', v_delivery.id,
    'status', v_invite.status,
    'deliveryStatus', v_delivery.status,
    'accountAccessState', v_profile.account_access_state,
    'authenticatedUserId', v_delivery.authenticated_user_id,
    'authenticatedAt', v_delivery.authenticated_at,
    'claimExpiresAt', v_delivery.claim_expires_at
  );
end;
$$;

revoke all on function public.claim_account_invite_for_registration_hash(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.claim_account_invite_for_registration_hash(uuid, text, text, text)
  to service_role;

create or replace function public.claim_account_invite_for_current_user(
  p_actor_user_id uuid,
  p_delivery_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.assert_request_actor(p_actor_user_id);

  return public.claim_account_invite_for_registration_hash(
    p_actor_user_id,
    public.hash_invite_token(p_delivery_token),
    null,
    null
  );
end;
$$;

revoke all on function public.claim_account_invite_for_current_user(uuid, text)
  from public, anon, authenticated;
grant execute on function public.claim_account_invite_for_current_user(uuid, text) to service_role;

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
set search_path = public, app_private, extensions, pg_temp
as $$
declare
  v_idempotency public.idempotency_keys%rowtype;
  v_actor_profile public.user_profiles%rowtype;
  v_invite public.account_invites%rowtype;
  v_delivery public.account_invite_deliveries%rowtype;
  v_legacy_delivery public.account_invite_deliveries%rowtype;
  v_response jsonb;
  v_request_hash text;
  v_delivery_expires_at timestamptz;
  v_delivery_token text;
  v_is_legacy_replay boolean := false;
  v_now timestamptz := timezone('utc', now());
  v_alias text := nullif(btrim(p_intended_recipient_alias), '');
  v_phone_e164 text := nullif(btrim(p_intended_recipient_phone_e164), '');
  v_phone_label text := nullif(btrim(p_intended_recipient_phone_label), '');
  v_source_context text := nullif(btrim(p_source_context), '');
begin
  perform public.assert_request_actor(p_actor_user_id);
  if not exists (
    select 1
    from auth.users auth_user
    where auth_user.id = p_actor_user_id
      and auth_user.email_confirmed_at is not null
  ) then
    raise exception 'email_confirmation_required';
  end if;
  if nullif(btrim(p_idempotency_key), '') is null
    or length(btrim(p_idempotency_key)) not between 8 and 128 then
    raise exception 'invalid_idempotency_key';
  end if;
  if p_channel not in ('remote', 'qr') then
    raise exception 'account_invite_channel_required';
  end if;
  if v_phone_e164 is null then
    raise exception 'contact_phone_required';
  end if;

  v_request_hash := encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'channel', p_channel,
          'sourceContext', v_source_context,
          'alias', v_alias,
          'phoneE164', v_phone_e164,
          'phoneLabel', v_phone_label
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  insert into public.idempotency_keys (
    actor_user_id, operation_name, idempotency_key, request_hash, expires_at
  )
  values (
    p_actor_user_id,
    'create_account_invite',
    btrim(p_idempotency_key),
    v_request_hash,
    v_now + interval '30 days'
  )
  on conflict (actor_user_id, operation_name, idempotency_key) do nothing;

  select * into v_idempotency
  from public.idempotency_keys
  where actor_user_id = p_actor_user_id
    and operation_name = 'create_account_invite'
    and idempotency_key = btrim(p_idempotency_key)
  for update;

  if v_idempotency.request_hash is not null
    and v_idempotency.request_hash <> v_request_hash then
    raise exception 'idempotency_key_reused';
  end if;

  v_is_legacy_replay :=
    v_idempotency.response_json is not null
    and v_idempotency.request_hash is null;

  if v_is_legacy_replay then
    if not (v_idempotency.response_json ? 'inviteId')
      or not (v_idempotency.response_json ? 'deliveryId') then
      raise exception 'legacy_idempotency_replay_unavailable';
    end if;

    if coalesce(
        v_idempotency.response_json ->> 'originChannel',
        v_idempotency.response_json ->> 'channel'
      ) is distinct from p_channel::text
      or (v_idempotency.response_json ->> 'intendedRecipientAlias')
        is distinct from v_alias
      or (v_idempotency.response_json ->> 'intendedRecipientPhoneE164')
        is distinct from v_phone_e164
      or (v_idempotency.response_json ->> 'intendedRecipientPhoneLabel')
        is distinct from v_phone_label then
      raise exception 'idempotency_key_reused';
    end if;

  end if;

  update public.idempotency_keys
  set request_hash = coalesce(request_hash, v_request_hash),
      expires_at = greatest(coalesce(expires_at, v_now), v_now + interval '30 days')
  where id = v_idempotency.id;

  v_delivery_token := app_private.derive_account_invite_delivery_token(
    p_actor_user_id,
    v_idempotency.id::text,
    v_request_hash
  );
  if v_delivery_token is null then
    raise exception 'account_invite_token_secret_unavailable';
  end if;

  -- Serialize invitations for the same sender/phone before touching invite rows.
  perform pg_advisory_xact_lock(
    hashtextextended(p_actor_user_id::text || '|' || v_phone_e164, 73002)
  );

  -- Pre-lock every row this request can mutate before touching the actor profile.
  -- This preserves idempotency -> invite -> delivery -> profile across create,
  -- replay, stale-claim release, and QR-delivery replacement.
  perform 1
  from public.account_invites invite
  where (
      invite.inviter_user_id = p_actor_user_id
      and invite.intended_recipient_phone_e164 = v_phone_e164
      and invite.status in ('pending_activation', 'pending_inviter_review')
    )
    or (
      v_idempotency.response_json is not null
      and v_idempotency.response_json ? 'inviteId'
      and invite.id = (v_idempotency.response_json ->> 'inviteId')::uuid
    )
  order by invite.id
  for update;

  perform 1
  from public.account_invite_deliveries delivery
  where delivery.invite_id in (
      select invite.id
      from public.account_invites invite
      where (
          invite.inviter_user_id = p_actor_user_id
          and invite.intended_recipient_phone_e164 = v_phone_e164
          and invite.status in ('pending_activation', 'pending_inviter_review')
        )
        or (
          v_idempotency.response_json is not null
          and v_idempotency.response_json ? 'inviteId'
          and invite.id = (v_idempotency.response_json ->> 'inviteId')::uuid
        )
    )
    or (
      v_idempotency.response_json is not null
      and v_idempotency.response_json ? 'deliveryId'
      and delivery.id = (v_idempotency.response_json ->> 'deliveryId')::uuid
    )
  order by delivery.id
  for update;

  select * into v_actor_profile
  from public.user_profiles
  where id = p_actor_user_id
  for update;
  if not found then
    raise exception 'actor_profile_not_found';
  end if;
  if v_actor_profile.account_access_state <> 'active' then
    raise exception 'actor_account_not_active';
  end if;
  if not public.friendship_identity_ready(p_actor_user_id) then
    raise exception 'identity_incomplete';
  end if;
  if nullif(btrim(v_actor_profile.phone_e164), '') = v_phone_e164 then
    raise exception 'cannot_invite_self';
  end if;

  if v_is_legacy_replay then
    select * into v_legacy_delivery
    from public.account_invite_deliveries
    where id = (v_idempotency.response_json ->> 'deliveryId')::uuid
      and invite_id = (v_idempotency.response_json ->> 'inviteId')::uuid
    for update;

    if not found then
      raise exception 'legacy_idempotency_replay_unavailable';
    end if;

    if v_legacy_delivery.channel is distinct from p_channel
      or v_legacy_delivery.source_context is distinct from v_source_context then
      raise exception 'idempotency_key_reused';
    end if;
  end if;

  if v_idempotency.response_json is not null
    and v_idempotency.response_json ? 'inviteId'
    and exists (
      select 1
      from public.account_invite_deliveries replay_delivery
      where replay_delivery.invite_id = (v_idempotency.response_json ->> 'inviteId')::uuid
        and replay_delivery.token_hash = public.hash_invite_token(v_delivery_token)
    ) then
    return v_idempotency.response_json || jsonb_build_object('deliveryToken', v_delivery_token);
  end if;

  perform public.release_stale_account_invite_claim_for_phone(p_actor_user_id, v_phone_e164);

  update public.account_invites
  set status = 'expired',
      resolution_actor = coalesce(resolution_actor, 'system'),
      resolution_reason = coalesce(resolution_reason, 'activation_window_expired'),
      resolved_at = coalesce(resolved_at, v_now),
      updated_at = v_now
  where inviter_user_id = p_actor_user_id
    and intended_recipient_phone_e164 = v_phone_e164
    and status in ('pending_activation', 'pending_inviter_review')
    and expires_at <= v_now;

  select * into v_invite
  from public.account_invites
  where (
    (
      v_idempotency.response_json is not null
      and id = (v_idempotency.response_json ->> 'inviteId')::uuid
    )
    or (
      v_idempotency.response_json is null
      and inviter_user_id = p_actor_user_id
      and intended_recipient_phone_e164 = v_phone_e164
      and status in ('pending_activation', 'pending_inviter_review')
    )
  )
  order by created_at desc
  limit 1
  for update;

  if v_is_legacy_replay then
    if not found then
      raise exception 'legacy_idempotency_replay_unavailable';
    end if;

    if v_invite.inviter_user_id is distinct from p_actor_user_id
      or v_invite.intended_recipient_phone_e164 is distinct from v_phone_e164
      or public.effective_account_invite_status(v_invite.status, v_invite.expires_at)
        <> 'pending_activation'
      or v_invite.activated_user_id is not null then
      raise exception 'legacy_idempotency_replay_unavailable';
    end if;
  end if;

  if found and v_invite.activated_user_id is not null then
    raise exception 'account_invite_reservation_active';
  end if;

  if not found then
    insert into public.account_invites (
      inviter_user_id,
      status,
      intended_recipient_alias,
      intended_recipient_phone_e164,
      intended_recipient_phone_label,
      source_context,
      expires_at
    ) values (
      p_actor_user_id,
      'pending_activation',
      v_alias,
      v_phone_e164,
      v_phone_label,
      v_source_context,
      v_now + interval '7 days'
    ) returning * into v_invite;

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
        updated_at = v_now
    where id = v_invite.id
    returning * into v_invite;
  end if;

  if p_channel = 'remote' then
    v_delivery_expires_at := v_now + interval '7 days';
  else
    update public.account_invite_deliveries
    set status = 'revoked',
        revoked_at = coalesce(revoked_at, v_now),
        updated_at = v_now
    where invite_id = v_invite.id
      and channel = 'qr'
      and status = 'issued'
      and revoked_at is null;
    v_delivery_expires_at := v_now + interval '10 minutes';
  end if;

  update public.account_invites
  set expires_at = greatest(expires_at, v_delivery_expires_at),
      updated_at = v_now
  where id = v_invite.id
  returning * into v_invite;

  insert into public.account_invite_deliveries (
    invite_id, token_hash, channel, source_context, status, expires_at
  ) values (
    v_invite.id,
    public.hash_invite_token(v_delivery_token),
    p_channel,
    v_source_context,
    'issued',
    v_delivery_expires_at
  ) returning * into v_delivery;

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
  set response_json = v_response - 'deliveryToken',
      completed_at = v_now,
      expires_at = v_now + interval '30 days'
  where id = v_idempotency.id;

  return v_response;
end;
$$;

revoke all on function public.create_account_invite(
  uuid, text, public.account_invite_channel, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.create_account_invite(
  uuid, text, public.account_invite_channel, text, text, text, text
) to service_role;

create or replace function app_private.activate_account_from_invite_delivery(
  p_actor_user_id uuid,
  p_idempotency_key text,
  p_delivery_id uuid,
  p_current_device_id text,
  p_current_session_id text,
  p_allow_legacy_unbound_trust boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, extensions, pg_temp
as $$
declare
  v_idempotency public.idempotency_keys%rowtype;
  v_delivery public.account_invite_deliveries%rowtype;
  v_invite public.account_invites%rowtype;
  v_trusted_device public.trusted_devices%rowtype;
  v_actor_profile public.user_profiles%rowtype;
  v_relationship_id uuid;
  v_invite_id uuid;
  v_now timestamptz := timezone('utc', now());
  v_phone_identity_match boolean := false;
  v_request_hash text;
  v_response jsonb;
begin
  perform public.assert_request_actor(p_actor_user_id);
  if not exists (
    select 1
    from auth.users auth_user
    where auth_user.id = p_actor_user_id
      and auth_user.email_confirmed_at is not null
  ) then
    raise exception 'email_confirmation_required';
  end if;
  if nullif(btrim(p_idempotency_key), '') is null
    or length(btrim(p_idempotency_key)) not between 8 and 128 then
    raise exception 'invalid_idempotency_key';
  end if;
  if nullif(btrim(p_current_device_id), '') is null
    or (
      not coalesce(p_allow_legacy_unbound_trust, false)
      and nullif(btrim(p_current_session_id), '') is null
    ) then
    raise exception 'activation_device_not_trusted';
  end if;
  if p_delivery_id is null then
    raise exception 'account_invite_delivery_not_found';
  end if;

  select invite_id into v_invite_id
  from public.account_invite_deliveries
  where id = p_delivery_id;
  if v_invite_id is null then
    raise exception 'account_invite_delivery_not_found';
  end if;

  v_request_hash := encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'deliveryId', p_delivery_id,
          'currentDeviceId', btrim(p_current_device_id)
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  insert into public.idempotency_keys (
    actor_user_id, operation_name, idempotency_key, request_hash, expires_at
  ) values (
    p_actor_user_id,
    'activate_account_from_invite',
    btrim(p_idempotency_key),
    v_request_hash,
    v_now + interval '30 days'
  )
  on conflict (actor_user_id, operation_name, idempotency_key) do nothing;

  select * into v_idempotency
  from public.idempotency_keys
  where actor_user_id = p_actor_user_id
    and operation_name = 'activate_account_from_invite'
    and idempotency_key = btrim(p_idempotency_key)
  for update;

  if v_idempotency.request_hash is not null
    and v_idempotency.request_hash <> v_request_hash then
    raise exception 'idempotency_key_reused';
  end if;
  update public.idempotency_keys
  set request_hash = coalesce(request_hash, v_request_hash),
      expires_at = greatest(coalesce(expires_at, v_now), v_now + interval '30 days')
  where id = v_idempotency.id;
  perform pg_advisory_xact_lock(hashtextextended(v_invite_id::text, 73001));

  select * into v_invite
  from public.account_invites
  where id = v_invite_id
  for update;
  if not found then
    raise exception 'account_invite_not_found';
  end if;

  -- Activation later revokes sibling deliveries. Lock the full set in a stable
  -- order now, before trusted-device and profile state.
  perform 1
  from public.account_invite_deliveries delivery
  where delivery.invite_id = v_invite.id
  order by delivery.id
  for update;

  select * into v_delivery
  from public.account_invite_deliveries
  where id = p_delivery_id
  for update;
  if not found then
    raise exception 'account_invite_delivery_not_found';
  end if;

  if v_invite.inviter_user_id = p_actor_user_id then
    raise exception 'cannot_activate_own_invite';
  end if;
  if v_invite.activated_user_id is not null
    and v_invite.activated_user_id <> p_actor_user_id then
    raise exception 'account_invite_already_used';
  end if;
  if v_delivery.authenticated_user_id is not null
    and v_delivery.authenticated_user_id <> p_actor_user_id then
    raise exception 'account_invite_already_used';
  end if;

  select * into v_trusted_device
  from public.trusted_devices
    where user_id = p_actor_user_id
      and device_id = btrim(p_current_device_id)
      and trust_state = 'trusted'
      and (
        (
          not coalesce(p_allow_legacy_unbound_trust, false)
          and trusted_session_id = btrim(p_current_session_id)
        )
        or (
          coalesce(p_allow_legacy_unbound_trust, false)
          and trusted_session_id is null
        )
      )
  for update;
  if not found then
    raise exception 'activation_device_not_trusted';
  end if;

  -- Replays remain bound to the currently authenticated trusted session. Only
  -- return the stored terminal response after locking/revalidating that proof.
  if v_idempotency.response_json is not null then
    return v_idempotency.response_json;
  end if;

  -- A repeated activation after a terminal transition is a semantic read: it
  -- returns the final state and never reopens, downgrades, or re-audits it.
  if v_invite.activated_user_id = p_actor_user_id
    and v_invite.status <> 'pending_activation' then
    v_response := jsonb_build_object(
      'inviteId', v_invite.id,
      'deliveryId', v_delivery.id,
      'status', v_invite.status,
      'activatedAt', v_invite.activated_at,
      'resolvedAt', v_invite.resolved_at,
      'relationshipId', v_invite.linked_relationship_id,
      'actorRole', 'claimant'
    );
    update public.idempotency_keys
    set response_json = v_response,
        completed_at = v_now,
        expires_at = v_now + interval '30 days'
    where id = v_idempotency.id;
    return v_response;
  end if;

  if public.effective_account_invite_status(v_invite.status, v_invite.expires_at)
      <> v_invite.status then
    update public.account_invites
    set status = public.effective_account_invite_status(status, expires_at),
        resolution_actor = coalesce(resolution_actor, 'system'),
        resolution_reason = coalesce(resolution_reason, 'expired_before_activation'),
        resolved_at = coalesce(resolved_at, v_now),
        updated_at = v_now
    where id = v_invite.id
    returning * into v_invite;
  end if;

  if public.effective_account_invite_delivery_status(
      v_delivery.status, v_delivery.expires_at, v_delivery.revoked_at
    ) <> v_delivery.status then
    update public.account_invite_deliveries
    set status = public.effective_account_invite_delivery_status(status, expires_at, revoked_at),
        updated_at = v_now
    where id = v_delivery.id
    returning * into v_delivery;
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

  select * into v_actor_profile
  from public.user_profiles
  where id = p_actor_user_id
  for update;
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
  -- A direct activation is also a durable claim for email/password paths that
  -- reached this RPC before the auth trigger stored the reservation.
  update public.account_invites
  set activated_user_id = coalesce(activated_user_id, p_actor_user_id),
      updated_at = v_now
  where id = v_invite.id
  returning * into v_invite;

  update public.account_invite_deliveries
  set status = 'authenticated',
      authenticated_user_id = coalesce(authenticated_user_id, p_actor_user_id),
      authenticated_at = coalesce(authenticated_at, v_now),
      claim_expires_at = coalesce(claim_expires_at, least(expires_at, v_now + interval '24 hours')),
      updated_at = v_now
  where id = v_delivery.id
  returning * into v_delivery;

  v_phone_identity_match :=
    public.profile_phone_identity_ready(v_actor_profile)
    and v_invite.intended_recipient_phone_e164 is not null
    and btrim(v_invite.intended_recipient_phone_e164) = btrim(v_actor_profile.phone_e164);

  update public.user_profiles
  set account_access_state = 'active',
      invited_by_user_id = v_invite.inviter_user_id,
      activated_via_account_invite_id = v_invite.id,
      activated_at = coalesce(activated_at, v_now),
      pending_account_invite_id = null,
      pending_account_invite_delivery_id = null,
      account_invite_claimed_at = null,
      account_invite_claim_expires_at = null
  where id = p_actor_user_id
  returning * into v_actor_profile;

  -- Sibling delivery revocation occurs only at successful activation, not at
  -- registration claim, so an abandoned unconfirmed reservation can be released.
  update public.account_invite_deliveries
  set status = 'revoked',
      revoked_at = coalesce(revoked_at, v_now),
      claim_expires_at = null,
      updated_at = v_now
  where invite_id = v_invite.id
    and id <> v_delivery.id
    and status in ('issued', 'authenticated')
    and revoked_at is null;

  if v_phone_identity_match then
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
    set linked_relationship_id = v_relationship_id,
        status = 'accepted',
        activated_at = coalesce(activated_at, v_now),
        resolution_actor = 'system',
        resolution_reason = 'activation_phone_match_auto_accepted',
        resolved_at = coalesce(resolved_at, v_now),
        updated_at = v_now
    where id = v_invite.id
    returning * into v_invite;
  else
    update public.account_invites
    set status = 'pending_inviter_review',
        activated_at = coalesce(activated_at, v_now),
        resolution_actor = null,
        resolution_reason = null,
        resolved_at = null,
        updated_at = v_now
    where id = v_invite.id
    returning * into v_invite;
  end if;

  update public.account_invite_deliveries
  set status = 'activated',
      activation_completed_at = coalesce(activation_completed_at, v_now),
      claim_expires_at = null,
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
      'relationship_id', v_relationship_id,
      'phone_was_verified', v_actor_profile.phone_verified_at is not null,
      'phone_identity_source', case
        when v_actor_profile.phone_verified_at is not null then 'verified'
        when v_actor_profile.phone_identity_legacy_at is not null then 'legacy'
        else null
      end,
      'resolution_reason', case
        when v_phone_identity_match then 'activation_phone_match_auto_accepted'
        else 'activation_requires_sender_review'
      end
    )
  );

  if v_phone_identity_match then
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
  end if;

  v_response := jsonb_build_object(
    'inviteId', v_invite.id,
    'deliveryId', v_delivery.id,
    'status', v_invite.status,
    'activatedAt', v_invite.activated_at,
    'resolvedAt', v_invite.resolved_at,
    'relationshipId', v_relationship_id,
    'actorRole', 'claimant'
  );

  update public.idempotency_keys
  set response_json = v_response,
      completed_at = v_now,
      expires_at = v_now + interval '30 days'
  where id = v_idempotency.id;

  return v_response;
end;
$$;

revoke all on function app_private.activate_account_from_invite_delivery(uuid, text, uuid, text, text, boolean)
  from public, anon, authenticated;
grant execute on function app_private.activate_account_from_invite_delivery(uuid, text, uuid, text, text, boolean)
  to service_role;

-- Expand compatibility for the Edge Function already deployed in production.
-- This route accepts only a trusted row that predates session binding. Phase B
-- removes it after the minimum supported app version has moved past the legacy client.
create or replace function public.activate_account_from_invite(
  p_actor_user_id uuid,
  p_idempotency_key text,
  p_delivery_token text,
  p_current_device_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_delivery_id uuid;
begin
  perform public.assert_request_actor(p_actor_user_id);
  select id into v_delivery_id
  from public.account_invite_deliveries
  where token_hash = public.hash_invite_token(p_delivery_token)
  order by created_at desc
  limit 1;
  if v_delivery_id is null then
    raise exception 'account_invite_delivery_not_found';
  end if;
  return app_private.activate_account_from_invite_delivery(
    p_actor_user_id,
    p_idempotency_key,
    v_delivery_id,
    p_current_device_id,
    null,
    true
  );
end;
$$;

create or replace function public.activate_account_from_invite(
  p_actor_user_id uuid,
  p_idempotency_key text,
  p_delivery_token text,
  p_current_device_id text,
  p_current_session_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_delivery_id uuid;
begin
  perform public.assert_request_actor(p_actor_user_id);
  select id into v_delivery_id
  from public.account_invite_deliveries
  where token_hash = public.hash_invite_token(p_delivery_token)
  order by created_at desc
  limit 1;
  if v_delivery_id is null then
    raise exception 'account_invite_delivery_not_found';
  end if;
  return app_private.activate_account_from_invite_delivery(
    p_actor_user_id,
    p_idempotency_key,
    v_delivery_id,
    p_current_device_id,
    p_current_session_id,
    false
  );
end;
$$;

create or replace function public.activate_account_from_pending_invite(
  p_actor_user_id uuid,
  p_idempotency_key text,
  p_current_device_id text,
  p_current_session_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_delivery_id uuid;
begin
  perform public.assert_request_actor(p_actor_user_id);

  select coalesce(
    profile.pending_account_invite_delivery_id,
    (
      select delivery.id
      from public.account_invite_deliveries delivery
      where delivery.invite_id = profile.activated_via_account_invite_id
        and delivery.authenticated_user_id = p_actor_user_id
      order by delivery.created_at desc
      limit 1
    )
  ) into v_delivery_id
  from public.user_profiles profile
  where profile.id = p_actor_user_id;

  if v_delivery_id is null then
    raise exception 'account_invite_reservation_not_found';
  end if;

  return app_private.activate_account_from_invite_delivery(
    p_actor_user_id,
    p_idempotency_key,
    v_delivery_id,
    p_current_device_id,
    p_current_session_id,
    false
  );
end;
$$;

revoke all on function public.activate_account_from_invite(uuid, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.activate_account_from_invite(uuid, text, text, text)
  from public, anon, authenticated;
revoke all on function public.activate_account_from_pending_invite(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.activate_account_from_invite(uuid, text, text, text, text)
  to service_role;
grant execute on function public.activate_account_from_invite(uuid, text, text, text)
  to service_role;
grant execute on function public.activate_account_from_pending_invite(uuid, text, text, text)
  to service_role;

-- Preserve the legacy RPC contract while aligning its row-lock order with the
-- claim, activation, preview, and cleanup paths: invite before deliveries.
create or replace function public.cancel_account_invite(
  p_actor_user_id uuid,
  p_idempotency_key text,
  p_invite_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
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

  select * into v_idempotency
  from public.idempotency_keys
  where actor_user_id = p_actor_user_id
    and operation_name = 'cancel_account_invite'
    and idempotency_key = p_idempotency_key
  for update;

  if v_idempotency.response_json is not null then
    return v_idempotency.response_json;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_invite_id::text, 73001));

  select * into v_invite
  from public.account_invites
  where id = p_invite_id
  for update;

  if not found then
    raise exception 'account_invite_not_found';
  end if;

  if v_invite.inviter_user_id <> p_actor_user_id then
    raise exception 'account_invite_not_visible_to_actor';
  end if;

  perform 1
  from public.account_invite_deliveries
  where invite_id = p_invite_id
  order by created_at desc
  for update;

  if public.effective_account_invite_status(v_invite.status, v_invite.expires_at)
      <> v_invite.status then
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

revoke all on function public.cancel_account_invite(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.cancel_account_invite(uuid, text, uuid) to service_role;

-- Contact resolution treats a phone as an identity only after OTP proof.
create or replace function public.resolve_people_targets(
  p_actor_user_id uuid,
  p_phone_e164_list text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_response jsonb;
begin
  perform public.assert_request_actor(p_actor_user_id);
  with input_numbers as (
    select ordinality as position, nullif(btrim(phone_e164), '') as phone_e164
    from unnest(coalesce(p_phone_e164_list, array[]::text[]))
      with ordinality as input(phone_e164, ordinality)
  ),
  matched_profiles as (
    select input.position,
           input.phone_e164,
           profile.id as matched_user_id,
           profile.display_name,
           profile.avatar_path,
           profile.account_access_state
    from input_numbers input
    left join public.user_profiles profile
      on profile.phone_e164 = input.phone_e164
     and public.profile_phone_identity_ready(profile)
     and profile.id <> p_actor_user_id
  ),
  relationship_matches as (
    select matched.position, relationship.id as relationship_id
    from matched_profiles matched
    join public.relationships relationship
      on relationship.user_low_id = least(p_actor_user_id, matched.matched_user_id)
     and relationship.user_high_id = greatest(p_actor_user_id, matched.matched_user_id)
     and relationship.status = 'active'
  ),
  friendship_matches as (
    select distinct on (matched.position) matched.position, invite.id as invite_id
    from matched_profiles matched
    join public.friendship_invites invite
      on invite.flow = 'internal'
     and invite.status = 'pending_recipient'
     and least(invite.inviter_user_id, invite.target_user_id) = least(p_actor_user_id, matched.matched_user_id)
     and greatest(invite.inviter_user_id, invite.target_user_id) = greatest(p_actor_user_id, matched.matched_user_id)
    order by matched.position, invite.created_at desc
  ),
  account_matches as (
    select distinct on (input.position)
      input.position,
      invite.id as account_invite_id,
      public.effective_account_invite_status(invite.status, invite.expires_at) as invite_status
    from input_numbers input
    join public.account_invites invite
      on invite.inviter_user_id = p_actor_user_id
     and invite.intended_recipient_phone_e164 = input.phone_e164
     and public.effective_account_invite_status(invite.status, invite.expires_at)
       in ('pending_activation', 'pending_inviter_review')
    order by input.position, invite.created_at desc
  )
  select jsonb_agg(
    jsonb_build_object(
      'phoneE164', input.phone_e164,
      'status', case
        when input.phone_e164 is null then 'no_account'
        when relationship.relationship_id is not null then 'already_related'
        when matched.matched_user_id is not null
          and matched.account_access_state = 'active'
          and friendship.invite_id is not null then 'pending_friendship'
        when matched.matched_user_id is not null
          and matched.account_access_state = 'active' then 'active_user'
        when matched.matched_user_id is not null then 'pending_activation'
        when account.account_invite_id is not null then 'pending_activation'
        else 'no_account'
      end,
      'matchedUserId', matched.matched_user_id,
      'displayName', matched.display_name,
      'avatarPath', matched.avatar_path,
      'relationshipId', relationship.relationship_id,
      'friendshipInviteId', friendship.invite_id,
      'accountInviteId', account.account_invite_id,
      'accountInviteStatus', account.invite_status
    ) order by input.position
  ) into v_response
  from input_numbers input
  left join matched_profiles matched on matched.position = input.position
  left join relationship_matches relationship on relationship.position = input.position
  left join friendship_matches friendship on friendship.position = input.position
  left join account_matches account on account.position = input.position;

  return coalesce(v_response, '[]'::jsonb);
end;
$$;

create or replace function public.create_people_outreach(
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
set search_path = public, pg_temp
as $$
declare
  v_phone_e164 text := nullif(btrim(p_intended_recipient_phone_e164), '');
  v_target_profile public.user_profiles%rowtype;
  v_target_profile_found boolean := false;
  v_relationship_id uuid;
  v_pending_friendship public.friendship_invites%rowtype;
  v_outreach_response jsonb;
begin
  perform public.assert_request_actor(p_actor_user_id);
  if v_phone_e164 is null then
    raise exception 'contact_phone_required';
  end if;

  select * into v_target_profile
  from public.user_profiles
  where phone_e164 = v_phone_e164
    and public.profile_phone_identity_ready(user_profiles)
    and id <> p_actor_user_id
  limit 1;
  v_target_profile_found := found;

  if v_target_profile_found and v_target_profile.account_access_state = 'active' then
    select id into v_relationship_id
    from public.relationships
    where user_low_id = least(p_actor_user_id, v_target_profile.id)
      and user_high_id = greatest(p_actor_user_id, v_target_profile.id)
      and status = 'active';
    if v_relationship_id is not null then
      return jsonb_build_object(
        'kind', 'already_related', 'status', 'already_related',
        'relationshipId', v_relationship_id,
        'matchedUserId', v_target_profile.id,
        'displayName', v_target_profile.display_name
      );
    end if;

    select * into v_pending_friendship
    from public.friendship_invites
    where flow = 'internal'
      and status = 'pending_recipient'
      and least(inviter_user_id, target_user_id) = least(p_actor_user_id, v_target_profile.id)
      and greatest(inviter_user_id, target_user_id) = greatest(p_actor_user_id, v_target_profile.id)
    order by created_at desc
    limit 1;
    if found then
      return jsonb_build_object(
        'kind', 'friendship', 'status', 'pending_friendship',
        'inviteId', v_pending_friendship.id,
        'matchedUserId', v_target_profile.id,
        'displayName', v_target_profile.display_name
      );
    end if;

    v_outreach_response := public.create_internal_friendship_invite(
      p_actor_user_id, p_idempotency_key, v_target_profile.id, p_source_context
    );
    return jsonb_build_object(
      'kind', 'friendship', 'status', 'active_user',
      'matchedUserId', v_target_profile.id,
      'displayName', v_target_profile.display_name,
      'result', v_outreach_response
    );
  end if;

  v_outreach_response := public.create_account_invite(
    p_actor_user_id,
    p_idempotency_key,
    p_channel,
    p_source_context,
    p_intended_recipient_alias,
    v_phone_e164,
    p_intended_recipient_phone_label
  );
  return jsonb_build_object(
    'kind', 'account_invite',
    'status', case when v_target_profile_found then 'pending_activation' else 'no_account' end,
    'matchedUserId', case when v_target_profile_found then v_target_profile.id else null end,
    'displayName', case when v_target_profile_found then v_target_profile.display_name else null end,
    'result', v_outreach_response
  );
end;
$$;

revoke all on function public.resolve_people_targets(uuid, text[]) from public, anon, authenticated;
revoke all on function public.create_people_outreach(
  uuid, text, public.account_invite_channel, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.resolve_people_targets(uuid, text[]) to service_role;
grant execute on function public.create_people_outreach(
  uuid, text, public.account_invite_channel, text, text, text, text
) to service_role;

-- Latest external claim behavior: an unverified phone may identify the claimant
-- for sender review, but can never create a relationship automatically.
create or replace function public.claim_external_friendship_invite(
  p_actor_user_id uuid,
  p_idempotency_key text,
  p_delivery_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_idempotency public.idempotency_keys%rowtype;
  v_delivery public.friendship_invite_deliveries%rowtype;
  v_invite public.friendship_invites%rowtype;
  v_actor_profile public.user_profiles%rowtype;
  v_existing_relationship_id uuid;
  v_relationship_id uuid;
  v_phone_identity_matches boolean := false;
  v_response jsonb;
begin
  perform public.assert_request_actor(p_actor_user_id);
  if not public.friendship_identity_ready(p_actor_user_id) then
    raise exception 'identity_incomplete';
  end if;

  insert into public.idempotency_keys (
    actor_user_id, operation_name, idempotency_key, expires_at
  )
  values (
    p_actor_user_id,
    'claim_external_friendship_invite',
    p_idempotency_key,
    timezone('utc', now()) + interval '30 days'
  )
  on conflict (actor_user_id, operation_name, idempotency_key) do nothing;
  select * into v_idempotency
  from public.idempotency_keys
  where actor_user_id = p_actor_user_id
    and operation_name = 'claim_external_friendship_invite'
    and idempotency_key = p_idempotency_key
  for update;
  if v_idempotency.response_json is not null then
    return v_idempotency.response_json;
  end if;

  select * into v_delivery
  from public.friendship_invite_deliveries
  where token_hash = public.hash_invite_token(p_delivery_token)
  order by created_at desc
  limit 1
  for update;
  if not found then
    raise exception 'friendship_delivery_not_found';
  end if;
  select * into v_invite
  from public.friendship_invites
  where id = v_delivery.invite_id
  for update;
  if not found then
    raise exception 'friendship_invite_not_found';
  end if;

  if public.effective_friendship_invite_status(v_invite.status, v_invite.expires_at)
      <> v_invite.status then
    update public.friendship_invites
    set status = public.effective_friendship_invite_status(status, expires_at),
        resolution_actor = coalesce(resolution_actor, 'system'::public.friendship_invite_resolution_actor),
        resolution_reason = coalesce(resolution_reason, 'expired_before_claim'),
        resolved_at = coalesce(resolved_at, timezone('utc', now()))
    where id = v_invite.id
    returning * into v_invite;
  end if;
  if public.effective_friendship_delivery_status(
      v_delivery.status, v_delivery.expires_at, v_delivery.revoked_at
    ) <> v_delivery.status then
    update public.friendship_invite_deliveries
    set status = public.effective_friendship_delivery_status(status, expires_at, revoked_at)
    where id = v_delivery.id
    returning * into v_delivery;
  end if;

  if v_invite.flow <> 'external' then raise exception 'invite_not_external'; end if;
  if v_invite.inviter_user_id = p_actor_user_id then raise exception 'cannot_claim_own_invite'; end if;
  if v_invite.status <> 'pending_claim' then raise exception 'invite_not_pending_claim'; end if;
  if v_delivery.status <> 'issued' then
    if v_delivery.status = 'expired' then raise exception 'delivery_expired'; end if;
    raise exception 'delivery_not_available';
  end if;
  if v_invite.claimant_user_id is not null and v_invite.claimant_user_id <> p_actor_user_id then
    raise exception 'invite_already_claimed';
  end if;

  select id into v_existing_relationship_id
  from public.relationships
  where user_low_id = least(v_invite.inviter_user_id, p_actor_user_id)
    and user_high_id = greatest(v_invite.inviter_user_id, p_actor_user_id)
    and status = 'active';
  if v_existing_relationship_id is not null then
    raise exception 'relationship_already_exists';
  end if;

  select * into v_actor_profile
  from public.user_profiles
  where id = p_actor_user_id;
  if not found then raise exception 'actor_profile_not_found'; end if;

  v_phone_identity_matches :=
    public.profile_phone_identity_ready(v_actor_profile)
    and v_invite.intended_recipient_phone_e164 is not null
    and nullif(btrim(v_actor_profile.phone_e164), '') is not null
    and btrim(v_actor_profile.phone_e164) = btrim(v_invite.intended_recipient_phone_e164);

  update public.friendship_invite_deliveries
  set status = 'claimed', claimed_at = timezone('utc', now()), claimed_by_user_id = p_actor_user_id
  where id = v_delivery.id
  returning * into v_delivery;
  update public.friendship_invite_deliveries
  set status = 'revoked', revoked_at = coalesce(revoked_at, timezone('utc', now()))
  where invite_id = v_invite.id and id <> v_delivery.id and status = 'issued' and revoked_at is null;

  perform public.append_audit_event(
    p_actor_user_id, 'friendship_invite', v_invite.id, 'friendship_invite_claimed', null,
    jsonb_build_object(
      'delivery_id', v_delivery.id,
      'channel', v_delivery.channel,
      'claimed_by_user_id', p_actor_user_id,
      'phone_was_verified', v_actor_profile.phone_verified_at is not null,
      'phone_identity_source', case
        when v_actor_profile.phone_verified_at is not null then 'verified'
        when v_actor_profile.phone_identity_legacy_at is not null then 'legacy'
        else null
      end,
      'auto_accepted', v_phone_identity_matches
    )
  );

  if v_phone_identity_matches then
    insert into public.relationships (user_low_id, user_high_id, status)
    values (
      least(v_invite.inviter_user_id, p_actor_user_id),
      greatest(v_invite.inviter_user_id, p_actor_user_id),
      'active'
    )
    on conflict (user_low_id, user_high_id) do update set status = 'active'
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
      p_actor_user_id, 'friendship_invite', v_invite.id, 'friendship_invite_accepted', null,
      jsonb_build_object(
        'relationship_id', v_relationship_id,
        'claimed_by_user_id', p_actor_user_id,
        'resolution_reason', 'claim_phone_match_auto_accepted'
      )
    );
    v_response := jsonb_build_object(
      'inviteId', v_invite.id, 'deliveryId', v_delivery.id,
      'status', v_invite.status, 'resolvedAt', v_invite.resolved_at,
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
      'inviteId', v_invite.id, 'deliveryId', v_delivery.id,
      'status', v_invite.status, 'expiresAt', v_invite.expires_at,
      'actorRole', 'claimant'
    );
  end if;

  update public.idempotency_keys
  set response_json = v_response,
      completed_at = timezone('utc', now()),
      expires_at = timezone('utc', now()) + interval '30 days'
  where id = v_idempotency.id;
  return v_response;
end;
$$;

revoke all on function public.claim_external_friendship_invite(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.claim_external_friendship_invite(uuid, text, text)
  to service_role;

create or replace function public.get_account_invite_preview_public(
  p_delivery_token text,
  p_record_app_open boolean default true,
  p_client_fingerprint_hash text default null,
  p_actor_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_delivery_id uuid;
  v_invite_id uuid;
  v_delivery public.account_invite_deliveries%rowtype;
  v_invite public.account_invites%rowtype;
  v_inviter public.user_profiles%rowtype;
  v_now timestamptz := timezone('utc', now());
  v_token text := nullif(btrim(p_delivery_token), '');
  v_token_hash text := public.hash_invite_token(p_delivery_token);
  v_fingerprint_hash text := nullif(btrim(p_client_fingerprint_hash), '');
  v_window_started_at timestamptz := date_trunc('hour', timezone('utc', now()));
  v_request_count integer;
  v_unavailable jsonb := jsonb_build_object(
    'inviteId', null, 'deliveryId', null, 'status', 'unavailable',
    'deliveryStatus', 'unavailable', 'channel', null, 'expiresAt', null,
    'inviteExpiresAt', null, 'resolvedAt', null, 'inviterDisplayName', null,
    'inviterAvatarPath', null, 'intendedRecipientPhoneMasked', null,
    'reason', 'invite_unavailable'
  );
begin
  if v_token is null then return v_unavailable; end if;

  if v_fingerprint_hash is not null then
    insert into public.public_invite_preview_rate_limits (
      token_hash, client_fingerprint_hash, window_started_at, request_count, updated_at
    ) values (
      coalesce(v_token_hash, public.hash_invite_token('invalid-token')),
      v_fingerprint_hash, v_window_started_at, 1, v_now
    )
    on conflict (token_hash, client_fingerprint_hash, window_started_at)
    do update set
      request_count = public.public_invite_preview_rate_limits.request_count + 1,
      updated_at = excluded.updated_at
    returning request_count into v_request_count;
    if v_request_count > 60 then raise exception 'invite_preview_rate_limited'; end if;
  end if;

  select id, invite_id into v_delivery_id, v_invite_id
  from public.account_invite_deliveries
  where token_hash = v_token_hash
  order by created_at desc
  limit 1;
  if v_delivery_id is null then return v_unavailable; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_invite_id::text, 73001));

  select * into v_invite
  from public.account_invites where id = v_invite_id for update;
  if not found then return v_unavailable; end if;
  select * into v_delivery
  from public.account_invite_deliveries where id = v_delivery_id for update;
  if not found then return v_unavailable; end if;

  if public.effective_account_invite_status(v_invite.status, v_invite.expires_at)
      <> v_invite.status then
    update public.account_invites
    set status = public.effective_account_invite_status(status, expires_at),
        resolution_actor = coalesce(resolution_actor, 'system'),
        resolution_reason = coalesce(resolution_reason, 'expired_before_preview'),
        resolved_at = coalesce(resolved_at, v_now),
        updated_at = v_now
    where id = v_invite.id
    returning * into v_invite;
  end if;
  if public.effective_account_invite_delivery_status(
      v_delivery.status, v_delivery.expires_at, v_delivery.revoked_at
    ) <> v_delivery.status then
    update public.account_invite_deliveries
    set status = public.effective_account_invite_delivery_status(status, expires_at, revoked_at),
        updated_at = v_now
    where id = v_delivery.id
    returning * into v_delivery;
  end if;

  -- Preserve the public terminal-state contract from 0043. These responses
  -- intentionally expose only the same masked inviter/recipient data as an
  -- open invite; claimant mismatches below remain fully unavailable.
  if v_invite.status in ('accepted', 'rejected', 'canceled', 'expired')
    or v_delivery.status in ('revoked', 'expired') then
    select * into v_inviter
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
        when v_invite.status in ('accepted', 'rejected', 'canceled', 'expired')
          then v_invite.status::text
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
        or (v_delivery.authenticated_user_id is not null
          and v_delivery.authenticated_user_id <> p_actor_user_id)
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
    null, 'account_invite', v_invite.id, 'account_invite_opened', null,
    jsonb_build_object(
      'delivery_id', v_delivery.id,
      'channel', v_delivery.channel,
      'open_count', v_delivery.open_count
    )
  );
  select * into v_inviter from public.user_profiles where id = v_invite.inviter_user_id;
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

-- The auth trigger remains deliberately profile-only. Claiming an invite while
-- the surrounding auth INSERT still owns a user_profiles row would invert the
-- canonical invite -> delivery -> profile lock order. Email-confirmation claims
-- are installed separately after the schema and data phases have committed.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_phone_country_iso2 text;
  v_phone_country_calling_code text;
  v_phone_national_number text;
  v_phone_e164 text;
begin
  v_phone_country_iso2 := nullif(upper(coalesce(new.raw_user_meta_data ->> 'phone_country_iso2', '')), '');
  v_phone_country_calling_code := nullif(coalesce(new.raw_user_meta_data ->> 'phone_country_calling_code', ''), '');
  v_phone_national_number := nullif(coalesce(new.raw_user_meta_data ->> 'phone_national_number', ''), '');
  v_phone_e164 := nullif(coalesce(new.raw_user_meta_data ->> 'phone_e164', ''), '');

  insert into public.user_profiles (
    id,
    email,
    display_name,
    phone_country_iso2,
    phone_country_calling_code,
    phone_national_number,
    phone_e164,
    phone_identity_legacy_at,
    account_access_state
  ) values (
    new.id,
    new.email,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), ''),
    v_phone_country_iso2,
    v_phone_country_calling_code,
    v_phone_national_number,
    v_phone_e164,
    case when v_phone_e164 is null then null else timezone('utc', now()) end,
    'needs_invite'
  )
  on conflict (id) do update
  set email = excluded.email,
      display_name = excluded.display_name,
      phone_country_iso2 = coalesce(excluded.phone_country_iso2, public.user_profiles.phone_country_iso2),
      phone_country_calling_code = coalesce(excluded.phone_country_calling_code, public.user_profiles.phone_country_calling_code),
      phone_national_number = coalesce(excluded.phone_national_number, public.user_profiles.phone_national_number),
      phone_e164 = coalesce(excluded.phone_e164, public.user_profiles.phone_e164);

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

create or replace function public.mark_onboarding_completed(p_actor_user_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_completed_at timestamptz;
begin
  perform public.assert_request_actor(p_actor_user_id);

  update public.user_profiles
  set onboarding_completed_at = coalesce(onboarding_completed_at, timezone('utc', now()))
  where id = p_actor_user_id
    and account_access_state = 'active'
    and exists (
      select 1
      from auth.users auth_user
      where auth_user.id = p_actor_user_id
        and auth_user.email_confirmed_at is not null
    )
    and length(btrim(display_name)) >= 3
    and position('@' in btrim(display_name)) = 0
    and nullif(btrim(email), '') is not null
    and nullif(btrim(phone_e164), '') is not null
  returning onboarding_completed_at into v_completed_at;

  if v_completed_at is null then
    raise exception 'onboarding_not_ready';
  end if;
  return v_completed_at;
end;
$$;

create or replace function public.claim_welcome_email_delivery_v2(p_actor_user_id uuid)
returns table(email text, display_name text, lease_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_stale_before timestamptz := v_now - interval '10 minutes';
  v_lease_id uuid := gen_random_uuid();
begin
  perform public.assert_request_actor(p_actor_user_id);

  return query
  update public.user_profiles profile
  set welcome_email_queued_at = v_now,
      welcome_email_lease_id = v_lease_id,
      welcome_email_last_error = null
  where profile.id = p_actor_user_id
    and profile.onboarding_completed_at is not null
    and profile.account_access_state = 'active'
    and profile.welcome_email_sent_at is null
    and (
      profile.welcome_email_queued_at is null
      or profile.welcome_email_queued_at < v_stale_before
    )
    and length(btrim(profile.display_name)) >= 3
    and position('@' in btrim(profile.display_name)) = 0
    and nullif(btrim(profile.email), '') is not null
    and nullif(btrim(profile.phone_e164), '') is not null
  returning profile.email, profile.display_name, profile.welcome_email_lease_id;
end;
$$;

create or replace function public.mark_welcome_email_sent_v2(
  p_actor_user_id uuid,
  p_lease_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.assert_request_actor(p_actor_user_id);
  update public.user_profiles
  set welcome_email_sent_at = coalesce(welcome_email_sent_at, timezone('utc', now())),
      welcome_email_queued_at = null,
      welcome_email_lease_id = null,
      welcome_email_last_error = null
  where id = p_actor_user_id
    and welcome_email_sent_at is null
    and welcome_email_lease_id = p_lease_id;
  return found;
end;
$$;

create or replace function public.release_welcome_email_delivery_v2(
  p_actor_user_id uuid,
  p_lease_id uuid,
  p_error text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.assert_request_actor(p_actor_user_id);
  update public.user_profiles
  set welcome_email_queued_at = null,
      welcome_email_lease_id = null,
      welcome_email_last_error = left(nullif(btrim(coalesce(p_error, '')), ''), 240)
  where id = p_actor_user_id
    and welcome_email_sent_at is null
    and welcome_email_lease_id = p_lease_id;
  return found;
end;
$$;

revoke all on function public.mark_onboarding_completed(uuid)
  from public, anon, authenticated;
revoke all on function public.claim_welcome_email_delivery_v2(uuid)
  from public, anon, authenticated;
revoke all on function public.mark_welcome_email_sent_v2(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.release_welcome_email_delivery_v2(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.mark_onboarding_completed(uuid) to service_role;
grant execute on function public.claim_welcome_email_delivery_v2(uuid) to service_role;
grant execute on function public.mark_welcome_email_sent_v2(uuid, uuid) to service_role;
grant execute on function public.release_welcome_email_delivery_v2(uuid, uuid, text) to service_role;

create or replace function public.cleanup_new_user_operational_state()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_claims_released integer := 0;
  v_idempotency_deleted integer := 0;
begin
  with candidates as materialized (
    select id
    from public.idempotency_keys
    where operation_name in (
      'create_account_invite',
      'activate_account_from_invite',
      'claim_external_friendship_invite'
    )
      and (
        expires_at < timezone('utc', now())
        or (
          response_json is null
          and created_at < timezone('utc', now()) - interval '7 days'
        )
      )
    order by id
    limit 5000
    for update skip locked
  ), deleted as (
    delete from public.idempotency_keys idempotency
    using candidates
    where idempotency.id = candidates.id
    returning 1
  )
  select count(*)::integer into v_idempotency_deleted from deleted;

  -- Match command paths: idempotency rows are always touched before invite rows.
  v_claims_released := public.release_stale_account_invite_claims(1000);

  return jsonb_build_object(
    'staleInviteClaimsReleased', v_claims_released,
    'idempotencyKeysDeleted', v_idempotency_deleted
  );
end;
$$;

revoke all on function public.cleanup_new_user_operational_state()
  from public, anon, authenticated;
grant execute on function public.cleanup_new_user_operational_state() to service_role;

-- Edge Functions use a service-role PostgREST client for actor-scoped snapshot
-- assembly and post-transition notification lookups. BYPASSRLS does not bypass
-- table ACLs, and the security-invoker views also require access to their base
-- relations. Keep this contract read-only; state changes remain behind the
-- service-role-only RPCs above.
-- edge_service_role_read_contract:start
grant select on table
  public.relationships,
  public.pair_net_edges_cache,
  public.financial_requests,
  public.ledger_accounts,
  public.ledger_transactions,
  public.ledger_entries,
  public.settlement_proposals,
  public.settlement_proposal_participants,
  public.happy_circle_score_events,
  public.notification_views,
  public.audit_events,
  public.user_profiles,
  public.friendship_invites,
  public.friendship_invite_deliveries,
  public.account_invites,
  public.account_invite_deliveries
to service_role;

grant select on table
  public.v_open_debts,
  public.v_relationship_history,
  public.v_inbox_items,
  public.v_friendship_invites_live,
  public.v_friendship_invite_deliveries_live,
  public.v_account_invites_live,
  public.v_account_invite_deliveries_live
to service_role;
-- edge_service_role_read_contract:end
