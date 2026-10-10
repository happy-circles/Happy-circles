-- Additive rollout: deploy the proof endpoint/mobile flow before enabling this Auth hook.
-- OAuth hook UUIDs are provisional. Reservation consumption belongs to the real INSERT transaction.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- The real INSERT guard cannot infer the hosted Auth-hook configuration. Activate this switch
-- with that hook only after the invited-social mobile flow is released; rollback disables both.
create table app_private.signup_gate_configuration (
  singleton boolean primary key default true check (singleton),
  enforce_social_grants boolean not null default false
);
insert into app_private.signup_gate_configuration(singleton, enforce_social_grants) values (true, false);
alter table app_private.signup_gate_configuration enable row level security;
revoke all on table app_private.signup_gate_configuration from public, anon, authenticated, service_role, supabase_auth_admin;

create table app_private.social_registration_grants (
  invite_id uuid primary key references public.account_invites(id) on delete cascade,
  delivery_id uuid not null references public.account_invite_deliveries(id) on delete cascade,
  provider text not null check (provider in ('google', 'apple')),
  provider_subject text not null check (length(provider_subject) between 1 and 255),
  email text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  -- No early FK to auth.users: the BEFORE INSERT trigger knows the final UUID before its row exists.
  consumed_user_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check ((consumed_at is null) = (consumed_user_id is null))
);
create index social_registration_grants_identity_idx
  on app_private.social_registration_grants(provider, provider_subject, email);
alter table app_private.social_registration_grants enable row level security;
revoke all on table app_private.social_registration_grants from public, anon, authenticated, service_role, supabase_auth_admin;

