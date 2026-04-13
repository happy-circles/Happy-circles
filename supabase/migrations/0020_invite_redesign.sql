create or replace function public.generate_short_token(p_bytes integer default 18)
returns text
language sql
security definer
set search_path = public
as $$
  select lower(encode(extensions.gen_random_bytes(greatest(p_bytes, 12)), 'hex'));
$$;

alter table public.user_profiles
  add column if not exists public_connection_token text;

update public.user_profiles
set public_connection_token = public.generate_short_token(12)
where public_connection_token is null;

alter table public.user_profiles
  alter column public_connection_token set default public.generate_short_token(12),
  alter column public_connection_token set not null;

create unique index if not exists user_profiles_public_connection_token_unique_idx
  on public.user_profiles (public_connection_token);

alter table public.relationship_invites
  add column if not exists target_mode text,
  add column if not exists invite_token text,
  add column if not exists expires_at timestamptz,
  add column if not exists resolved_at timestamptz,
  add column if not exists accepted_by_user_id uuid references public.user_profiles (id) on delete set null,
  add column if not exists channel_label text;

update public.relationship_invites
set target_mode = 'direct_user'
where target_mode is null;

update public.relationship_invites
set expires_at = created_at + interval '7 days'
where expires_at is null;

update public.relationship_invites
set resolved_at = updated_at
where resolved_at is null
  and status <> 'pending';

update public.relationship_invites
set accepted_by_user_id = invitee_user_id
where accepted_by_user_id is null
  and status = 'accepted';

update public.relationship_invites
set channel_label = 'Directa'
where channel_label is null;

alter table public.relationship_invites
  alter column target_mode set default 'direct_user',
  alter column target_mode set not null,
  alter column expires_at set default timezone('utc', now()) + interval '7 days',
  alter column expires_at set not null,
  alter column channel_label set default 'Directa',
  alter column channel_label set not null,
  alter column invitee_user_id drop not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'relationship_invites_target_mode_check'
  ) then
    alter table public.relationship_invites
      add constraint relationship_invites_target_mode_check
      check (target_mode in ('direct_user', 'share_link'));
  end if;
end
$$;

alter table public.relationship_invites
  drop constraint if exists relationship_invites_no_self;

alter table public.relationship_invites
  add constraint relationship_invites_no_self
  check (invitee_user_id is null or inviter_user_id <> invitee_user_id);

drop index if exists relationship_invites_pending_unique_idx;

create unique index if not exists relationship_invites_pending_direct_unique_idx
  on public.relationship_invites (
    least(inviter_user_id, invitee_user_id),
    greatest(inviter_user_id, invitee_user_id)
  )
  where status = 'pending'
    and target_mode = 'direct_user'
    and invitee_user_id is not null;

create unique index if not exists relationship_invites_pending_share_link_unique_idx
  on public.relationship_invites (inviter_user_id)
  where status = 'pending'
    and target_mode = 'share_link';

create unique index if not exists relationship_invites_invite_token_unique_idx
  on public.relationship_invites (invite_token)
  where invite_token is not null;

update public.relationship_invites
set status = 'expired',
    resolved_at = coalesce(resolved_at, timezone('utc', now()))
where status = 'pending'
  and expires_at <= timezone('utc', now());

create or replace function public.effective_relationship_invite_status(
  p_status public.relationship_invite_status,
  p_expires_at timestamptz
)
returns text
language sql
stable
set search_path = public
as $$
  select case
    when p_status = 'pending'::public.relationship_invite_status
      and p_expires_at <= timezone('utc', now())
      then 'expired'
    else p_status::text
  end;
$$;

create or replace function public.handle_user_profile_phone_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.phone_e164 is not null and new.phone_e164 is distinct from old.phone_e164 then
    perform public.claim_contact_invites_for_user(new.id);
  end if;

  return new;
end;
$$;

drop trigger if exists claim_contact_invites_after_phone_change on public.user_profiles;

