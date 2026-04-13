do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'friendship_invite_flow'
      and n.nspname = 'public'
  ) then
    create type public.friendship_invite_flow as enum ('internal', 'external');
  end if;

  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'friendship_invite_status'
      and n.nspname = 'public'
  ) then
    create type public.friendship_invite_status as enum (
      'pending_recipient',
      'pending_claim',
      'pending_sender_review',
      'accepted',
      'rejected',
      'canceled',
      'expired'
    );
  end if;

  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'friendship_invite_channel'
      and n.nspname = 'public'
  ) then
    create type public.friendship_invite_channel as enum ('internal', 'whatsapp', 'link', 'qr');
  end if;

  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'friendship_invite_resolution_actor'
      and n.nspname = 'public'
  ) then
    create type public.friendship_invite_resolution_actor as enum ('sender', 'recipient', 'system');
  end if;

  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'friendship_invite_delivery_status'
      and n.nspname = 'public'
  ) then
    create type public.friendship_invite_delivery_status as enum ('issued', 'claimed', 'revoked', 'expired');
  end if;
end
$$;

alter table public.user_profiles
  add column if not exists phone_verified_at timestamptz;

create table if not exists public.friendship_invites (
  id uuid primary key default gen_random_uuid(),
  inviter_user_id uuid not null references public.user_profiles (id) on delete cascade,
  target_user_id uuid references public.user_profiles (id) on delete set null,
  claimant_user_id uuid references public.user_profiles (id) on delete set null,
  relationship_id uuid references public.relationships (id) on delete set null,
  flow public.friendship_invite_flow not null,
  origin_channel public.friendship_invite_channel not null,
  status public.friendship_invite_status not null,
  resolution_actor public.friendship_invite_resolution_actor,
  resolution_reason text,
  intended_recipient_alias text,
  claimant_snapshot jsonb,
  source_context text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null,
  resolved_at timestamptz,
  constraint friendship_invites_no_self_target
    check (target_user_id is null or inviter_user_id <> target_user_id),
  constraint friendship_invites_no_self_claimant
    check (claimant_user_id is null or inviter_user_id <> claimant_user_id),
  constraint friendship_invites_flow_shape
    check (
      (flow = 'internal' and origin_channel = 'internal' and target_user_id is not null)
      or
      (flow = 'external' and origin_channel <> 'internal' and target_user_id is null)
    )
);

create table if not exists public.friendship_invite_deliveries (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references public.friendship_invites (id) on delete cascade,
  token text not null,
  channel public.friendship_invite_channel not null,
  source_context text,
  delivery_phone_e164 text,
  status public.friendship_invite_delivery_status not null default 'issued',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null,
  claimed_at timestamptz,
  claimed_by_user_id uuid references public.user_profiles (id) on delete set null,
  revoked_at timestamptz,
  constraint friendship_invite_deliveries_channel_external check (channel <> 'internal')
);

create unique index if not exists friendship_invite_deliveries_token_unique_idx
  on public.friendship_invite_deliveries (token);

create unique index if not exists friendship_invites_pending_internal_pair_unique_idx
  on public.friendship_invites (
    least(inviter_user_id, target_user_id),
    greatest(inviter_user_id, target_user_id)
  )
  where flow = 'internal' and status = 'pending_recipient' and target_user_id is not null;

create unique index if not exists friendship_invites_pending_external_sender_unique_idx
  on public.friendship_invites (inviter_user_id)
  where flow = 'external' and status = 'pending_claim';

create unique index if not exists friendship_invites_active_qr_delivery_unique_idx
  on public.friendship_invite_deliveries (invite_id, channel)
  where channel = 'qr' and status = 'issued' and revoked_at is null;

create index if not exists friendship_invites_inviter_status_idx
  on public.friendship_invites (inviter_user_id, status, created_at desc);

create index if not exists friendship_invites_target_status_idx
  on public.friendship_invites (target_user_id, status, created_at desc);

create index if not exists friendship_invites_claimant_status_idx
  on public.friendship_invites (claimant_user_id, status, created_at desc);

create index if not exists friendship_invite_deliveries_invite_idx
  on public.friendship_invite_deliveries (invite_id, created_at desc);

create index if not exists friendship_invite_deliveries_claimant_idx
  on public.friendship_invite_deliveries (claimed_by_user_id, claimed_at desc);

drop trigger if exists set_friendship_invites_updated_at on public.friendship_invites;
create trigger set_friendship_invites_updated_at
before update on public.friendship_invites
for each row execute function public.tg_set_updated_at();

drop trigger if exists set_friendship_invite_deliveries_updated_at on public.friendship_invite_deliveries;
create trigger set_friendship_invite_deliveries_updated_at
before update on public.friendship_invite_deliveries
for each row execute function public.tg_set_updated_at();