create function public.prepare_social_registration(
  p_delivery_token text,
  p_provider text,
  p_provider_subject text,
  p_email text,
  p_credential_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_delivery_id uuid;
  v_invite_id uuid;
  v_invite public.account_invites%rowtype;
  v_delivery public.account_invite_deliveries%rowtype;
  v_grant app_private.social_registration_grants%rowtype;
  v_email text := lower(btrim(p_email));
  v_now timestamptz;
  v_expires_at timestamptz;
begin
  -- These assertions are supplied only by the service-role Edge endpoint after signature verification.
  if p_provider not in ('google', 'apple') or p_provider is null
    or nullif(btrim(p_provider_subject), '') is null or length(p_provider_subject) > 255
    or nullif(v_email, '') is null or length(v_email) > 320
    or nullif(btrim(p_delivery_token), '') is null then
    raise exception 'account_invite_required';
  end if;
  select delivery.id, delivery.invite_id into v_delivery_id, v_invite_id
  from public.account_invite_deliveries delivery
  where delivery.token_hash = public.hash_invite_token(p_delivery_token);
  if v_invite_id is null then raise exception 'account_invite_required'; end if;

  -- Same invite -> delivery ordering as claim/cancel/preview, followed by our private reservation.
  perform pg_advisory_xact_lock(hashtextextended(v_invite_id::text, 73001));
  select * into v_invite from public.account_invites where id = v_invite_id for update;
  select * into v_delivery from public.account_invite_deliveries where id = v_delivery_id for update;
  v_now := clock_timestamp();
  if v_invite.id is null or v_delivery.id is null
    or v_invite.status <> 'pending_activation' or v_invite.expires_at <= v_now
    or v_invite.activated_user_id is not null
    or v_delivery.status <> 'issued' or v_delivery.expires_at <= v_now
    or v_delivery.revoked_at is not null or v_delivery.authenticated_user_id is not null
    or p_credential_expires_at is null or p_credential_expires_at <= v_now then
    raise exception 'account_invite_required';
  end if;
  v_expires_at := least(p_credential_expires_at, v_invite.expires_at, v_delivery.expires_at, v_now + interval '5 minutes');

  select * into v_grant from app_private.social_registration_grants where invite_id = v_invite_id for update;
  if v_grant.invite_id is not null and (v_grant.consumed_at is not null or v_grant.expires_at > v_now)
    and (v_grant.provider <> p_provider or v_grant.provider_subject <> p_provider_subject or v_grant.email <> v_email) then
    raise exception 'account_invite_required';
  end if;
  -- The same identity may retry after a lost successful sign-in response. It will sign in to its existing user;
  -- the consumed grant never permits another INSERT, even when its five-minute reservation has expired.
  if v_grant.consumed_at is not null then
    return jsonb_build_object('authorized', true, 'expiresAt', v_expires_at);
  end if;
  insert into app_private.social_registration_grants(invite_id, delivery_id, provider, provider_subject, email, expires_at)
  values (v_invite_id, v_delivery_id, p_provider, p_provider_subject, v_email, v_expires_at)
  on conflict (invite_id) do update
  set delivery_id = excluded.delivery_id, provider = excluded.provider,
      provider_subject = excluded.provider_subject, email = excluded.email,
      expires_at = excluded.expires_at, updated_at = v_now;
  return jsonb_build_object('authorized', true, 'expiresAt', v_expires_at);
end;
$$;
revoke all on function public.prepare_social_registration(text, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.prepare_social_registration(text, text, text, text, timestamptz) to service_role;

create function app_private.require_invited_signup(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_provider text := event #>> '{user,app_metadata,provider}';
  v_email text := lower(btrim(event #>> '{user,email}'));
  v_subject text := event #>> '{user,user_metadata,sub}';
  v_token_hash text := event #>> '{user,user_metadata,account_invite_delivery_token_hash}';
  v_allowed boolean := false;
  v_now timestamptz := clock_timestamp();
begin
  if event #> '{user,is_anonymous}' = 'true'::jsonb then
    v_allowed := false;
  elsif v_provider in ('google', 'apple') and nullif(v_subject, '') is not null then
    -- Social fields here come from Supabase's verified provider identity; email signup cannot forge provider.
    select exists (
      select 1 from app_private.social_registration_grants grant_row
      join public.account_invites invite on invite.id = grant_row.invite_id
      join public.account_invite_deliveries delivery on delivery.id = grant_row.delivery_id and delivery.invite_id = invite.id
      where grant_row.provider = v_provider and grant_row.provider_subject = v_subject and grant_row.email = v_email
        and grant_row.expires_at > v_now and grant_row.consumed_at is null
        and invite.status = 'pending_activation' and invite.expires_at > v_now and invite.activated_user_id is null
        and delivery.status = 'issued' and delivery.expires_at > v_now
        and delivery.revoked_at is null and delivery.authenticated_user_id is null
    ) into v_allowed;
  elsif v_provider = 'email' and v_token_hash ~ '^[0-9a-f]{64}$' then
    select exists (
      select 1 from public.account_invite_deliveries delivery
      join public.account_invites invite on invite.id = delivery.invite_id
      where delivery.token_hash = v_token_hash
        and invite.status = 'pending_activation' and invite.expires_at > v_now and invite.activated_user_id is null
        and delivery.status = 'issued' and delivery.expires_at > v_now
        and delivery.revoked_at is null and delivery.authenticated_user_id is null
        and not exists (
          select 1 from app_private.social_registration_grants grant_row
          where grant_row.invite_id = invite.id and grant_row.consumed_at is not null
        )
    ) into v_allowed;
  end if;
  if v_allowed then return '{}'::jsonb; end if;
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'account_invite_required: Necesitas una invitación válida para crear tu cuenta. Si ya tienes cuenta, usa el mismo método con el que te registraste.'
  ));
end;
$$;
revoke all on function app_private.require_invited_signup(jsonb) from public, anon, authenticated, service_role;
grant usage on schema app_private to supabase_auth_admin;
grant execute on function app_private.require_invited_signup(jsonb) to supabase_auth_admin;

create function app_private.consume_social_registration_grant()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_provider text := new.raw_app_meta_data ->> 'provider';
  v_subject text := new.raw_user_meta_data ->> 'sub';
  v_email text := lower(btrim(new.email));
  v_invite_id uuid;
  v_invite public.account_invites%rowtype;
  v_delivery public.account_invite_deliveries%rowtype;
  v_grant app_private.social_registration_grants%rowtype;
  v_now timestamptz;
begin
  if v_provider not in ('google', 'apple') or nullif(v_subject, '') is null then return new; end if;
  select grant_row.invite_id into v_invite_id from app_private.social_registration_grants grant_row
  where grant_row.provider = v_provider and grant_row.provider_subject = v_subject and grant_row.email = v_email
  order by grant_row.updated_at desc limit 1;
  if v_invite_id is null then
    if exists (select 1 from app_private.signup_gate_configuration where enforce_social_grants) then
      -- A permit can expire, be deleted, or be reassigned between the external hook and this INSERT.
      raise exception 'account_invite_required';
    end if;
    -- Additive rollout preserves older clients/administrative fixtures until explicit activation.
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_invite_id::text, 73001));
  select * into v_invite from public.account_invites where id = v_invite_id for update;
  select * into v_grant from app_private.social_registration_grants where invite_id = v_invite_id;
  select * into v_delivery from public.account_invite_deliveries where id = v_grant.delivery_id for update;
  select * into v_grant from app_private.social_registration_grants where invite_id = v_invite_id for update;
  v_now := clock_timestamp();
  if v_grant.invite_id is null or v_grant.provider <> v_provider or v_grant.provider_subject <> v_subject or v_grant.email <> v_email
    or v_grant.consumed_at is not null or v_grant.expires_at <= v_now
    or v_invite.id is null or v_invite.status <> 'pending_activation' or v_invite.expires_at <= v_now
    or v_invite.activated_user_id is not null
    or v_delivery.id is null or v_delivery.status <> 'issued' or v_delivery.expires_at <= v_now
    or v_delivery.revoked_at is not null or v_delivery.authenticated_user_id is not null then
    raise exception 'account_invite_required';
  end if;
  update app_private.social_registration_grants
  set consumed_at = v_now, consumed_user_id = new.id, updated_at = v_now
  where invite_id = v_invite_id;
  -- Profile creation, phone proof, invitation claim, and activation keep their existing sequence.
  return new;
end;
$$;
revoke all on function app_private.consume_social_registration_grant() from public, anon, authenticated, service_role, supabase_auth_admin;
create trigger before_auth_user_insert_consume_social_registration
before insert on auth.users
for each row execute function app_private.consume_social_registration_grant();