create trigger claim_contact_invites_after_phone_change
after update on public.user_profiles
for each row execute function public.handle_user_profile_phone_change();

create or replace view public.v_relationship_invites_live as
select
  invite.id,
  invite.inviter_user_id,
  invite.invitee_user_id,
  public.effective_relationship_invite_status(invite.status, invite.expires_at) as status,
  invite.target_mode,
  invite.invite_token,
  invite.expires_at,
  invite.resolved_at,
  invite.accepted_by_user_id,
  invite.channel_label,
  invite.created_at,
  invite.updated_at
from public.relationship_invites invite;

create or replace view public.v_contact_invites_live as
select
  contact_invite.id,
  contact_invite.inviter_user_id,
  contact_invite.invitee_name,
  contact_invite.invitee_phone_country_iso2,
  contact_invite.invitee_phone_country_calling_code,
  contact_invite.invitee_phone_national_number,
  contact_invite.invitee_phone_e164,
  contact_invite.status,
  contact_invite.claimed_by_user_id,
  contact_invite.relationship_invite_id,
  live_invite.status as relationship_invite_status,
  live_invite.expires_at as relationship_invite_expires_at,
  live_invite.resolved_at as relationship_invite_resolved_at,
  live_invite.target_mode as relationship_invite_target_mode,
  live_invite.channel_label as relationship_invite_channel_label,
  contact_invite.created_at,
  contact_invite.updated_at
from public.contact_invites contact_invite
left join public.v_relationship_invites_live live_invite
  on live_invite.id = contact_invite.relationship_invite_id;

grant select on public.v_relationship_invites_live to authenticated;
grant select on public.v_contact_invites_live to authenticated;

drop function if exists public.create_relationship_invite(uuid, text, uuid);