create or replace function public.friendship_channel_from_label(p_label text)
returns public.friendship_invite_channel
language sql
immutable
as $$
  select case
    when coalesce(lower(btrim(p_label)), '') like '%what%' then 'whatsapp'::public.friendship_invite_channel
    when coalesce(lower(btrim(p_label)), '') like '%qr%' then 'qr'::public.friendship_invite_channel
    when coalesce(lower(btrim(p_label)), '') = 'directa' then 'internal'::public.friendship_invite_channel
    else 'link'::public.friendship_invite_channel
  end;
$$;

create or replace function public.mask_email_value(p_email text)
returns text
language sql
immutable
as $$
  select case
    when p_email is null or position('@' in p_email) <= 1 then null
    else left(split_part(p_email, '@', 1), 1)
      || repeat('*', greatest(length(split_part(p_email, '@', 1)) - 1, 1))
      || '@'
      || split_part(p_email, '@', 2)
  end;
$$;

create or replace function public.mask_phone_value(p_phone text)
returns text
language sql
immutable
as $$
  select case
    when p_phone is null or length(regexp_replace(p_phone, '[^0-9]', '', 'g')) < 4 then null
    else '***' || right(regexp_replace(p_phone, '[^0-9]', '', 'g'), 4)
  end;
$$;

