do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'contact_invite_status'
      and n.nspname = 'public'
  ) then
    create type public.contact_invite_status as enum ('pending', 'matched', 'canceled');
  end if;
end
$$;

alter table public.user_profiles
  add column if not exists phone_country_iso2 text,
  add column if not exists phone_country_calling_code text,
  add column if not exists phone_national_number text,
  add column if not exists phone_e164 text;

create unique index if not exists user_profiles_phone_e164_unique_idx
  on public.user_profiles (phone_e164)
  where phone_e164 is not null;

create table if not exists public.contact_invites (
  id uuid primary key default gen_random_uuid(),
  inviter_user_id uuid not null references public.user_profiles (id) on delete cascade,
  invitee_name text not null,
  invitee_phone_country_iso2 text not null,
  invitee_phone_country_calling_code text not null,
  invitee_phone_national_number text not null,
  invitee_phone_e164 text not null,
  status public.contact_invite_status not null default 'pending',
  claimed_by_user_id uuid references public.user_profiles (id) on delete set null,
  relationship_invite_id uuid references public.relationship_invites (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint contact_invites_phone_not_self check (invitee_phone_e164 <> '')
);

create unique index if not exists contact_invites_pending_per_inviter_phone_idx
  on public.contact_invites (inviter_user_id, invitee_phone_e164)
  where status = 'pending';

create index if not exists contact_invites_phone_lookup_idx
  on public.contact_invites (invitee_phone_e164, status, created_at desc);

create trigger set_contact_invites_updated_at
before update on public.contact_invites
for each row execute function public.tg_set_updated_at();

create or replace function public.normalize_phone_e164(
  p_country_calling_code text,
  p_phone_national_number text
)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_country_digits text;
  v_number_digits text;
begin
  v_country_digits := regexp_replace(coalesce(p_country_calling_code, ''), '[^0-9]', '', 'g');
  v_number_digits := regexp_replace(coalesce(p_phone_national_number, ''), '[^0-9]', '', 'g');

  if length(v_country_digits) = 0 or length(v_number_digits) < 6 then
    raise exception 'invalid_phone_number';
  end if;

  return '+' || v_country_digits || v_number_digits;
end;
$$;

create or replace function public.claim_contact_invites_for_user(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.user_profiles%rowtype;
  v_contact_invite public.contact_invites%rowtype;
  v_existing_relationship_id uuid;
  v_existing_pending_invite_id uuid;
  v_created_relationship_invite_id uuid;
  v_processed_count integer := 0;
begin
  select *
    into v_profile
  from public.user_profiles
  where id = p_user_id;

  if not found or v_profile.phone_e164 is null then
    return 0;
  end if;

  for v_contact_invite in
    select *
    from public.contact_invites
    where invitee_phone_e164 = v_profile.phone_e164
      and inviter_user_id <> p_user_id
      and status = 'pending'
    order by created_at asc
    for update
  loop
    select id
      into v_existing_relationship_id
    from public.relationships
    where user_low_id = least(v_contact_invite.inviter_user_id, p_user_id)
      and user_high_id = greatest(v_contact_invite.inviter_user_id, p_user_id)
      and status = 'active';

    if v_existing_relationship_id is null then
      select id
        into v_existing_pending_invite_id
      from public.relationship_invites
      where least(inviter_user_id, invitee_user_id) = least(v_contact_invite.inviter_user_id, p_user_id)
        and greatest(inviter_user_id, invitee_user_id) = greatest(v_contact_invite.inviter_user_id, p_user_id)
        and status = 'pending'
      order by created_at desc
      limit 1;

      if v_existing_pending_invite_id is null then
        insert into public.relationship_invites (inviter_user_id, invitee_user_id, status)
        values (v_contact_invite.inviter_user_id, p_user_id, 'pending')
        returning id into v_created_relationship_invite_id;

        perform public.append_audit_event(
          v_contact_invite.inviter_user_id,
          'relationship_invite',
          v_created_relationship_invite_id,
          'relationship_invited',
          null,
          jsonb_build_object(
            'invitee_user_id', p_user_id,
            'source', 'contact_invite',
            'contact_invite_id', v_contact_invite.id
          )
        );
      else
        v_created_relationship_invite_id := v_existing_pending_invite_id;
      end if;
    end if;

    update public.contact_invites
    set status = 'matched',
        claimed_by_user_id = p_user_id,
        relationship_invite_id = coalesce(v_created_relationship_invite_id, v_existing_pending_invite_id)
    where id = v_contact_invite.id;

    v_processed_count := v_processed_count + 1;
    v_existing_relationship_id := null;
    v_existing_pending_invite_id := null;
    v_created_relationship_invite_id := null;
  end loop;

  return v_processed_count;
end;
$$;

create or replace function public.create_contact_invite(
  p_actor_user_id uuid,
  p_idempotency_key text,
  p_invitee_name text,
  p_invitee_phone_country_iso2 text,
  p_invitee_phone_country_calling_code text,
  p_invitee_phone_national_number text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_idempotency public.idempotency_keys%rowtype;
  v_actor_profile public.user_profiles%rowtype;
  v_invitee_user_id uuid;
  v_existing_relationship_id uuid;
  v_existing_pending_invite_id uuid;
  v_contact_invite_id uuid;
  v_phone_e164 text;
  v_response jsonb;
begin
  v_phone_e164 := public.normalize_phone_e164(
    p_invitee_phone_country_calling_code,
    p_invitee_phone_national_number
  );

  select *
    into v_actor_profile
  from public.user_profiles
  where id = p_actor_user_id;

  if not found then
    raise exception 'actor_profile_not_found';
  end if;

  if v_actor_profile.phone_e164 is not null and v_actor_profile.phone_e164 = v_phone_e164 then
    raise exception 'cannot_invite_own_phone';
  end if;

  insert into public.idempotency_keys (actor_user_id, operation_name, idempotency_key)
  values (p_actor_user_id, 'create_contact_invite', p_idempotency_key)
  on conflict (actor_user_id, operation_name, idempotency_key) do nothing;

  select *
    into v_idempotency
  from public.idempotency_keys
  where actor_user_id = p_actor_user_id
    and operation_name = 'create_contact_invite'
    and idempotency_key = p_idempotency_key
  for update;

  if v_idempotency.response_json is not null then
    return v_idempotency.response_json;
  end if;

  select id
    into v_invitee_user_id
  from public.user_profiles
  where phone_e164 = v_phone_e164
    and id <> p_actor_user_id
  limit 1;

  if v_invitee_user_id is not null then
    select id
      into v_existing_relationship_id
    from public.relationships
    where user_low_id = least(p_actor_user_id, v_invitee_user_id)
      and user_high_id = greatest(p_actor_user_id, v_invitee_user_id)
      and status = 'active';

    if v_existing_relationship_id is not null then
      raise exception 'relationship_already_exists';
    end if;

    select id
      into v_existing_pending_invite_id
    from public.relationship_invites
    where least(inviter_user_id, invitee_user_id) = least(p_actor_user_id, v_invitee_user_id)
      and greatest(inviter_user_id, invitee_user_id) = greatest(p_actor_user_id, v_invitee_user_id)
      and status = 'pending'
    order by created_at desc
    limit 1;
  end if;

  insert into public.contact_invites (
    inviter_user_id,
    invitee_name,
    invitee_phone_country_iso2,
    invitee_phone_country_calling_code,
    invitee_phone_national_number,
    invitee_phone_e164,
    status,
    claimed_by_user_id,
    relationship_invite_id
  )
  values (
    p_actor_user_id,
    btrim(p_invitee_name),
    upper(btrim(p_invitee_phone_country_iso2)),
    btrim(p_invitee_phone_country_calling_code),
    regexp_replace(p_invitee_phone_national_number, '[^0-9]', '', 'g'),
    v_phone_e164,
    case when v_invitee_user_id is null then 'pending' else 'matched' end,
    v_invitee_user_id,
    v_existing_pending_invite_id
  )
  on conflict (inviter_user_id, invitee_phone_e164)
    where status = 'pending'
  do update set
    invitee_name = excluded.invitee_name,
    invitee_phone_country_iso2 = excluded.invitee_phone_country_iso2,
    invitee_phone_country_calling_code = excluded.invitee_phone_country_calling_code,
    invitee_phone_national_number = excluded.invitee_phone_national_number,
    status = excluded.status,
    claimed_by_user_id = excluded.claimed_by_user_id,
    relationship_invite_id = coalesce(excluded.relationship_invite_id, public.contact_invites.relationship_invite_id),
    updated_at = timezone('utc', now())
  returning id into v_contact_invite_id;

  if v_invitee_user_id is not null and v_existing_pending_invite_id is null then
    insert into public.relationship_invites (inviter_user_id, invitee_user_id, status)
    values (p_actor_user_id, v_invitee_user_id, 'pending')
    returning id into v_existing_pending_invite_id;

    update public.contact_invites
    set relationship_invite_id = v_existing_pending_invite_id
    where id = v_contact_invite_id;

    perform public.append_audit_event(
      p_actor_user_id,
      'relationship_invite',
      v_existing_pending_invite_id,
      'relationship_invited',
      null,
      jsonb_build_object(
        'invitee_user_id', v_invitee_user_id,
        'source', 'contact_invite',
        'contact_invite_id', v_contact_invite_id
      )
    );
  end if;

  v_response := jsonb_build_object(
    'contactInviteId', v_contact_invite_id,
    'status', case when v_invitee_user_id is null then 'pending' else 'matched' end,
    'phoneE164', v_phone_e164,
    'matchedUserId', v_invitee_user_id,
    'relationshipInviteId', v_existing_pending_invite_id
  );

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

  perform public.claim_contact_invites_for_user(new.id);

  return new;
end;
$$;

drop policy if exists user_profiles_select_authenticated on public.user_profiles;
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
    from public.relationship_invites invite
    where invite.status = 'pending'
      and (
        (invite.inviter_user_id = auth.uid() and invite.invitee_user_id = user_profiles.id)
        or
        (invite.invitee_user_id = auth.uid() and invite.inviter_user_id = user_profiles.id)
      )
  )
  or exists (
    select 1
    from public.contact_invites contact_invite
    where contact_invite.inviter_user_id = auth.uid()
      and contact_invite.claimed_by_user_id = user_profiles.id
  )
);

alter table public.contact_invites enable row level security;

drop policy if exists contact_invites_select_visible on public.contact_invites;
create policy contact_invites_select_visible
on public.contact_invites
for select
to authenticated
using (auth.uid() = inviter_user_id or auth.uid() = claimed_by_user_id);

grant select on public.contact_invites to authenticated;