create or replace function public.create_relationship_invite(
  p_actor_user_id uuid,
  p_idempotency_key text,
  p_invitee_user_id uuid,
  p_channel_label text default 'Directa'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_idempotency public.idempotency_keys%rowtype;
  v_existing_relationship_id uuid;
  v_existing_pending_invite public.relationship_invites%rowtype;
  v_invite_id uuid;
  v_response jsonb;
begin
  if p_actor_user_id = p_invitee_user_id then
    raise exception 'cannot_invite_self';
  end if;

  update public.relationship_invites
  set status = 'expired',
      resolved_at = coalesce(resolved_at, timezone('utc', now()))
  where status = 'pending'
    and target_mode = 'direct_user'
    and invitee_user_id is not null
    and least(inviter_user_id, invitee_user_id) = least(p_actor_user_id, p_invitee_user_id)
    and greatest(inviter_user_id, invitee_user_id) = greatest(p_actor_user_id, p_invitee_user_id)
    and expires_at <= timezone('utc', now());

  insert into public.idempotency_keys (actor_user_id, operation_name, idempotency_key)
  values (p_actor_user_id, 'create_relationship_invite', p_idempotency_key)
  on conflict (actor_user_id, operation_name, idempotency_key) do nothing;

  select *
    into v_idempotency
  from public.idempotency_keys
  where actor_user_id = p_actor_user_id
    and operation_name = 'create_relationship_invite'
    and idempotency_key = p_idempotency_key
  for update;

  if v_idempotency.response_json is not null then
    return v_idempotency.response_json;
  end if;

  select id
    into v_existing_relationship_id
  from public.relationships
  where user_low_id = least(p_actor_user_id, p_invitee_user_id)
    and user_high_id = greatest(p_actor_user_id, p_invitee_user_id)
    and status = 'active';

  if v_existing_relationship_id is not null then
    raise exception 'relationship_already_exists';
  end if;

  select *
    into v_existing_pending_invite
  from public.relationship_invites
  where status = 'pending'
    and target_mode = 'direct_user'
    and invitee_user_id is not null
    and least(inviter_user_id, invitee_user_id) = least(p_actor_user_id, p_invitee_user_id)
    and greatest(inviter_user_id, invitee_user_id) = greatest(p_actor_user_id, p_invitee_user_id)
  order by created_at desc
  limit 1;

  if found then
    v_invite_id := v_existing_pending_invite.id;
  else
    insert into public.relationship_invites (
      inviter_user_id,
      invitee_user_id,
      status,
      target_mode,
      expires_at,
      channel_label
    )
    values (
      p_actor_user_id,
      p_invitee_user_id,
      'pending',
      'direct_user',
      timezone('utc', now()) + interval '7 days',
      coalesce(nullif(btrim(p_channel_label), ''), 'Directa')
    )
    returning id into v_invite_id;

    perform public.append_audit_event(
      p_actor_user_id,
      'relationship_invite',
      v_invite_id,
      'relationship_invited',
      null,
      jsonb_build_object(
        'invitee_user_id', p_invitee_user_id,
        'target_mode', 'direct_user',
        'channel_label', coalesce(nullif(btrim(p_channel_label), ''), 'Directa')
      )
    );
  end if;

  v_response := jsonb_build_object(
    'inviteId', v_invite_id,
    'status', 'pending',
    'targetMode', 'direct_user',
    'channelLabel', coalesce(nullif(btrim(p_channel_label), ''), 'Directa')
  );

  update public.idempotency_keys
  set response_json = v_response
  where id = v_idempotency.id;

  return v_response;
end;
$$;

create or replace function public.accept_relationship_invite(
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
  v_invite public.relationship_invites%rowtype;
  v_relationship_id uuid;
  v_response jsonb;
begin
  insert into public.idempotency_keys (actor_user_id, operation_name, idempotency_key)
  values (p_actor_user_id, 'accept_relationship_invite', p_idempotency_key)
  on conflict (actor_user_id, operation_name, idempotency_key) do nothing;

  select *
    into v_idempotency
  from public.idempotency_keys
  where actor_user_id = p_actor_user_id
    and operation_name = 'accept_relationship_invite'
    and idempotency_key = p_idempotency_key
  for update;

  if v_idempotency.response_json is not null then
    return v_idempotency.response_json;
  end if;

  select *
    into v_invite
  from public.relationship_invites
  where id = p_invite_id
  for update;

  if not found then
    raise exception 'relationship_invite_not_found';
  end if;

  if v_invite.status = 'pending' and v_invite.expires_at <= timezone('utc', now()) then
    update public.relationship_invites
    set status = 'expired',
        resolved_at = coalesce(resolved_at, timezone('utc', now()))
    where id = v_invite.id
    returning * into v_invite;
  end if;

  if v_invite.target_mode = 'share_link' then
    raise exception 'invite_requires_token_acceptance';
  end if;

  if v_invite.invitee_user_id <> p_actor_user_id then
    raise exception 'invite_not_visible_to_actor';
  end if;

  if v_invite.status = 'expired' then
    raise exception 'invite_expired';
  end if;

  if v_invite.status <> 'pending' then
    raise exception 'invite_not_pending';
  end if;

  insert into public.relationships (user_low_id, user_high_id, status)
  values (
    least(v_invite.inviter_user_id, p_actor_user_id),
    greatest(v_invite.inviter_user_id, p_actor_user_id),
    'active'
  )
  on conflict (user_low_id, user_high_id)
  do update set status = 'active'
  returning id into v_relationship_id;

  update public.relationship_invites
  set status = 'accepted',
      accepted_by_user_id = p_actor_user_id,
      resolved_at = timezone('utc', now())
  where id = v_invite.id;

  perform public.ensure_relationship_accounts(v_relationship_id);

  perform public.append_audit_event(
    p_actor_user_id,
    'relationship',
    v_relationship_id,
    'relationship_accepted',
    null,
    jsonb_build_object(
      'invite_id', v_invite.id,
      'target_mode', v_invite.target_mode,
      'channel_label', v_invite.channel_label
    )
  );

  v_response := jsonb_build_object(
    'relationshipId', v_relationship_id,
    'status', 'active',
    'inviteStatus', 'accepted'
  );

  update public.idempotency_keys
  set response_json = v_response
  where id = v_idempotency.id;

  return v_response;
end;
$$;

create or replace function public.reject_relationship_invite(
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
  v_invite public.relationship_invites%rowtype;
  v_response jsonb;
begin
  insert into public.idempotency_keys (actor_user_id, operation_name, idempotency_key)
  values (p_actor_user_id, 'reject_relationship_invite', p_idempotency_key)
  on conflict (actor_user_id, operation_name, idempotency_key) do nothing;

  select *
    into v_idempotency
  from public.idempotency_keys
  where actor_user_id = p_actor_user_id
    and operation_name = 'reject_relationship_invite'
    and idempotency_key = p_idempotency_key
  for update;

  if v_idempotency.response_json is not null then
    return v_idempotency.response_json;
  end if;

  select *
    into v_invite
  from public.relationship_invites
  where id = p_invite_id
  for update;

  if not found then
    raise exception 'relationship_invite_not_found';
  end if;

  if v_invite.status = 'pending' and v_invite.expires_at <= timezone('utc', now()) then
    update public.relationship_invites
    set status = 'expired',
        resolved_at = coalesce(resolved_at, timezone('utc', now()))
    where id = v_invite.id
    returning * into v_invite;
  end if;

  if v_invite.target_mode = 'share_link' then
    raise exception 'invite_requires_token_acceptance';
  end if;

  if v_invite.invitee_user_id <> p_actor_user_id then
    raise exception 'invite_not_visible_to_actor';
  end if;

  if v_invite.status = 'expired' then
    raise exception 'invite_expired';
  end if;

  if v_invite.status <> 'pending' then
    raise exception 'invite_not_pending';
  end if;

  update public.relationship_invites
  set status = 'rejected',
      resolved_at = timezone('utc', now())
  where id = v_invite.id;

  perform public.append_audit_event(
    p_actor_user_id,
    'relationship_invite',
    v_invite.id,
    'relationship_invite_rejected',
    null,
    jsonb_build_object(
      'inviter_user_id', v_invite.inviter_user_id,
      'target_mode', v_invite.target_mode,
      'channel_label', v_invite.channel_label
    )
  );

  v_response := jsonb_build_object(
    'inviteId', v_invite.id,
    'status', 'rejected',
    'resolvedAt', timezone('utc', now())
  );

  update public.idempotency_keys
  set response_json = v_response
  where id = v_idempotency.id;

  return v_response;
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
  v_existing_pending_invite public.relationship_invites%rowtype;
  v_created_relationship_invite_id uuid;
  v_processed_count integer := 0;
  v_channel_label text := 'WhatsApp';
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
    update public.relationship_invites
    set status = 'expired',
        resolved_at = coalesce(resolved_at, timezone('utc', now()))
    where status = 'pending'
      and target_mode = 'direct_user'
      and invitee_user_id is not null
      and least(inviter_user_id, invitee_user_id) = least(v_contact_invite.inviter_user_id, p_user_id)
      and greatest(inviter_user_id, invitee_user_id) = greatest(v_contact_invite.inviter_user_id, p_user_id)
      and expires_at <= timezone('utc', now());

    select id
      into v_existing_relationship_id
    from public.relationships
    where user_low_id = least(v_contact_invite.inviter_user_id, p_user_id)
      and user_high_id = greatest(v_contact_invite.inviter_user_id, p_user_id)
      and status = 'active';

    if v_existing_relationship_id is null then
      select *
        into v_existing_pending_invite
      from public.relationship_invites
      where status = 'pending'
        and target_mode = 'direct_user'
        and invitee_user_id is not null
        and least(inviter_user_id, invitee_user_id) = least(v_contact_invite.inviter_user_id, p_user_id)
        and greatest(inviter_user_id, invitee_user_id) = greatest(v_contact_invite.inviter_user_id, p_user_id)
      order by created_at desc
      limit 1;

      if found then
        v_created_relationship_invite_id := v_existing_pending_invite.id;
      else
        insert into public.relationship_invites (
          inviter_user_id,
          invitee_user_id,
          status,
          target_mode,
          expires_at,
          channel_label
        )
        values (
          v_contact_invite.inviter_user_id,
          p_user_id,
          'pending',
          'direct_user',
          timezone('utc', now()) + interval '7 days',
          v_channel_label
        )
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
            'contact_invite_id', v_contact_invite.id,
            'target_mode', 'direct_user',
            'channel_label', v_channel_label
          )
        );
      end if;
    else
      v_created_relationship_invite_id := null;
    end if;

    update public.contact_invites
    set status = 'matched',
        claimed_by_user_id = p_user_id,
        relationship_invite_id = coalesce(v_created_relationship_invite_id, v_existing_pending_invite.id)
    where id = v_contact_invite.id;

    v_processed_count := v_processed_count + 1;
    v_existing_relationship_id := null;
    v_existing_pending_invite := null;
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
  v_existing_pending_invite public.relationship_invites%rowtype;
  v_contact_invite_id uuid;
  v_phone_e164 text;
  v_response jsonb;
  v_channel_label text := 'WhatsApp';
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
    update public.relationship_invites
    set status = 'expired',
        resolved_at = coalesce(resolved_at, timezone('utc', now()))
    where status = 'pending'
      and target_mode = 'direct_user'
      and invitee_user_id is not null
      and least(inviter_user_id, invitee_user_id) = least(p_actor_user_id, v_invitee_user_id)
      and greatest(inviter_user_id, invitee_user_id) = greatest(p_actor_user_id, v_invitee_user_id)
      and expires_at <= timezone('utc', now());

    select id
      into v_existing_relationship_id
    from public.relationships
    where user_low_id = least(p_actor_user_id, v_invitee_user_id)
      and user_high_id = greatest(p_actor_user_id, v_invitee_user_id)
      and status = 'active';

    if v_existing_relationship_id is not null then
      raise exception 'relationship_already_exists';
    end if;

    select *
      into v_existing_pending_invite
    from public.relationship_invites
    where status = 'pending'
      and target_mode = 'direct_user'
      and invitee_user_id is not null
      and least(inviter_user_id, invitee_user_id) = least(p_actor_user_id, v_invitee_user_id)
      and greatest(inviter_user_id, invitee_user_id) = greatest(p_actor_user_id, v_invitee_user_id)
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
    case
      when v_invitee_user_id is null then 'pending'::public.contact_invite_status
      else 'matched'::public.contact_invite_status
    end,
    v_invitee_user_id,
    v_existing_pending_invite.id
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

  if v_invitee_user_id is not null and v_existing_pending_invite.id is null then
    insert into public.relationship_invites (
      inviter_user_id,
      invitee_user_id,
      status,
      target_mode,
      expires_at,
      channel_label
    )
    values (
      p_actor_user_id,
      v_invitee_user_id,
      'pending',
      'direct_user',
      timezone('utc', now()) + interval '7 days',
      v_channel_label
    )
    returning * into v_existing_pending_invite;

    update public.contact_invites
    set relationship_invite_id = v_existing_pending_invite.id
    where id = v_contact_invite_id;

    perform public.append_audit_event(
      p_actor_user_id,
      'relationship_invite',
      v_existing_pending_invite.id,
      'relationship_invited',
      null,
      jsonb_build_object(
        'invitee_user_id', v_invitee_user_id,
        'source', 'contact_invite',
        'contact_invite_id', v_contact_invite_id,
        'target_mode', 'direct_user',
        'channel_label', v_channel_label
      )
    );
  end if;

  v_response := jsonb_build_object(
    'contactInviteId', v_contact_invite_id,
    'status', case when v_invitee_user_id is null then 'pending' else 'matched' end,
    'phoneE164', v_phone_e164,
    'matchedUserId', v_invitee_user_id,
    'relationshipInviteId', v_existing_pending_invite.id,
    'relationshipInviteStatus',
      case
        when v_existing_pending_invite.id is null then null
        else public.effective_relationship_invite_status(v_existing_pending_invite.status, v_existing_pending_invite.expires_at)
      end,
    'relationshipInviteExpiresAt', v_existing_pending_invite.expires_at,
    'relationshipInviteResolvedAt', v_existing_pending_invite.resolved_at
  );

  update public.idempotency_keys
  set response_json = v_response
  where id = v_idempotency.id;

  return v_response;
end;
$$;

create or replace function public.create_shareable_invite(
  p_actor_user_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_idempotency public.idempotency_keys%rowtype;
  v_invite public.relationship_invites%rowtype;
  v_invite_token text;
  v_response jsonb;
begin
  insert into public.idempotency_keys (actor_user_id, operation_name, idempotency_key)
  values (p_actor_user_id, 'create_shareable_invite', p_idempotency_key)
  on conflict (actor_user_id, operation_name, idempotency_key) do nothing;

  select *
    into v_idempotency
  from public.idempotency_keys
  where actor_user_id = p_actor_user_id
    and operation_name = 'create_shareable_invite'
    and idempotency_key = p_idempotency_key
  for update;

  if v_idempotency.response_json is not null then
    return v_idempotency.response_json;
  end if;

  update public.relationship_invites
  set status = case
        when expires_at <= timezone('utc', now()) then 'expired'::public.relationship_invite_status
        else 'canceled'::public.relationship_invite_status
      end,
      resolved_at = coalesce(resolved_at, timezone('utc', now()))
  where inviter_user_id = p_actor_user_id
    and target_mode = 'share_link'
    and status = 'pending';

  v_invite_token := public.generate_short_token(18);

  insert into public.relationship_invites (
    inviter_user_id,
    invitee_user_id,
    status,
    target_mode,
    invite_token,
    expires_at,
    channel_label
  )
  values (
    p_actor_user_id,
    null,
    'pending',
    'share_link',
    v_invite_token,
    timezone('utc', now()) + interval '7 days',
    'Link'
  )
  returning * into v_invite;

  perform public.append_audit_event(
    p_actor_user_id,
    'relationship_invite',
    v_invite.id,
    'relationship_invited',
    null,
    jsonb_build_object(
      'target_mode', 'share_link',
      'channel_label', 'Link'
    )
  );

  v_response := jsonb_build_object(
    'inviteId', v_invite.id,
    'status', 'pending',
    'targetMode', 'share_link',
    'inviteToken', v_invite.invite_token,
    'inviteLink', 'happycircles://invite/' || v_invite.invite_token,
    'expiresAt', v_invite.expires_at,
    'channelLabel', v_invite.channel_label
  );

  update public.idempotency_keys
  set response_json = v_response
  where id = v_idempotency.id;

  return v_response;
end;
$$;

create or replace function public.get_invite_preview_by_token(
  p_actor_user_id uuid,
  p_invite_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.relationship_invites%rowtype;
  v_inviter_profile public.user_profiles%rowtype;
  v_existing_relationship_id uuid;
begin
  select *
    into v_invite
  from public.relationship_invites
  where invite_token = btrim(p_invite_token)
    and target_mode = 'share_link'
  order by created_at desc
  limit 1;

  if not found then
    raise exception 'relationship_invite_not_found';
  end if;

  if v_invite.status = 'pending' and v_invite.expires_at <= timezone('utc', now()) then
    update public.relationship_invites
    set status = 'expired',
        resolved_at = coalesce(resolved_at, timezone('utc', now()))
    where id = v_invite.id
    returning * into v_invite;
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

  return jsonb_build_object(
    'inviteId', v_invite.id,
    'status', public.effective_relationship_invite_status(v_invite.status, v_invite.expires_at),
    'canAccept',
      v_invite.status = 'pending'
      and v_invite.expires_at > timezone('utc', now())
      and v_invite.inviter_user_id <> p_actor_user_id
      and v_existing_relationship_id is null,
    'reason',
      case
        when v_invite.inviter_user_id = p_actor_user_id then 'self'
        when v_existing_relationship_id is not null then 'already_connected'
        when public.effective_relationship_invite_status(v_invite.status, v_invite.expires_at) <> 'pending'
          then public.effective_relationship_invite_status(v_invite.status, v_invite.expires_at)
        else 'ready'
      end,
    'inviterUserId', v_invite.inviter_user_id,
    'inviterDisplayName', coalesce(v_inviter_profile.display_name, 'Persona'),
    'channelLabel', v_invite.channel_label,
    'targetMode', v_invite.target_mode,
    'expiresAt', v_invite.expires_at,
    'resolvedAt', v_invite.resolved_at
  );
end;
$$;

create or replace function public.accept_invite_by_token(
  p_actor_user_id uuid,
  p_idempotency_key text,
  p_invite_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_idempotency public.idempotency_keys%rowtype;
  v_invite public.relationship_invites%rowtype;
  v_relationship_id uuid;
  v_response jsonb;
begin
  insert into public.idempotency_keys (actor_user_id, operation_name, idempotency_key)
  values (p_actor_user_id, 'accept_invite_by_token', p_idempotency_key)
  on conflict (actor_user_id, operation_name, idempotency_key) do nothing;

  select *
    into v_idempotency
  from public.idempotency_keys
  where actor_user_id = p_actor_user_id
    and operation_name = 'accept_invite_by_token'
    and idempotency_key = p_idempotency_key
  for update;

  if v_idempotency.response_json is not null then
    return v_idempotency.response_json;
  end if;

  select *
    into v_invite
  from public.relationship_invites
  where invite_token = btrim(p_invite_token)
    and target_mode = 'share_link'
  order by created_at desc
  limit 1
  for update;

  if not found then
    raise exception 'relationship_invite_not_found';
  end if;

  if v_invite.status = 'pending' and v_invite.expires_at <= timezone('utc', now()) then
    update public.relationship_invites
    set status = 'expired',
        resolved_at = coalesce(resolved_at, timezone('utc', now()))
    where id = v_invite.id
    returning * into v_invite;
  end if;

  if v_invite.inviter_user_id = p_actor_user_id then
    raise exception 'cannot_accept_own_invite';
  end if;

  if v_invite.status = 'expired' then
    raise exception 'invite_expired';
  end if;

  if v_invite.status <> 'pending' then
    raise exception 'invite_not_pending';
  end if;

  insert into public.relationships (user_low_id, user_high_id, status)
  values (
    least(v_invite.inviter_user_id, p_actor_user_id),
    greatest(v_invite.inviter_user_id, p_actor_user_id),
    'active'
  )
  on conflict (user_low_id, user_high_id)
  do update set status = 'active'
  returning id into v_relationship_id;

  update public.relationship_invites
  set invitee_user_id = p_actor_user_id,
      status = 'accepted',
      accepted_by_user_id = p_actor_user_id,
      resolved_at = timezone('utc', now())
  where id = v_invite.id;

  perform public.ensure_relationship_accounts(v_relationship_id);

  perform public.append_audit_event(
    p_actor_user_id,
    'relationship',
    v_relationship_id,
    'relationship_accepted',
    null,
    jsonb_build_object(
      'invite_id', v_invite.id,
      'target_mode', v_invite.target_mode,
      'channel_label', v_invite.channel_label
    )
  );

  v_response := jsonb_build_object(
    'relationshipId', v_relationship_id,
    'status', 'active',
    'inviteStatus', 'accepted',
    'inviteId', v_invite.id
  );

  update public.idempotency_keys
  set response_json = v_response
  where id = v_idempotency.id;

  return v_response;
end;
$$;

create or replace function public.get_profile_connection_preview(
  p_actor_user_id uuid,
  p_connection_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_profile public.user_profiles%rowtype;
  v_existing_relationship_id uuid;
  v_existing_pending_invite public.relationship_invites%rowtype;
begin
  select *
    into v_target_profile
  from public.user_profiles
  where public_connection_token = btrim(p_connection_token);

  if not found then
    raise exception 'profile_connection_not_found';
  end if;

  if v_target_profile.id <> p_actor_user_id then
    update public.relationship_invites
    set status = 'expired',
        resolved_at = coalesce(resolved_at, timezone('utc', now()))
    where status = 'pending'
      and target_mode = 'direct_user'
      and invitee_user_id is not null
      and least(inviter_user_id, invitee_user_id) = least(v_target_profile.id, p_actor_user_id)
      and greatest(inviter_user_id, invitee_user_id) = greatest(v_target_profile.id, p_actor_user_id)
      and expires_at <= timezone('utc', now());
  end if;

  select id
    into v_existing_relationship_id
  from public.relationships
  where user_low_id = least(v_target_profile.id, p_actor_user_id)
    and user_high_id = greatest(v_target_profile.id, p_actor_user_id)
    and status = 'active';

  select *
    into v_existing_pending_invite
  from public.relationship_invites
  where status = 'pending'
    and target_mode = 'direct_user'
    and invitee_user_id is not null
    and least(inviter_user_id, invitee_user_id) = least(v_target_profile.id, p_actor_user_id)
    and greatest(inviter_user_id, invitee_user_id) = greatest(v_target_profile.id, p_actor_user_id)
  order by created_at desc
  limit 1;

  return jsonb_build_object(
    'targetUserId', v_target_profile.id,
    'displayName', v_target_profile.display_name,
    'canCreateInvite',
      v_target_profile.id <> p_actor_user_id
      and v_existing_relationship_id is null
      and v_existing_pending_invite.id is null,
    'reason',
      case
        when v_target_profile.id = p_actor_user_id then 'self'
        when v_existing_relationship_id is not null then 'already_connected'
        when v_existing_pending_invite.id is not null then
          case
            when v_existing_pending_invite.invitee_user_id = p_actor_user_id then 'incoming_pending'
            else 'outgoing_pending'
          end
        else 'ready'
      end,
    'existingInviteId', v_existing_pending_invite.id,
    'existingInviteStatus',
      case
        when v_existing_pending_invite.id is null then null
        else public.effective_relationship_invite_status(v_existing_pending_invite.status, v_existing_pending_invite.expires_at)
      end,
    'existingInviteDirection',
      case
        when v_existing_pending_invite.id is null then null
        when v_existing_pending_invite.invitee_user_id = p_actor_user_id then 'incoming'
        else 'outgoing'
      end,
    'existingInviteExpiresAt', v_existing_pending_invite.expires_at
  );
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
    public_connection_token
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    v_phone_country_iso2,
    v_phone_country_calling_code,
    v_phone_national_number,
    v_phone_e164,
    public.generate_short_token(12)
  )
  on conflict (id) do update
  set email = excluded.email,
      display_name = excluded.display_name,
      phone_country_iso2 = coalesce(excluded.phone_country_iso2, public.user_profiles.phone_country_iso2),
      phone_country_calling_code = coalesce(excluded.phone_country_calling_code, public.user_profiles.phone_country_calling_code),
      phone_national_number = coalesce(excluded.phone_national_number, public.user_profiles.phone_national_number),
      phone_e164 = coalesce(excluded.phone_e164, public.user_profiles.phone_e164),
      public_connection_token = coalesce(public.user_profiles.public_connection_token, excluded.public_connection_token);

  perform public.claim_contact_invites_for_user(new.id);

  return new;
end;
$$;