create or replace function public.friendship_identity_flags(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.user_profiles%rowtype;
  v_email_confirmed boolean := false;
  v_has_display_name boolean := false;
  v_has_avatar boolean := false;
  v_has_phone boolean := false;
begin
  select *
    into v_profile
  from public.user_profiles
  where id = p_user_id;

  if not found then
    raise exception 'actor_profile_not_found';
  end if;

  select coalesce(email_confirmed_at is not null, false)
    into v_email_confirmed
  from auth.users
  where id = p_user_id;

  v_has_display_name := coalesce(length(btrim(v_profile.display_name)) >= 3, false)
    and position('@' in coalesce(v_profile.display_name, '')) = 0;
  v_has_avatar := coalesce(length(btrim(v_profile.avatar_path)) > 0, false);
  v_has_phone := coalesce(length(btrim(v_profile.phone_e164)) > 0, false);

  return jsonb_build_object(
    'emailConfirmed', v_email_confirmed,
    'hasDisplayName', v_has_display_name,
    'hasAvatar', v_has_avatar,
    'hasPhone', v_has_phone,
    'phoneVerified', v_profile.phone_verified_at is not null
  );
end;
$$;

create or replace function public.friendship_identity_ready(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select
    coalesce((flags ->> 'emailConfirmed')::boolean, false)
    and coalesce((flags ->> 'hasDisplayName')::boolean, false)
    and coalesce((flags ->> 'hasAvatar')::boolean, false)
    and coalesce((flags ->> 'hasPhone')::boolean, false)
  from (
    select public.friendship_identity_flags(p_user_id) as flags
  ) derived;
$$;

create or replace function public.build_friendship_claimant_snapshot(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.user_profiles%rowtype;
  v_flags jsonb;
begin
  select *
    into v_profile
  from public.user_profiles
  where id = p_user_id;

  if not found then
    raise exception 'claimant_profile_not_found';
  end if;

  v_flags := public.friendship_identity_flags(p_user_id);

  return jsonb_build_object(
    'displayName', v_profile.display_name,
    'avatarPath', v_profile.avatar_path,
    'maskedEmail', public.mask_email_value(v_profile.email),
    'maskedPhone', public.mask_phone_value(v_profile.phone_e164),
    'emailConfirmed', coalesce((v_flags ->> 'emailConfirmed')::boolean, false),
    'phonePresent', coalesce((v_flags ->> 'hasPhone')::boolean, false),
    'phoneVerified', coalesce((v_flags ->> 'phoneVerified')::boolean, false),
    'claimedAt', timezone('utc', now())
  );
end;
$$;

create or replace function public.effective_friendship_invite_status(
  p_status public.friendship_invite_status,
  p_expires_at timestamptz
)
returns public.friendship_invite_status
language sql
stable
as $$
  select case
    when p_status in (
      'pending_recipient'::public.friendship_invite_status,
      'pending_claim'::public.friendship_invite_status,
      'pending_sender_review'::public.friendship_invite_status
    )
      and p_expires_at <= timezone('utc', now())
      then 'expired'::public.friendship_invite_status
    else p_status
  end;
$$;

create or replace function public.effective_friendship_delivery_status(
  p_status public.friendship_invite_delivery_status,
  p_expires_at timestamptz,
  p_revoked_at timestamptz
)
returns public.friendship_invite_delivery_status
language sql
stable
as $$
  select case
    when p_revoked_at is not null then 'revoked'::public.friendship_invite_delivery_status
    when p_status = 'issued'::public.friendship_invite_delivery_status
      and p_expires_at <= timezone('utc', now())
      then 'expired'::public.friendship_invite_delivery_status
    else p_status
  end;
$$;

create or replace view public.v_friendship_invites_live as
select
  invite.id,
  invite.inviter_user_id,
  invite.target_user_id,
  invite.claimant_user_id,
  invite.relationship_id,
  invite.flow,
  invite.origin_channel,
  public.effective_friendship_invite_status(invite.status, invite.expires_at) as status,
  invite.resolution_actor,
  invite.resolution_reason,
  invite.intended_recipient_alias,
  invite.claimant_snapshot,
  invite.source_context,
  invite.created_at,
  invite.updated_at,
  invite.expires_at,
  invite.resolved_at
from public.friendship_invites invite;

create or replace view public.v_friendship_invite_deliveries_live as
select
  delivery.id,
  delivery.invite_id,
  delivery.token,
  delivery.channel,
  delivery.source_context,
  delivery.delivery_phone_e164,
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

alter view public.v_friendship_invites_live set (security_invoker = true);
alter view public.v_friendship_invite_deliveries_live set (security_invoker = true);

insert into public.app_settings (key, value_json)
values
  (
    'app_web_origin',
    jsonb_build_object('value', 'https://app.happycircles.com')
  ),
  (
    'mobile_min_supported_version',
    jsonb_build_object(
      'minimumVersion',
      '0.1.0',
      'message',
      'Actualiza Happy Circles para seguir usando invitaciones de amistad.'
    )
  )
on conflict (key) do update
set value_json = excluded.value_json,
    updated_at = timezone('utc', now());

insert into public.friendship_invites (
  id,
  inviter_user_id,
  target_user_id,
  claimant_user_id,
  relationship_id,
  flow,
  origin_channel,
  status,
  resolution_actor,
  resolution_reason,
  intended_recipient_alias,
  claimant_snapshot,
  source_context,
  created_at,
  updated_at,
  expires_at,
  resolved_at
)
select
  invite.id,
  invite.inviter_user_id,
  case when invite.target_mode = 'direct_user' then invite.invitee_user_id else null end,
  case
    when invite.target_mode = 'share_link' and invite.invitee_user_id is not null then invite.invitee_user_id
    else null
  end,
  relationship.id,
  case
    when invite.target_mode = 'direct_user' then 'internal'::public.friendship_invite_flow
    else 'external'::public.friendship_invite_flow
  end,
  case
    when invite.target_mode = 'direct_user' then 'internal'::public.friendship_invite_channel
    else public.friendship_channel_from_label(invite.channel_label)
  end,
  case
    when invite.target_mode = 'direct_user'
      and public.effective_relationship_invite_status(invite.status, invite.expires_at) = 'pending'
      then 'pending_recipient'::public.friendship_invite_status
    when invite.target_mode = 'share_link'
      and public.effective_relationship_invite_status(invite.status, invite.expires_at) = 'pending'
      then 'canceled'::public.friendship_invite_status
    when public.effective_relationship_invite_status(invite.status, invite.expires_at) = 'accepted'
      then 'accepted'::public.friendship_invite_status
    when public.effective_relationship_invite_status(invite.status, invite.expires_at) = 'rejected'
      then 'rejected'::public.friendship_invite_status
    when public.effective_relationship_invite_status(invite.status, invite.expires_at) = 'expired'
      then 'expired'::public.friendship_invite_status
    else 'canceled'::public.friendship_invite_status
  end,
  case
    when invite.target_mode = 'direct_user' and invite.status = 'accepted' then 'recipient'::public.friendship_invite_resolution_actor
    when invite.target_mode = 'direct_user' and invite.status in ('rejected', 'canceled', 'expired') then 'recipient'::public.friendship_invite_resolution_actor
    when invite.target_mode = 'share_link' then 'system'::public.friendship_invite_resolution_actor
    else null
  end,
  case
    when invite.target_mode = 'share_link' and public.effective_relationship_invite_status(invite.status, invite.expires_at) = 'pending'
      then 'legacy_cutover_ambiguous'
    when invite.target_mode = 'share_link' and invite.status = 'accepted'
      then 'legacy_share_link_auto_accepted'
    else null
  end,
  null,
  case
    when invite.target_mode = 'share_link' and invite.invitee_user_id is not null
      then public.build_friendship_claimant_snapshot(invite.invitee_user_id)
    else null
  end,
  case
    when invite.target_mode = 'direct_user' then 'legacy_direct_user'
    else 'legacy_share_link'
  end,
  invite.created_at,
  invite.updated_at,
  invite.expires_at,
  case
    when invite.target_mode = 'share_link'
      and public.effective_relationship_invite_status(invite.status, invite.expires_at) = 'pending'
      then coalesce(invite.resolved_at, timezone('utc', now()))
    else invite.resolved_at
  end
from public.relationship_invites invite
left join public.relationships relationship
  on relationship.user_low_id = least(invite.inviter_user_id, invite.invitee_user_id)
 and relationship.user_high_id = greatest(invite.inviter_user_id, invite.invitee_user_id)
 and relationship.status = 'active'
on conflict (id) do nothing;

insert into public.friendship_invite_deliveries (
  invite_id,
  token,
  channel,
  source_context,
  delivery_phone_e164,
  status,
  created_at,
  updated_at,
  expires_at,
  claimed_at,
  claimed_by_user_id,
  revoked_at
)
select
  invite.id,
  coalesce(invite.invite_token, public.generate_short_token(18)),
  public.friendship_channel_from_label(invite.channel_label),
  'legacy_share_link',
  null,
  case
    when public.effective_relationship_invite_status(invite.status, invite.expires_at) = 'accepted'
      then 'claimed'::public.friendship_invite_delivery_status
    when public.effective_relationship_invite_status(invite.status, invite.expires_at) = 'expired'
      then 'expired'::public.friendship_invite_delivery_status
    else 'revoked'::public.friendship_invite_delivery_status
  end,
  invite.created_at,
  invite.updated_at,
  invite.expires_at,
  case
    when invite.status = 'accepted' then coalesce(invite.resolved_at, invite.updated_at, invite.created_at)
    else null
  end,
  case when invite.status = 'accepted' then invite.invitee_user_id else null end,
  case
    when public.effective_relationship_invite_status(invite.status, invite.expires_at) in ('pending', 'canceled')
      then coalesce(invite.resolved_at, timezone('utc', now()))
    else null
  end
from public.relationship_invites invite
where invite.target_mode = 'share_link'
on conflict do nothing;

insert into public.friendship_invites (
  inviter_user_id,
  target_user_id,
  claimant_user_id,
  relationship_id,
  flow,
  origin_channel,
  status,
  resolution_actor,
  resolution_reason,
  intended_recipient_alias,
  claimant_snapshot,
  source_context,
  created_at,
  updated_at,
  expires_at,
  resolved_at
)
select
  contact.inviter_user_id,
  null,
  contact.claimed_by_user_id,
  null,
  'external'::public.friendship_invite_flow,
  'whatsapp'::public.friendship_invite_channel,
  'canceled'::public.friendship_invite_status,
  'system'::public.friendship_invite_resolution_actor,
  'legacy_cutover_ambiguous',
  contact.invitee_name,
  case
    when contact.claimed_by_user_id is not null
      then public.build_friendship_claimant_snapshot(contact.claimed_by_user_id)
    else null
  end,
  'legacy_contact_invite',
  contact.created_at,
  contact.updated_at,
  coalesce(contact.updated_at, contact.created_at),
  coalesce(contact.updated_at, timezone('utc', now()))
from public.contact_invites contact
where contact.relationship_invite_id is null
on conflict do nothing;

drop trigger if exists claim_contact_invites_after_phone_change on public.user_profiles;

drop view if exists public.v_contact_invites_live;
drop view if exists public.v_relationship_invites_live;

drop function if exists public.create_contact_invite(uuid, text, text, text, text, text);
drop function if exists public.claim_contact_invites_for_user(uuid);
drop function if exists public.create_shareable_invite(uuid, text);
drop function if exists public.get_invite_preview_by_token(uuid, text);
drop function if exists public.accept_invite_by_token(uuid, text, text);
drop function if exists public.get_profile_connection_preview(uuid, text);
drop function if exists public.create_relationship_invite(uuid, text, uuid, text);
drop function if exists public.accept_relationship_invite(uuid, text, uuid);
drop function if exists public.reject_relationship_invite(uuid, text, uuid);
drop function if exists public.effective_relationship_invite_status(public.relationship_invite_status, timestamptz);

drop policy if exists user_profiles_select_visible on public.user_profiles;
drop policy if exists contact_invites_select_visible on public.contact_invites;
drop policy if exists relationship_invites_select_participants on public.relationship_invites;

drop table if exists public.contact_invites;
drop table if exists public.relationship_invites;

drop index if exists user_profiles_public_connection_token_unique_idx;
alter table public.user_profiles
  drop column if exists public_connection_token;

drop type if exists public.contact_invite_status;
drop type if exists public.relationship_invite_status;

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
    phone_e164
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    v_phone_country_iso2,
    v_phone_country_calling_code,
    v_phone_national_number,
    v_phone_e164
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

alter table public.friendship_invites enable row level security;
alter table public.friendship_invite_deliveries enable row level security;

drop policy if exists user_profiles_select_visible on public.user_profiles;
create policy user_profiles_select_visible
on public.user_profiles
for select
to authenticated
using (
  user_profiles.id = auth.uid()
  or exists (
    select 1
    from public.relationships relationship
    where relationship.status = 'active'
      and (
        (relationship.user_low_id = auth.uid() and relationship.user_high_id = user_profiles.id)
        or
        (relationship.user_high_id = auth.uid() and relationship.user_low_id = user_profiles.id)
      )
  )
  or exists (
    select 1
    from public.friendship_invites invite
    where (
      invite.inviter_user_id = auth.uid()
      and user_profiles.id in (invite.target_user_id, invite.claimant_user_id)
    )
    or (
      invite.target_user_id = auth.uid()
      and invite.inviter_user_id = user_profiles.id
    )
    or (
      invite.claimant_user_id = auth.uid()
      and invite.inviter_user_id = user_profiles.id
    )
  )
);

drop policy if exists friendship_invites_select_visible on public.friendship_invites;
create policy friendship_invites_select_visible
on public.friendship_invites
for select
to authenticated
using (
  auth.uid() = inviter_user_id
  or auth.uid() = target_user_id
  or auth.uid() = claimant_user_id
);

drop policy if exists friendship_invite_deliveries_select_visible on public.friendship_invite_deliveries;
create policy friendship_invite_deliveries_select_visible
on public.friendship_invite_deliveries
for select
to authenticated
using (
  exists (
    select 1
    from public.friendship_invites invite
    where invite.id = friendship_invite_deliveries.invite_id
      and (
        auth.uid() = invite.inviter_user_id
        or auth.uid() = invite.target_user_id
        or auth.uid() = invite.claimant_user_id
      )
  )
);

drop policy if exists audit_events_select_relevant on public.audit_events;
create policy audit_events_select_relevant
on public.audit_events
for select
to authenticated
using (
  actor_user_id = auth.uid()
  or (
    entity_type = 'friendship_invite'
    and exists (
      select 1
      from public.friendship_invites invite
      where invite.id = entity_id
        and auth.uid() in (invite.inviter_user_id, invite.target_user_id, invite.claimant_user_id)
    )
  )
  or (
    entity_type = 'financial_request'
    and exists (
      select 1
      from public.financial_requests fr
      where fr.id = entity_id
        and (
          fr.creator_user_id = auth.uid()
          or fr.responder_user_id = auth.uid()
          or fr.debtor_user_id = auth.uid()
          or fr.creditor_user_id = auth.uid()
        )
    )
  )
  or (
    entity_type = 'settlement_proposal'
    and exists (
      select 1
      from public.settlement_proposal_participants spp
      where spp.settlement_proposal_id = entity_id
        and spp.participant_user_id = auth.uid()
    )
  )
);

drop policy if exists app_settings_select_authenticated on public.app_settings;
drop policy if exists app_settings_select_public on public.app_settings;
create policy app_settings_select_public
on public.app_settings
for select
to authenticated, anon
using (true);

grant select on public.friendship_invites to authenticated;
grant select on public.friendship_invite_deliveries to authenticated;
grant select on public.v_friendship_invites_live to authenticated;
grant select on public.v_friendship_invite_deliveries_live to authenticated;
grant select on public.app_settings to anon;
grant select on public.app_settings to authenticated;

create or replace function public.create_internal_friendship_invite(
  p_actor_user_id uuid,
  p_idempotency_key text,
  p_target_user_id uuid,
  p_source_context text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_idempotency public.idempotency_keys%rowtype;
  v_existing_relationship_id uuid;
  v_existing_invite public.friendship_invites%rowtype;
  v_invite public.friendship_invites%rowtype;
  v_response jsonb;
begin
  if p_actor_user_id = p_target_user_id then
    raise exception 'cannot_invite_self';
  end if;

  if not public.friendship_identity_ready(p_actor_user_id) then
    raise exception 'identity_incomplete';
  end if;

  update public.friendship_invites
  set status = 'expired',
      resolution_actor = coalesce(resolution_actor, 'system'::public.friendship_invite_resolution_actor),
      resolution_reason = coalesce(resolution_reason, 'expired_before_internal_reuse'),
      resolved_at = coalesce(resolved_at, timezone('utc', now()))
  where flow = 'internal'
    and status = 'pending_recipient'
    and target_user_id is not null
    and least(inviter_user_id, target_user_id) = least(p_actor_user_id, p_target_user_id)
    and greatest(inviter_user_id, target_user_id) = greatest(p_actor_user_id, p_target_user_id)
    and expires_at <= timezone('utc', now());

  insert into public.idempotency_keys (actor_user_id, operation_name, idempotency_key)
  values (p_actor_user_id, 'create_internal_friendship_invite', p_idempotency_key)
  on conflict (actor_user_id, operation_name, idempotency_key) do nothing;

  select *
    into v_idempotency
  from public.idempotency_keys
  where actor_user_id = p_actor_user_id
    and operation_name = 'create_internal_friendship_invite'
    and idempotency_key = p_idempotency_key
  for update;

  if v_idempotency.response_json is not null then
    return v_idempotency.response_json;
  end if;

  select id
    into v_existing_relationship_id
  from public.relationships
  where user_low_id = least(p_actor_user_id, p_target_user_id)
    and user_high_id = greatest(p_actor_user_id, p_target_user_id)
    and status = 'active';

  if v_existing_relationship_id is not null then
    raise exception 'relationship_already_exists';
  end if;

  select *
    into v_existing_invite
  from public.friendship_invites
  where flow = 'internal'
    and status = 'pending_recipient'
    and target_user_id is not null
    and least(inviter_user_id, target_user_id) = least(p_actor_user_id, p_target_user_id)
    and greatest(inviter_user_id, target_user_id) = greatest(p_actor_user_id, p_target_user_id)
  order by created_at desc
  limit 1;

  if found then
    v_invite := v_existing_invite;
  else
    insert into public.friendship_invites (
      inviter_user_id,
      target_user_id,
      flow,
      origin_channel,
      status,
      source_context,
      expires_at
    )
    values (
      p_actor_user_id,
      p_target_user_id,
      'internal',
      'internal',
      'pending_recipient',
      nullif(btrim(p_source_context), ''),
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
        'flow', 'internal',
        'origin_channel', 'internal',
        'target_user_id', p_target_user_id,
        'source_context', nullif(btrim(p_source_context), '')
      )
    );
  end if;

  v_response := jsonb_build_object(
    'inviteId', v_invite.id,
    'flow', v_invite.flow,
    'status', public.effective_friendship_invite_status(v_invite.status, v_invite.expires_at),
    'targetUserId', v_invite.target_user_id,
    'expiresAt', v_invite.expires_at
  );

  update public.idempotency_keys
  set response_json = v_response
  where id = v_idempotency.id;

  return v_response;
end;
$$;

create or replace function public.create_external_friendship_invite(
  p_actor_user_id uuid,
  p_idempotency_key text,
  p_channel public.friendship_invite_channel,
  p_source_context text default null,
  p_intended_recipient_alias text default null,
  p_delivery_phone_e164 text default null
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
begin
  if p_channel = 'internal' then
    raise exception 'external_channel_required';
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

  if v_idempotency.response_json is not null then
    return v_idempotency.response_json;
  end if;

  select *
    into v_invite
  from public.friendship_invites
  where inviter_user_id = p_actor_user_id
    and flow = 'external'
    and status = 'pending_claim'
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
      source_context,
      expires_at
    )
    values (
      p_actor_user_id,
      'external',
      p_channel,
      'pending_claim',
      nullif(btrim(p_intended_recipient_alias), ''),
      nullif(btrim(p_source_context), ''),
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
        'source_context', nullif(btrim(p_source_context), ''),
        'intended_recipient_alias', nullif(btrim(p_intended_recipient_alias), '')
      )
    );
  else
    update public.friendship_invites
    set origin_channel = p_channel,
        intended_recipient_alias = coalesce(
          nullif(btrim(p_intended_recipient_alias), ''),
          intended_recipient_alias
        ),
        source_context = coalesce(nullif(btrim(p_source_context), ''), source_context)
    where id = v_invite.id
    returning * into v_invite;
  end if;

  if p_channel = 'qr' then
    update public.friendship_invite_deliveries
    set status = 'revoked',
        revoked_at = coalesce(revoked_at, timezone('utc', now()))
    where invite_id = v_invite.id
      and channel = 'qr'
      and status = 'issued'
      and revoked_at is null;

    v_delivery_expires_at := timezone('utc', now()) + interval '10 minutes';
  else
    v_delivery_expires_at := timezone('utc', now()) + interval '7 days';
  end if;

  insert into public.friendship_invite_deliveries (
    invite_id,
    token,
    channel,
    source_context,
    delivery_phone_e164,
    status,
    expires_at
  )
  values (
    v_invite.id,
    public.generate_short_token(18),
    p_channel,
    nullif(btrim(p_source_context), ''),
    nullif(btrim(p_delivery_phone_e164), ''),
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
      'source_context', nullif(btrim(p_source_context), ''),
      'delivery_phone_e164', nullif(btrim(p_delivery_phone_e164), ''),
      'expires_at', v_delivery.expires_at
    )
  );

  v_response := jsonb_build_object(
    'inviteId', v_invite.id,
    'deliveryId', v_delivery.id,
    'deliveryToken', v_delivery.token,
    'flow', v_invite.flow,
    'status', public.effective_friendship_invite_status(v_invite.status, v_invite.expires_at),
    'channel', v_delivery.channel,
    'originChannel', v_invite.origin_channel,
    'expiresAt', v_delivery.expires_at,
    'inviteExpiresAt', v_invite.expires_at,
    'intendedRecipientAlias', v_invite.intended_recipient_alias,
    'deliveryPhoneE164', v_delivery.delivery_phone_e164
  );

  update public.idempotency_keys
  set response_json = v_response
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
  select *
    into v_delivery
  from public.friendship_invite_deliveries
  where token = btrim(p_delivery_token)
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
  v_existing_relationship_id uuid;
  v_response jsonb;
begin
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
  where token = btrim(p_delivery_token)
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

  update public.friendship_invites
  set claimant_user_id = p_actor_user_id,
      claimant_snapshot = public.build_friendship_claimant_snapshot(p_actor_user_id),
      status = 'pending_sender_review',
      expires_at = timezone('utc', now()) + interval '72 hours'
  where id = v_invite.id
  returning * into v_invite;

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
      'claimed_by_user_id', p_actor_user_id
    )
  );

  v_response := jsonb_build_object(
    'inviteId', v_invite.id,
    'deliveryId', v_delivery.id,
    'status', v_invite.status,
    'expiresAt', v_invite.expires_at,
    'actorRole', 'claimant'
  );

  update public.idempotency_keys
  set response_json = v_response
  where id = v_idempotency.id;

  return v_response;
