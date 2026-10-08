-- Discovery is private, temporary, and never broadcasts an address book.
set local lock_timeout = '10s';
set local statement_timeout = '60s';

insert into app_private.backend_secrets (name, secret)
values ('contact_discovery_hmac_v1', extensions.gen_random_bytes(32))
on conflict (name) do nothing;

create table app_private.contact_discovery_sessions (
  owner_user_id uuid not null references public.user_profiles(id) on delete cascade,
  session_id uuid not null,
  expires_at timestamptz not null default now() + interval '15 minutes',
  primary key (owner_user_id, session_id)
);
create index contact_discovery_sessions_expiry_idx
  on app_private.contact_discovery_sessions (expires_at);

create table app_private.contact_discovery_watches (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  session_id uuid not null,
  phone_hmac bytea not null,
  foreign key (owner_user_id, session_id)
    references app_private.contact_discovery_sessions(owner_user_id, session_id) on delete cascade,
  unique (owner_user_id, session_id, phone_hmac)
);
create index contact_discovery_watches_phone_idx
  on app_private.contact_discovery_watches (phone_hmac);
alter table app_private.contact_discovery_sessions enable row level security;
alter table app_private.contact_discovery_watches enable row level security;
revoke all on app_private.contact_discovery_sessions, app_private.contact_discovery_watches
  from public, anon, authenticated, service_role;

create function app_private.contact_phone_hmac(p_phone text)
returns bytea language sql stable security definer
set search_path = pg_catalog, app_private, extensions, pg_temp
as $$
  select extensions.hmac(convert_to(p_phone, 'UTF8'), secret, 'sha256')
  from app_private.backend_secrets where name = 'contact_discovery_hmac_v1';
$$;
revoke all on function app_private.contact_phone_hmac(text) from public, anon, authenticated, service_role;

