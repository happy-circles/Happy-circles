do $$
begin
  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'account_access_state'
  ) then
    create type public.account_access_state as enum ('needs_invite', 'needs_activation', 'active');
  end if;

  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'account_invite_status'
  ) then
    create type public.account_invite_status as enum (
      'pending_activation',
      'pending_inviter_review',
      'accepted',
      'rejected',
      'canceled',
      'expired'
    );
  end if;

  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'account_invite_channel'
  ) then
    create type public.account_invite_channel as enum ('remote', 'qr');
  end if;
end
$$;

alter table public.user_profiles
  add column if not exists account_access_state public.account_access_state not null default 'active',
  add column if not exists invited_by_user_id uuid references public.user_profiles (id) on delete set null,
  add column if not exists activated_at timestamptz;

update public.user_profiles
set account_access_state = 'active'
where account_access_state is null;

alter table public.user_profiles
  alter column account_access_state set default 'needs_invite';

create table if not exists public.account_invites (
  id uuid primary key default gen_random_uuid(),
  inviter_user_id uuid not null references public.user_profiles (id) on delete cascade,
  activated_user_id uuid references public.user_profiles (id) on delete set null,
  linked_relationship_id uuid references public.relationships (id) on delete set null,
  status public.account_invite_status not null default 'pending_activation',
  resolution_actor text,
  resolution_reason text,
  intended_recipient_alias text,
  intended_recipient_phone_e164 text,
  intended_recipient_phone_label text,
  source_context text,
  expires_at timestamptz not null default timezone('utc', now()) + interval '7 days',
  activated_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint account_invites_actor_not_claimant check (
    activated_user_id is null or inviter_user_id <> activated_user_id
  )
);

create index if not exists account_invites_inviter_created_idx
  on public.account_invites (inviter_user_id, created_at desc);

create unique index if not exists account_invites_pending_per_phone_idx
  on public.account_invites (inviter_user_id, intended_recipient_phone_e164)
  where status in ('pending_activation', 'pending_inviter_review')
    and intended_recipient_phone_e164 is not null;