end;
$$;

create or replace function public.review_external_friendship_invite(
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
  v_invite public.friendship_invites%rowtype;
  v_relationship_id uuid;
  v_response jsonb;
begin
  if p_decision not in ('approve', 'reject') then
    raise exception 'invalid_review_decision';
  end if;

  insert into public.idempotency_keys (actor_user_id, operation_name, idempotency_key)
  values (p_actor_user_id, 'review_external_friendship_invite', p_idempotency_key)
  on conflict (actor_user_id, operation_name, idempotency_key) do nothing;

  select *
    into v_idempotency
  from public.idempotency_keys
  where actor_user_id = p_actor_user_id
    and operation_name = 'review_external_friendship_invite'
    and idempotency_key = p_idempotency_key
  for update;

  if v_idempotency.response_json is not null then
    return v_idempotency.response_json;
  end if;

  select *
    into v_invite
  from public.friendship_invites
  where id = p_invite_id
  for update;

  if not found then
    raise exception 'friendship_invite_not_found';
  end if;

  if v_invite.flow <> 'external' then
    raise exception 'invite_not_external';
  end if;

  if v_invite.inviter_user_id <> p_actor_user_id then
    raise exception 'invite_not_visible_to_actor';
  end if;

  if public.effective_friendship_invite_status(v_invite.status, v_invite.expires_at) <> v_invite.status then
    update public.friendship_invites
    set status = public.effective_friendship_invite_status(v_invite.status, v_invite.expires_at),
        resolution_actor = coalesce(resolution_actor, 'system'::public.friendship_invite_resolution_actor),
        resolution_reason = coalesce(resolution_reason, 'expired_before_review'),
        resolved_at = coalesce(resolved_at, timezone('utc', now()))
    where id = v_invite.id
    returning * into v_invite;
  end if;

  if v_invite.status <> 'pending_sender_review' then
    raise exception 'invite_not_pending_sender_review';
  end if;

  if v_invite.claimant_user_id is null then
    raise exception 'invite_missing_claimant';
  end if;

  if p_decision = 'approve' then
    insert into public.relationships (user_low_id, user_high_id, status)
    values (
      least(v_invite.inviter_user_id, v_invite.claimant_user_id),
      greatest(v_invite.inviter_user_id, v_invite.claimant_user_id),
      'active'
    )
    on conflict (user_low_id, user_high_id)
    do update set status = 'active'
    returning id into v_relationship_id;

    update public.friendship_invites
    set relationship_id = v_relationship_id,
        status = 'accepted',
        resolution_actor = 'sender',
        resolution_reason = null,
        resolved_at = timezone('utc', now())
    where id = v_invite.id
    returning * into v_invite;

    perform public.ensure_relationship_accounts(v_relationship_id);

    perform public.append_audit_event(
      p_actor_user_id,
      'friendship_invite',
      v_invite.id,
      'friendship_invite_sender_approved',
      null,
      jsonb_build_object(
        'relationship_id', v_relationship_id,
        'claimant_user_id', v_invite.claimant_user_id
      )
    );

    perform public.append_audit_event(
      p_actor_user_id,
      'friendship_invite',
      v_invite.id,
      'friendship_invite_accepted',
      null,
      jsonb_build_object(
        'relationship_id', v_relationship_id,
        'claimant_user_id', v_invite.claimant_user_id
      )
    );

    v_response := jsonb_build_object(
      'inviteId', v_invite.id,
      'status', v_invite.status,
      'relationshipId', v_relationship_id
    );
  else
    update public.friendship_invites
    set status = 'rejected',
        resolution_actor = 'sender',
        resolution_reason = 'sender_rejected_claimant',
        resolved_at = timezone('utc', now())
    where id = v_invite.id
    returning * into v_invite;

    perform public.append_audit_event(
      p_actor_user_id,
      'friendship_invite',
      v_invite.id,
      'friendship_invite_sender_rejected',
      null,
      jsonb_build_object(
        'claimant_user_id', v_invite.claimant_user_id
      )
    );

    perform public.append_audit_event(
      p_actor_user_id,
      'friendship_invite',
      v_invite.id,
      'friendship_invite_rejected',
      null,
      jsonb_build_object(
        'claimant_user_id', v_invite.claimant_user_id
      )
    );

    v_response := jsonb_build_object(
      'inviteId', v_invite.id,
      'status', v_invite.status,
      'resolvedAt', v_invite.resolved_at
    );
  end if;

  update public.idempotency_keys
  set response_json = v_response
  where id = v_idempotency.id;

  return v_response;
end;
$$;

create or replace function public.respond_internal_friendship_invite(
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
  v_invite public.friendship_invites%rowtype;
  v_relationship_id uuid;
  v_response jsonb;
begin
  if p_decision not in ('accept', 'reject') then
    raise exception 'invalid_internal_decision';
  end if;

  insert into public.idempotency_keys (actor_user_id, operation_name, idempotency_key)
  values (p_actor_user_id, 'respond_internal_friendship_invite', p_idempotency_key)
  on conflict (actor_user_id, operation_name, idempotency_key) do nothing;

  select *
    into v_idempotency
  from public.idempotency_keys
  where actor_user_id = p_actor_user_id
    and operation_name = 'respond_internal_friendship_invite'
    and idempotency_key = p_idempotency_key
  for update;

  if v_idempotency.response_json is not null then
    return v_idempotency.response_json;
  end if;

  select *
    into v_invite
  from public.friendship_invites
  where id = p_invite_id
  for update;

  if not found then
    raise exception 'friendship_invite_not_found';
  end if;

  if v_invite.flow <> 'internal' then
    raise exception 'invite_not_internal';
  end if;

  if v_invite.target_user_id <> p_actor_user_id then
    raise exception 'invite_not_visible_to_actor';
  end if;

  if public.effective_friendship_invite_status(v_invite.status, v_invite.expires_at) <> v_invite.status then
    update public.friendship_invites
    set status = public.effective_friendship_invite_status(v_invite.status, v_invite.expires_at),
        resolution_actor = coalesce(resolution_actor, 'system'::public.friendship_invite_resolution_actor),
        resolution_reason = coalesce(resolution_reason, 'expired_before_response'),
        resolved_at = coalesce(resolved_at, timezone('utc', now()))
    where id = v_invite.id
    returning * into v_invite;
  end if;

  if v_invite.status <> 'pending_recipient' then
    raise exception 'invite_not_pending_recipient';
  end if;

  if p_decision = 'accept' then
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
    set relationship_id = v_relationship_id,
        status = 'accepted',
        resolution_actor = 'recipient',
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
        'target_user_id', p_actor_user_id
      )
    );

    v_response := jsonb_build_object(
      'inviteId', v_invite.id,
      'status', v_invite.status,
      'relationshipId', v_relationship_id
    );
  else
    update public.friendship_invites
    set status = 'rejected',
        resolution_actor = 'recipient',
        resolution_reason = 'recipient_rejected',
        resolved_at = timezone('utc', now())
    where id = v_invite.id
    returning * into v_invite;

    perform public.append_audit_event(
      p_actor_user_id,
      'friendship_invite',
      v_invite.id,
      'friendship_invite_rejected',
      null,
      jsonb_build_object(
        'target_user_id', p_actor_user_id
      )
    );

    v_response := jsonb_build_object(
      'inviteId', v_invite.id,
      'status', v_invite.status,
      'resolvedAt', v_invite.resolved_at
    );
  end if;

  update public.idempotency_keys
  set response_json = v_response
  where id = v_idempotency.id;

  return v_response;