create function public.resolve_people_targets_observed(
  p_actor_user_id uuid,
  p_phone_e164_list text[],
  p_discovery_session_id uuid default null
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, app_private, pg_temp
as $$
declare
  v_hash bytea;
  v_hashes bytea[];
  v_result jsonb;
begin
  perform public.assert_request_actor(p_actor_user_id);
  if p_actor_user_id is null then raise exception 'actor_mismatch'; end if;
  if coalesce(cardinality(p_phone_e164_list), 0) not between 1 and 60
     or exists (select 1 from unnest(p_phone_e164_list) phone
                where phone is null or phone !~ '^\+[1-9][0-9]{7,14}$') then
    raise exception 'Invalid phoneE164List';
  end if;
  if p_discovery_session_id is null then
    return public.resolve_people_targets(p_actor_user_id, p_phone_e164_list);
  end if;

  -- Bound concurrent sessions and serialize the per-owner capacity check.
  perform pg_advisory_xact_lock(hashtextextended('contact-owner:' || p_actor_user_id::text, 0));
  delete from app_private.contact_discovery_sessions
    where owner_user_id = p_actor_user_id and expires_at <= now();
  if not exists (select 1 from app_private.contact_discovery_sessions
                 where owner_user_id = p_actor_user_id and session_id = p_discovery_session_id)
     and (select count(*) from app_private.contact_discovery_sessions
          where owner_user_id = p_actor_user_id) >= 4 then
    raise exception 'rate_limited: discovery sessions';
  end if;
  insert into app_private.contact_discovery_sessions(owner_user_id, session_id)
    values (p_actor_user_id, p_discovery_session_id)
    on conflict (owner_user_id, session_id) do update
      set expires_at = now() + interval '15 minutes';

  select array_agg(distinct app_private.contact_phone_hmac(phone)) into v_hashes
    from unnest(p_phone_e164_list) phone;
  -- Profile triggers use the same ordered locks. This closes the race between
  -- registering a watch and reading a profile that is currently being activated.
  for v_hash in select hash from unnest(v_hashes) hash order by hash loop
    perform pg_advisory_xact_lock(hashtextextended('contact-phone:' || encode(v_hash, 'hex'), 0));
  end loop;
  insert into app_private.contact_discovery_watches(owner_user_id, session_id, phone_hmac)
    select p_actor_user_id, p_discovery_session_id, hash from unnest(v_hashes) hash
    on conflict (owner_user_id, session_id, phone_hmac) do nothing;
  if (select count(*) from app_private.contact_discovery_watches
      where owner_user_id = p_actor_user_id and session_id = p_discovery_session_id) > 20000 then
    raise exception 'rate_limited: discovery contacts';
  end if;

  select coalesce(jsonb_agg(target.value || jsonb_build_object('discoveryWatchId', watch.id)
                          order by target.position), '[]'::jsonb)
    into v_result
    from jsonb_array_elements(public.resolve_people_targets(p_actor_user_id, p_phone_e164_list))
      with ordinality target(value, position)
    join app_private.contact_discovery_watches watch
      on watch.owner_user_id = p_actor_user_id and watch.session_id = p_discovery_session_id
     and watch.phone_hmac = app_private.contact_phone_hmac(target.value ->> 'phoneE164');
  return v_result;
end;
$$;
revoke all on function public.resolve_people_targets_observed(uuid, text[], uuid) from public, anon, authenticated;
grant execute on function public.resolve_people_targets_observed(uuid, text[], uuid) to service_role;

create function public.manage_contact_discovery(
  p_actor_user_id uuid, p_discovery_session_id uuid, p_action text
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, app_private, pg_temp
as $$
declare v_expiry timestamptz;
begin
  perform public.assert_request_actor(p_actor_user_id);
  if p_actor_user_id is null or p_discovery_session_id is null then
    raise exception 'Invalid discoverySessionId';
  end if;
  if p_action = 'stop' then
    delete from app_private.contact_discovery_sessions
      where owner_user_id = p_actor_user_id and session_id = p_discovery_session_id;
    return jsonb_build_object('status', 'stopped');
  elsif p_action = 'renew' then
    update app_private.contact_discovery_sessions set expires_at = now() + interval '15 minutes'
      where owner_user_id = p_actor_user_id and session_id = p_discovery_session_id
        and expires_at > now()
      returning expires_at into v_expiry;
    return jsonb_build_object('status', case when v_expiry is null then 'expired' else 'renewed' end,
                              'expiresAt', v_expiry);
  end if;
  raise exception 'Invalid action';
end;
$$;
revoke all on function public.manage_contact_discovery(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.manage_contact_discovery(uuid, uuid, text) to service_role;

create function app_private.tg_contact_discovery_profile_changed()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, app_private, pg_temp
as $$
declare
  v_old_phone text;
  v_new_phone text;
  v_hash bytea;
  v_hashes bytea[];
  v_observer record;
begin
  if tg_op <> 'INSERT' then v_old_phone := old.phone_e164; end if;
  if tg_op <> 'DELETE' then v_new_phone := new.phone_e164; end if;
  if tg_op = 'UPDATE' and
    (old.phone_e164, old.phone_verified_at, old.phone_identity_legacy_at,
     old.account_access_state, old.display_name, old.avatar_path)
    is not distinct from
    (new.phone_e164, new.phone_verified_at, new.phone_identity_legacy_at,
     new.account_access_state, new.display_name, new.avatar_path) then
    return null;
  end if;
  select array_agg(distinct app_private.contact_phone_hmac(phone)) into v_hashes
    from unnest(array[v_old_phone, v_new_phone]) phone where phone is not null;
  for v_hash in select hash from unnest(v_hashes) hash order by hash loop
    perform pg_advisory_xact_lock(hashtextextended('contact-phone:' || encode(v_hash, 'hex'), 0));
  end loop;
  for v_observer in
    select watch.owner_user_id, jsonb_agg(watch.id order by watch.id) as watch_ids
    from app_private.contact_discovery_watches watch
    join app_private.contact_discovery_sessions session
      on session.owner_user_id = watch.owner_user_id and session.session_id = watch.session_id
    where watch.phone_hmac = any(v_hashes) and session.expires_at > now()
    group by watch.owner_user_id
  loop
    begin
      perform realtime.send(jsonb_build_object(
        'eventId', gen_random_uuid(), 'watchIds', v_observer.watch_ids, 'sentAt', now()
      ), 'contacts_changed', 'user:' || v_observer.owner_user_id::text, true);
    exception when others then
      -- Discovery is best effort; reconnect/visible-row revalidation recovers it.
      raise warning 'contact_discovery_broadcast_failed sqlstate=%', sqlstate;
    end;
  end loop;
  return null;
end;
$$;
revoke all on function app_private.tg_contact_discovery_profile_changed() from public, anon, authenticated, service_role;
create trigger contact_discovery_profile_changed
  after insert or update or delete on public.user_profiles
  for each row execute function app_private.tg_contact_discovery_profile_changed();

create function app_private.cleanup_contact_discovery()
returns integer language plpgsql security definer
set search_path = pg_catalog, app_private, pg_temp
as $$
declare v_count integer;
begin
  with stale as (
    select owner_user_id, session_id from app_private.contact_discovery_sessions
    where expires_at <= now() order by expires_at limit 100 for update skip locked
  )
  delete from app_private.contact_discovery_sessions session using stale
    where session.owner_user_id = stale.owner_user_id and session.session_id = stale.session_id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function app_private.cleanup_contact_discovery() from public, anon, authenticated, service_role;

do $$
begin
  if to_regnamespace('cron') is not null then
    perform cron.schedule('happy-circles-contact-discovery-cleanup', '*/5 * * * *',
      'select app_private.cleanup_contact_discovery();');
  end if;
end;
$$;
