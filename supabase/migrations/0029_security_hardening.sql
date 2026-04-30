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

create unique index if not exists friendship_invite_deliveries_token_hash_unique_idx
  on public.friendship_invite_deliveries (token_hash)
  where token_hash is not null;

create unique index if not exists account_invite_deliveries_token_hash_unique_idx
  on public.account_invite_deliveries (token_hash)
  where token_hash is not null;

create or replace function public.set_invite_delivery_token_hash()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.token is not null then
    new.token_hash := public.hash_invite_token(new.token);
  elsif new.token_hash is not null then
    new.token_hash := btrim(new.token_hash);
  end if;

  return new;
end;
$$;

revoke all on function public.set_invite_delivery_token_hash() from public, anon, authenticated;
grant execute on function public.set_invite_delivery_token_hash() to service_role;

drop trigger if exists set_friendship_invite_delivery_token_hash on public.friendship_invite_deliveries;
create trigger set_friendship_invite_delivery_token_hash
before insert or update of token, token_hash on public.friendship_invite_deliveries
for each row execute function public.set_invite_delivery_token_hash();

drop trigger if exists set_account_invite_delivery_token_hash on public.account_invite_deliveries;
create trigger set_account_invite_delivery_token_hash
before insert or update of token, token_hash on public.account_invite_deliveries
for each row execute function public.set_invite_delivery_token_hash();

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
  where (
      v_delivery_token_hash is not null
      and token_hash = v_delivery_token_hash
    )
    or (
      token_hash is null
      and token = v_delivery_token
    )
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
end
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