end;
$$;

create or replace function public.cancel_friendship_invite(
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
  v_invite public.friendship_invites%rowtype;
  v_response jsonb;
begin
  insert into public.idempotency_keys (actor_user_id, operation_name, idempotency_key)
  values (p_actor_user_id, 'cancel_friendship_invite', p_idempotency_key)
  on conflict (actor_user_id, operation_name, idempotency_key) do nothing;

  select *
    into v_idempotency
  from public.idempotency_keys
  where actor_user_id = p_actor_user_id
    and operation_name = 'cancel_friendship_invite'
    and idempotency_key = p_idempotency_key
  for update;

  if v_idempotency.response_json is not null then
    return v_idempotency.response_json;
  end if;

  select *
    into v_invite
  from public.friendship_invites
  where id = p_invite_id
  for update;

  if not found then
    raise exception 'friendship_invite_not_found';
  end if;

  if v_invite.inviter_user_id <> p_actor_user_id then
    raise exception 'invite_not_visible_to_actor';
  end if;

  if v_invite.status in ('accepted', 'rejected', 'canceled', 'expired') then
    raise exception 'invite_not_cancelable';
  end if;

  update public.friendship_invites
  set status = 'canceled',
      resolution_actor = 'sender',
      resolution_reason = 'sender_canceled',
      resolved_at = timezone('utc', now())
  where id = v_invite.id
  returning * into v_invite;

  update public.friendship_invite_deliveries
  set status = 'revoked',
      revoked_at = coalesce(revoked_at, timezone('utc', now()))
  where invite_id = v_invite.id
    and status = 'issued'
    and revoked_at is null;

  perform public.append_audit_event(
    p_actor_user_id,
    'friendship_invite',
    v_invite.id,
    'friendship_invite_canceled',
    null,
    jsonb_build_object(
      'flow', v_invite.flow,
      'origin_channel', v_invite.origin_channel
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