create table if not exists public.account_invite_deliveries (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references public.account_invites (id) on delete cascade,
  token text not null,
  channel public.account_invite_channel not null,
  source_context text,
  status text not null default 'issued' check (status in ('issued', 'authenticated', 'activated', 'revoked', 'expired')),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  first_opened_at timestamptz,
  last_opened_at timestamptz,
  open_count integer not null default 0,
  first_app_opened_at timestamptz,
  authenticated_user_id uuid references public.user_profiles (id) on delete set null,
  authenticated_at timestamptz,
  activation_completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists account_invite_deliveries_token_unique_idx
  on public.account_invite_deliveries (token);

create index if not exists account_invite_deliveries_invite_created_idx
  on public.account_invite_deliveries (invite_id, created_at desc);

alter table public.user_profiles
  add column if not exists activated_via_account_invite_id uuid references public.account_invites (id) on delete set null;

create or replace function public.effective_account_invite_status(
  p_status public.account_invite_status,
  p_expires_at timestamptz
)
returns public.account_invite_status
language plpgsql
stable
set search_path = public
as $$
begin
  if p_status in ('pending_activation', 'pending_inviter_review')
    and p_expires_at <= timezone('utc', now()) then
    return 'expired';
  end if;

  return p_status;
end;
$$;

create or replace function public.effective_account_invite_delivery_status(
  p_status text,
  p_expires_at timestamptz,
  p_revoked_at timestamptz
)
returns text
language plpgsql
stable
set search_path = public
as $$
begin
  if p_status = 'revoked' or p_revoked_at is not null then
    return 'revoked';
  end if;

  if p_status in ('issued', 'authenticated') and p_expires_at <= timezone('utc', now()) then
    return 'expired';
  end if;

  return p_status;
end;
$$;

create or replace view public.v_account_invites_live as
select
  invite.id,
  invite.inviter_user_id,
  invite.activated_user_id,
  invite.linked_relationship_id,
  public.effective_account_invite_status(invite.status, invite.expires_at) as status,
  invite.resolution_actor,
  invite.resolution_reason,
  invite.intended_recipient_alias,
  invite.intended_recipient_phone_e164,
  invite.intended_recipient_phone_label,
  invite.source_context,
  invite.expires_at,
  invite.activated_at,
  invite.resolved_at,
  invite.created_at,
  invite.updated_at
from public.account_invites invite;

create or replace view public.v_account_invite_deliveries_live as
select
  delivery.id,
  delivery.invite_id,
  delivery.token,
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

alter table public.account_invites enable row level security;
alter table public.account_invite_deliveries enable row level security;

drop policy if exists account_invites_select_visible on public.account_invites;
create policy account_invites_select_visible
on public.account_invites
for select
to authenticated
using (
  inviter_user_id = auth.uid()
  or activated_user_id = auth.uid()
);

drop policy if exists account_invite_deliveries_select_visible on public.account_invite_deliveries;
create policy account_invite_deliveries_select_visible
on public.account_invite_deliveries
for select
to authenticated
using (
  exists (
    select 1
    from public.account_invites invite
    where invite.id = account_invite_deliveries.invite_id
      and (
        invite.inviter_user_id = auth.uid()
        or invite.activated_user_id = auth.uid()
      )
  )
);

grant select on public.account_invites to authenticated;
grant select on public.account_invite_deliveries to authenticated;

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
  v_existing_delivery public.account_invite_deliveries%rowtype;
  v_response jsonb;
  v_delivery_expires_at timestamptz;
  v_alias text := nullif(btrim(p_intended_recipient_alias), '');
  v_phone_e164 text := nullif(btrim(p_intended_recipient_phone_e164), '');
  v_phone_label text := nullif(btrim(p_intended_recipient_phone_label), '');
  v_source_context text := nullif(btrim(p_source_context), '');
begin
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

  if v_idempotency.response_json is not null then
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
    select *
      into v_existing_delivery
    from public.account_invite_deliveries
    where invite_id = v_invite.id
      and channel = 'remote'
      and status = 'issued'
      and revoked_at is null
      and expires_at > timezone('utc', now())
    order by created_at desc
    limit 1
    for update;

    if found then
      v_response := jsonb_build_object(
        'inviteId', v_invite.id,
        'deliveryId', v_existing_delivery.id,
        'deliveryToken', v_existing_delivery.token,
        'status', public.effective_account_invite_status(v_invite.status, v_invite.expires_at),
        'channel', v_existing_delivery.channel,
        'originChannel', p_channel,
        'expiresAt', v_existing_delivery.expires_at,
        'inviteExpiresAt', v_invite.expires_at,
        'intendedRecipientAlias', v_invite.intended_recipient_alias,
        'intendedRecipientPhoneE164', v_invite.intended_recipient_phone_e164,
        'intendedRecipientPhoneLabel', v_invite.intended_recipient_phone_label
      );

      update public.idempotency_keys
      set response_json = v_response
      where id = v_idempotency.id;

      return v_response;
    end if;

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

  insert into public.account_invite_deliveries (
    invite_id,
    token,
    channel,
    source_context,
    status,
    expires_at
  )
  values (
    v_invite.id,
    public.generate_short_token(18),
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
    'deliveryToken', v_delivery.token,
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
  set response_json = v_response
  where id = v_idempotency.id;

  return v_response;
end;
$$;

create or replace function public.resolve_people_targets(
  p_actor_user_id uuid,
  p_phone_e164_list text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_response jsonb;
begin
  with input_numbers as (
    select
      ordinality as position,
      nullif(btrim(phone_e164), '') as phone_e164
    from unnest(coalesce(p_phone_e164_list, array[]::text[])) with ordinality as input(phone_e164, ordinality)
  ),
  matched_profiles as (
    select
      input.position,
      input.phone_e164,
      profile.id as matched_user_id,
      profile.display_name,
      profile.avatar_path,
      profile.account_access_state
    from input_numbers input
    left join public.user_profiles profile
      on profile.phone_e164 = input.phone_e164
     and profile.id <> p_actor_user_id
  ),
  relationship_matches as (
    select
      matched.position,
      relationship.id as relationship_id
    from matched_profiles matched
    join public.relationships relationship
      on relationship.user_low_id = least(p_actor_user_id, matched.matched_user_id)
     and relationship.user_high_id = greatest(p_actor_user_id, matched.matched_user_id)
     and relationship.status = 'active'
  ),
  friendship_matches as (
    select distinct on (matched.position)
      matched.position,
      invite.id as invite_id
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
     and public.effective_account_invite_status(invite.status, invite.expires_at) in ('pending_activation', 'pending_inviter_review')
    order by input.position, invite.created_at desc
  )
  select jsonb_agg(
    jsonb_build_object(
      'phoneE164', input.phone_e164,
      'status',
        case
          when input.phone_e164 is null then 'no_account'
          when relationship.relationship_id is not null then 'already_related'
          when matched.matched_user_id is not null and matched.account_access_state = 'active' and friendship.invite_id is not null then 'pending_friendship'
          when matched.matched_user_id is not null and matched.account_access_state = 'active' then 'active_user'
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
    )
    order by input.position
  )
    into v_response
  from input_numbers input
  left join matched_profiles matched
    on matched.position = input.position
  left join relationship_matches relationship
    on relationship.position = input.position
  left join friendship_matches friendship
    on friendship.position = input.position
  left join account_matches account
    on account.position = input.position;

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
set search_path = public
as $$
declare
  v_phone_e164 text := nullif(btrim(p_intended_recipient_phone_e164), '');
  v_target_profile public.user_profiles%rowtype;
  v_target_profile_found boolean := false;
  v_relationship_id uuid;
  v_pending_friendship public.friendship_invites%rowtype;
  v_outreach_response jsonb;
begin
  if v_phone_e164 is null then
    raise exception 'contact_phone_required';
  end if;

  select *
    into v_target_profile
  from public.user_profiles
  where phone_e164 = v_phone_e164
    and id <> p_actor_user_id
  limit 1;

  v_target_profile_found := found;

  if v_target_profile_found and v_target_profile.account_access_state = 'active' then
    select id
      into v_relationship_id
    from public.relationships
    where user_low_id = least(p_actor_user_id, v_target_profile.id)
      and user_high_id = greatest(p_actor_user_id, v_target_profile.id)
      and status = 'active';

    if v_relationship_id is not null then
      return jsonb_build_object(
        'kind', 'already_related',
        'status', 'already_related',
        'relationshipId', v_relationship_id,
        'matchedUserId', v_target_profile.id,
        'displayName', v_target_profile.display_name
      );
    end if;

    select *
      into v_pending_friendship
    from public.friendship_invites
    where flow = 'internal'
      and status = 'pending_recipient'
      and least(inviter_user_id, target_user_id) = least(p_actor_user_id, v_target_profile.id)
      and greatest(inviter_user_id, target_user_id) = greatest(p_actor_user_id, v_target_profile.id)
    order by created_at desc
    limit 1;

    if found then
      return jsonb_build_object(
        'kind', 'friendship',
        'status', 'pending_friendship',
        'inviteId', v_pending_friendship.id,
        'matchedUserId', v_target_profile.id,
        'displayName', v_target_profile.display_name
      );
    end if;

    v_outreach_response := public.create_internal_friendship_invite(
      p_actor_user_id,
      p_idempotency_key,
      v_target_profile.id,
      p_source_context
    );

    return jsonb_build_object(
      'kind', 'friendship',
      'status', 'active_user',
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

create or replace function public.get_account_invite_preview_public(
  p_delivery_token text,
  p_record_app_open boolean default true
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
  v_activated public.user_profiles%rowtype;
  v_now timestamptz := timezone('utc', now());
  v_effective_invite_status public.account_invite_status;
  v_effective_delivery_status text;
begin
  select *
    into v_delivery
  from public.account_invite_deliveries
  where token = btrim(p_delivery_token)
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

  if v_delivery.status in ('issued', 'authenticated') then
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
  end if;

  select *
    into v_inviter
  from public.user_profiles
  where id = v_invite.inviter_user_id;

  if v_invite.activated_user_id is not null then
    select *
      into v_activated
    from public.user_profiles
    where id = v_invite.activated_user_id;
  end if;

  return jsonb_build_object(
    'inviteId', v_invite.id,
    'deliveryId', v_delivery.id,
    'status', v_invite.status,
    'deliveryStatus', v_delivery.status,
    'channel', v_delivery.channel,
    'expiresAt', v_delivery.expires_at,
    'inviteExpiresAt', v_invite.expires_at,
    'resolvedAt', v_invite.resolved_at,
    'inviterUserId', v_invite.inviter_user_id,
    'inviterDisplayName', coalesce(v_inviter.display_name, 'Persona'),
    'intendedRecipientAlias', v_invite.intended_recipient_alias,
    'intendedRecipientPhoneE164', v_invite.intended_recipient_phone_e164,
    'intendedRecipientPhoneLabel', v_invite.intended_recipient_phone_label,
    'activatedUserId', v_invite.activated_user_id,
    'activatedDisplayName', case when v_activated.id is not null then v_activated.display_name else null end,
    'linkedRelationshipId', v_invite.linked_relationship_id,
    'reason',
      case
        when v_delivery.status = 'revoked' then 'delivery_revoked'
        when v_delivery.status = 'expired' then 'delivery_expired'
        when v_invite.status = 'pending_activation' then 'pending_activation'
        when v_invite.status = 'pending_inviter_review' then 'pending_inviter_review'
        when v_invite.status = 'accepted' then 'accepted'
        when v_invite.status = 'rejected' then 'rejected'
        when v_invite.status = 'canceled' then 'canceled'
        else 'expired'
      end
  );
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
  v_trusted_device public.trusted_devices%rowtype;
  v_relationship_id uuid;
  v_now timestamptz := timezone('utc', now());
  v_phone_matches boolean := false;
  v_response jsonb;
begin
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
  where token = btrim(p_delivery_token)
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

  select *
    into v_trusted_device
  from public.trusted_devices
  where user_id = p_actor_user_id
    and device_id = btrim(p_current_device_id)
  order by created_at desc
  limit 1;

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

create or replace function public.review_account_invite(
  p_actor_user_id uuid,
  p_idempotency_key text,
  p_invite_id uuid,
  p_decision text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_idempotency public.idempotency_keys%rowtype;
  v_invite public.account_invites%rowtype;
  v_relationship_id uuid;
  v_now timestamptz := timezone('utc', now());
  v_response jsonb;
begin
  if p_decision not in ('approve', 'reject') then
    raise exception 'invalid_account_invite_review_decision';
  end if;

  insert into public.idempotency_keys (actor_user_id, operation_name, idempotency_key)
  values (p_actor_user_id, 'review_account_invite', p_idempotency_key)
  on conflict (actor_user_id, operation_name, idempotency_key) do nothing;

  select *
    into v_idempotency
  from public.idempotency_keys
  where actor_user_id = p_actor_user_id
    and operation_name = 'review_account_invite'
    and idempotency_key = p_idempotency_key
  for update;

  if v_idempotency.response_json is not null then
    return v_idempotency.response_json;
  end if;

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
        resolution_reason = coalesce(resolution_reason, 'expired_before_review'),
        resolved_at = coalesce(resolved_at, v_now),
        updated_at = v_now
    where id = v_invite.id
    returning * into v_invite;
  end if;

  if v_invite.status <> 'pending_inviter_review' then
    raise exception 'account_invite_not_pending_inviter_review';
  end if;

  if v_invite.activated_user_id is null then
    raise exception 'account_invite_missing_activated_user';
  end if;

  if p_decision = 'approve' then
    insert into public.relationships (user_low_id, user_high_id, status)
    values (
      least(v_invite.inviter_user_id, v_invite.activated_user_id),
      greatest(v_invite.inviter_user_id, v_invite.activated_user_id),
      'active'
    )
    on conflict (user_low_id, user_high_id)
    do update set status = 'active'
    returning id into v_relationship_id;

    perform public.ensure_relationship_accounts(v_relationship_id);

    update public.account_invites
    set linked_relationship_id = v_relationship_id,
        status = 'accepted',
        resolution_actor = 'sender',
        resolution_reason = 'sender_approved_activation',
        resolved_at = v_now,
        updated_at = v_now
    where id = v_invite.id
    returning * into v_invite;

    perform public.append_audit_event(
      p_actor_user_id,
      'account_invite',
      v_invite.id,
      'account_invite_sender_approved',
      null,
      jsonb_build_object(
        'relationship_id', v_relationship_id,
        'activated_user_id', v_invite.activated_user_id
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
        'activated_user_id', v_invite.activated_user_id
      )
    );

    v_response := jsonb_build_object(
      'inviteId', v_invite.id,
      'status', v_invite.status,
      'relationshipId', v_relationship_id
    );
  else
    update public.account_invites
    set status = 'rejected',
        resolution_actor = 'sender',
        resolution_reason = 'sender_rejected_activation',
        resolved_at = v_now,
        updated_at = v_now
    where id = v_invite.id
    returning * into v_invite;

    perform public.append_audit_event(
      p_actor_user_id,
      'account_invite',
      v_invite.id,
      'account_invite_sender_rejected',
      null,
      jsonb_build_object(
        'activated_user_id', v_invite.activated_user_id
      )
    );

    perform public.append_audit_event(
      p_actor_user_id,
      'account_invite',
      v_invite.id,
      'account_invite_rejected',
      null,
      jsonb_build_object(
        'activated_user_id', v_invite.activated_user_id
      )
    );

    v_response := jsonb_build_object(
      'inviteId', v_invite.id,
      'status', v_invite.status
    );
  end if;

  update public.idempotency_keys
  set response_json = v_response
  where id = v_idempotency.id;

  return v_response;
end;
$$;

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

  return new;
end;
$$;

grant execute on function public.create_account_invite(
  uuid,
  text,
  public.account_invite_channel,
  text,
  text,
  text,
  text
) to authenticated;

grant execute on function public.resolve_people_targets(uuid, text[]) to authenticated;

grant execute on function public.create_people_outreach(
  uuid,
  text,
  public.account_invite_channel,
  text,
  text,
  text,
  text
) to authenticated;

grant execute on function public.get_account_invite_preview_public(text, boolean) to anon, authenticated;

grant execute on function public.activate_account_from_invite(
  uuid,
  text,
  text,
  text
) to authenticated;

grant execute on function public.review_account_invite(
  uuid,
  text,
  uuid,
  text
) to authenticated;
